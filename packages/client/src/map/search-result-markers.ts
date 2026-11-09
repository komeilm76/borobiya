import type { GeocodeResult } from "@shared/index";

/** Group projected hits whose compact category pins/count bubbles would overlap.
 * Connected components ensure a chain cannot leave two cluster buttons atop
 * each other. Keep the snapshot order (and every hit) for stable list selection.
 */
export function groupSearchResults(
  places: readonly GeocodeResult[], project: (place: GeocodeResult) => { x: number; y: number },
  chipWidth = 56, chipHeight = 56
): GeocodeResult[][] {
  const points = places.map(project);
  const parent = places.map((_, index) => index);
  const root = (index: number): number => {
    while (parent[index] !== index) index = parent[index]!;
    return index;
  };
  for (let i = 0; i < places.length; i++) {
    for (let j = i + 1; j < places.length; j++) {
      // Reserve an 8px gap around pins/count bubbles at the current zoom.
      const dx = (points[i]!.x - points[j]!.x) / (chipWidth + 8);
      const dy = (points[i]!.y - points[j]!.y) / (chipHeight + 8);
      if (Math.hypot(dx, dy) >= 1) continue;
      parent[root(j)] = root(i);
    }
  }
  const groups = new Map<number, GeocodeResult[]>();
  places.forEach((place, index) => {
    const id = root(index);
    const group = groups.get(id) ?? [];
    group.push(place);
    groups.set(id, group);
  });
  return [...groups.values()];
}

/** Offset a centered name label to the clipped map canvas, not the browser.
 * Callers cap the label's max-width to the map's inner width first; if an
 * exceptionally large label still cannot fit, center its overflow instead.
 */
export function mapLabelShift(labelLeft: number, labelRight: number, mapLeft: number, mapRight: number): number {
  if (![labelLeft, labelRight, mapLeft, mapRight].every(Number.isFinite) || mapLeft >= mapRight) return 0;
  const min = mapLeft + 8 - labelLeft;
  const max = mapRight - 8 - labelRight;
  return min > max ? (min + max) / 2 : Math.max(min, Math.min(0, max));
}

/** Cluster taps zoom in by two levels, bounded by the installed map's max zoom.
 * At max zoom, identical-coordinate (or still-overlapping) hits need the list.
 */
export function nextClusterZoom(current: number, max: number): number | null {
  if (!Number.isFinite(current) || !Number.isFinite(max)) return null;
  const target = Math.min(current + 2, max);
  return target - current >= 0.05 ? target : null;
}

/** Keep the camera bounded to the displayed snapshot, never to stale/unvalidated hits. */
export function resultExtent(places: readonly GeocodeResult[]): [[number, number], [number, number]] | null {
  if (!places.length) return null;
  let west = Infinity, east = -Infinity, south = Infinity, north = -Infinity;
  for (const place of places) {
    west = Math.min(west, place.lon); east = Math.max(east, place.lon);
    south = Math.min(south, place.lat); north = Math.max(north, place.lat);
  }
  return [[west, south], [east, north]];
}

/** Phone padding clears the app bar, dock and marker offsets; desktop clears side cards. */
export function resultCameraPadding(width: number, height: number, phone: boolean) {
  if (phone) return {
    top: Math.min(150, Math.round(height * 0.43)), bottom: Math.min(128, Math.round(height * 0.32)),
    left: Math.min(64, Math.round(width * 0.17)), right: Math.min(64, Math.round(width * 0.17))
  };
  if (width >= 1024) {
    const side = Math.min(440, Math.round(width * 0.43));
    return { top: 88, bottom: 72, left: side, right: side };
  }
  return { top: 48, bottom: 48, left: 48, right: 48 };
}
