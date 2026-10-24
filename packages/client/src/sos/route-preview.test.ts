import { describe, expect, it } from "vitest";
import { decodeRoutePolyline, formatRouteDistance, formatRouteDuration } from "./route-preview";

describe("offline mission route presentation", () => {
  it("decodes OSRM polyline5 into [lon, lat] with stable bounds", () => {
    expect(decodeRoutePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [-120.2, 38.5], [-120.95, 40.7], [-126.453, 43.252]
    ]);
  });
  it("rejects truncated, invalid, oversized and out-of-world paths before painting", () => {
    for (const polyline of ["", "?", "_p~iF~ps|U?", "_p~iF~ps|U".repeat(20_000)]) {
      expect(() => decodeRoutePolyline(polyline)).toThrow();
    }
  });
  it("formats approximate, not promised, route measurements", () => {
    expect(formatRouteDistance(785)).toContain("متر");
    expect(formatRouteDistance(4120)).toContain("کیلومتر");
    expect(formatRouteDuration(90)).toContain("دقیقه");
  });
});
