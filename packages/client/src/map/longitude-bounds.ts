/* MapLibre fitBounds accepts longitudes beyond ±180, representing the adjacent
 * world copy. A local mission crossing the date line must not fit the entire
 * globe just because its validated coordinates wrap from 179° to -179°. */
function canonicalLongitude(lon: number): number {
  return lon >= -180 && lon < 180 ? lon : ((lon + 180) % 360 + 360) % 360 - 180;
}

/** Smallest longitude arc containing a set of local points; result is [west, east] with east >= west. */
export function shortestLongitudeBounds(longitudes: readonly number[]): [number, number] {
  if (!longitudes.length) throw new Error("A longitude bound requires at least one point.");
  const sorted = longitudes.map(canonicalLongitude).sort((a, b) => a - b);
  if (sorted.length === 1) return [sorted[0]!, sorted[0]!];
  // Remove the largest empty gap on the longitude circle. Prefer an ordinary
  // unwrapped interval if two gaps tie (e.g. exactly opposite longitudes).
  let gapIndex = sorted.length - 1;
  let largestGap = sorted[0]! + 360 - sorted[gapIndex]!;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gap = sorted[i + 1]! - sorted[i]!;
    if (gap > largestGap) { largestGap = gap; gapIndex = i; }
  }
  return gapIndex === sorted.length - 1
    ? [sorted[0]!, sorted[gapIndex]!]
    : [sorted[gapIndex + 1]!, sorted[gapIndex]! + 360];
}

/** Keep successive GeoJSON line vertices in adjacent world copies, not 360° apart. */
export function unwrapRouteLongitudes(points: readonly [number, number][]): [number, number][] {
  let previous: number | null = null;
  return points.map(([lon, lat]) => {
    const normalized = canonicalLongitude(lon);
    const adjusted = previous === null ? lon :
      normalized + 360 * Math.round((previous - normalized) / 360);
    previous = adjusted;
    return [adjusted, lat];
  });
}
