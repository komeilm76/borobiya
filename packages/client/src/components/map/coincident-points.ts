import type { Marker } from "maplibre-gl";

/** Separate exactly coincident DOM points without changing their geographic
 * coordinates. A stable ring keeps each 44px control individually tappable;
 * isolated markers return to their original position when peers move away. */
export function spreadCoincidentPoints(markers: readonly (Marker | null)[], reserved: readonly (Marker | null)[] = []): void {
  const groups = new Map<string, Marker[]>();
  const locked = new Set(reserved.filter((marker): marker is Marker => marker !== null));
  for (const marker of [...markers, ...locked]) {
    if (!marker) continue;
    const { lng, lat } = marker.getLngLat();
    const key = `${lng.toFixed(7)},${lat.toFixed(7)}`;
    const group = groups.get(key) ?? [];
    group.push(marker);
    groups.set(key, group);
  }
  for (const group of groups.values()) {
    const movable = group.filter((marker) => !locked.has(marker));
    for (const marker of group) if (locked.has(marker)) marker.setOffset([0, 0]);
    movable.forEach((marker, index) => {
      const count = group.length;
      const spaced = movable.length;
      // Six controls on a 44px ring have >=44px center spacing. Additional
      // rings keep larger groups selectable rather than stacking hit targets.
      const ring = Math.floor(index / 6);
      const ringCount = Math.min(6, spaced - ring * 6);
      const radius = Math.max(30, ringCount * 7.5) + ring * 64;
      const angle = -Math.PI / 2 + 2 * Math.PI * (index % 6) / ringCount;
      marker.setOffset(count === 1 ? [0, 0] :
        [Math.round(Math.cos(angle) * radius), Math.round(Math.sin(angle) * radius)]);
    });
  }
}
