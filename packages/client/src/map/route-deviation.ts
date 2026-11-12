import type { RoutePoint } from "@/api/mission-routing";
import { longitudeNear } from "./longitude-bounds";

/** Nearest distance to route segments, not vertices (which can be kilometres apart). */
export function distanceFromRoute(point: RoutePoint, line: readonly (readonly [number, number])[]): number {
  if (line.length < 2) return Infinity;
  const latitudeScale = Math.cos(point.lat * Math.PI / 180);
  const y = point.lat;
  let nearest = Infinity;
  let previousLon = line[0]![0];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!;
    const nextLon = longitudeNear(b[0], previousLon);
    const ax = previousLon * latitudeScale, ay = a[1];
    const dx = (nextLon - previousLon) * latitudeScale, dy = b[1] - ay;
    // The GPS fix and each segment may be reported in different world copies.
    const x = longitudeNear(point.lon, previousLon) * latitudeScale;
    const length2 = dx * dx + dy * dy;
    const fraction = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)) : 0;
    nearest = Math.min(nearest, Math.hypot((x - ax) - fraction * dx, (y - ay) - fraction * dy) * 111_195);
    previousLon = nextLon;
  }
  return nearest;
}

/** Require two trustworthy, separated fixes; GPS drift alone must not trigger a reroute. */
export function deviationThreshold(profile: "car" | "bicycle" | "foot", accuracy: number): number {
  return Math.max(profile === "car" ? 65 : profile === "bicycle" ? 45 : 35, accuracy * 2 + 20);
}
