import type { MissionTrace, MissionTracePoint } from "@/api/mission";
import { decodeRoutePolyline } from "@/sos/route-preview";

export type TraceRole = MissionTracePoint["role"];
export const TRACE_LABEL: Record<TraceRole, string> = {
  requester: "درخواست‌کننده", rescuer: "امدادگر", admin: "مدیر"
};
export interface RoleTrace {
  role: TraceRole;
  count: number;
  segments: [number, number][][];
  measuredMetres: number;
  gaps: number;
}

function distance(a: MissionTracePoint, b: MissionTracePoint): number {
  const rad = Math.PI / 180;
  const x = Math.sin((b.lat - a.lat) * rad / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lon - a.lon) * rad / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(x)));
}

/** Keep raw samples in history; draw only plausible contiguous legs so a GPS outage
 * is not represented as a straight journey. Distances are observed samples, not an odometer. */
export function buildMissionTraces(points: readonly MissionTracePoint[]): RoleTrace[] {
  return (["requester", "rescuer", "admin"] as const).map((role) => {
    const samples = points.filter((point) => point.role === role)
      .sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt));
    const segments: [number, number][][] = [];
    let current: [number, number][] = [];
    let previous: MissionTracePoint | null = null;
    let measuredMetres = 0, gaps = 0;
    for (const sample of samples) {
      const time = Date.parse(sample.observedAt);
      const dt = previous ? (time - Date.parse(previous.observedAt)) / 1000 : 0;
      const metres = previous ? distance(previous, sample) : 0;
      const plausible = previous && dt > 0 && dt <= 120 && metres / dt <= 70 &&
        (previous.accuracy === null || previous.accuracy <= 100) &&
        (sample.accuracy === null || sample.accuracy <= 100);
      if (!plausible) {
        if (previous) gaps++;
        if (current.length >= 2) segments.push(current);
        current = [];
      } else measuredMetres += metres;
      current.push([sample.lon, sample.lat]);
      previous = sample;
    }
    if (current.length >= 2) segments.push(current);
    return { role, count: samples.length, segments, measuredMetres, gaps };
  }).filter((item) => item.count > 0);
}

export function rescuerComparisonTrace(trace: MissionTrace): RoleTrace | null {
  const start = Date.parse(trace.suggestedRoute?.selectedAt ?? "");
  if (!Number.isFinite(start)) return null;
  return buildMissionTraces(trace.points.filter((point) => point.role === "rescuer" &&
    Date.parse(point.observedAt) >= start)).find((item) => item.role === "rescuer") ?? null;
}

export function suggestedLine(route: MissionTrace["suggestedRoute"]): [number, number][] | null {
  if (!route) return null;
  try { return decodeRoutePolyline(route.polyline); } catch { return null; }
}
