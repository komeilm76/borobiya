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

/** Align the camera with the nearest *segment*, not a vertex or an inaccurate GPS-to-vertex
 * vector. Sparse polylines and duplicate vertices otherwise swing the view before a turn. */
export function routeBearing(position: MissionMapPoint, route: readonly [number, number][]): number {
  if (route.length < 2) return 0;
  const latitudeScale = Math.cos(position.lat * Math.PI / 180);
  let closest = -1;
  let best = Infinity;
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i]!, b = route[i + 1]!;
    const dx = (b[0] - a[0]) * latitudeScale, dy = b[1] - a[1];
    const length2 = dx * dx + dy * dy;
    if (length2 < 1e-18) continue; // Repeated polyline vertices have no direction.
    const x = (position.lon - a[0]) * latitudeScale, y = position.lat - a[1];
    const fraction = Math.max(0, Math.min(1, (x * dx + y * dy) / length2));
    const squared = (x - fraction * dx) ** 2 + (y - fraction * dy) ** 2;
    if (squared < best) { best = squared; closest = i; }
  }
  if (closest < 0) return 0;
  const [fromLon, fromLatitude] = route[closest]!;
  const [toLon, toLatitude] = route[closest + 1]!;
  const fromLat = fromLatitude * Math.PI / 180;
  const toLat = toLatitude * Math.PI / 180;
  const dLon = (toLon - fromLon) * Math.PI / 180;
  const y = Math.sin(dLon) * Math.cos(toLat);
  const x = Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLon);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** GPS heading reports travel direction, while a snapped route tangent can point the wrong
 * way at a turn or on an off-route fix. Use heading only with a fresh accurate moving fix;
 * browser geolocation may report null (or no speed) when stationary or unsupported. */
const MIN_HEADING_SPEED: Record<TransportProfile, number> = { car: 2, bicycle: 1, foot: 0.5 };
export function navigationArrowBearing(position: MissionMapPoint & {
  accuracy?: number | null; heading?: number | null; speed?: number | null;
}, route: readonly [number, number][], profile: TransportProfile): number {
  if (position.accuracy != null && position.accuracy <= 35 &&
    position.heading != null && Number.isFinite(position.heading) &&
    position.heading >= 0 && position.heading < 360 &&
    position.speed != null && Number.isFinite(position.speed) &&
    position.speed >= MIN_HEADING_SPEED[profile]) return position.heading;
  return routeBearing(position, route);
}

/** MapLibre's positive Y offset puts the GPS marker below the viewport centre. Reserve the
 * guidance banner and bottom controls rather than placing the user behind them; leave more
 * visible road ahead for faster modes. The view supplies live DOM occlusion measurements. */
const FOLLOW_FRACTION: Record<TransportProfile, number> = { car: 0.68, bicycle: 0.61, foot: 0.55 };
const LOOK_AHEAD_METRES: Record<TransportProfile, number> = { car: 220, bicycle: 110, foot: 65 };

export function navigationCameraOffset(profile: TransportProfile, height: number,
  topOcclusion: number, bottomOcclusion: number): [number, number] {
  if (!Number.isFinite(height) || height <= 0) return [0, 0];
  const top = Math.max(0, Math.min(height, topOcclusion)) + 16;
  const bottom = Math.max(0, Math.min(height, bottomOcclusion)) + 16;
  if (top + bottom >= height) return [0, 0];
  return [0, Math.round(top + (height - top - bottom) * FOLLOW_FRACTION[profile] - height / 2)];
}

/** Approximate the forward ground visible above the GPS marker using the viewport's unobstructed
 * height, latitude and effective pitch. A fixed zoom hides upcoming road on short phones; simply
 * clamping all three fixed zooms to a library's ceiling also makes their views identical. Shift the
 * whole three-mode scale beneath that ceiling instead of collapsing every mode to the same zoom. */
export function navigationFollowZoom(profile: TransportProfile, latitude: number, height: number,
  topOcclusion: number, bottomOcclusion: number, minZoom: number, maxZoom: number,
  effectivePitch = NAVIGATION_VIEW[profile].pitch): number {
  const clamp = (zoom: number) => Math.max(minZoom, Math.min(maxZoom, zoom));
  if (!Number.isFinite(height) || height <= 0) return clamp(NAVIGATION_VIEW[profile].zoom);
  const usable = Math.max(96, height - Math.max(0, topOcclusion) - Math.max(0, bottomOcclusion));
  const latitudeScale = Math.max(0.15, Math.cos(latitude * Math.PI / 180));
  const metresPerPixelAtZero = 40_075_016.686 * latitudeScale / 512;
  const pitchScale = (mode: TransportProfile) => Math.cos(Math.min(75, Math.max(0,
    mode === profile ? effectivePitch : NAVIGATION_VIEW[mode].pitch)) * Math.PI / 180);
  const ideal = (mode: TransportProfile) => Math.log2(metresPerPixelAtZero * usable * (1 - FOLLOW_FRACTION[mode]) /
    (LOOK_AHEAD_METRES[mode] * pitchScale(mode)));
  const ceilingShift = Math.max(0, ideal("foot") - maxZoom);
  return clamp(ideal(profile) - ceilingShift);
}

export function navigationCamera(position: MissionMapPoint, route: readonly [number, number][],
  profile: TransportProfile): NavigationCamera {
  return { center: [position.lon, position.lat], bearing: routeBearing(position, route),
    ...NAVIGATION_VIEW[profile], duration: 550 };
}
