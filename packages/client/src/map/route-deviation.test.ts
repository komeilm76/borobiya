import { describe, expect, it } from "vitest";
import { deviationThreshold, distanceFromRoute } from "./route-deviation";

describe("reliable off-route detection", () => {
  it("uses the nearest segment rather than its distant endpoints", () => {
    expect(distanceFromRoute({ lat: 0, lon: .5 }, [[0, 0], [1, 0]])).toBeCloseTo(0);
    expect(distanceFromRoute({ lat: .001, lon: .5 }, [[0, 0], [1, 0]])).toBeCloseTo(111.195, 1);
    expect(distanceFromRoute({ lat: 0, lon: 2 }, [[0, 0], [1, 0]])).toBeGreaterThan(110_000);
    expect(distanceFromRoute({ lat: 0, lon: 0 }, [])).toBe(Infinity);
  });
  it("does not treat a date-line crossing as a road across the entire world", () => {
    const crossing = [[179.999, 0], [-179.999, 0]] as const;
    expect(distanceFromRoute({ lat: 0, lon: -179.9995 }, crossing)).toBeLessThan(1);
    expect(distanceFromRoute({ lat: 0, lon: 0 }, crossing)).toBeGreaterThan(1_000_000);
    expect(distanceFromRoute({ lat: 0, lon: -179.9995 }, [[179.999, 0], [180.001, 0]])).toBeLessThan(1);
    // Even a road that stays on one side must recognize a nearby GPS world copy.
    expect(distanceFromRoute({ lat: 0, lon: -179.9995 }, [[179.9995, 0], [179.9999, 0]])).toBeLessThan(150);
  });
  it("keeps GPS uncertainty out of mode-specific deviation alarms", () => {
    expect(deviationThreshold("car", 8)).toBe(65);
    expect(deviationThreshold("bicycle", 8)).toBe(45);
    expect(deviationThreshold("foot", 8)).toBe(36);
    expect(deviationThreshold("foot", 30)).toBe(80);
  });
});
