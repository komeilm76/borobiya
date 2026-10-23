import type { CreateLocationShareInput, LocationShare, UserDevice } from "@shared/index";
import { describeLiveShareRow } from "@/sharing/share-form";

/**
 * The rules behind “change the broadcasting device, any time” (spec §7.3, T2.3.5).
 *
 * There is no endpoint for this and that is the point worth stating: the pin lives on
 * `location_shares.priority_device_id`, and `POST /_user/location/share` already *re-points* an active
 * row for the same owner/target pair (the reuse plan the share dialog relies on). So a settings screen
 * writes through the same door the dialog uses, and this module's job is to make that write mean exactly
 * one thing — a different device — and nothing else. Everything below exists to keep that promise.
 */

/** Why a device change is not sent for a given share. */
export type ReprioritizeRefusal = "expired" | "unchanged";

export const REPRIORITIZE_REFUSAL_COPY: Readonly<Record<ReprioritizeRefusal, string>> = {
  // One code for "over or nearly over", because that is exactly how `describeLiveShareRow` classifies a
  // row for the share lists: minutes are floored, so a share with 40 seconds left reads as finished on
  // both screens instead of being actionable on one of them. A timed duration below a minute would be
  // refused by the schema anyway.
  expired: "این اشتراک تمام شده است یا کمتر از یک دقیقه دارد؛ تغییر دستگاه آن را دوباره فعال نمی‌کند، بلکه اشتراک تازه‌ای می‌سازد.",
  unchanged: "همین دستگاه اکنون این اشتراک را پخش می‌کند."
};

export type ReprioritizePlan =
  | { readonly kind: "ready"; readonly shareId: string; readonly body: CreateLocationShareInput }
  | { readonly kind: "refused"; readonly shareId: string; readonly reason: ReprioritizeRefusal };

/**
 * The request that re-points one share, or the reason there must not be one.
 *
 * Three rules carry the whole risk of a settings screen writing to a sharing endpoint:
 * - **The expiry must not move.** A timed row's reuse in `planShareReuse` extends `expiresAt` *only
 *   forward*, so the body carries the *floored* minutes still remaining on the row — a duration that can
 *   never reach past what is already promised. Resending the original `durationMinutes`, or rounding up,
 *   would buy the recipient more time to watch a user who only clicked “change device”: a privacy side
 *   effect disguised as a preference edit.
 * - **An expired row is refused, not revived.** The lists contain active rows only, so a share whose
 *   expiry passed (or is under way in its last minute) between the fetch and the click has no row to
 *   reuse — the POST would create a new share, silently reopening live tracking that had just closed.
 * - **`note` is never sent.** The reuse patch keeps a stored note when the request carries none, so
 *   leaving it out is what preserves it; sending `null` would erase a message the user wrote in the dialog.
 *
 *
 * The remaining minutes come from `describeLiveShareRow` rather than a fresh computation, on purpose: the
 * share lists and this screen must call the same row expired at the same instant.
 */
export function planReprioritize(share: LocationShare, deviceId: string, now: Date): ReprioritizePlan {
  const row = describeLiveShareRow(share, now);
  if (row.kind === "expired") return { kind: "refused", shareId: share.id, reason: "expired" };
  if (share.priorityDeviceId === deviceId) return { kind: "refused", shareId: share.id, reason: "unchanged" };

  const body: CreateLocationShareInput = {
    targetUserIds: [share.targetUserId],
    mode: share.mode,
    priorityDeviceId: deviceId
  };
  if (share.mode === "timed") {
    // `row.kind === "active"` already guarantees at least a whole minute is left, which is what the
    // schema's floor needs; nothing here re-derives that judgement.
    body.durationMinutes = row.remainingMinutes;
  }
  return { kind: "ready", shareId: share.id, body };
}

export interface ReprioritizeSweep {
  readonly ready: Extract<ReprioritizePlan, { kind: "ready" }>[];
  readonly refused: Extract<ReprioritizePlan, { kind: "refused" }>[];
}

/**
 * One device across every live share the account has, split into what will be sent and what will not.
 *
 * The bulk action is deliberately *not* atomic and says so: there is one active arrangement per
 * (owner, target) pair and no endpoint that re-pins them together, so this is N independent posts and
 * the caller reports each outcome. A partial failure leaves the user with a device broadcasting to some
 * friends and not others, which is exactly the state a silent `.catch(() => {})` would hide.
 */
export function planReprioritizeAll(shares: readonly LocationShare[], deviceId: string, now: Date): ReprioritizeSweep {
  const ready: ReprioritizeSweep["ready"] = [];
  const refused: ReprioritizeSweep["refused"] = [];
  for (const share of shares) {
    const plan = planReprioritize(share, deviceId, now);
    if (plan.kind === "ready") ready.push(plan);
    else refused.push(plan);
  }
  return { ready, refused };
}

export interface ReprioritizeSummary {
  readonly applied: number;
  readonly failed: number;
  readonly skipped: number;
  readonly all: boolean;
}

/** The wording for “۲ از ۳ به‌روز شد” comes from these counts, so they must not double-count a refusal. */
export function summarizeReprioritize(
  sweep: ReprioritizeSweep,
  results: readonly { readonly ok: boolean }[]
): ReprioritizeSummary {
  const applied = results.filter((result) => result.ok).length;
  const failed = results.length - applied;
  return { applied, failed, skipped: sweep.refused.length, all: applied === sweep.ready.length && failed === 0 };
}

export interface DeviceRow {
  readonly deviceId: string;
  /** `user_sessions.device_name` is nullable by design: an unrecognized user agent stores `null`, so a
   * row still has to be sayable, and “unnamed device” is the truth rather than a guessed brand. */
  readonly label: string;
  readonly hasName: boolean;
  readonly isCurrent: boolean;
  readonly isOnline: boolean;
  readonly ip: string | null;
  /** Never negative: a clock skew would otherwise print «-۳ دقیقه پیش» for a session that is fine. */
  readonly minutesSinceActive: number;
  readonly pinnedShareCount: number;
}

/**
 * One row of the Active Devices table, joined with what the shares say about it.
 *
 * `pinnedShareCount` is the column that makes the table answer the question the user actually came with
 * (“which of these is sending my position, and to how many people?”) rather than listing sessions. It
 * counts *any* id the shares name, including ones this list no longer contains — a device that signed
 * out keeps its pin until the maintenance sweep re-points it, and pretending otherwise would show
 * “nothing is broadcasting” while somebody is still being shown a position.
 */
export function describeDeviceRows(devices: readonly UserDevice[], shares: readonly LocationShare[], now: Date): DeviceRow[] {
  const pinned = new Map<string, number>();
  for (const share of shares) {
    if (share.priorityDeviceId === null) continue;
    pinned.set(share.priorityDeviceId, (pinned.get(share.priorityDeviceId) ?? 0) + 1);
  }
  return devices.map((device) => ({
    deviceId: device.deviceId,
    label: device.deviceName ?? "دستگاه بدون نام",
    hasName: device.deviceName !== null,
    isCurrent: device.isCurrentDevice,
    isOnline: device.isOnline,
    ip: device.ip,
    minutesSinceActive: Math.max(0, Math.floor((now.getTime() - new Date(device.lastActiveAt).getTime()) / 60_000)),
    pinnedShareCount: pinned.get(device.deviceId) ?? 0
  }));
}

export interface DeviceChoice {
  readonly value: string;
  readonly label: string;
  /** A pinned-but-gone device is shown so the screen states what is in force; it cannot be re-selected. */
  readonly disabled: boolean;
  readonly isGone: boolean;
}

/**
 * The options for one share's chooser.
 *
 * Two decisions:
 * - A device that is no longer a live session is **not refused client-side**. This list is a snapshot;
 *   the server owns the rule and answers `400 unknown_priority_device` for a session that signed out a
 *   second ago, and the panel shows that refusal. Caching the server's rule in a browser tab is the
 *   mistake `history/playback.ts` records for range limits, and here it would turn a normal race into a
 *   control that says “you cannot do that”.
 * - The share's currently pinned id is kept as a **disabled** row when the list does not contain it,
 *   because a chooser that drops it would imply the share has no device while one is still stored.
 */
export function deviceChoices(devices: readonly UserDevice[], pinnedDeviceId: string | null): DeviceChoice[] {
  const choices: DeviceChoice[] = devices.map((device) => ({
    value: device.deviceId,
    label: `${device.deviceName ?? "دستگاه بدون نام"}${device.isCurrentDevice ? " · همین دستگاه" : ""}${device.isOnline ? "" : " · آفلاین"}`,
    disabled: !device.isOnline,
    isGone: false
  }));
  if (pinnedDeviceId && !choices.some((choice) => choice.value === pinnedDeviceId)) {
    choices.unshift({
      value: pinnedDeviceId,
      label: `${pinnedDeviceId.slice(0, 8)}… · دستگاه پخش‌کنندهٔ فعلی (دیگر در فهرست نیست)`,
      disabled: true,
      isGone: true
    });
  }
  // An offline-but-listed device is disabled rather than hidden: it is still the account's session, it
  // just may not be able to send anything right now, and hiding it would make "the laptop" disappear for
  // a minute of no connectivity.
  return choices;
}

/**
 * What a share's stored pin means in words.
 *
 * Three states, all of them sayable, because a settings screen that reads `null` as "no device" would be
 * wrong in the one case that matters: `priorityDeviceId` is null when the account has a single live
 * session and the server auto-pinned nothing. And an id this list no longer contains is still stored on
 * the row — naming it as absent is the truth; dropping it would claim nobody is broadcasting while
 * somebody is being shown a position.
 */
export function deviceLabelFor(rows: readonly DeviceRow[], deviceId: string | null): string {
  if (!deviceId) return "هیچ دستگاهی انتخاب نشده";
  const known = rows.find((row) => row.deviceId === deviceId);
  if (known) return known.isOnline ? known.label : `${known.label} · آفلاین`;
  return `${deviceId.slice(0, 8)}… (دیگر در فهرست نیست)`;
}
