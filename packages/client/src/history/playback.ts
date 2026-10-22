import type { LocationHistoryPoint } from "@shared/index";

/**
 * The math behind history playback (T2.2.6), kept free of Vue and of MapLibre so every rule on this
 * screen is testable — the repository's client convention, and the reason the components below only
 * render and dispatch.
 *
 * The axis of the whole feature is the **observation time** (`timestamp`), not the ingest order: the
 * server's windowed read is `[from, to)` on that column, the index behind it is `(user_id, timestamp)`,
 * and a grant's window is expressed in it. So a frame is an instant plus a place, and every function
 * here takes an explicit clock rather than reading one — the same lesson the share lists learned the
 * hard way when a countdown computed inside a cached `computed` froze at its first render.
 */

/** A recorded position reduced to what a timeline needs. */
export interface PlaybackFrame {
  /** Observation time in epoch milliseconds. */
  ms: number;
  lat: number;
  lon: number;
}

import {
  emptyOverlay,
  lineOverlay,
  pointOverlay,
  type MapPosition,
  type OverlayCollection,
  type OverlayFeature,
  type OverlayLineGeometry,
  type OverlayLayerSpec,
  type OverlayPointGeometry,
  type OverlaySourceSpec,
  type OverlayStyle
} from "@/map/overlay-sync";

/**
 * Playback's GeoJSON shapes are the generic overlay shapes (see `@/map/overlay-sync`); the aliases stay
 * because this module is where a reader looks for the playback data model, and the map rules the
 * companion markers share belong to the map module.
 */
export type PlaybackCollection = OverlayCollection;
export type PlaybackFeature = OverlayFeature;
export type PlaybackLineGeometry = OverlayLineGeometry;
export type PlaybackPointGeometry = OverlayPointGeometry;
export type { MapPosition };

/** The window a range picker answers with, in the ISO instants the API's query schema expects. */
export interface HistoryWindow {
  from: string;
  to: string;
}

export interface TimelineBounds {
  startMs: number;
  endMs: number;
}

/**
 * Playback speeds, as *seconds of trace per second of wall clock*. A week of recorded movement cannot
 * be replayed at 1× and remain usable, so 1× exists for the last few minutes of a day and the coarse
 * multipliers exist for the whole window; the labels the dialog shows are derived from these numbers by
 * the component, never stored here.
 */
export const PLAYBACK_SPEEDS = [1, 4, 16, 60] as const;
export const DEFAULT_PLAYBACK_SPEED = 16;

/** The tracker's named shortcut is the middle one, and the view defaults to it. */
export const RANGE_PRESET_DAYS = [1, 7, 30] as const;
export const DEFAULT_RANGE_PRESET_DAYS = 7;

export interface RangePreset {
  days: number;
  /** Stable id for the toggle, so the copy stays in the component. */
  id: string;
}

export function rangePresets(): readonly RangePreset[] {
  return RANGE_PRESET_DAYS.map((days) => ({ days, id: `${days}d` }));
}

/**
 * Turns stored points into frames on the timeline.
 *
 * Two decisions worth their comment:
 * - **Unparseable or non-finite input is dropped, never coerced.** `NaN` in a coordinate propagates
 *   into `fitBounds` and leaves the camera in a state the user cannot escape by panning.
 * - **The result is sorted by observation time.** The endpoint returns oldest-first, and it will keep
 *   doing so — but a polyline drawn from rows in ingest order after a future sort change is a scribble
 *   that looks like a data problem. Sorting is one pass over an array the server already capped, and it
 *   makes the shape of the output a property of this module rather than a promise it borrows.
 */
export function buildFrames(points: readonly LocationHistoryPoint[]): PlaybackFrame[] {
  const frames: PlaybackFrame[] = [];
  for (const point of points) {
    const ms = Date.parse(point.timestamp);
    if (!Number.isFinite(ms) || !Number.isFinite(point.lat) || !Number.isFinite(point.lon)) continue;
    frames.push({ ms, lat: point.lat, lon: point.lon });
  }
  return frames.sort((left, right) => left.ms - right.ms);
}

/** The span the slider covers, or `null` when there is nothing to play. */
export function timelineBounds(frames: readonly PlaybackFrame[]): TimelineBounds | null {
  const first = frames[0];
  const last = frames[frames.length - 1];
  if (!first || !last) return null;
  return { startMs: first.ms, endMs: last.ms };
}

/**
 * Where the account was at `ms`.
 *
 * `null` *before* the first frame, deliberately: a marker at the first point while the cursor is still
 * two hours early would show a position the trace says nobody had recorded yet. Once the trace ends the
 * position holds at the last point, because that is what "the end of the recording" means.
 */
export function positionAt(frames: readonly PlaybackFrame[], ms: number): MapPosition | null {
  const first = frames[0];
  if (!first) return null;
  if (ms <= first.ms) return ms === first.ms ? [first.lon, first.lat] : null;

  const last = frames[frames.length - 1]!;
  if (ms >= last.ms) return [last.lon, last.lat];

  // Frames are sorted, so a linear walk finds the enclosing pair. A window capped at
  // `LOCATION_HISTORY_READ_POINTS` (default 1000) is far too small to warrant a binary search, and a
  // search is where off-by-one bugs live.
  for (let index = 1; index < frames.length; index += 1) {
    const previous = frames[index - 1]!;
    const current = frames[index]!;
    if (ms > current.ms) continue;
    const span = current.ms - previous.ms;
    // Identical timestamps are possible (two devices fixing at the same instant), and dividing by zero
    // would put `NaN` in the geometry.
    if (span <= 0) return [current.lon, current.lat];
    const ratio = (ms - previous.ms) / span;
    return [
      previous.lon + (current.lon - previous.lon) * ratio,
      previous.lat + (current.lat - previous.lat) * ratio
    ];
  }
  return [last.lon, last.lat];
}

/**
 * The path from the first frame to the cursor, head included.
 *
 * Interpolating the head is what makes the line *grow* while playing: with only whole frames in the
 * prefix the trace advances in jumps, and on a sparse trace (one point per minute in a parking lot) the
 * marker visibly detaches from the end of the line.
 */
export function playedCoordinates(frames: readonly PlaybackFrame[], ms: number): MapPosition[] {
  const path: MapPosition[] = [];
  for (const frame of frames) {
    if (frame.ms > ms) break;
    path.push([frame.lon, frame.lat]);
  }
  const head = positionAt(frames, ms);
  // The head equals the last included frame at a frame boundary, so adding it unconditionally would
  // duplicate a coordinate pair — harmless to a renderer, and visible in a test that counts vertices.
  if (head && (path.length === 0 || !samePosition(path[path.length - 1]!, head))) path.push(head);
  return path;
}

function samePosition(left: MapPosition, right: MapPosition): boolean {
  return left[0] === right[0] && left[1] === right[1];
}

/** Slider progress, 0…1. A single-point trace is "finished" as soon as the cursor reaches it. */
export function cursorProgress(ms: number, bounds: TimelineBounds | null): number {
  if (!bounds) return 0;
  const span = bounds.endMs - bounds.startMs;
  if (span <= 0) return ms >= bounds.endMs ? 1 : 0;
  return Math.min(1, Math.max(0, (ms - bounds.startMs) / span));
}

/**
 * The cursor after a tick of wall-clock time.
 *
 * Clamped to `endMs` and never moved backwards, so a stalled tab whose `requestAnimationFrame` delta
 * arrives huge does not fling the cursor past the end and leave the marker off the trace.
 */
export function advanceCursor(input: {
  cursorMs: number;
  elapsedMs: number;
  speed: number;
  endMs: number;
}): number {
  const elapsed = Math.max(0, input.elapsedMs) * Math.max(0, input.speed);
  return Math.min(input.endMs, input.cursorMs + elapsed);
}

/** The next recorded position strictly after the cursor, for the step-forward button. */
export function nextFrameMs(frames: readonly PlaybackFrame[], cursorMs: number): number | null {
  for (const frame of frames) {
    if (frame.ms > cursorMs) return frame.ms;
  }
  return null;
}

/** The last recorded position strictly before the cursor, for the step-back button. */
export function previousFrameMs(frames: readonly PlaybackFrame[], cursorMs: number): number | null {
  for (let index = frames.length - 1; index >= 0; index -= 1) {
    const frame = frames[index]!;
    if (frame.ms < cursorMs) return frame.ms;
  }
  return null;
}

/** One render's worth of data: the whole trace, the part already played, and where the head is. */
export interface PlaybackFrameData {
  readonly trace: PlaybackCollection;
  readonly played: PlaybackCollection;
  readonly head: PlaybackCollection;
}

/**
 * Everything the map needs to draw one frame of playback, as GeoJSON data rather than maplibre calls.
 *
 * Three collections because they change at different rates and for different reasons: the full trace is
 * set once per load, the played prefix once per tick, and the head once per tick. A component that
 * rebuilt the trace every frame would re-upload the largest geometry 60 times a second for no visual
 * gain.
 */
export function playbackGeoJson(frames: readonly PlaybackFrame[], cursorMs: number): PlaybackFrameData {
  return {
    // `[lon, lat]` and not `[lat, lon]`, in the one place that order is chosen for playback: a swap
    // here draws a plausible track across the wrong continent.
    trace: lineOverlay(frames.map((frame) => [frame.lon, frame.lat] as MapPosition)),
    played: lineOverlay(playedCoordinates(frames, cursorMs)),
    head: pointOverlay(positionAt(frames, cursorMs))
  };
}

/** An empty collection is a valid `setData` argument and clears a layer without removing it. */
export function emptyCollection(): OverlayCollection {
  return emptyOverlay();
}

/**
 * The extent of a trace, for framing the camera on load.
 *
 * `null` for an empty track *and* for a single point: `fitBounds` on a zero-area box is how a map ends up
 * zoomed to max level inside one building, and the caller already has a better answer for one fix — move
 * the camera there at the current zoom.
 */
export function trackBounds(frames: readonly PlaybackFrame[]): [MapPosition, MapPosition] | null {
  if (frames.length < 2) return null;
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const frame of frames) {
    minLon = Math.min(minLon, frame.lon);
    maxLon = Math.max(maxLon, frame.lon);
    minLat = Math.min(minLat, frame.lat);
    maxLat = Math.max(maxLat, frame.lat);
  }
  return [[minLon, minLat], [maxLon, maxLat]];
}

/** The whole overlay a playback view installs on the map, as data. */
export type PlaybackStyleDescriptor = OverlayStyle;

/** Source ids, exported so the panel and the map agree on them without a string agreed on twice. */
export const PLAYBACK_SOURCE_IDS = {
  trace: "borobiya-history-trace",
  played: "borobiya-history-played",
  head: "borobiya-history-head"
} as const;

export type PlaybackSourceSpec = OverlaySourceSpec;
export type PlaybackLayerSpec = OverlayLayerSpec;

/**
 * The sources and layers a playback view needs, as data.
 *
 * Kept as a pure descriptor so the *shape* is testable (ids unique, every layer's `source` exists, the
 * trace and the played path are distinguishable in both themes) even though this repository does not
 * mount components in tests. The played path is the only one that carries color: the greyed-out dashed
 * trace is context, and at 2px it would otherwise compete with the marker for attention.
 */
export function historyPlaybackStyle(dark: boolean): PlaybackStyleDescriptor {
  const context = dark ? "rgba(226, 240, 238, 0.45)" : "rgba(23, 59, 60, 0.32)";
  const played = dark ? "#6ee7d7" : "#0e6666";
  const head = dark ? "#ffd166" : "#c2410c";

  return {
    sources: [
      { type: "geojson", id: PLAYBACK_SOURCE_IDS.trace, data: emptyCollection() },
      { type: "geojson", id: PLAYBACK_SOURCE_IDS.played, data: emptyCollection() },
      { type: "geojson", id: PLAYBACK_SOURCE_IDS.head, data: emptyCollection() }
    ],
    layers: [
      {
        id: "borobiya-history-trace-line",
        type: "line",
        source: PLAYBACK_SOURCE_IDS.trace,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": context, "line-width": 2, "line-dasharray": [2, 2] }
      },
      {
        id: "borobiya-history-played-line",
        type: "line",
        source: PLAYBACK_SOURCE_IDS.played,
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": played, "line-width": 4 }
      },
      {
        id: "borobiya-history-head-point",
        type: "circle",
        source: PLAYBACK_SOURCE_IDS.head,
        paint: {
          "circle-radius": 7,
          "circle-color": head,
          // A halo keeps the marker readable where the played line runs under it.
          "circle-stroke-width": 3,
          "circle-stroke-color": dark ? "rgba(11, 26, 27, 0.85)" : "rgba(255, 255, 255, 0.9)"
        }
      }
    ]
  };
}

/**
 * The window a preset chip asks for, ending at `nowMs`.
 *
 * The end is the caller's clock, not the server's: a `to` in the future is legal (the read simply
 * returns everything up to now) and a `to` in the past would silently hide the last few minutes the user
 * can see on their own phone. Passing the clock in keeps this a pure function the test can pin, which is
 * how "7 days" stays exactly 7 days rather than a daylight-saving surprise — the span is computed in
 * milliseconds, not by adding "7 days" to a calendar date.
 */
export function historyWindowFromPreset(days: number, nowMs: number): HistoryWindow {
  const spanMs = Math.max(0, days) * 24 * 60 * 60 * 1000;
  const endMs = Number.isFinite(nowMs) ? nowMs : Date.now();
  return {
    from: new Date(Math.max(0, endMs - spanMs)).toISOString(),
    to: new Date(endMs).toISOString()
  };
}

export type HistoryWindowIssue = "unparsable" | "order" | "in_future";

/** Why a load failed when the range itself was fine. */
export type HistoryLoadIssue = "grant_required" | "grant_gone" | "no_token" | "request_failed";

/**
 * Why a hand-typed range cannot be asked for, or `null` when it can.
 *
 * There is deliberately **no span limit here**: the server caps a *share* window at
 * `LOCATION_HISTORY_MAX_SHARE_DAYS` and puts no cap on reading one's own history, so inventing a client
 * bound would reject requests the API answers. What is worth refusing locally is the range that produces
 * a confusing screen: one endpoint cannot parse, the two are the wrong way round (which reads as "no
 * data" rather than "bad range"), or the start is in the future (always empty, and the user was aiming
 * at their browser's clock widget).
 */
export function historyWindowIssue(window: HistoryWindow): HistoryWindowIssue | null {
  const from = Date.parse(window.from);
  const to = Date.parse(window.to);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return "unparsable";
  if (to <= from) return "order";
  if (from > Date.now()) return "in_future";
  return null;
}

/**
 * Whether the view is a sample of the record.
 *
 * The server downsamples inside the query and reports `totalPoints` for exactly this: 1000 points drawn
 * as if they were the whole trace is a correctness problem, so the panel says "۱٬۰۰۰ از ۸٬۴۱۲ نقطه"
 * rather than letting a sparse polyline pass for the truth. `shown > total` cannot happen (the SQL
 * guarantees `points.length <= totalPoints`); the clamp is there so a contract change shows a sensible
 * ratio instead of a number above 1.
 */
export function samplingState(shown: number, total: number): { sampled: boolean; ratio: number } {
  const safeTotal = Math.max(0, total);
  const safeShown = Math.min(Math.max(0, shown), safeTotal);
  return {
    sampled: safeShown < safeTotal,
    ratio: safeTotal === 0 ? 0 : safeShown / safeTotal
  };
}

/**
 * A `datetime-local` value is local wall-clock time with no zone, which is what a person means when they
 * pick "18:00 today", and JavaScript parses it in the browser's zone accordingly. Converting here rather
 * than in the component keeps the trap in one place: feeding the raw string to the API instead would send
 * an instant the server reads as UTC, four and a half hours off for a Tehran user.
 */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** The mirror of {@link localInputToIso}, for seeding the inputs from a window. */
export function isoToLocalInput(iso: string): string {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(
    date.getMinutes()
  )}`;
}

/**
 * What a rejected range means, in the user's terms. Kept with the validator rather than inline in a
 * template because the same four states are reachable from the chips, the two text fields and a
 * restored share link, and each has to explain the fix instead of just refusing.
 */
export const HISTORY_WINDOW_ISSUE_COPY: Readonly<Record<HistoryWindowIssue, string>> = {
  unparsable: "یکی از دو تاریخ قابل خواندن نیست؛ فرمت را دست‌کاری نکنید.",
  order: "بازه زمانی باید از یک لحظه‌ی مشخص شروع شود و در آینده تمام شود.",
  in_future: "نمی‌توان مسیری را که هنوز ثبت نشده پخش کرد."
};

/** The states a load can fail in that are not the range's fault. */
export const HISTORY_LOAD_ISSUE_COPY: Readonly<Record<HistoryLoadIssue, string>> = {
  grant_required: "برای دیدن مسیر اشتراکی، اول یک اشتراک از فهرست انتخاب کنید.",
  grant_gone: "این اشتراک دیگر در دسترس نیست؛ شاید صاحبش آن را حذف کرده باشد.",
  no_token: "برای دیدن تاریخچه باید وارد حساب شوید.",
  request_failed: "خواندن تاریخچه ناموفق بود؛ دوباره تلاش کنید."
};

/** Every state the panel can refuse in, and the one place that turns it into wording. */
export type PlaybackIssue = HistoryWindowIssue | HistoryLoadIssue;

/**
 * Both issue maps in one call, because the panel has one status line and should not have to know which
 * half of the model produced the code. Exhaustive over both unions, so adding a state without wording is
 * a type error rather than a `undefined` rendered into the UI.
 */
export function playbackIssueText(issue: PlaybackIssue): string {
  if (issue === "unparsable" || issue === "order" || issue === "in_future") return HISTORY_WINDOW_ISSUE_COPY[issue];
  return HISTORY_LOAD_ISSUE_COPY[issue];
}

/**
 * The cursor's clock label, in the viewer's zone.
 *
 * Explicitly not UTC: a Tehran user who stopped at home at 22:00 sees «22:00», and the same string
 * that the `datetime-local` fields show, because both read the same instant through the same local
 * rules. `timeZone` exists so the tests can pin the formatting against a fixed zone instead of the
 * sandbox's.
 */
export function formatLocalTime(ms: number, options: { timeZone?: string; locale?: string; withDate?: boolean } = {}): string {
  const formatter = new Intl.DateTimeFormat(options.locale ?? "fa-IR", {
    ...(options.timeZone ? { timeZone: options.timeZone } : {}),
    ...(options.withDate ? { year: "numeric", month: "2-digit", day: "2-digit" } : {}),
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  return formatter.format(new Date(ms));
}
