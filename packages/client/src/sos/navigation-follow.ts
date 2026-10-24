import type { TransportProfile } from "@/api/mission-routing";
import type { MissionMapPoint } from "./mission-map";

export type NavigationCamera = {
  center: [number, number];
  bearing: number;
  pitch: number;
  zoom: number;
  duration: number;
};

export const NAVIGATION_VIEW: Record<TransportProfile, { pitch: number; zoom: number }> = {
  car: { pitch: 60, zoom: 17 },
  bicycle: { pitch: 45, zoom: 16 },
  foot: { pitch: 0, zoom: 17 }
};

/** Pick the next local route point, not a remote geocoding service or a simulated heading. */
export function routeBearing(position: MissionMapPoint, route: readonly [number, number][]): number {
  if (route.length < 2) return 0;
  const latitudeScale = Math.cos(position.lat * Math.PI / 180);
  let closest = 0;
  let best = Infinity;
  for (let i = 0; i < route.length; i++) {
    const [lon, lat] = route[i]!;
    const squared = ((lon - position.lon) * latitudeScale) ** 2 + (lat - position.lat) ** 2;
    if (squared < best) { best = squared; closest = i; }
  }
  const next = route[Math.min(closest + 1, route.length - 1)]!;
  const current = route[closest === route.length - 1 ? Math.max(0, closest - 1) : closest]!;
  const start = closest === route.length - 1 ? current : [position.lon, position.lat];
  const fromLat = start[1]! * Math.PI / 180;
  const toLat = next[1] * Math.PI / 180;
  const dLon = (next[0] - start[0]!) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

export function navigationCamera(position: MissionMapPoint, route: readonly [number, number][],
  profile: TransportProfile): NavigationCamera {
  return { center: [position.lon, position.lat], bearing: routeBearing(position, route),
    ...NAVIGATION_VIEW[profile], duration: 550 };
}
