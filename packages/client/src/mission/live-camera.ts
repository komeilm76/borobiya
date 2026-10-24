/** A bounded camera for the three most recent consented fixes; never use an unvalidated event here. */
export function missionLiveCamera(points: readonly { lat: number; lon: number }[]):
  | { kind: "single"; center: [number, number]; zoom: number }
  | { kind: "bounds"; bounds: [[number, number], [number, number]]; padding: number; maxZoom: number }
  | null {
  if (!points.length) return null;
  const first = points[0]!;
  if (points.length === 1) return { kind: "single", center: [first.lon, first.lat], zoom: 14 };
  const lons = points.map((point) => point.lon);
  const lats = points.map((point) => point.lat);
  const minLon = Math.min(...lons);
  const maxLon = Math.max(...lons);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const span = 0.0004;
  return { kind: "bounds", bounds: [
    [minLon - (minLon === maxLon ? span : 0), minLat - (minLat === maxLat ? span : 0)],
    [maxLon + (minLon === maxLon ? span : 0), maxLat + (minLat === maxLat ? span : 0)]
  ], padding: 44, maxZoom: 14 };
}
