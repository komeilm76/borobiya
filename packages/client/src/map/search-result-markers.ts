import type { GeocodeResult } from "@shared/index";

/** Displace only exact-coordinate duplicates so every result remains independently tappable. */
export function resultMarkerOffsets(places: readonly GeocodeResult[]): Map<string, [number, number]> {
  const groups = new Map<string, GeocodeResult[]>();
  for (const place of places) {
    const key = `${place.lon}:${place.lat}`;
    const group = groups.get(key) ?? [];
    group.push(place);
    groups.set(key, group);
  }
  const offsets = new Map<string, [number, number]>();
  for (const group of groups.values()) {
    if (group.length === 1) { offsets.set(group[0]!.placeId, [0, 0]); continue; }
    // All callouts in a duplicate group use the same radius. An individual
    // radius per result can pull two neighboring labels back into each other.
    const angles = group.map((_, index) => 2 * Math.PI * index / group.length - Math.PI / 2);
    const width = group.length > 12 ? 128 : 168; // Matches the capped CSS widths.
    let radius = 0;
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const dx = Math.abs(Math.cos(angles[i]!) - Math.cos(angles[j]!));
        const dy = Math.abs(Math.sin(angles[i]!) - Math.sin(angles[j]!));
        // Clearing either axis separates these 48px-tall rectangles. Add a
        // gap before rounding the pixel offsets and cap name width in CSS.
        radius = Math.max(radius, Math.min(dx ? (width + 12) / dx : Infinity, dy ? 60 / dy : Infinity));
      }
    }
    group.forEach((place, index) => {
      const angle = angles[index]!;
      offsets.set(place.placeId, [Math.round(radius * Math.cos(angle)), Math.round(radius * Math.sin(angle))]);
    });
  }
  return offsets;
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
