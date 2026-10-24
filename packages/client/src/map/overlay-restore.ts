// `setData` and `setPaintProperty` schedule MapLibre style work. Calling them unconditionally
// from an `idle`/`styledata` listener can schedule the very next event, indefinitely. Those
// listeners should only restore resources removed by a style swap; data watchers own updates.
export interface OverlayPresence {
  styleLoaded: boolean;
  hasSource(id: string): boolean;
  hasLayer(id: string): boolean;
}

export function needsOverlayRestore(
  map: OverlayPresence, sourceIds: readonly string[], layerIds: readonly string[]
): boolean {
  return map.styleLoaded && (sourceIds.some((id) => !map.hasSource(id)) ||
    layerIds.some((id) => !map.hasLayer(id)));
}
