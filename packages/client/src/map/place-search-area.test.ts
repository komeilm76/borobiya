import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@shared/index";
import { placeSearchArea } from "./place-search-area";

function bounds(west: number, south: number, east: number, north: number) {
  return { getWest: () => west, getSouth: () => south, getEast: () => east, getNorth: () => north };
}
function place(lon: number, lat: number): GeocodeResult {
  return { placeId: "one", name: "place", address: "place", lon, lat, type: "place" };
}

describe("map search area", () => {
  const library = bounds(50, 34, 52, 36);

  it("searches all installed coverage by default and clips a visible viewport to its bounds", () => {
    expect(placeSearchArea(library, library)?.bbox).toBe("50,34,52,36");
    const visible = placeSearchArea(library, bounds(51, 35, 53, 37));
    expect(visible?.bbox).toBe("51,35,52,36");
    expect(visible?.contains(place(51.5, 35.5))).toBe(true);
    expect(visible?.contains(place(50.5, 35.5))).toBe(false);
    expect(visible?.contains(place(52.1, 36))).toBe(false);
  });

  it("uses the search-time snapshot even after the camera moves", () => {
    let west = 50;
    const moving = { getWest: () => west, getSouth: () => 34, getEast: () => 51, getNorth: () => 35 };
    const area = placeSearchArea(library, moving);
    west = 50.9;
    expect(area?.bbox).toBe("50,34,51,35");
    expect(area?.contains(place(50.1, 34.1))).toBe(true);
  });

  it("refuses missing, non-overlapping or invalid bounds rather than issuing a global query", () => {
    expect(placeSearchArea(null, library)).toBeNull();
    expect(placeSearchArea(library, null)).toBeNull();
    expect(placeSearchArea(library, bounds(54, 34, 55, 36))).toBeNull();
    expect(placeSearchArea(library, bounds(Number.NaN, 34, 51, 35))).toBeNull();
    expect(placeSearchArea(bounds(-181, 34, 52, 36), bounds(-181, 34, 52, 36))).toBeNull();
  });
});
