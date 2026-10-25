import type { ElevationProfilePoint } from "@/api/mission-routing";

export interface ElevationChart {
  line: string;
  area: string;
  range: string;
  description: string;
}

/** Chart geometry only. Source and coverage are validated by the route adapter; no DEM is inferred here. */
export function buildElevationChart(points: readonly ElevationProfilePoint[] | undefined): ElevationChart | null {
  if (!points || points.length < 2 || points.length > 96 || points[0]?.distance_m !== 0) return null;
  if (points.some((point, index) => !Number.isFinite(point.distance_m) || !Number.isFinite(point.elevation_m) ||
    point.distance_m < 0 || (index > 0 && point.distance_m < points[index - 1]!.distance_m))) return null;

  const heights = points.map((point) => point.elevation_m);
  const minimum = Math.min(...heights);
  const maximum = Math.max(...heights);
  // Do not amplify a 1 m change into a full-height peak. 20 m is a display
  // floor, not a claimed measurement resolution; the text reports actual extrema.
  const span = Math.max(20, maximum - minimum);
  const lower = (maximum + minimum - span) / 2;
  const length = points.at(-1)!.distance_m;
  const line = points.map((point, index) => {
    const fraction = length > 0 ? point.distance_m / length : index / (points.length - 1);
    const x = 4 + 232 * fraction;
    const y = 70 - 56 * (point.elevation_m - lower) / span;
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ");
  const metre = (height: number) => Math.round(height).toLocaleString("fa-IR");
  return {
    line,
    area: `${line} L236 74 L4 74 Z`,
    range: `کمینه ${metre(minimum)} · بیشینه ${metre(maximum)} متر`,
    description: `نمودار ارتفاع تقریبی مسیر؛ شروع ${metre(heights[0]!)} متر، پایان ${metre(heights.at(-1)!)} متر، کمینه ${metre(minimum)} متر و بیشینه ${metre(maximum)} متر.`
  };
}
