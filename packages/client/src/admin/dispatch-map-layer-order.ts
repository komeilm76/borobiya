type LayerOrderMap = {
  getStyle(): { layers: readonly { id: string }[] } | undefined;
  getLayer(id: string): unknown;
  moveLayer(id: string): void;
};

/** Base style diffs can retain dispatch layers while inserting new POI layers
 * above them. Put all existing dispatch overlays back on top in their fixed
 * drawing order, with the selected incident pin last. Avoid moving anything
 * when already ordered: moveLayer fires styledata again. */
export function raiseDispatchLayers(map: LayerOrderMap, orderedIds: readonly string[]): void {
  const layers = map.getStyle()?.layers;
  if (!layers) return;
  const overlay = orderedIds.filter((id) => Boolean(map.getLayer(id)));
  if (!overlay.length) return;
  const tail = layers.slice(-overlay.length).map((layer) => layer.id);
  if (overlay.every((id, index) => tail[index] === id)) return;
  for (const id of overlay) map.moveLayer(id);
}
