import type { DispatchSosLabelPlacement } from "./dispatch-sos-label";

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
type Side = DispatchSosLabelPlacement["side"];

/** DOM chips paint above WebGL regardless of the pin layer's order. Reserve
 * the selected incident's painted head so a responder chip cannot cover it. */
export function selectedSosPinBounds(x: number, y: number, pinReady: boolean): LabelBounds {
  return pinReady
    ? { left: x - 26, right: x + 26, top: y - 59, bottom: y + 6 }
    : { left: x - 18, right: x + 18, top: y - 18, bottom: y + 18 };
}

/** Try every pin-attached direction before hiding a crowded name. The DOM
 * supplies measured bounds (including RTL wrapping and edge shifts); null
 * means that direction would clip off the map. Selected responders go first,
 * and the selected SOS chip and pin are already reserved. A hidden name never
 * hides its real WebGL pin or accessible list entry. */
export function placeResponderLabels(
  candidates: readonly { id: string; selected: boolean; preferred: Side }[],
  measure: (id: string, side: Side) => LabelBounds | null,
  reserved: readonly LabelBounds[] = []
): Map<string, Side> {
  const placed = [...reserved];
  const visible = new Map<string, Side>();
  for (const candidate of [...candidates].sort((a, b) => Number(b.selected) - Number(a.selected) || a.id.localeCompare(b.id))) {
    for (const side of new Set<Side>([candidate.preferred, "right", "left", "below", "above"])) {
      const box = measure(candidate.id, side);
      if (!box || placed.some((other) => box.left < other.right + 4 && box.right + 4 > other.left &&
        box.top < other.bottom + 4 && box.bottom + 4 > other.top)) continue;
      visible.set(candidate.id, side);
      placed.push(box);
      break;
    }
  }
  return visible;
}
