/**
 * The maplibre overlay rules that every client-drawn layer shares (T2.1.8, T2.2.6).
 *
 * History playback and live companion markers are different data on the same canvas, and the ways to
 * get them wrong are identical: mutating a style that is still loading throws, a layer without its
 * source (or a source left behind after its layers) leaves the map half-painted, `addLayer(layer,
 * beforeId)` is the only way to keep one overlay under another, and dropping layers before their
 * source is the only order that does not orphan a live source. Saying the rules once is also the only
 * way to test them here: maplibre cannot run in this workspace (no DOM), so any other approach is a
 * mock that agrees with itself rather than with the library.
 *
 * This module deliberately never imports `maplibre-gl` — the package is lazy-loaded inside
 * `MapCanvas.vue` so the renderer stays out of the initial bundle, and a helper naming it would undo
 * that. The caller applies the plan; these types are the contract, and the tests assert the plan.
 */

/** MapLibre's coordinate order is `[longitude, latitude]` — the reverse of the API's named fields. */
export type MapPosition = [number, number];

export interface OverlayPointGeometry {
  readonly type: "Point";
  readonly coordinates: MapPosition;
}

export interface OverlayLineGeometry {
  readonly type: "LineString";
  readonly coordinates: MapPosition[];
}

export interface OverlayFeature {
  readonly type: "Feature";
  readonly geometry: OverlayPointGeometry | OverlayLineGeometry;
  readonly properties: Record<string, unknown>;
}

/**
 * One GeoJSON `FeatureCollection`, declared structurally: maplibre's `GeoJSONSource` is typed against
 * `@types/geojson`, which this workspace does not resolve, so the shape is spelled out here and cast at
 * the one place the maplibre types are crossed. Every conversion from `{lat, lon}` to `[lon, lat]`
 * belongs to that same call site: a polyline built from `[lat, lon]` pairs draws a plausible path across
 * the wrong continent and no component test would notice.
 */
export interface OverlayCollection {
  readonly type: "FeatureCollection";
  readonly features: OverlayFeature[];
}

/** A fresh empty collection — a new object per call, because maplibre compares `setData` by identity. */
export function emptyOverlay(): OverlayCollection {
  return { type: "FeatureCollection", features: [] };
}

/** One `LineString`, or empty: a one-vertex line is invalid GeoJSON and maplibre draws nothing from it. */
export function lineOverlay(coordinates: readonly MapPosition[]): OverlayCollection {
  if (coordinates.length < 2) return emptyOverlay();
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [...coordinates] } }]
  };
}

/** One `Point`, or none: an unknown position must not become a dot at `[0, 0]`, off the coast of Somalia. */
export function pointOverlay(position: MapPosition | null, properties: Record<string, unknown> = {}): OverlayCollection {
  if (!position) return emptyOverlay();
  return {
    type: "FeatureCollection",
    features: [{ type: "Feature", properties: { ...properties }, geometry: { type: "Point", coordinates: position } }]
  };
}

/**
 * Several `Point`s in one collection, each with its own properties. Markers need this because a
 * data-driven `["get", ...]` expression reads per-feature properties, which is how one layer paints a
 * fresh dot and a stale dot differently without two sources.
 */
export function pointsOverlay(points: readonly { readonly position: MapPosition; readonly properties?: Record<string, unknown> }[]): OverlayCollection {
  if (points.length === 0) return emptyOverlay();
  return {
    type: "FeatureCollection",
    features: points.map((point) => ({
      type: "Feature" as const,
      properties: { ...(point.properties ?? {}) },
      geometry: { type: "Point" as const, coordinates: point.position }
    }))
  };
}

export interface OverlaySourceSpec {
  readonly type: "geojson";
  readonly id: string;
  /** The initial data, so a source is never created empty and patched afterwards. */
  readonly data: OverlayCollection;
}

export interface OverlayLayerSpec {
  readonly id: string;
  readonly type: "line" | "circle";
  readonly source: string;
  readonly paint: Record<string, unknown>;
  readonly layout?: Record<string, unknown>;
}

/** The sources and layers one feature owns, in the order they have to be added. */
export interface OverlayStyle {
  readonly sources: OverlaySourceSpec[];
  readonly layers: OverlayLayerSpec[];
}

/** The subset of the maplibre API the planner asks about, so it runs against a stub while the view owns the real calls. */
export interface OverlayMapState {
  readonly styleLoaded: boolean;
  hasSource(id: string): boolean;
  hasLayer(id: string): boolean;
  /**
   * An existing layer to sit *under*, which is how live companion markers stay on top of the playback
   * line. Absent means "append", the only safe default: maplibre rejects an `beforeId` it cannot find,
   * and a local style is free not to declare a layer.
   */
  readonly beforeLayerId?: string;
}

export type OverlayOp =
  | { readonly op: "addSource"; readonly id: string; readonly data: OverlayCollection }
  | { readonly op: "setData"; readonly id: string; readonly data: OverlayCollection }
  | { readonly op: "addLayer"; readonly layer: OverlayLayerSpec; readonly beforeId?: string }
  | { readonly op: "setPaintProperty"; readonly id: string; readonly paint: Record<string, unknown> }
  | { readonly op: "removeLayer"; readonly id: string }
  | { readonly op: "removeSource"; readonly id: string };

/**
 * The operations that bring the map to `style` holding `dataFor(...)`.
 *
 * Idempotent by construction: the caller may run it on every frame, after a theme switch and after the
 * style finishes loading, without first asking whether anything changed. That matters because
 * `MapCanvas` answers a theme change with `setStyle(…, { diff: true })`, and a diff *removes* the layers
 * a new style does not declare — so both halves are re-ensured on every paint rather than assumed.
 */
export function planOverlaySync(state: OverlayMapState, style: OverlayStyle, dataFor: (sourceId: string) => OverlayCollection): OverlayOp[] {
  // Mutating a style that is still loading throws inside maplibre; the caller retries on its `ready` event.
  if (!state.styleLoaded) return [];
  const ops: OverlayOp[] = [];
  for (const source of style.sources) {
    const data = dataFor(source.id);
    ops.push(state.hasSource(source.id) ? { op: "setData", id: source.id, data } : { op: "addSource", id: source.id, data });
  }
  for (const layer of style.layers) {
    if (state.hasLayer(layer.id)) {
      // Paint only for an existing layer: a fresh add already carries the descriptor's colors, so
      // writing them again every tick would be a style mutation per frame for no visible change.
      ops.push({ op: "setPaintProperty", id: layer.id, paint: layer.paint });
      continue;
    }
    ops.push({
      op: "addLayer",
      layer,
      ...(state.beforeLayerId ? { beforeId: state.beforeLayerId } : {})
    });
  }
  return ops;
}

/**
 * The operations that take a feature off the map.
 *
 * Every layer first (in reverse, so the topmost goes before what it covers) and only then the sources,
 * also in reverse — maplibre warns about a source removed while a layer still reads it, and the reversed
 * order is also the mirror image of `planOverlaySync`, which is what makes the pair reviewable: run one
 * after the other and the map is exactly where it started.
 */
export function planOverlayRemoval(state: OverlayMapState, style: OverlayStyle): OverlayOp[] {
  const ops: OverlayOp[] = [];
  for (const layer of [...style.layers].reverse()) {
    if (state.hasLayer(layer.id)) ops.push({ op: "removeLayer", id: layer.id });
  }
  for (const source of [...style.sources].reverse()) {
    if (state.hasSource(source.id)) ops.push({ op: "removeSource", id: source.id });
  }
  return ops;
}
