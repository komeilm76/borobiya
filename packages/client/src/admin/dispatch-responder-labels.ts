/** Only individually rendered, currently authorised nearby responders get a
 * DOM name chip. Cluster bubbles represent groups, not a separate name for
 * every underlying coordinate. Selected responders have their own unclustered
 * pin layer, so they remain named even when the nearby source clusters. */
export function visibleResponderLabelIds(
  rendered: readonly { layer: { id: string }; properties: { id?: unknown } | null }[],
  eligibleIds: ReadonlySet<string>, individualLayerIds: ReadonlySet<string>
): Set<string> {
  const visible = new Set<string>();
  for (const feature of rendered) {
    const id = feature.properties?.id;
    if (individualLayerIds.has(feature.layer.id) && typeof id === "string" && eligibleIds.has(id))
      visible.add(id);
  }
  return visible;
}

type LabelBounds = { left: number; right: number; top: number; bottom: number };

/** DOM chips paint above WebGL regardless of the pin layer's order. Reserve
 * the selected incident's painted head so a responder chip cannot cover it. */
export function selectedSosPinBounds(x: number, y: number, pinReady: boolean): LabelBounds {
  return pinReady
    ? { left: x - 26, right: x + 26, top: y - 59, bottom: y + 6 }
    : { left: x - 18, right: x + 18, top: y - 18, bottom: y + 18 };
}

/** Keep selected names readable first. Hiding a colliding chip never hides its
 * actual WebGL pin, changes its coordinate, or removes its accessible list row. */
export function nonOverlappingResponderLabelIds(
  candidates: readonly { id: string; selected: boolean; bounds: LabelBounds }[],
  reserved: readonly LabelBounds[] = []
): Set<string> {
  const placed = [...reserved];
  const visible = new Set<string>();
  for (const candidate of [...candidates].sort((a, b) => Number(b.selected) - Number(a.selected))) {
    const box = candidate.bounds;
    if (placed.some((other) => box.left < other.right + 4 && box.right + 4 > other.left &&
      box.top < other.bottom + 4 && box.bottom + 4 > other.top)) continue;
    visible.add(candidate.id);
    placed.push(box);
  }
  return visible;
}
