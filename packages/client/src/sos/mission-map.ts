/** Camera math for the post-accept map. Coordinates are GeoJSON [lon, lat], not [lat, lon]. */
export type MissionMapPoint = { lat: number; lon: number };
export type MissionMapCamera =
  | { kind: "incident"; center: [number, number]; zoom: 14 }
  | { kind: "both"; bounds: [[number, number], [number, number]]; padding: number; maxZoom: number };

export function missionMapCamera(incident: MissionMapPoint, rescuer: MissionMapPoint | null): MissionMapCamera {
  if (!rescuer || (Math.abs(rescuer.lat - incident.lat) < 0.00001 &&
      Math.abs(rescuer.lon - incident.lon) < 0.00001)) {
    return { kind: "incident", center: [incident.lon, incident.lat], zoom: 14 };
  }
  return {
    kind: "both",
    bounds: [
      [Math.min(incident.lon, rescuer.lon), Math.min(incident.lat, rescuer.lat)],
      [Math.max(incident.lon, rescuer.lon), Math.max(incident.lat, rescuer.lat)]
    ],
    padding: 64,
    maxZoom: 15
  };
}
