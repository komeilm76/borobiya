/** Camera math for the post-accept map. Coordinates are GeoJSON [lon, lat], not [lat, lon]. */
export type MissionMapPoint = { lat: number; lon: number };
export type MissionMapCamera =
  | { kind: "incident"; center: [number, number]; zoom: 14 }
  | { kind: "both"; bounds: [[number, number], [number, number]]; padding: number; maxZoom: number };

export function missionRouteStop(incident: MissionMapPoint, origin: MissionMapPoint | null,
  stops: readonly MissionMapPoint[], order: readonly number[], step: number): MissionMapPoint | null {
  const inputIndex = order[step];
  if (!Number.isInteger(inputIndex)) return null;
  if (inputIndex === 0) return origin;
  if (inputIndex === stops.length + 1) return incident;
  return stops[inputIndex! - 1] ?? null;
}

export function missionMapCamera(incident: MissionMapPoint, rescuer: MissionMapPoint | null,
  stops: readonly MissionMapPoint[] = [], routeBounds: [[number, number], [number, number]] | null = null): MissionMapCamera {
  // Always include the actual incident and planned stops, even after a route is
  // calculated. OSRM may snap its endpoint to a distant road: framing only the
  // decoded line would leave the incident marker outside the promised overview.
  const points = [incident, ...(rescuer ? [rescuer] : []), ...stops,
    ...(routeBounds ? routeBounds.map(([lon, lat]) => ({ lat, lon })) : [])];
  const minLon = Math.min(...points.map((point) => point.lon));
  const maxLon = Math.max(...points.map((point) => point.lon));
  const minLat = Math.min(...points.map((point) => point.lat));
  const maxLat = Math.max(...points.map((point) => point.lat));
  if (maxLat - minLat < 0.00001 && maxLon - minLon < 0.00001) {
    return { kind: "incident", center: [incident.lon, incident.lat], zoom: 14 };
  }
  return { kind: "both", bounds: [[minLon, minLat], [maxLon, maxLat]], padding: 64, maxZoom: 15 };
}
