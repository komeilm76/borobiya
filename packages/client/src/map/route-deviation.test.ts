import { describe, expect, it } from "vitest";
import { deviationThreshold, distanceFromRoute } from "./route-deviation";

describe("reliable off-route detection", () => {
  it("uses the nearest segment rather than its distant endpoints", () => {
    expect(distanceFromRoute({ lat: 0, lon: .5 }, [[0, 0], [1, 0]])).toBeCloseTo(0);
    expect(distanceFromRoute({ lat: .001, lon: .5 }, [[0, 0], [1, 0]])).toBeCloseTo(111.195, 1);
    expect(distanceFromRoute({ lat: 0, lon: 2 }, [[0, 0], [1, 0]])).toBeGreaterThan(110_000);
    expect(distanceFromRoute({ lat: 0, lon: 0 }, [])).toBe(Infinity);
  });
  it("keeps GPS uncertainty out of mode-specific deviation alarms", () => {
    expect(deviationThreshold("car", 8)).toBe(65);
    expect(deviationThreshold("bicycle", 8)).toBe(45);
    expect(deviationThreshold("foot", 8)).toBe(36);
    expect(deviationThreshold("foot", 30)).toBe(80);
  });
});
