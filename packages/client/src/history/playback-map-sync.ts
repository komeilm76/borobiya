import type { PlaybackCollection, PlaybackFrameData, PlaybackLayerSpec, PlaybackStyleDescriptor } from "./playback";
import { PLAYBACK_SOURCE_IDS } from "./playback";

/**
 * The map-side half of playback: what has to happen to a maplibre style to move the three overlay
 * collections from one frame to the next, as data rather than as calls.
 *
 * Why this is a separate module and not a watcher inside the view: the ordering rules are real
 * maplibre constraints that fail loudly at runtime and cannot be exercised here (no DOM in the client
 * test environment) — `addLayer` throws while the style is still loading, a layer cannot reference a
 * source that does not exist yet, and `MapCanvas`'s `setStyle(…, { diff: true })` removes layers that
 * the new theme does not declare, so a theme switch silently deletes the track. Encoding the decision
 * as a plan makes all three testable, and leaves the component a dumb interpreter.
 */
export type PlaybackOp =
  | { readonly op: "addSource"; readonly id: string; readonly data: PlaybackCollection }
  | { readonly op: "setData"; readonly id: string; readonly data: PlaybackCollection }
  | { readonly op: "addLayer"; readonly layer: PlaybackLayerSpec; readonly beforeId?: string }
  | { readonly op: "setPaintProperty"; readonly id: string; readonly paint: PlaybackLayerSpec["paint"] }
  | { readonly op: "removeLayer"; readonly id: string }
  | { readonly op: "removeSource"; readonly id: string };

/** What the caller knows about the live map right now. */
export interface PlaybackMapState {
  /** `map.isStyleLoaded()` — adding a layer before that throws. */
  readonly styleLoaded: boolean;
  readonly hasSource: (id: string) => boolean;
  readonly hasLayer: (id: string) => boolean;
  /**
   * Id of the first layer that belongs to the live companion overlay, when there is one. Playback is
   * inserted below it so a companion's newest position always paints on top of the owner's history.
   */
  readonly firstLiveLayerId?: string;
}

const DATA_BY_SOURCE: Readonly<Record<string, keyof PlaybackFrameData>> = {
  [PLAYBACK_SOURCE_IDS.trace]: "trace",
  [PLAYBACK_SOURCE_IDS.played]: "played",
  [PLAYBACK_SOURCE_IDS.head]: "head"
};

/**
 * Bring the map up to date with one frame: create what is missing, update what is there.
 *
 * Sources created in this plan are created *with* the frame's data, so they do not also receive a
 * `setData`; paint is re-applied to layers that already exist because the style swap that removed them
 * may have happened between two frames and the colours would otherwise stay on the old theme.
 */
export function planPlaybackSync(state: PlaybackMapState, style: PlaybackStyleDescriptor, frame: PlaybackFrameData): PlaybackOp[] {
  if (!state.styleLoaded) return [];
  const ops: PlaybackOp[] = [];
  for (const source of style.sources) {
    const data = frame[DATA_BY_SOURCE[source.id]!];
    if (state.hasSource(source.id)) ops.push({ op: "setData", id: source.id, data });
    else ops.push({ op: "addSource", id: source.id, data });
  }
  for (const layer of style.layers) {
    if (state.hasLayer(layer.id)) ops.push({ op: "setPaintProperty", id: layer.id, paint: layer.paint });
    else ops.push({ op: "addLayer", layer, ...(state.firstLiveLayerId ? { beforeId: state.firstLiveLayerId } : {}) });
  }
  return ops;
}

/**
 * Take the overlay off the map, layers before sources — maplibre refuses to drop a source a layer still
 * references, which is the kind of teardown error that only appears when a user navigates away.
 */
export function planPlaybackRemoval(state: PlaybackMapState, style: PlaybackStyleDescriptor): PlaybackOp[] {
  const ops: PlaybackOp[] = [];
  for (const layer of style.layers) if (state.hasLayer(layer.id)) ops.push({ op: "removeLayer", id: layer.id });
  for (const source of [...style.sources].reverse()) if (state.hasSource(source.id)) ops.push({ op: "removeSource", id: source.id });
  return ops;
}
