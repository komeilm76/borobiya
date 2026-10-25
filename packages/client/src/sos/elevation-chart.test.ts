import { describe, expect, it } from "vitest";
import { buildElevationChart } from "./elevation-chart";

describe("offline route elevation chart", () => {
  it("keeps chart position proportional to route distance and exposes accessible extrema", () => {
    const chart = buildElevationChart([
      { distance_m: 0, elevation_m: 120 },
      { distance_m: 100, elevation_m: 150 },
      { distance_m: 1000, elevation_m: 110 }
    ]);
    expect(chart?.line).toMatch(/^M4\.0 \d+\.\d L27\.2 \d+\.\d L236\.0 \d+\.\d$/);
    expect(chart?.area).toMatch(/L236 74 L4 74 Z$/);
    expect(chart?.description).toContain("کمینه ۱۱۰ متر و بیشینه ۱۵۰ متر");
    expect(chart?.range).toContain("کمینه ۱۱۰ · بیشینه ۱۵۰ متر");
  });

  it("uses a nonzero display range for flat or short routes, without inventing a grade", () => {
    const flat = buildElevationChart([{ distance_m: 0, elevation_m: 500 }, { distance_m: 0, elevation_m: 500 }]);
    expect(flat?.line).toBe("M4.0 42.0 L236.0 42.0");
    expect(flat?.description).toContain("شروع ۵۰۰ متر، پایان ۵۰۰ متر");
    expect(flat?.line).not.toContain("NaN");
  });

  it("rejects holes, decreasing distance, non-finite numbers and oversized profiles", () => {
    expect(buildElevationChart(undefined)).toBeNull();
    expect(buildElevationChart([{ distance_m: 0, elevation_m: 4 }])).toBeNull();
    expect(buildElevationChart([{ distance_m: 4, elevation_m: 4 }, { distance_m: 5, elevation_m: 5 }])).toBeNull();
    expect(buildElevationChart([{ distance_m: 0, elevation_m: 4 }, { distance_m: -1, elevation_m: 4 }])).toBeNull();
    expect(buildElevationChart([{ distance_m: 0, elevation_m: Number.NaN }, { distance_m: 1, elevation_m: 4 }])).toBeNull();
    expect(buildElevationChart(Array.from({ length: 97 }, (_, i) => ({ distance_m: i, elevation_m: 4 })))).toBeNull();
  });
});
