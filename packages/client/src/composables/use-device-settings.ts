import { computed, onScopeDispose, ref, type ComputedRef, type Ref } from "vue";
import type { CreateLocationShareInput, LocationShare, UserDevice } from "@shared/index";
import { fetchUserDevices } from "@/api/devices";
import { friendlyErrorMessage } from "@/api/error-message";
import { createLocationShare, listLocationShares } from "@/api/location";
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
}

const faNumber = (value: number) => value.toLocaleString("fa-IR");

export function useDeviceSettings(options: UseDeviceSettingsOptions) {
  const devices = ref<UserDevice[]>([]);
  const liveShares = ref<LocationShare[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  const busyShareId = ref<string | null>(null);
  const bulkRunning = ref(false);
  const status = ref<DeviceSettingsStatus | null>(null);

  // A `computed` that read `Date.now()` directly would freeze the ages at its first evaluation — the
  // bug the share lists already had to fix. This ref is the reactive clock the row describers take, and
  // `refresh` re-stamps it so an age means "time since this list was read", never "time since the page
  // was opened".
  const nowMs = ref(Date.now());
  const clock = setInterval(() => {
    nowMs.value = Date.now();
  }, DEVICE_CLOCK_INTERVAL_MS);
  onScopeDispose(() => clearInterval(clock));

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

  async function refresh(): Promise<void> {
    const accessToken = options.accessToken.value;
    if (!accessToken) {
      setStatus("warn", "برای دیدن دستگاه‌ها وارد حساب شوید.");
      return;
    }
    loading.value = true;
    try {
      const [deviceList, shares] = await Promise.all([fetchUserDevices(accessToken), listLocationShares(accessToken)]);
      devices.value = deviceList;
      // Owned rows only: the pin belongs to the sharer's sessions, so a received share is not this
      // screen's to edit — and `sharedWithMe` rows carry the *owner's* device ids, which would be both
      // meaningless and a leak of their session list to offer them here.
      liveShares.value = shares.owned;
      failed.value = false;
      nowMs.value = Date.now();
    } catch {
      // A refresh that fails keeps the previous rows on screen (and says it failed): the user may be
      // looking at a device they are about to change, and an empty table is a worse answer than a stale
      // one with a warning.
      failed.value = true;
      setStatus("error", "خواندن فهرست دستگاه‌ها ناموفق بود؛ آخرین خوانده‌شده نمایش داده می‌شود.");
    } finally {
      loading.value = false;
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
    const accessToken = options.accessToken.value;
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

    busyShareId.value = shareId;
    try {
      const outcome = await send(plan.body, accessToken);
      if (!outcome.ok) {
        setStatus("error", outcome.message ?? "تغییر دستگاه انجام نشد.");
        if (outcome.staleList) await refresh();
        return false;
      }
      setStatus("ok", "دستگاه پخش‌کنندهٔ این اشتراک عوض شد.");
      await refresh();
      return true;
    } finally {
      busyShareId.value = null;
    }
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
    const accessToken = options.accessToken.value;
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

    bulkRunning.value = true;
    const outcomes: SendOutcome[] = [];
    try {
      for (const plan of sweep.ready) outcomes.push(await send(plan.body, accessToken));
    } finally {
      bulkRunning.value = false;
    }

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

  return {
    devices,
    liveShares,
    deviceRows,
    shareRows,
    lastBulkSummary,
    loading,
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
    assignEverywhere
  };
}
