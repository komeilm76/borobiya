import {
  MAX_LOCATION_SHARE_MINUTES,
  MAX_LOCATION_SHARE_NOTE_LENGTH,
  MAX_LOCATION_SHARE_TARGETS,
  type CreateLocationHistoryShareInput,
  type CreateLocationShareInput,
  type LocationHistoryShare,
  type LocationShare,
  type ReceivedLocationHistoryShare,
  type ReceivedLocationShare,
  type UserSearchResult
} from "@shared/index";
import { ApiError } from "../api/http";

/**
 * Everything the share dialogs need to decide, kept free of Vue so it can be tested without a
 * DOM. Copy (Persian strings) lives in the components: this module returns *codes* and numbers.
 */

/** The picker's two modes. `permanent` never expires; `timed` needs a duration. */
export type ShareMode = "timed" | "permanent";

export interface ShareDraft {
  mode: ShareMode;
  /** Ordered by selection, because the server reports `createdShareIds` in request order. */
  recipients: UserSearchResult[];
  durationMinutes: number;
  note: string;
}

export type ShareDraftIssueCode =
  | "no_recipients"
  | "too_many_recipients"
  | "duration_required"
  | "duration_out_of_range"
  | "note_too_long";

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
  const payload: CreateLocationShareInput = {
    targetUserIds: uniqueRecipientIds(draft.recipients),
    mode: draft.mode
  };
  if (draft.mode === "timed") payload.durationMinutes = Math.trunc(draft.durationMinutes);
  if (note.length > 0) payload.note = note;
  return payload;
}

export interface HistoryWindow {
  /** ISO instant; the picker sends this explicitly instead of relying on a server-side default. */
  from: string;
  to: string;
}

export function buildHistorySharePayload(
  draft: ShareDraft,
  window: HistoryWindow
): CreateLocationHistoryShareInput {
  // A history grant has no `note` column, so the draft's note is deliberately dropped rather than
  // sent: `historyShareSchema` is strict and an extra key would be a 400 the user cannot fix.
  return {
    targetUserIds: uniqueRecipientIds(draft.recipients),
    from: window.from,
    to: window.to
  };
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
}

/** The UI renders Persian, so the default labels are Persian. */
export const PERSIAN_DURATION_UNITS: DurationUnits = {
  minute: "دقیقه",
  hour: "ساعت",
  day: "روز",
  week: "هفته",
  separator: " و "
};

/**
 * Turns a minute count into the words a person can compare at a glance.
 *
 * The rules the interface is held to (and every one of them is tested):
 * - under an hour: minutes only — `15` → "15 دقیقه";
 * - an hour or more: hours, plus minutes when there is a remainder — `390` → "6 ساعت و 30 دقیقه",
 *   and `360` → "6 ساعت" rather than "360 دقیقه";
 * - a day or more: days with the leftover hours and minutes — `1505` → "1 روز و 1 ساعت و 5 دقیقه";
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
  if (minutes === 0) return `0 ${units.minute}`;
  if (minutes >= MINUTES_PER_WEEK && minutes % MINUTES_PER_WEEK === 0) {
    return `${minutes / MINUTES_PER_WEEK} ${units.week}`;
  }

  const { days, hours, minutes: remainder } = splitDuration(minutes);
  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ${units.day}`);
  if (hours > 0) parts.push(`${hours} ${units.hour}`);
  // Under an hour the count *is* the minutes; above it only a leftover is worth naming, so
  // "6 hours" never renders as "6 hours and 0 minutes".
  const leftover = days > 0 || hours > 0 ? remainder : minutes;
  if (leftover > 0) parts.push(`${leftover} ${units.minute}`);

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
 * Names for the ids the share lists carry.
 *
 * `GET /_user/location/shares` returns the *other* party's username only on received rows
 * (`owner.username`); an owned row has a bare `targetUserId`. Rather than invent a server-side
 * join in a client commit, the dashboard labels those rows from the people it has already seen in
 * this session (the picker's selections) and falls back to a short id, so a row is never
 * anonymous-looking without a reason. Tracked in `docs/PROGRESS.md`.
 */
export function buildShareNameMap(entries: readonly { id: string; username: string }[]): Map<string, string> {
  return new Map(entries.map((entry) => [entry.id, entry.username]));
}

export function shareRowLabel(id: string, names: ReadonlyMap<string, string>): string {
  const known = names.get(id);
  if (known) return known;
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
