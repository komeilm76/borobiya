import {
  MAX_LOCATION_HISTORY_SHARE_POINTS,
  MAX_LOCATION_SHARE_MINUTES,
  MAX_LOCATION_SHARE_NOTE_LENGTH,
  MAX_LOCATION_SHARE_TARGETS,
  type CreateLocationHistoryShareInput,
  type CreateLocationShareInput,
  type LocationHistoryShare,
  type LocationShare,
  type ReceivedLocationHistoryShare,
  type ReceivedLocationShare,
  type UserDevice,
  type UserSearchResult
} from "@shared/index";
import { ApiError } from "../api/http";

/**
 * Everything the share dialogs need to decide, kept free of Vue so it can be tested without a
 * DOM. Copy (Persian strings) lives in the components: this module returns *codes* and numbers.
 */

/** The picker's modes: live (`timed` / `permanent`) or past route window (`history`). */
export type ShareMode = "timed" | "permanent" | "history";

export interface ShareDraft {
  mode: ShareMode;
  /** Ordered by selection, because the server reports `createdShareIds` in request order. */
  recipients: UserSearchResult[];
  durationMinutes: number;
  note: string;
  /** Checked only when `mode === "history"`. */
  historyFrom?: string;
  historyTo?: string;
  historyMaxPoints?: number | null;
}

export type ShareDraftIssueCode =
  | "no_recipients"
  | "too_many_recipients"
  | "duration_required"
  | "duration_out_of_range"
  | "note_too_long"
  | "history_window_required"
  | "history_end_not_after_start"
  | "history_points_out_of_range";

export interface ShareDraftIssue {
  code: ShareDraftIssueCode;
  params?: Record<string, number>;
}

/**
 * Client-side mirror of the shared schema's rules.
 *
 * The server validates the same things; this exists so the form can say *which* field is wrong
 * before a round trip, and so a submit that can never succeed never reaches the network. Keep
 * the bounds imported from `@shared/index` — duplicating a number here is how a client ends up
 * rejecting a request its own server accepts.
 */
export function shareDraftIssues(draft: ShareDraft): ShareDraftIssue[] {
  const issues: ShareDraftIssue[] = [];
  const recipients = uniqueRecipientIds(draft.recipients).length;

  if (recipients === 0) issues.push({ code: "no_recipients" });
  if (recipients > MAX_LOCATION_SHARE_TARGETS) {
    issues.push({ code: "too_many_recipients", params: { max: MAX_LOCATION_SHARE_TARGETS } });
  }

  if (draft.mode === "history") {
    const fromMs = draft.historyFrom ? Date.parse(draft.historyFrom) : Number.NaN;
    const toMs = draft.historyTo ? Date.parse(draft.historyTo) : Number.NaN;
    if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
      issues.push({ code: "history_window_required" });
    } else if (toMs <= fromMs) {
      issues.push({ code: "history_end_not_after_start" });
    }
    if (draft.historyMaxPoints !== undefined && draft.historyMaxPoints !== null) {
      if (
        !Number.isInteger(draft.historyMaxPoints) ||
        draft.historyMaxPoints < 1 ||
        draft.historyMaxPoints > MAX_LOCATION_HISTORY_SHARE_POINTS
      ) {
        issues.push({
          code: "history_points_out_of_range",
          params: { min: 1, max: MAX_LOCATION_HISTORY_SHARE_POINTS }
        });
      }
    }
    return issues;
  }

  if (draft.mode === "timed") {
    if (!Number.isFinite(draft.durationMinutes)) issues.push({ code: "duration_required" });
    else if (
      !Number.isInteger(draft.durationMinutes) ||
      draft.durationMinutes < 1 ||
      draft.durationMinutes > MAX_LOCATION_SHARE_MINUTES
    ) {
      issues.push({
        code: "duration_out_of_range",
        params: { min: 1, max: MAX_LOCATION_SHARE_MINUTES }
      });
    }
  }

  if (draft.note.trim().length > MAX_LOCATION_SHARE_NOTE_LENGTH) {
    issues.push({ code: "note_too_long", params: { max: MAX_LOCATION_SHARE_NOTE_LENGTH } });
  }

  return issues;
}

export function canSubmitShareDraft(draft: ShareDraft): boolean {
  return shareDraftIssues(draft).length === 0;
}

/** Recipient ids in selection order, first occurrence wins. */
export function uniqueRecipientIds(recipients: readonly UserSearchResult[]): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const recipient of recipients) {
    if (seen.has(recipient.id)) continue;
    seen.add(recipient.id);
    ids.push(recipient.id);
  }
  return ids;
}

/** Adds a candidate only if it is not already selected — the picker must not double-count. */
export function addRecipient(
  recipients: readonly UserSearchResult[],
  candidate: UserSearchResult
): UserSearchResult[] {
  if (recipients.some((recipient) => recipient.id === candidate.id)) return [...recipients];
  return [...recipients, candidate];
}

export function removeRecipient(
  recipients: readonly UserSearchResult[],
  id: string
): UserSearchResult[] {
  return recipients.filter((recipient) => recipient.id !== id);
}

/**
 * The body for `POST /_user/location/share`.
 *
 * `note` is trimmed and dropped when empty rather than sent as `""`: the server stores `null` for
 * "no note", and an empty string would come back as a blank line in the recipient's list.
 */
export function buildLiveSharePayload(draft: ShareDraft): CreateLocationShareInput {
  const note = draft.note.trim();
  const mode = draft.mode === "permanent" ? "permanent" : "timed";
  const payload: CreateLocationShareInput = {
    targetUserIds: uniqueRecipientIds(draft.recipients),
    mode
  };
  if (mode === "timed") payload.durationMinutes = Math.trunc(draft.durationMinutes);
  if (note.length > 0) payload.note = note;
  return payload;
}

/**
 * Names of the selected recipients in the order the payload sends their ids.
 *
 * Deduplicated exactly as `uniqueRecipientIds` does, first occurrence winning: the server resolves a
 * refusal's index against that same order, so a map built any other way would name the wrong person for
 * a list that somehow holds one id twice.
 */
export function recipientLabels(recipients: readonly UserSearchResult[]): string[] {
  const byId = new Map<string, string>();
  for (const recipient of recipients) {
    if (!byId.has(recipient.id)) byId.set(recipient.id, recipient.username);
  }
  return uniqueRecipientIds(recipients).map((id) => byId.get(id) ?? id);
}

/**
 * One refusal from a share creation's `400 VALIDATION_ERROR`, reduced to what the interface can use.
 *
 * `POST /_user/location/share` answers a batch with one issue per unusable recipient, so the response
 * already says *who* failed; `path` is the body path of that element. The dialog used to recompute its
 * own draft issues instead of reading these, and since a draft that failed client validation never
 * reaches the network, every server refusal collapsed into "check your input" — on a 30-person request
 * with no way to find the one person at fault.
 */
export interface ShareRejection {
  code: string;
  /** Index into the sent `targetUserIds`, or `null` when the issue does not name a recipient. */
  recipientIndex: number | null;
}

/** A refusal plus the name of the person it refuses, when the index still resolves. */
export interface NamedShareRejection extends ShareRejection {
  label: string | null;
}

/**
 * Last numeric segment of an issue path, tolerating the shapes the field has had — `["targetUserIds",
 * index]` as of this fix, the bare `[index]` a deployed server still answers, and a lone number in case
 * a serializer collapses a one-element array. A client must not be stricter than the contract it talks
 * to, and every miss degrades to "one of your selections" rather than to a wrong name.
 */
function recipientIndexFromPath(path: unknown): number | null {
  if (typeof path === "number") return Number.isInteger(path) && path >= 0 ? path : null;
  if (!Array.isArray(path)) return null;
  for (let index = path.length - 1; index >= 0; index -= 1) {
    const segment: unknown = path[index];
    const numeric = typeof segment === "string" && /^\d+$/.test(segment) ? Number(segment) : segment;
    if (typeof numeric === "number" && Number.isInteger(numeric) && numeric >= 0) return numeric;
  }
  return null;
}

export function shareRejections(error: unknown): ShareRejection[] {
  if (!(error instanceof ApiError)) return [];
  const rejections: ShareRejection[] = [];
  for (const issue of error.issues) {
    if (!issue || typeof issue !== "object") continue;
    const { code, path } = issue as { code?: unknown; path?: unknown };
    if (typeof code !== "string") continue;
    rejections.push({ code, recipientIndex: recipientIndexFromPath(path) });
  }
  return rejections;
}

/** Ordered as the server sent them; the first entry is the one worth showing. */
/**
 * Copy for one refusal from `POST /_user/location/share`, shared by the share dialog and the device
 * settings screen because both write through that endpoint: two switches over the same server codes drift
 * the first time a code is added. Codes the client cannot explain return `null` so the caller's generic
 * path still runs — a silently dropped refusal would be worse than a vague message.
 */
export function rejectionText(rejection: { code: string; label: string | null } | undefined): string | null {
  if (!rejection) return null;
  switch (rejection.code) {
    case "self_target":
      return "نمی‌توانید موقعیت خود را با خودتان به اشتراک بگذارید.";
    case "unknown_target":
      return rejection.label
        ? `حساب «${rejection.label}» دیگر وجود ندارد.`
        : "یک یا چند نفر از انتخاب‌ها پیدا نشدند.";
    case "unavailable_target":
      return rejection.label
        ? `«${rejection.label}» غیرفعال یا محدود شده و نمی‌تواند اشتراک بگیرد.`
        : "یک یا چند نفر از انتخاب‌ها نمی‌توانند اشتراک بگیرند.";
    case "unknown_priority_device":
      return "دستگاه انتخابی دیگر زنده نیست. فهرست دستگاه‌ها را تازه کنید و دوباره انتخاب کنید.";
    default:
      return null;
  }
}

export function nameShareRejections(
  rejections: readonly ShareRejection[],
  labels: readonly string[]
): NamedShareRejection[] {
  return rejections.map((rejection) => ({
    ...rejection,
    label:
      rejection.recipientIndex !== null && rejection.recipientIndex < labels.length
        ? labels[rejection.recipientIndex] ?? null
        : null
  }));
}

export interface HistoryWindow {
  /** ISO instant; the picker sends this explicitly instead of relying on a server-side default. */
  from: string;
  to: string;
  maxPoints?: number | null;
}

export const HISTORY_PRESET_HOURS: readonly number[] = [1, 6, 24, 72, 7 * 24];

export function historyPresetWindow(hours: number, nowMs = Date.now()): { from: string; to: string } {
  const clampedHours = Number.isFinite(hours) && hours > 0 ? hours : 1;
  return {
    from: new Date(nowMs - clampedHours * 60 * 60_000).toISOString(),
    to: new Date(nowMs).toISOString()
  };
}

export function buildHistorySharePayload(
  draft: ShareDraft,
  window: HistoryWindow
): CreateLocationHistoryShareInput {
  // A history grant has no `note` column, so the draft's note is deliberately dropped rather than
  // sent: `historyShareSchema` is strict and an extra key would be a 400 the user cannot fix.
  const payload: CreateLocationHistoryShareInput = {
    targetUserIds: uniqueRecipientIds(draft.recipients),
    from: window.from,
    to: window.to
  };
  if (window.maxPoints !== undefined && window.maxPoints !== null) {
    payload.maxPoints = Math.trunc(window.maxPoints);
  }
  return payload;
}

export function isHistoryRangeTooLarge(error: unknown): boolean {
  return error instanceof ApiError && error.code === "SHARE_RANGE_TOO_LARGE";
}

export function choiceDeviceOptionLabel(
  deviceId: string,
  devices: readonly UserDevice[],
  index: number,
  currentDeviceSuffix = "همین دستگاه"
): string {
  const matched = devices.find((device) => device.deviceId === deviceId);
  if (!matched) return `دستگاه ${index + 1} (${deviceId.slice(0, 8)}…)`;
  const name = matched.deviceName ?? `دستگاه ${index + 1}`;
  return matched.isCurrentDevice ? `${name} (${currentDeviceSuffix})` : name;
}

/**
 * Slider presets, in minutes. A share that outlasts an operation is usually hours or days, so the
 * short end of the range is minutes and the long end jumps in whole days. The labels are *not*
 * stored here: a chip that says `1d` is a translation table waiting to drift from the rule below, so
 * the component formats each value with `formatDuration`.
 */
export const DURATION_PRESET_MINUTES: readonly number[] = [
  15, 30, 60, 180, 360, 720, 24 * 60, 3 * 24 * 60, 7 * 24 * 60
];

export const MINUTES_PER_HOUR = 60;
export const MINUTES_PER_DAY = 24 * 60;
export const MINUTES_PER_WEEK = 7 * 24 * 60;

export interface DurationUnits {
  minute: string;
  hour: string;
  day: string;
  week: string;
  /** Joiner between parts, e.g. "6 hours **and** 30 minutes". */
  separator: string;
  /** Optional numeral locale for counts; omitted keeps ASCII digits for custom units. */
  numberLocale?: string;
}

/** The UI renders Persian words and digits by default. */
export const PERSIAN_DURATION_UNITS: DurationUnits = {
  minute: "دقیقه",
  hour: "ساعت",
  day: "روز",
  week: "هفته",
  separator: " و ",
  numberLocale: "fa-IR"
};

/**
 * Turns a minute count into the words a person can compare at a glance.
 *
 * The rules the interface is held to (and every one of them is tested):
 * - under an hour: minutes only — `15` → "۱۵ دقیقه";
 * - an hour or more: hours, plus minutes when there is a remainder — `390` → "۶ ساعت و ۳۰ دقیقه",
 *   and `360` → "۶ ساعت" rather than "۳۶۰ دقیقه";
 * - a day or more: days with the leftover hours and minutes — `1505` → "۱ روز و ۱ ساعت و ۵ دقیقه";
 * - an exact number of whole weeks: weeks, because `10080` is a week long before it is 7 days long.
 *
 * Zero parts are dropped ("1 day and 0 hours" is noise), and a duration of zero says zero minutes
 * rather than the empty string. Units are injected because this module must not own copy — and
 * because Persian has no plural inflection, so the formatter never guesses at one.
 */
/** Broken into parts so the component can compose copy without string math. */
export function splitDuration(totalMinutes: number): DurationParts {
  const minutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.trunc(totalMinutes)) : 0;
  return {
    days: Math.floor(minutes / MINUTES_PER_DAY),
    hours: Math.floor((minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR),
    minutes: minutes % MINUTES_PER_HOUR
  };
}

export function formatDuration(totalMinutes: number, units: DurationUnits = PERSIAN_DURATION_UNITS): string {
  const minutes = Number.isFinite(totalMinutes) ? Math.max(0, Math.trunc(totalMinutes)) : 0;
  const number = (value: number) => units.numberLocale ? value.toLocaleString(units.numberLocale) : String(value);
  if (minutes === 0) return `${number(0)} ${units.minute}`;
  if (minutes >= MINUTES_PER_WEEK && minutes % MINUTES_PER_WEEK === 0) {
    return `${number(minutes / MINUTES_PER_WEEK)} ${units.week}`;
  }

  const { days, hours, minutes: remainder } = splitDuration(minutes);
  const parts: string[] = [];
  if (days > 0) parts.push(`${number(days)} ${units.day}`);
  if (hours > 0) parts.push(`${number(hours)} ${units.hour}`);
  // Under an hour the count *is* the minutes; above it only a leftover is worth naming, so
  // "6 hours" never renders as "6 hours and 0 minutes".
  const leftover = days > 0 || hours > 0 ? remainder : minutes;
  if (leftover > 0) parts.push(`${number(leftover)} ${units.minute}`);

  return parts.join(units.separator);
}

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
}


/**
 * `409 PRIORITY_DEVICE_REQUIRED` carries the device ids that are currently broadcasting. Reading
 * it here (rather than in the component) keeps the shape of the server's error in one place and
 * makes the chooser testable.
 */
export function priorityDeviceIds(error: unknown): string[] {
  if (!(error instanceof ApiError) || error.code !== "PRIORITY_DEVICE_REQUIRED") return [];
  const first = error.issues[0] as { deviceIds?: unknown } | undefined;
  if (!first || !Array.isArray(first.deviceIds)) return [];
  return first.deviceIds.filter((value): value is string => typeof value === "string");
}

export function isPriorityDeviceConflict(error: unknown): boolean {
  return error instanceof ApiError && error.code === "PRIORITY_DEVICE_REQUIRED";
}

export type ShareRowKind = "permanent" | "active" | "expired";

export interface LiveShareRow {
  id: string;
  kind: ShareRowKind;
  /** Minutes left, rounded down; `null` only for a permanent share. */
  remainingMinutes: number | null;
  note: string | null;
  priorityDeviceId: string | null;
}

/**
 * A row of `GET /_user/location/shares`, in either direction.
 *
 * `now` is a parameter, not `Date.now()`, because "expires in 2 minutes" is the one part of this
 * screen worth pinning in a test: an off-by-one here is someone believing they are still visible
 * after they are not. `remainingMinutes` is floored and never negative — "expires in -3 minutes"
 * would be a bug the user reads as a UI glitch, so the row is simply `expired` with 0 left.
 *
 * The response carries only `isRevoked`/`expiresAt` for timing; revocation state is not part of
 * the row because the endpoint lists *active* shares only (the schema's own comment), so a
 * revoked row cannot reach this function.
 */
export function describeLiveShareRow(
  share: LocationShare | ReceivedLocationShare,
  now: Date
): LiveShareRow {
  if (!share.expiresAt) {
    return {
      id: share.id,
      kind: "permanent",
      remainingMinutes: null,
      note: share.note,
      priorityDeviceId: share.priorityDeviceId
    };
  }

  const remaining = Math.floor((new Date(share.expiresAt).getTime() - now.getTime()) / 60_000);
  return {
    id: share.id,
    kind: remaining > 0 ? "active" : "expired",
    remainingMinutes: Math.max(0, remaining),
    note: share.note,
    priorityDeviceId: share.priorityDeviceId
  };
}

export interface HistoryShareRow {
  id: string;
  /** `true` while `to` is still in the future: the window is still collecting points. */
  isOpen: boolean;
  /** Minutes until the window closes (0 once it has). */
  minutesUntilClose: number;
  from: string;
  to: string;
  maxPoints: number | null;
}

/**
 * A row of `GET /_user/location/history/shares`. A grant has no expiry — it stops being useful
 * when its `to` passes — so "open" is the only state a reader can act on, and it is what decides
 * whether the list offers a delete as "still sharing" or "history only".
 */
export function describeHistoryShareRow(
  share: LocationHistoryShare | ReceivedLocationHistoryShare,
  now: Date
): HistoryShareRow {
  const untilClose = Math.floor((new Date(share.to).getTime() - now.getTime()) / 60_000);
  return {
    id: share.id,
    isOpen: untilClose > 0,
    minutesUntilClose: Math.max(0, untilClose),
    from: share.from,
    to: share.to,
    maxPoints: share.maxPoints
  };
}

/**
 * Names this session has seen, for the ids the share lists carry.
 *
 * The server now labels an owned row itself (`targetUsername`, since P2-Q1), so this map is the
 * *fallback* rather than the answer: it covers the case the server's left join tolerates — a share whose
 * target row could not be read — with a name the user learned from the picker or from a received row.
 * It is kept for that case instead of a bare short id, and the last resort is still the id prefix,
 * because a row that pretends to know a name it does not is worse than a row that admits it.
 */
export function buildShareNameMap(entries: readonly { id: string; username: string }[]): Map<string, string> {
  return new Map(entries.map((entry) => [entry.id, entry.username]));
}

/** The order is the rule: what the server read, then what this session saw, then the id. */
export function shareRowLabel(id: string, names: ReadonlyMap<string, string>, knownName?: string | null): string {
  const name = knownName?.trim();
  if (name) return name;
  const seen = names.get(id);
  if (seen) return seen;
  return `${id.slice(0, 8)}…`;
}

/**
 * A response from an earlier keystroke must never overwrite a newer one. The caller keeps a
 * counter; this only answers the question, so the rule is testable.
 */
export function isLatestSearch(requestId: number, latestRequestId: number): boolean {
  return requestId === latestRequestId;
}

/**
 * Distinguishes "a newer keystroke replaced this request" from a real failure. Without it the
 * picker flashes an error for every superseded request while the user is still typing.
 */
export function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "CanceledError" || /abort/i.test(error.message))
  );
}

/** The one 409 the form can resolve itself: the account has more than one live device. */
export function needsPriorityDevice(error: unknown): boolean {
  return isPriorityDeviceConflict(error);
}

/** The autocomplete's debounce, per the sharing spec (300 ms after typing stops). */
export const SEARCH_DEBOUNCE_MS = 300;

/** Below this the server answers 400 `q_too_short`; asking it would only show the user an error. */
export const MIN_SEARCH_TERM_LENGTH = 2;

export function shouldSearch(term: string): boolean {
  return term.trim().length >= MIN_SEARCH_TERM_LENGTH;
}
