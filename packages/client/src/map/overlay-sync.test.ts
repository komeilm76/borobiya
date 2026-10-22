import { describe, expect, it } from "vitest";
import {
  emptyOverlay,
  lineOverlay,
  planOverlayRemoval,
  planOverlaySync,
  pointOverlay,
  pointsOverlay,
  type OverlayMapState,
  type OverlayOp,
  type OverlayStyle
} from "./overlay-sync";

const STYLE: OverlayStyle = {
  sources: [
    { type: "geojson", id: "s-a", data: emptyOverlay() },
    { type: "geojson", id: "s-b", data: emptyOverlay() }
  ],
  layers: [
    { id: "l-a1", type: "line", source: "s-a", paint: { "line-color": "#000" } },
    { id: "l-a2", type: "circle", source: "s-a", paint: { "circle-radius": 4 } },
    { id: "l-b1", type: "line", source: "s-b", paint: { "line-color": "#fff" }, layout: { visibility: "visible" } }
  ]
};

function map(options: { sources?: string[]; layers?: string[]; loaded?: boolean; beforeLayerId?: string } = {}): OverlayMapState {
  return {
    styleLoaded: options.loaded ?? true,
    hasSource: (id) => (options.sources ?? []).includes(id),
    hasLayer: (id) => (options.layers ?? []).includes(id),
    ...(options.beforeLayerId ? { beforeLayerId: options.beforeLayerId } : {})
  };
}

const ALL = { sources: ["s-a", "s-b"], layers: ["l-a1", "l-a2", "l-b1"] };

/** An `addLayer` op names its layer inside `layer`; every other op carries the id directly. */
function idOf(op: OverlayOp): string {
  return op.op === "addLayer" ? op.layer.id : op.id;
}

describe("planOverlaySync", () => {
  it("returns nothing while the style is loading, because maplibre would throw", () => {
    expect(planOverlaySync(map({ loaded: false }), STYLE, () => emptyOverlay())).toEqual([]);
  });

  it("adds every source before any layer, since a layer without its source is an error", () => {
    const ops = planOverlaySync(map(), STYLE, () => emptyOverlay());
    expect(ops.map((op) => op.op)).toEqual(["addSource", "addSource", "addLayer", "addLayer", "addLayer"]);
  });

  it("creates a source with its data instead of an empty source plus a setData", () => {
    const data = lineOverlay([[1, 2], [3, 4]]);
    const ops = planOverlaySync(map(), STYLE, (id) => (id === "s-a" ? data : emptyOverlay()));
    expect(ops[0]).toEqual({ op: "addSource", id: "s-a", data });
    expect(ops[1]).toEqual({ op: "addSource", id: "s-b", data: expect.objectContaining({ features: [] }) });
  });

  it("updates an existing source and paints an existing layer, without re-adding either", () => {
    const ops = planOverlaySync(map(ALL), STYLE, () => emptyOverlay());
    expect(ops.map((op) => op.op)).toEqual(["setData", "setData", "setPaintProperty", "setPaintProperty", "setPaintProperty"]);
  });

  it("paints only the property sets the descriptor declares, in the descriptor's own values", () => {
    const ops = planOverlaySync(map({ ...ALL, layers: ["l-a1"] }), STYLE, () => emptyOverlay());
    const painted = ops.filter((op) => op.op === "setPaintProperty");
    expect(painted[0]).toEqual({ op: "setPaintProperty", id: "l-a1", paint: { "line-color": "#000" } });
    // Only the layer that already exists is touched; the others are being added with their paint.
    expect(painted).toHaveLength(1);
  });

  it("sits under a named layer when the caller passes one, and appends when it does not", () => {
    const below = planOverlaySync(map({ beforeLayerId: "base-water" }), STYLE, () => emptyOverlay()).filter((op) => op.op === "addLayer");
    for (const op of below) expect(op).toMatchObject({ beforeId: "base-water" });
    const onTop = planOverlaySync(map(), STYLE, () => emptyOverlay()).filter((op) => op.op === "addLayer");
    for (const op of onTop) expect(op).not.toHaveProperty("beforeId");
  });

  it("re-ensures the half a style diff removed, which is why a theme change repaints safely", () => {
    const ops = planOverlaySync(map({ sources: ["s-a", "s-b"] }), STYLE, () => emptyOverlay());
    expect(ops.map((op) => op.op)).toEqual(["setData", "setData", "addLayer", "addLayer", "addLayer"]);
  });

  it("is idempotent: planning twice against an unchanged map costs nothing the second time", () => {
    const first = planOverlaySync(map(ALL), STYLE, () => emptyOverlay());
    const second = planOverlaySync(map(ALL), STYLE, () => emptyOverlay());
    expect(second).toEqual(first);
    expect(first.every((op) => op.op === "setData" || op.op === "setPaintProperty")).toBe(true);
  });
});

describe("planOverlayRemoval", () => {
  it("drops every layer before any source, in reverse order", () => {
    const ops = planOverlayRemoval(map(ALL), STYLE);
    expect(ops.map((op) => op.op)).toEqual(["removeLayer", "removeLayer", "removeLayer", "removeSource", "removeSource"]);
    expect(ops.map(idOf)).toEqual(["l-b1", "l-a2", "l-a1", "s-b", "s-a"]);
  });

  it("skips what was never added, so tearing down an unpainted overlay is not an error", () => {
    expect(planOverlayRemoval(map(), STYLE)).toEqual([]);
    expect(planOverlayRemoval(map({ sources: ["s-b"] }), STYLE)).toEqual([{ op: "removeSource", id: "s-b" }]);
  });

  it("leaves the map exactly where it started, which is what makes the pair reviewable", () => {
    const added = planOverlaySync(map(), STYLE, () => emptyOverlay()).map(idOf);
    const removed = planOverlayRemoval(map(ALL), STYLE).map(idOf);
    expect([...removed].sort()).toEqual([...added].sort());
  });
});

describe("overlay data builders", () => {
  it("refuses to draw a line through one point, which is invalid GeoJSON", () => {
    expect(lineOverlay([[1, 2]]).features).toEqual([]);
    expect(lineOverlay([]).features).toEqual([]);
    expect(lineOverlay([[1, 2], [3, 4]]).features[0]?.geometry).toEqual({ type: "LineString", coordinates: [[1, 2], [3, 4]] });
  });

  it("draws no point for an unknown position rather than one at [0, 0]", () => {
    expect(pointOverlay(null).features).toEqual([]);
    expect(pointOverlay([51.4, 35.7], { name: "x" }).features[0]).toEqual({
      type: "Feature",
      properties: { name: "x" },
      geometry: { type: "Point", coordinates: [51.4, 35.7] }
    });
  });

  it("copies the properties it is handed instead of sharing one object between features", () => {
    const properties = { stale: 0 };
    const collection = pointsOverlay([{ position: [1, 1], properties }, { position: [2, 2], properties }]);
    expect(collection.features[0]?.properties).not.toBe(collection.features[1]?.properties);
    expect(collection.features[1]?.properties).toEqual({ stale: 0 });
  });

  it("returns an empty collection for no points, which clears a layer without removing it", () => {
    expect(pointsOverlay([])).toEqual({ type: "FeatureCollection", features: [] });
  });
});
