import { describe, expect, it } from "vitest";
import {
  emptyCollection,
  historyPlaybackStyle,
  PLAYBACK_SOURCE_IDS,
  type PlaybackFrameData
} from "./playback";
import { planPlaybackRemoval, planPlaybackSync, type PlaybackMapState } from "./playback-map-sync";

const frame: PlaybackFrameData = { trace: emptyCollection(), played: emptyCollection(), head: emptyCollection() };

interface LiveMap {
  readonly sources?: string[];
  readonly layers?: string[];
  readonly styleLoaded?: boolean;
  readonly beforeLayerId?: string;
}

function withMap(loaded: LiveMap = {}): PlaybackMapState {
  return {
    styleLoaded: loaded.styleLoaded ?? true,
    hasSource: (id) => (loaded.sources ?? []).includes(id),
    hasLayer: (id) => (loaded.layers ?? []).includes(id),
    ...(loaded.beforeLayerId ? { beforeLayerId: loaded.beforeLayerId } : {})
  };
}

const ALL_SOURCES = [PLAYBACK_SOURCE_IDS.trace, PLAYBACK_SOURCE_IDS.played, PLAYBACK_SOURCE_IDS.head];

describe("planPlaybackSync", () => {
  it("does nothing until the style is loaded, because maplibre would throw", () => {
    expect(planPlaybackSync(withMap({ styleLoaded: false }), historyPlaybackStyle(false), frame)).toEqual([]);
  });

  it("creates the sources and layers on a cold map, sources first", () => {
    const style = historyPlaybackStyle(false);
    const ops = planPlaybackSync(withMap(), style, frame);
    expect(ops.map((entry) => entry.op)).toEqual([
      "addSource",
      "addSource",
      "addSource",
      "addLayer",
      "addLayer",
      "addLayer"
    ]);
    // A layer may only be added after the source it references exists, so every addLayer has to come
    // after its own addSource in the same plan.
    const layerIndexes = ops.map((entry, index) => (entry.op === "addLayer" ? index : -1)).filter((index) => index >= 0);
    const sourceIndexes = ops.map((entry, index) => (entry.op === "addSource" ? index : -1)).filter((index) => index >= 0);
    for (const layerIndex of layerIndexes) expect(Math.max(...sourceIndexes)).toBeLessThan(layerIndex);
    // Created with the frame's data already in place, so no follow-up setData is emitted for them.
    expect(ops.filter((entry) => entry.op === "setData")).toEqual([]);
    expect(ops[1]).toMatchObject({ id: PLAYBACK_SOURCE_IDS.played });
  });

  it("only pushes data and paint on a warm map", () => {
    const style = historyPlaybackStyle(false);
    const ops = planPlaybackSync(withMap({ sources: ALL_SOURCES, layers: style.layers.map((layer) => layer.id) }), style, frame);
    expect(ops.map((entry) => entry.op)).toEqual([
      "setData",
      "setData",
      "setData",
      "setPaintProperty",
      "setPaintProperty",
      "setPaintProperty"
    ]);
  });

  it("re-applies paint to existing layers so a theme switch cannot leave stale colours", () => {
    const dark = historyPlaybackStyle(true);
    const ops = planPlaybackSync(withMap({ sources: ALL_SOURCES, layers: dark.layers.map((layer) => layer.id) }), dark, frame);
    const paints = ops.filter((entry) => entry.op === "setPaintProperty");
    expect(paints).toHaveLength(3);
    expect((paints[1] as { paint: Record<string, unknown> }).paint["line-color"]).toBe(dark.layers[1]!.paint["line-color"]);
  });

  it("fills in whichever half is missing after the basemap removed the layers", () => {
    // This is the `setStyle({ diff: true })` case in `MapCanvas`: the sources it created earlier are
    // still there, every layer we added is gone.
    const style = historyPlaybackStyle(false);
    const ops = planPlaybackSync(withMap({ sources: ALL_SOURCES }), style, frame);
    expect(ops.map((entry) => entry.op)).toEqual([
      "setData",
      "setData",
      "setData",
      "addLayer",
      "addLayer",
      "addLayer"
    ]);
  });

  it("inserts below the live overlay so companion markers stay on top", () => {
    const ops = planPlaybackSync(withMap({ beforeLayerId: "borobiya-live" }), historyPlaybackStyle(false), frame);
    const added = ops.filter((entry) => entry.op === "addLayer");
    expect(added).toHaveLength(3);
    for (const entry of added) expect(entry).toMatchObject({ beforeId: "borobiya-live" });
  });

  it("omits beforeId when nobody names a layer to sit under", () => {
    const ops = planPlaybackSync(withMap(), historyPlaybackStyle(false), frame);
    for (const entry of ops.filter((candidate) => candidate.op === "addLayer")) expect(entry).not.toHaveProperty("beforeId");
  });
});

describe("planPlaybackRemoval", () => {
  it("drops layers before the sources they reference", () => {
    const style = historyPlaybackStyle(false);
    const ops = planPlaybackSync(withMap({ sources: ALL_SOURCES, layers: style.layers.map((layer) => layer.id) }), style, frame);
    expect(ops.length).toBeGreaterThan(0);
    const removal = planPlaybackRemoval(withMap({ sources: ALL_SOURCES, layers: style.layers.map((layer) => layer.id) }), style);
    expect(removal.map((entry) => entry.op)).toEqual([
      "removeLayer",
      "removeLayer",
      "removeLayer",
      "removeSource",
      "removeSource",
      "removeSource"
    ]);
    expect(removal[removal.length - 1]).toMatchObject({ id: PLAYBACK_SOURCE_IDS.trace });
  });

  it("skips what was never added, so unmounting a panel that never painted is not an error", () => {
    expect(planPlaybackRemoval(withMap(), historyPlaybackStyle(false))).toEqual([]);
    expect(planPlaybackRemoval(withMap({ sources: [PLAYBACK_SOURCE_IDS.head] }), historyPlaybackStyle(false))).toEqual([
      { op: "removeSource", id: PLAYBACK_SOURCE_IDS.head }
    ]);
  });
});
