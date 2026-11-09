import { describe, expect, it } from "vitest";
import type { GeocodeResult } from "@shared/index";
import { resultAppearance, clusterAppearance, matchesSelectedSearchDestination } from "./search-result-presentation";

const hit = (type: string, subtype?: string): GeocodeResult => ({
  placeId: `${type}:${subtype}`, lat: 35, lon: 51, name: "نام", address: "نشانی", type, ...(subtype ? { subtype } : {})
});

describe("search-result pin appearance", () => {
  it("uses verified Photon OSM key/value, not guesses from names or broad amenity keys", () => {
    expect(resultAppearance(hit("amenity", "cafe"))).toMatchObject({ icon: "mdi-coffee", color: "#087988" });
    expect(resultAppearance(hit("amenity", "restaurant")).icon).toBe("mdi-silverware-fork-knife");
    expect(resultAppearance(hit("tourism", "hotel")).icon).toBe("mdi-bed");
    expect(resultAppearance(hit("amenity", "fuel")).icon).toBe("mdi-gas-station");
    expect(resultAppearance(hit("leisure", "park")).icon).toBe("mdi-tree");
    expect(resultAppearance(hit("highway", "bus_stop")).icon).toBe("mdi-bus-stop");
    expect(resultAppearance(hit("amenity")).icon).toBe("mdi-map-marker");
    expect(resultAppearance(hit("amenity", "hospital")).icon).toBe("mdi-map-marker");
    expect(resultAppearance(hit("place", "cafe")).icon).toBe("mdi-map-marker");
  });
  it("does not stack a second pin when the same destination gets refreshed metadata", () => {
    const route = hit("amenity", "cafe");
    const updated = { ...route, name: "نام تازه", address: "نشانی تازه", subtype: "restaurant" };
    expect(matchesSelectedSearchDestination(updated, route, { lat: route.lat, lon: route.lon })).toBe(true);
    expect(matchesSelectedSearchDestination(null, route, route)).toBe(false);
    expect(matchesSelectedSearchDestination(updated, null, route)).toBe(false);
    expect(matchesSelectedSearchDestination(updated, route, null)).toBe(false);
    expect(matchesSelectedSearchDestination({ ...updated, placeId: "other" }, route, route)).toBe(false);
    expect(matchesSelectedSearchDestination({ ...updated, lon: 51.01 }, route, route)).toBe(false);
    expect(matchesSelectedSearchDestination(updated, route, { lat: route.lat + 0.01, lon: route.lon })).toBe(false);
  });
  it("shares a category color only for homogenous known groups", () => {
    const cafe = hit("amenity", "cafe"), park = hit("leisure", "park");
    expect(clusterAppearance([cafe, cafe]).color).toBe(resultAppearance(cafe).color);
    expect(clusterAppearance([cafe, park]).color).not.toBe(resultAppearance(cafe).color);
    expect(clusterAppearance([hit("place"), cafe]).icon).toBe("mdi-map-marker-multiple");
  });
});
