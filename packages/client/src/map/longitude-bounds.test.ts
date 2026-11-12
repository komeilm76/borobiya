import { describe, expect, it } from "vitest";
import { shortestLongitudeBounds, unwrapRouteLongitudes } from "./longitude-bounds";

describe("mission longitude camera and route geometry", () => {
  it("keeps ordinary local bounds and an unwrapped route unchanged", () => {
    expect(shortestLongitudeBounds([51.42, 51.39, 51.4])).toEqual([51.39, 51.42]);
    expect(shortestLongitudeBounds([51.4, 51.4])).toEqual([51.4, 51.4]);
    const original: [number, number][] = [[51.4, 35.7], [51.5, 35.8]];
    expect(unwrapRouteLongitudes(original)).toEqual(original);
    expect(unwrapRouteLongitudes(original)).not.toBe(original);
  });

  it("finds the shortest world-copy arc without dropping either date-line side", () => {
    const [west, east] = shortestLongitudeBounds([179.8, -179.9, -179.8]);
    expect(west).toBeCloseTo(179.8);
    expect(east).toBeCloseTo(180.2);
    expect(east - west).toBeCloseTo(.4);
    const [otherWest, otherEast] = shortestLongitudeBounds([-179.9, 179.8, 180.1]);
    expect(otherWest).toBeCloseTo(179.8);
    expect(otherEast).toBeCloseTo(180.1);
    // +180 and -180 are the same meridian; they must not produce a full-world bounds.
    expect(shortestLongitudeBounds([-180, 180])).toEqual([-180, -180]);
  });

  it("unwraps each polyline leg to its nearest world copy, including repeated crossings", () => {
    const points: [number, number][] = [[179.8, 6], [-179.9, 6.1], [179.9, 6.2], [-179.8, 6.3]];
    const unwrapped = unwrapRouteLongitudes(points);
    expect(unwrapped.map(([lon]) => lon)).toEqual([179.8, 180.1, 179.9, 180.2]);
    expect(unwrapped.map(([, lat]) => lat)).toEqual([6, 6.1, 6.2, 6.3]);
    expect(points[1]![0]).toBe(-179.9); // Never mutate decoded input shared with other callers.
  });
});
