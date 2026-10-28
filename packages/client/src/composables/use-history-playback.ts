import { computed, onScopeDispose, ref, shallowRef, watch, type ComputedRef, type Ref } from "vue";
import type { LocationHistoryPoint, ReceivedLocationHistoryShare } from "@shared/index";
import { ApiError } from "@/api/http";
import { fetchMyLocationHistory, fetchSharedLocationHistory, listLocationHistoryShares } from "@/api/location";
import {
  advanceCursor,
  buildFrames,
  cursorProgress,
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_RANGE_PRESET_DAYS,
  historyWindowFromPreset,
  historyWindowIssue,
  isoToLocalInput,
  localInputToIso,
  nextFrameMs,
  playbackGeoJson,
  positionAt,
  previousFrameMs,
  samplingState,
  timelineBounds,
  trackBounds,
  type HistoryLoadIssue,
  type HistoryWindow,
  type HistoryWindowIssue
} from "@/history/playback";

/**
 * The state behind the history playback panel: which window was asked for, what came back, and where
 * the cursor is. All the geometry lives in `@/history/playback`; this file only decides *when* those
 * pure functions run.
 *
 * Three rules here are load-bearing enough to spell out:
 * - **a reloaded track restarts the cursor**, because playing from a position that no longer exists in
 *   the new window would show the first point of an unrelated range while the slider claims otherwise;
 * - **responses are matched to the request that produced them** (same `requestId` discipline as
 *   `useTargetSearch`): two quick chip presses must not let the older, slower response overwrite the
 *   newer track and leave the panel displaying one range under another's label;
 * - **the cursor never leaves the recorded interval**, and the loop stops at the end rather than
 *   idling at max progress, which would leave a play button that does nothing.
 */
export type PlaybackSourceKind = "own" | "grant";

/**
 * The loop runs on a 50 ms interval instead of `requestAnimationFrame` on purpose. A rAF callback is
 * *paused* in a hidden tab, so the first tick after the tab returns carries a delta of minutes and the
 * marker teleports; an interval keeps firing while throttled and the clamp in {@link tick} turns that
 * into a briefly slower playback, which is what a user reading a trace would expect. 20 fps is enough
 * for a polyline to look continuous and cheap enough to run on a phone.
 */
export const PLAYBACK_TICK_MS = 50;
/** Ceiling for one tick's advance, in wall-clock ms. See the note above. */
export const PLAYBACK_MAX_TICK_DELTA_MS = 250;

/** Everything the panel and the view share; the component's only prop. */
export type HistoryPlayback = ReturnType<typeof useHistoryPlayback>;

export interface UseHistoryPlaybackOptions {
  accessToken: ComputedRef<string | null> | Ref<string | null>;
  ensureSession?: () => Promise<void>;
  refreshSession?: () => Promise<boolean>;
}

export function useHistoryPlayback(options: UseHistoryPlaybackOptions) {
  // Read through `Date.now` on every tick rather than capturing a clock once: the tests drive time with
  // fake timers, which patch `Date.now`, and a captured reference would have to be injected for no
  // benefit the component actually uses.
  const now = () => Date.now();

  const sourceKind = ref<PlaybackSourceKind>("own");
  const grantId = ref("");
  const grants = ref<ReceivedLocationHistoryShare[]>([]);
  const grantsLoading = ref(false);
  const grantsLoaded = ref(false);
  const grantsFailed = ref(false);

  const presetDays = ref<number>(DEFAULT_RANGE_PRESET_DAYS);
  const fromInput = ref("");
  const toInput = ref("");

  // `shallowRef`: the response can be the full read budget (1000 points). Deep reactivity would wrap
  // every point in a proxy and the frame computed would walk it on each of the 20 ticks a second.
  const points = shallowRef<LocationHistoryPoint[]>([]);
  const totalPoints = ref(0);
  const loading = ref(false);
  const failed = ref(false);
  const windowIssue = ref<HistoryWindowIssue | null>(null);
  const loadIssue = ref<HistoryLoadIssue | null>(null);

  const cursorMs = ref(0);
  const playing = ref(false);
  const speed = ref<number>(DEFAULT_PLAYBACK_SPEED);

  const frames = computed(() => buildFrames(points.value));
  const bounds = computed(() => timelineBounds(frames.value));
  const hasTrack = computed(() => frames.value.length > 0);
  /** A single recorded fix is a position, not a path: there is nothing to play between. */
  const canPlay = computed(() => frames.value.length > 1);
  const progress = computed(() => cursorProgress(cursorMs.value, bounds.value));
  const position = computed(() => positionAt(frames.value, cursorMs.value));
  const frame = computed(() => playbackGeoJson(frames.value, cursorMs.value));
  const sampling = computed(() => samplingState(points.value.length, totalPoints.value));
  const boundsForMap = computed(() => trackBounds(frames.value));

  let requestId = 0;
  let grantsRequestId = 0;
  let timer: ReturnType<typeof setInterval> | null = null;
  let lastTickAt = 0;

  function currentWindow(): HistoryWindow | null {
    const from = localInputToIso(fromInput.value);
    const to = localInputToIso(toInput.value);
    if (!from || !to) return null;
    return { from, to };
  }

  function clearTrack(): void {
    points.value = [];
    totalPoints.value = 0;
    cursorMs.value = 0;
  }

  function stopTimer(): void {
    if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    playing.value = false;
  }

  function selectPreset(days: number): Promise<void> {
    presetDays.value = days;
    const window = historyWindowFromPreset(days, now());
    fromInput.value = isoToLocalInput(window.from);
    toInput.value = isoToLocalInput(window.to);
    return load();
  }

  /** Hand-editing the fields is its own choice, so the chip highlight has to go. */
  function setManualRange(from: string, to: string): Promise<void> {
    presetDays.value = 0;
    fromInput.value = from;
    toInput.value = to;
    return load();
  }

  async function loadShares(): Promise<void> {
    if (grantsLoading.value) return;
    const requestIdForThisLoad = ++grantsRequestId;
    grantsLoading.value = true;
    try {
      if (options.ensureSession) await options.ensureSession();
      if (requestIdForThisLoad !== grantsRequestId) return;
      const accessToken = options.accessToken.value;
      if (!accessToken) return;
      let response;
      try {
        response = await listLocationHistoryShares(accessToken);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && options.refreshSession) {
          const refreshed = await options.refreshSession();
          // Another account/read may have replaced this one while the 401 recovery waited.
          // Never replay its private grant list with the new session's bearer.
          if (requestIdForThisLoad !== grantsRequestId) return;
          if (refreshed && options.accessToken.value) {
            response = await listLocationHistoryShares(options.accessToken.value);
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      if (requestIdForThisLoad !== grantsRequestId) return;
      grants.value = response.sharedWithMe;
      grantsLoaded.value = true;
      grantsFailed.value = false;
      if (grantId.value && !response.sharedWithMe.some((grant) => grant.id === grantId.value)) {
        stopTimer();
        grantId.value = "";
        clearTrack();
        if (sourceKind.value === "grant") {
          failed.value = true;
          loadIssue.value = "grant_gone";
        }
      }
    } catch {
      // A failed refresh keeps the list the user is already choosing from (and any track already on the
      // map playable): the panel reports `grantsFailed` next to a list that may be a moment stale,
      // rather than silently replacing it with nothing.
      if (requestIdForThisLoad === grantsRequestId) grantsFailed.value = true;
    } finally {
      if (requestIdForThisLoad === grantsRequestId) grantsLoading.value = false;
    }
  }

  async function load(): Promise<void> {
    // Invalidate the previous read *before* session refresh or window validation: even an
    // invalid next range must prevent an older response from repainting the map.
    const requestIdForThisLoad = ++requestId;
    stopTimer();
    loading.value = true;
    windowIssue.value = null;
    loadIssue.value = null;
    failed.value = false;
    try {
      if (options.ensureSession) await options.ensureSession();
    } catch {
      if (requestIdForThisLoad !== requestId) return;
      clearTrack();
      loadIssue.value = "request_failed";
      failed.value = true;
      loading.value = false;
      return;
    }
    if (requestIdForThisLoad !== requestId) return;
    const accessToken = options.accessToken.value;
    if (!accessToken) {
      loadIssue.value = "no_token";
      failed.value = true;
      clearTrack();
      loading.value = false;
      return;
    }

    // What the request actually is, decided once: reading your own history needs a range the user
    // picked, reading a grant needs only the grant id. Building the plan here (rather than re-deriving
    // it inside the `try`) is what keeps the two shapes from drifting, and keeps the range check from
    // ever being applied to a shared read.
    //
    // A shared read carries the grant id and nothing else — the owner fixed the range and the density
    // when they granted it — so validating the picker's fields there would refuse a request the server
    // answers, and leave the user reading an error about a date they were never asked to edit.
    let plan: { kind: "own"; window: HistoryWindow } | { kind: "grant"; shareId: string };
    if (sourceKind.value === "own") {
      const window = currentWindow();
      const issue = window ? historyWindowIssue(window, now()) : "unparsable";
      if (!window || issue) {
        windowIssue.value = issue;
        failed.value = true;
        clearTrack();
        loading.value = false;
        return;
      }
      plan = { kind: "own", window };
    } else {
      if (!grantId.value) {
        loadIssue.value = "grant_required";
        failed.value = true;
        clearTrack();
        loading.value = false;
        return;
      }
      plan = { kind: "grant", shareId: grantId.value };
    }

    const runPlan = (token: string) =>
      plan.kind === "own"
        ? fetchMyLocationHistory(plan.window, token)
        : fetchSharedLocationHistory(plan.shareId, token);
    try {
      let response;
      try {
        response = await runPlan(accessToken);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && options.refreshSession) {
          const refreshed = await options.refreshSession();
          // A canceled range (including logout/account switch) must not be retried with
          // whatever bearer now happens to be current.
          if (requestIdForThisLoad !== requestId) return;
          if (refreshed && options.accessToken.value) {
            response = await runPlan(options.accessToken.value);
          } else {
            throw error;
          }
        } else {
          throw error;
        }
      }
      if (requestIdForThisLoad !== requestId) return;
      points.value = response.points;
      totalPoints.value = response.totalPoints;
      const nextBounds = timelineBounds(buildFrames(response.points));
      cursorMs.value = nextBounds ? nextBounds.startMs : 0;
    } catch (error) {
      if (requestIdForThisLoad !== requestId) return;
      clearTrack();
      failed.value = true;
      // Only a grant the server says is gone is reported as gone; a network blip or a 500 on a
      // receiver's read must not tell them their friend deleted the share.
      loadIssue.value =
        plan.kind === "grant" && error instanceof ApiError && (error.status === 404 || error.code === "SHARE_NOT_FOUND")
          ? "grant_gone"
          : "request_failed";
    } finally {
      if (requestIdForThisLoad === requestId) loading.value = false;
    }
  }

  function tick(): void {
    const interval = bounds.value;
    if (!interval) {
      stopTimer();
      return;
    }
    const at = now();
    const elapsed = Math.max(0, Math.min(at - lastTickAt, PLAYBACK_MAX_TICK_DELTA_MS));
    lastTickAt = at;
    cursorMs.value = advanceCursor({ cursorMs: cursorMs.value, elapsedMs: elapsed, speed: speed.value, endMs: interval.endMs });
    if (cursorMs.value >= interval.endMs) stopTimer();
  }

  function play(): void {
    const interval = bounds.value;
    if (!interval || !canPlay.value || timer !== null) return;
    // Pressing play at the end rewinds: the alternative is a button that appears to do nothing.
    if (cursorMs.value >= interval.endMs) cursorMs.value = interval.startMs;
    playing.value = true;
    lastTickAt = now();
    timer = setInterval(tick, PLAYBACK_TICK_MS);
  }

  function pause(): void {
    stopTimer();
  }

  function toggle(): void {
    if (timer !== null) pause();
    else play();
  }

  function stepTo(next: number | null): void {
    const interval = bounds.value;
    if (!interval || next === null) return;
    stopTimer();
    cursorMs.value = Math.min(Math.max(next, interval.startMs), interval.endMs);
  }

  function stepNext(): void {
    stepTo(nextFrameMs(frames.value, cursorMs.value));
  }

  function stepPrevious(): void {
    stepTo(previousFrameMs(frames.value, cursorMs.value));
  }

  /** The slider is 0..1 so a track of any length shares one control; see `cursorProgress`. */
  function seekProgress(value: number): void {
    const interval = bounds.value;
    if (!interval) return;
    stopTimer();
    const ratio = Math.min(Math.max(value, 0), 1);
    cursorMs.value = interval.startMs + (interval.endMs - interval.startMs) * ratio;
  }

  function setSpeed(value: number): void {
    speed.value = Number.isFinite(value) && value > 0 ? value : DEFAULT_PLAYBACK_SPEED;
  }

  function selectSource(kind: PlaybackSourceKind): void {
    if (sourceKind.value === kind) return;
    sourceKind.value = kind;
    if (kind === "grant") {
      void loadShares();
    } else {
      grantId.value = "";
    }
    void load();
  }

  function selectGrant(id: string): void {
    grantId.value = id;
    // A grant carries its own window and density, so the picker's fields are not what a shared read
    // uses; clearing them here would suggest the user's edit changed what the owner permitted.
    void load();
  }

  // Sign-out must synchronously invalidate both reads: otherwise a response that was already in
  // flight can repopulate a previous account's private track or share list after auth is cleared.
  watch(options.accessToken, (token) => {
    if (token) return;
    ++requestId;
    ++grantsRequestId;
    stopTimer();
    clearTrack();
    loading.value = false;
    grants.value = [];
    grantsLoading.value = false;
    grantsLoaded.value = false;
    grantsFailed.value = false;
    grantId.value = "";
    sourceKind.value = "own";
  }, { flush: "sync" });

  onScopeDispose(() => {
    ++requestId;
    ++grantsRequestId;
    stopTimer();
  });

  return {
    sourceKind,
    grantId,
    grants,
    grantsLoading,
    grantsLoaded,
    grantsFailed,
    presetDays,
    fromInput,
    toInput,
    points,
    totalPoints,
    loading,
    failed,
    windowIssue,
    loadIssue,
    cursorMs,
    playing,
    speed,
    frames,
    bounds,
    hasTrack,
    canPlay,
    progress,
    position,
    frame,
    sampling,
    boundsForMap,
    selectPreset,
    setManualRange,
    load,
    loadShares,
    play,
    pause,
    toggle,
    stepNext,
    stepPrevious,
    seekProgress,
    setSpeed,
    selectSource,
    selectGrant
  };
}
