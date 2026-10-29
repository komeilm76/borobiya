import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from "vue";
import type { CreateLocationShareInput, LocationShare, OwnedLocationShare, UserDevice } from "@shared/index";
import { fetchUserDevices } from "@/api/devices";
import { friendlyErrorMessage } from "@/api/error-message";
import { createLocationShare, listLocationShares } from "@/api/location";
import { decodeAccessTokenClaims, ownDeviceId } from "@/composables/device-identity";
import { describeLiveShareRow, rejectionText, shareRejections } from "@/sharing/share-form";
import {
  describeDeviceRows,
  deviceChoices,
  planReprioritize,
  planReprioritizeAll,
  REPRIORITIZE_REFUSAL_COPY,
  summarizeReprioritize,
  type ReprioritizeSweep,
  type ReprioritizeSummary
} from "@/settings/priority-device";

/**
 * The Active Devices screen's state: the account's live sessions, the shares that pin one of them, and
 * the write that changes a pin.
 *
 * The write goes through `POST /_user/location/share` — the same endpoint the share dialog uses — because
 * that is where the pin lives, and `settings/priority-device.ts` explains how the body is built so the
 * call changes only the device. Everything in this file is sequencing: which refresh follows which write,
 * and what the user is told when the two lists disagree.
 */

/** Ages are minutes, so the clock only has to be honest to a minute. */
export const DEVICE_CLOCK_INTERVAL_MS = 60_000;

export interface DeviceSettingsStatus {
  readonly tone: "ok" | "warn" | "error";
  readonly text: string;
}

/** The panel's single prop: state in, intent out. */
export type DeviceSettings = ReturnType<typeof useDeviceSettings>;

export interface UseDeviceSettingsOptions {
  accessToken: ComputedRef<string | null> | Ref<string | null>;
  /** The displayed account, paired with JWT session ID to distinguish login switches from bearer renewal. */
  accountId?: ComputedRef<string | null> | Ref<string | null>;
  ensureSession?: () => Promise<void>;
}

const faNumber = (value: number) => value.toLocaleString("fa-IR");

export function useDeviceSettings(options: UseDeviceSettingsOptions) {
  const devices = ref<UserDevice[]>([]);
  const liveShares = ref<OwnedLocationShare[]>([]);
  // Until both owner-scoped reads succeed, an empty array is not proof that there are no devices/shares.
  const loading = ref(true);
  const loaded = ref(false);
  const failed = ref(false);
  let readVersion = 0;
  let sessionGeneration = 0;
  const busyShareId = ref<string | null>(null);
  const bulkRunning = ref(false);
  const status = ref<DeviceSettingsStatus | null>(null);
  // Bearer renewal within one session preserves the snapshot; a different login for the same
  // account must not keep the previous session's `isCurrentDevice` or its pending writes.
  const sessionKey = computed(() => {
    const bearer = options.accessToken.value;
    const account = options.accountId?.value;
    if (!bearer || (options.accountId && !account)) return null;
    const claims = decodeAccessTokenClaims(bearer);
    if (bearer.includes(".") && (typeof claims?.sub !== "string" || typeof claims.sessionId !== "string" ||
      (account && claims.sub !== account))) return null;
    return JSON.stringify([account ?? claims?.sub ?? null, claims?.sessionId ?? null]);
  });

  // A `computed` that read `Date.now()` directly would freeze the ages at its first evaluation — the
  // bug the share lists already had to fix. This ref is the reactive clock the row describers take, and
  // `refresh` re-stamps it so an age means "time since this list was read", never "time since the page
  // was opened".
  const nowMs = ref(Date.now());
  const clock = setInterval(() => {
    nowMs.value = Date.now();
  }, DEVICE_CLOCK_INTERVAL_MS);

  const currentDeviceId = computed(() => sessionKey.value
    ? devices.value.find((device) => device.isCurrentDevice)?.deviceId ?? ownDeviceId(options.accessToken.value)
    : null
  );
  const deviceRows = computed(() => describeDeviceRows(devices.value, liveShares.value, new Date(nowMs.value)));
  const shareRows = computed(() =>
    liveShares.value.map((share) => ({ share, row: describeLiveShareRow(share, new Date(nowMs.value)) }))
  );
  const hasMultipleDevices = computed(() => devices.value.length > 1);
  const hasShares = computed(() => liveShares.value.length > 0);

  /** The last bulk pass's counts, kept as state: a computed over a mutable `let` would never update. */
  const lastBulkSummary = ref<ReprioritizeSummary | null>(null);

  function choicesFor(share: LocationShare) {
    return deviceChoices(devices.value, share.priorityDeviceId);
  }

  function setStatus(tone: DeviceSettingsStatus["tone"], text: string): void {
    status.value = { tone, text };
  }

  async function currentAccessToken(): Promise<string | null> {
    // Session recovery must still run on a cold mount before either token/profile exists.
    if (options.ensureSession) await options.ensureSession();
    return sessionKey.value ? options.accessToken.value : null;
  }

  const READ_FAILED_STALE = "خواندن فهرست دستگاه‌ها ناموفق بود؛ آخرین خوانده‌شده نمایش داده می‌شود.";
  const READ_FAILED_FIRST = "خواندن فهرست دستگاه‌ها ناموفق بود؛ دوباره تلاش کنید.";
  const SIGN_IN_REQUIRED = "برای دیدن دستگاه‌ها وارد حساب شوید.";
  const SESSION_PENDING = "نشست و حساب هنوز هماهنگ نیستند؛ دوباره تلاش کنید.";
  const unavailableStatus = () => options.accessToken.value ? SESSION_PENDING : SIGN_IN_REQUIRED;

  function resetPrivateState(): void {
    // A pending read/write belongs to the former account or login even if no manual refresh follows.
    readVersion += 1;
    sessionGeneration += 1;
    devices.value = [];
    liveShares.value = [];
    loaded.value = false;
    loading.value = false;
    failed.value = false;
    busyShareId.value = null;
    bulkRunning.value = false;
    lastBulkSummary.value = null;
    status.value = null;
  }

  onScopeDispose(() => {
    clearInterval(clock);
    // A disposed screen must not apply a late read or continue a multi-share write.
    // The already-started request may commit; reopening the screen re-reads the server.
    resetPrivateState();
  });

  watch(sessionKey, (next, previous) => {
    if (next === previous) return;
    // Synchronous invalidation also fences reads and multi-post writes when auth replaces the
    // bearer before its profile, or replaces a session under an unchanged account ID.
    resetPrivateState();
    if (!next) {
      failed.value = true;
      setStatus("warn", unavailableStatus());
      return;
    }
    // The mount-time read handles cold restore; subsequent identity changes re-read on their own.
    void refresh();
  }, { flush: "sync" });

  async function refresh(): Promise<void> {
    const version = ++readVersion;
    loading.value = true;
    try {
      const accessToken = await currentAccessToken();
      if (version !== readVersion) return;
      if (!accessToken) {
        // An unavailable session cannot keep displaying the prior account's private rows.
        devices.value = [];
        liveShares.value = [];
        loaded.value = false;
        failed.value = true;
        setStatus("warn", unavailableStatus());
        return;
      }
      const [deviceList, shares] = await Promise.all([fetchUserDevices(accessToken), listLocationShares(accessToken)]);
      if (version !== readVersion) return;
      devices.value = deviceList;
      // Owned rows only: the pin belongs to the sharer's sessions, so a received share is not this
      // screen's to edit — and `sharedWithMe` rows carry the *owner's* device ids, which would be both
      // meaningless and a leak of their session list to offer them here.
      liveShares.value = shares.owned;
      loaded.value = true;
      failed.value = false;
      if ([READ_FAILED_STALE, READ_FAILED_FIRST, SIGN_IN_REQUIRED, SESSION_PENDING].includes(status.value?.text ?? "")) status.value = null;
      nowMs.value = Date.now();
    } catch {
      if (version !== readVersion) return;
      // A failed re-read retains known rows but cannot certify that a previously empty list remains empty.
      failed.value = true;
      setStatus("error", loaded.value ? READ_FAILED_STALE : READ_FAILED_FIRST);
    } finally {
      if (version === readVersion) loading.value = false;
    }
  }

  /** Server refusals first, then the code table, then the caller's fallback. */
  function failureText(error: unknown, fallback: string): string {
    const [rejection] = shareRejections(error);
    const named = rejection ? rejectionText({ code: rejection.code, label: null }) : null;
    return named ?? friendlyErrorMessage(error, fallback);
  }

  function isStaleDeviceList(error: unknown): boolean {
    return shareRejections(error).some((rejection) => rejection.code === "unknown_priority_device");
  }

  /** One post's outcome, carrying the two facts the caller has to act on. */
  interface SendOutcome {
    readonly ok: boolean;
    readonly message: string | null;
    /** `unknown_priority_device`: the list this choice came from is older than the session that left. */
    readonly staleList: boolean;
  }

  async function send(body: CreateLocationShareInput, accessToken: string): Promise<SendOutcome> {
    try {
      await createLocationShare(body, accessToken);
      return { ok: true, message: null, staleList: false };
    } catch (error) {
      return {
        ok: false,
        message: failureText(error, "تغییر دستگاه انجام نشد."),
        staleList: isStaleDeviceList(error)
      };
    }
  }

  async function assign(shareId: string, deviceId: string): Promise<boolean> {
    // Lock before ensureSession's first await: another tap (including bulk) cannot
    // race this share's pin, then make the last response overwrite the user's choice.
    if (busyShareId.value || bulkRunning.value) return false;
    const session = sessionGeneration;
    busyShareId.value = shareId;
    try {
      return await assignUnlocked(shareId, deviceId, session);
    } finally {
      if (session === sessionGeneration) busyShareId.value = null;
    }
  }

  async function assignUnlocked(shareId: string, deviceId: string, session: number): Promise<boolean> {
    let accessToken: string | null;
    try {
      accessToken = await currentAccessToken();
    } catch (error) {
      if (session === sessionGeneration)
        setStatus("error", friendlyErrorMessage(error, "بررسی نشست انجام نشد؛ دوباره تلاش کنید."));
      return false;
    }
    if (session !== sessionGeneration) return false;
    if (!accessToken) {
      setStatus("warn", "برای تغییر دستگاه وارد حساب شوید.");
      return false;
    }
    const share = liveShares.value.find((candidate) => candidate.id === shareId);
    if (!share) {
      // The row disappeared between the read and the click. Posting anyway would *create* a share, which
      // is the opposite of changing one, so the click is refused and the list is re-read.
      setStatus("warn", "این اشتراک دیگر در فهرست نیست؛ فهرست تازه شد.");
      await refresh();
      return false;
    }

    const plan = planReprioritize(share, deviceId, new Date());
    if (plan.kind === "refused") {
      setStatus("warn", REPRIORITIZE_REFUSAL_COPY[plan.reason]);
      return false;
    }

    const outcome = await send(plan.body, accessToken);
    if (session !== sessionGeneration) return false;
    if (!outcome.ok) {
      setStatus("error", outcome.message ?? "تغییر دستگاه انجام نشد.");
      if (outcome.staleList) await refresh();
      return false;
    }
    setStatus("ok", "دستگاه پخش‌کنندهٔ این اشتراک عوض شد.");
    await refresh();
    return session === sessionGeneration;
  }

  /**
   * One device for every live share, as N posts.
   *
   * The counts are reported rather than smoothed over: a device change that worked for three friends and
   * failed for the fourth leaves the account broadcasting to some and not others, and «۲ از ۳ · ۱
   * ناموفق» is the only honest sentence about that. The list is re-read once at the end so every row shows
   * the pin the server actually kept.
   */
  async function assignEverywhere(deviceId: string): Promise<void> {
    if (busyShareId.value || bulkRunning.value) return;
    const session = sessionGeneration;
    bulkRunning.value = true;
    try {
      await assignEverywhereUnlocked(deviceId, session);
    } finally {
      if (session === sessionGeneration) bulkRunning.value = false;
    }
  }

  async function assignEverywhereUnlocked(deviceId: string, session: number): Promise<void> {
    let accessToken: string | null;
    try {
      accessToken = await currentAccessToken();
    } catch (error) {
      if (session === sessionGeneration)
        setStatus("error", friendlyErrorMessage(error, "بررسی نشست انجام نشد؛ دوباره تلاش کنید."));
      return;
    }
    if (session !== sessionGeneration) return;
    if (!accessToken) {
      setStatus("warn", "برای تغییر دستگاه وارد حساب شوید.");
      return;
    }
    const sweep: ReprioritizeSweep = planReprioritizeAll(liveShares.value, deviceId, new Date());
    if (sweep.ready.length === 0) {
      setStatus(
        "warn",
        hasShares.value ? "برای هیچ‌کدام از اشتراک‌های زندهٔ شما تغییری لازم نبود." : "اشتراک زنده‌ای ندارید که دستگاهش عوض شود."
      );
      return;
    }

    const outcomes: SendOutcome[] = [];
    for (const plan of sweep.ready) {
      if (session !== sessionGeneration) return;
      outcomes.push(await send(plan.body, accessToken));
    }
    if (session !== sessionGeneration) return;

    const summaryValue = summarizeReprioritize(
      sweep,
      outcomes.map((outcome) => ({ ok: outcome.ok }))
    );
    lastBulkSummary.value = summaryValue;
    const parts = [
      `دستگاه پخش‌کننده در ${faNumber(summaryValue.applied)} از ${faNumber(sweep.ready.length)} اشتراک عوض شد`
    ];
    if (summaryValue.skipped > 0) parts.push(`${faNumber(summaryValue.skipped)} مورد نیاز به تغییر نداشت یا منقضی شده بود`);
    const failure = outcomes.find((outcome) => !outcome.ok)?.message;
    if (summaryValue.failed > 0) parts.push(`${faNumber(summaryValue.failed)} ناموفق${failure ? `: ${failure}` : ""}`);
    setStatus(summaryValue.failed > 0 ? "error" : "ok", `${parts.join(" · ")}.`);
    await refresh();
  }

  async function assignCurrentDevice(): Promise<void> {
    if (busyShareId.value || bulkRunning.value) return;
    const targetDeviceId = currentDeviceId.value;
    if (!targetDeviceId) {
      setStatus("warn", "نشست فعلی در فهرست دستگاه‌ها پیدا نشد؛ فهرست را تازه کنید.");
      return;
    }
    await assignEverywhere(targetDeviceId);
  }

  return {
    devices,
    liveShares,
    currentDeviceId,
    deviceRows,
    shareRows,
    lastBulkSummary,
    loading,
    loaded,
    failed,
    busyShareId,
    bulkRunning,
    status,
    hasMultipleDevices,
    hasShares,
    nowMs,
    choicesFor,
    refresh,
    assign,
    assignEverywhere,
    assignCurrentDevice
  };
}
