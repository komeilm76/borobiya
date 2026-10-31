import type { RoutePoint } from "@/api/mission-routing";

/** Nearest distance to route segments, not vertices (which can be kilometres apart). */
export function distanceFromRoute(point: RoutePoint, line: readonly (readonly [number, number])[]): number {
  if (line.length < 2) return Infinity;
  const latitudeScale = Math.cos(point.lat * Math.PI / 180);
  const x = point.lon * latitudeScale, y = point.lat;
  let nearest = Infinity;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!, b = line[i]!;
    const ax = a[0] * latitudeScale, ay = a[1], dx = b[0] * latitudeScale - ax, dy = b[1] - ay;
    const length2 = dx * dx + dy * dy;
    const fraction = length2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)) : 0;
    nearest = Math.min(nearest, Math.hypot((x - ax) - fraction * dx, (y - ay) - fraction * dy) * 111_195);
  }
  return nearest;
}

/** Require two trustworthy, separated fixes; GPS drift alone must not trigger a reroute. */
export function deviationThreshold(profile: "car" | "bicycle" | "foot", accuracy: number): number {
  return Math.max(profile === "car" ? 65 : profile === "bicycle" ? 45 : 35, accuracy * 2 + 20);
}
