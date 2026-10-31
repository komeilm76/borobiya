import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LocationHistoryPoint } from "@shared/index";
import {
  advanceCursor,
  HISTORY_LOAD_ISSUE_COPY,
  HISTORY_WINDOW_ISSUE_COPY,
  playbackIssueText,
  type PlaybackIssue,
  buildFrames,
  cursorProgress,
  DEFAULT_PLAYBACK_SPEED,
  DEFAULT_RANGE_PRESET_DAYS,
  emptyCollection,
  historyPlaybackStyle,
  historyWindowFromPreset,
  historyWindowIssue,
  isoToLocalInput,
  localInputToIso,
  nextFrameMs,
  playedCoordinates,
  playbackGeoJson,
  PLAYBACK_SOURCE_IDS,
  PLAYBACK_SPEEDS,
  positionAt,
  previousFrameMs,
  rangePresets,
  samplingState,
  timelineBounds,
  trackBounds,
  type PlaybackFrame
} from "./playback";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

function point(lat: number, lon: number, timestamp: string): LocationHistoryPoint {
  return { lat, lon, timestamp };
}

function frames(...entries: Array<[number, number, number]>): PlaybackFrame[] {
  return entries.map(([ms, lat, lon]) => ({ ms, lat, lon }));
}

describe("buildFrames", () => {
  it("turns the API's named coordinates into timeline frames", () => {
    expect(buildFrames([point(35.7, 51.4, "2026-10-21T10:00:00.000Z")])).toEqual([
      { ms: Date.parse("2026-10-21T10:00:00.000Z"), lat: 35.7, lon: 51.4 }
    ]);
  });

  it("drops rows it cannot place rather than drawing NaN geometry", () => {
    const kept = buildFrames([
      point(35.7, 51.4, "not a date"),
      point(Number.NaN, 51.4, "2026-10-21T10:00:00.000Z"),
      point(35.7, 51.4, "2026-10-21T10:00:00.000Z")
    ]);
    expect(kept).toEqual([{ ms: Date.parse("2026-10-21T10:00:00.000Z"), lat: 35.7, lon: 51.4 }]);
  });

  it("orders by observation time even when the response did not", () => {
    const sorted = buildFrames([
      point(35.8, 51.5, "2026-10-21T11:00:00.000Z"),
      point(35.6, 51.3, "2026-10-21T09:00:00.000Z"),
      point(35.7, 51.4, "2026-10-21T10:00:00.000Z")
    ]);
    expect(sorted.map((frame) => frame.ms)).toEqual([
      Date.parse("2026-10-21T09:00:00.000Z"),
      Date.parse("2026-10-21T10:00:00.000Z"),
      Date.parse("2026-10-21T11:00:00.000Z")
    ]);
  });

  it("answers an empty window with an empty track", () => {
    expect(buildFrames([])).toEqual([]);
    expect(timelineBounds([])).toBeNull();
    expect(positionAt([], Date.now())).toBeNull();
    expect(playedCoordinates([], Date.now())).toEqual([]);
  });
});

describe("positionAt", () => {
  const track = frames([0, 35.7, 51.4], [1000, 35.9, 51.6]);

  it("emits map order, longitude before latitude", () => {
    // The one conversion that would silently draw the trace in the wrong place: the API says
    // `{ lat: 35.7, lon: 51.4 }` and GeoJSON says `[51.4, 35.7]`.
    expect(positionAt(track, 0)).toEqual([51.4, 35.7]);
    expect(positionAt(track, 1000)).toEqual([51.6, 35.9]);
  });

  it("interpolates linearly in time between two frames", () => {
    expect(positionAt(track, 500)).toEqual([51.5, 35.8]);
    expect(positionAt(track, 250)).toEqual([51.45, 35.75]);
  });

  it("shows nothing before the first fix and holds the last position after the end", () => {
    expect(positionAt(track, -1)).toBeNull();
    expect(positionAt(track, 5000)).toEqual([51.6, 35.9]);
  });

  it("survives two frames at the same instant instead of dividing by zero", () => {
    const doubled = frames([1000, 35.7, 51.4], [1000, 35.9, 51.6]);
    const position = positionAt(doubled, 1000);
    expect(position).not.toBeNull();
    expect(position!.every(Number.isFinite)).toBe(true);
  });

  it("places a single-frame trace exactly on that frame", () => {
    const single = frames([1000, 35.7, 51.4]);
    expect(positionAt(single, 1000)).toEqual([51.4, 35.7]);
    expect(positionAt(single, 999)).toBeNull();
    expect(positionAt(single, 1001)).toEqual([51.4, 35.7]);
    expect(timelineBounds(single)).toEqual({ startMs: 1000, endMs: 1000 });
  });
});

describe("playedCoordinates", () => {
  const track = frames([0, 35, 51], [1000, 36, 52], [2000, 37, 53]);

  it("starts empty and grows without duplicating a vertex at a boundary", () => {
    expect(playedCoordinates(track, -1)).toEqual([]);
    expect(playedCoordinates(track, 0)).toEqual([[51, 35]]);
    expect(playedCoordinates(track, 1000)).toEqual([[51, 35], [52, 36]]);
  });

  it("carries the interpolated head so the line advances continuously", () => {
    expect(playedCoordinates(track, 1500)).toEqual([[51, 35], [52, 36], [52.5, 36.5]]);
  });

  it("is the whole trace once the cursor passes the end", () => {
    expect(playedCoordinates(track, 5000)).toEqual([[51, 35], [52, 36], [53, 37]]);
  });
});

describe("the cursor", () => {
  it("advances by elapsed wall time times the speed and never past the end", () => {
    expect(advanceCursor({ cursorMs: 0, elapsedMs: 1000, speed: 16, endMs: 1_000_000 })).toBe(16_000);
    expect(advanceCursor({ cursorMs: 1_000, elapsedMs: 10_000, speed: 60, endMs: 2_000 })).toBe(2_000);
  });

  it("ignores a negative delta and a negative speed rather than rewinding", () => {
    // A throttled or backgrounded tab delivers one huge (or, with a misbehaving clock, negative)
    // interval; the cursor must sit still or stop, not jump backwards through the trace.
    expect(advanceCursor({ cursorMs: 500, elapsedMs: -10_000, speed: 4, endMs: 10_000 })).toBe(500);
    expect(advanceCursor({ cursorMs: 500, elapsedMs: 1000, speed: -4, endMs: 10_000 })).toBe(500);
  });

  it("maps the cursor to slider progress, clamped", () => {
    const bounds = { startMs: 1000, endMs: 3000 };
    expect(cursorProgress(1000, bounds)).toBe(0);
    expect(cursorProgress(2000, bounds)).toBeCloseTo(0.5);
    expect(cursorProgress(9000, bounds)).toBe(1);
    expect(cursorProgress(0, bounds)).toBe(0);
    expect(cursorProgress(5, null)).toBe(0);
    // A one-frame trace is "finished" the moment the cursor reaches it.
    expect(cursorProgress(1000, { startMs: 1000, endMs: 1000 })).toBe(1);
    expect(cursorProgress(999, { startMs: 1000, endMs: 1000 })).toBe(0);
  });

  it("steps between recorded positions strictly, so a step never sticks", () => {
    const track = frames([0, 35, 51], [1000, 36, 52], [2000, 37, 53]);
    expect(nextFrameMs(track, 0)).toBe(1000);
    expect(nextFrameMs(track, 2000)).toBeNull();
    expect(previousFrameMs(track, 2000)).toBe(1000);
    expect(previousFrameMs(track, 0)).toBeNull();
  });
});

describe("playbackGeoJson", () => {
  const track = frames([0, 35, 51], [1000, 36, 52], [2000, 37, 53]);

  it("splits the full trace from the played prefix and the head", () => {
    const frame = playbackGeoJson(track, 500);
    expect(frame.trace.features[0]!.geometry).toEqual({
      type: "LineString",
      coordinates: [[51, 35], [52, 36], [53, 37]]
    });
    expect(frame.played.features[0]!.geometry).toEqual({
      type: "LineString",
      coordinates: [[51, 35], [51.5, 35.5]]
    });
    expect(frame.head.features[0]!.geometry).toEqual({ type: "Point", coordinates: [51.5, 35.5] });
  });

  it("sends empty collections rather than invalid geometry while nothing is played", () => {
    const frame = playbackGeoJson(track, -1);
    expect(frame.played.features).toEqual([]);
    expect(frame.head.features).toEqual([]);
    // A one-point trace cannot be a LineString, and maplibre's data validator would be right to
    // reject it: an empty collection is what "there is no path yet" means in GeoJSON.
    expect(playbackGeoJson(frames([0, 35, 51]), 0).played.features).toEqual([]);
    expect(emptyCollection()).toEqual({ type: "FeatureCollection", features: [] });
  });
});

describe("trackBounds", () => {
  it("refuses to frame a track that has no extent", () => {
    expect(trackBounds([])).toBeNull();
    expect(trackBounds(frames([0, 35, 51]))).toBeNull();
  });

  it("returns the southwest and northeast corners in map order", () => {
    const bounds = trackBounds(frames([0, 35, 51], [1000, 36, 52], [2000, 35.5, 50]));
    expect(bounds).toEqual([[50, 35], [52, 36]]);
  });
});

describe("historyPlaybackStyle", () => {
  it("declares a source for every layer, with unique ids", () => {
    for (const dark of [false, true]) {
      const style = historyPlaybackStyle(dark);
      const sourceIds = style.sources.map((source) => source.id);
      expect(new Set(sourceIds).size).toBe(sourceIds.length);
      expect(new Set(style.layers.map((layer) => layer.id)).size).toBe(style.layers.length);
      for (const layer of style.layers) expect(sourceIds).toContain(layer.source);
      expect(sourceIds).toEqual([
        PLAYBACK_SOURCE_IDS.trace,
        PLAYBACK_SOURCE_IDS.played,
        PLAYBACK_SOURCE_IDS.head
      ]);
      // Every source starts empty so adding it before the first load renders nothing instead of
      // throwing on a missing `data`.
      for (const source of style.sources) expect(source.data.features).toEqual([]);
    }
  });

  it("distinguishes the played path from the remaining trace in both themes", () => {
    const light = historyPlaybackStyle(false);
    const dark = historyPlaybackStyle(true);
    const [trace, played] = light.layers;
    expect(trace!.paint["line-dasharray"]).toEqual([2, 2]);
    expect(played!.paint["line-color"]).not.toBe(trace!.paint["line-color"]);
    expect(dark.layers[1]!.paint["line-color"]).not.toBe(light.layers[1]!.paint["line-color"]);
    expect(light.layers[2]!.type).toBe("circle");
  });
});

describe("range presets and hand-typed windows", () => {
  const nowMs = Date.parse("2026-10-21T12:00:00.000Z");

  it("names the last 7 days as a preset and defaults to it", () => {
    const days = rangePresets().map((preset) => preset.days);
    expect(days).toEqual([1, 7, 30]);
    expect(rangePresets().map((preset) => preset.id)).toEqual(["1d", "7d", "30d"]);
    // The shortcut the task names is the one the panel opens on, not an option the user has to find.
    expect(days).toContain(DEFAULT_RANGE_PRESET_DAYS);
  });

  it("measures the span in milliseconds, so a daylight-saving week is still 7 days", () => {
    const window = historyWindowFromPreset(7, nowMs);
    expect(window.to).toBe("2026-10-21T12:00:00.000Z");
    expect(Date.parse(window.to) - Date.parse(window.from)).toBe(7 * DAY);
    expect(historyWindowIssue(window)).toBeNull();
  });

  it("ends the window at the caller's clock instead of inventing a future one", () => {
    expect(historyWindowFromPreset(1, nowMs).to).toBe(new Date(nowMs).toISOString());
  });

  it("rejects the ranges that produce a confusing screen, and only those", () => {
    expect(historyWindowIssue({ from: "yesterday", to: "today" }, nowMs)).toBe("unparsable");
    expect(historyWindowIssue({ from: new Date(nowMs).toISOString(), to: new Date(nowMs).toISOString() }, nowMs)).toBe("order");
    expect(historyWindowIssue({ from: new Date(nowMs + DAY).toISOString(), to: new Date(nowMs + 2 * DAY).toISOString() }, nowMs)).toBe(
      "in_future"
    );
    // The clock is an argument, not a hidden `Date.now()`: a window a day ahead of `nowMs` is refused
    // whatever day the suite runs on. It was read off the wall clock until 2026-10-22, when the fixture's
    // date stopped being in the future and this assertion began failing by itself.
    // No span limit is imposed here on purpose: the server caps a *share* window at
    // `LOCATION_HISTORY_MAX_SHARE_DAYS` and does not cap reading one's own history, so a client bound
    // would refuse requests the API answers correctly.
    expect(
      historyWindowIssue({ from: new Date(nowMs - 400 * DAY).toISOString(), to: new Date(nowMs).toISOString() }, nowMs)
    ).toBeNull();
  });

  it("has wording for every state, and the wording is never the code", () => {
    // The rule the share dialog learned the hard way: a refusal that names nothing is not a refusal the
    // user can act on, and a `Record<…, string>` with a missing key renders `undefined` into the panel.
    const issues = [
      ...Object.keys(HISTORY_WINDOW_ISSUE_COPY),
      ...Object.keys(HISTORY_LOAD_ISSUE_COPY)
    ] as PlaybackIssue[];
    // Three window shapes plus four load states: a code added on one side without wording lands here.
    expect(issues).toHaveLength(7);
    for (const issue of issues) {
      const text = playbackIssueText(issue);
      expect(text.length).toBeGreaterThan(8);
      expect(text).not.toBe(issue);
      expect(text).not.toContain("undefined");
    }
  });

  it("offers only speeds the control can actually select", () => {
    expect(PLAYBACK_SPEEDS).toContain(1);
    expect([...PLAYBACK_SPEEDS]).toEqual([...PLAYBACK_SPEEDS].sort((a, b) => a - b));
    expect(new Set(PLAYBACK_SPEEDS).size).toBe(PLAYBACK_SPEEDS.length);
    expect(PLAYBACK_SPEEDS.every((speed) => Number.isInteger(speed) && speed > 0)).toBe(true);
    expect(PLAYBACK_SPEEDS).toContain(DEFAULT_PLAYBACK_SPEED);
  });
});

describe("the sampling notice", () => {
  it("says so when the view is a sample of the record", () => {
    expect(samplingState(1000, 8412)).toEqual({ sampled: true, ratio: 1000 / 8412 });
    expect(samplingState(12, 12).sampled).toBe(false);
    expect(samplingState(0, 0).ratio).toBe(0);
    // A contract change that ever reported fewer total points than shown must not render a ratio above 1.
    expect(samplingState(20, 10)).toEqual({ sampled: false, ratio: 1 });
  });
});

describe("local wall time in the range inputs", () => {
  it("round-trips a picked instant through ISO without shifting it", () => {
    const iso = localInputToIso("2026-10-21T18:00");
    expect(iso).not.toBeNull();
    // Feeding the raw `datetime-local` string to the API would be read as UTC; the conversion has to
    // produce an instant whose *local* reading is still 18:00, whatever zone the browser is in.
    expect(new Date(iso!).getTime()).toBe(new Date("2026-10-21T18:00").getTime());
    expect(isoToLocalInput(iso!)).toBe("2026-10-21T18:00");
  });

  it("refuses an empty or unparseable field instead of sending an invalid query", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso("2026-13-45T99:99")).toBeNull();
    expect(isoToLocalInput("not a date")).toBe("");
  });
});

/**
 * The panel and the view are not mounted in tests (repo convention: no `@vue/test-utils`, no jsdom), so
 * the few rules that live in their templates are pinned against their source — the same approach
 * `sharing/share-form.test.ts` uses for the share dialog.
 */
describe("the panel and the view", () => {
  const panel = readFileSync(new URL("../components/map/HistoryPlaybackPanel.vue", import.meta.url), "utf8");
  const view = readFileSync(new URL("../views/_user/UserMapView.vue", import.meta.url), "utf8");

  it("labels a range with the same duration words as the rest of the app", () => {
    expect(panel).toContain("formatDuration(days * 1440)");
    expect(panel).toContain("${pointCount.value} · ${formatDuration(span)}");
    expect(panel).toContain("formatLocalTime(");
    // No raw minute count in a template again, which is the mistake the share dialog already fixed.
    expect(panel).not.toMatch(/span\s*}\s*·\s*دقیقه/);
  });

  it("disables transport and scrub when there is no movable timeline or a new read is pending", () => {
    // A single fix has no interval to scrub. While a new read is pending, the old track still
    // has canPlay=true; the panel must not offer actions on it under the loading status.
    expect(panel.match(/:disabled="!api\.canPlay\.value \|\| api\.loading\.value"/g)?.length).toBe(5);
    expect(panel).toContain('v-if="!isOpen && api.canPlay.value && !api.loading.value"');
  });

  it("keeps the map instance out of the panel", () => {
    expect(panel).not.toContain("maplibre");
    expect(panel).not.toContain("addSource");
    expect(panel).not.toContain("setData");
  });

  it("routes every map mutation through the planner", () => {
    expect(view).toContain("planPlaybackSync(");
    expect(view).toContain("planPlaybackRemoval(");
    // The style swap `MapCanvas` performs on a theme change drops layers it does not declare, so the
    // overlay has to be re-ensured on `ready`, on every frame, and on a theme change.
    expect(view).toContain("watch(() => playback.frame.value, paintPlayback)");
    // A theme change now repaints both overlays, live first because playback asks to sit under it.
    expect(view).toContain("watch(() => playbackStyle.value, () => {");
    expect(view).toContain("paintLive();\n  paintPlayback();");
    expect(view).toContain("paintPlayback();\n  paintPointRoute();\n  syncOwnMarker();\n  syncDestinationMarker();\n  syncSelectedPlaceMarker();\n  syncResultMarkers();\n  syncPeerAvatars();\n  frameCamera();");
  });

  it("frames the camera once per track, and does not zoom into a single fix", () => {
    expect(view).toContain("playback.boundsForMap.value");
    expect(view).toContain("maxZoom: 15");
    expect(view).toContain("easeTo({ center: [only.lon, only.lat]");
    expect(view).toContain("if (fittedFor === key) return;");
  });
});
