import { describe, expect, it } from "vitest";
import {
  boundingBoxQuerySchema,
  geocodeQuerySchema,
  reverseGeocodeQuerySchema,
  userSearchSchema
} from "./search";

describe("search and common query schemas", () => {
  it("coerces pagination values and enforces the published maximum", () => {
    expect(userSearchSchema.parse({ page: "2", limit: "50" })).toMatchObject({ page: 2, limit: 50 });
    expect(userSearchSchema.parse({})).toMatchObject({ page: 1, limit: 20 });
    expect(userSearchSchema.parse({})).not.toHaveProperty("sort");
    // A cleared picker control arrives as an empty string: that means "no filter", not "invalid id".
    expect(userSearchSchema.parse({ category: "", incidentType: "" })).toMatchObject({
      category: undefined,
      incidentType: undefined
    });
    expect(userSearchSchema.safeParse({ category: "not-a-uuid" }).success).toBe(false);
    expect(userSearchSchema.safeParse({ limit: "101" }).success).toBe(false);
    expect(userSearchSchema.parse({ radiusKm: "5", sort: "username" })).toMatchObject({ radiusKm: 5, sort: "username" });
    for (const radiusKm of ["0", "-1", "500.1", "Infinity", "x"]) {
      expect(userSearchSchema.safeParse({ radiusKm }).success).toBe(false);
    }
  });

  it("parses boolean query strings without treating false as true", () => {
    expect(userSearchSchema.parse({ online: "false" }).online).toBe(false);
    expect(userSearchSchema.parse({ online: "true" }).online).toBe(true);
    expect(userSearchSchema.safeParse({ online: "sometimes" }).success).toBe(false);
  });

  it("requires latitude and longitude together and validates coordinate ranges", () => {
    expect(userSearchSchema.safeParse({ lat: "35.7" }).success).toBe(false);
    expect(userSearchSchema.parse({ lat: "35.7", lon: "51.4" })).toMatchObject({ lat: 35.7, lon: 51.4 });
    expect(reverseGeocodeQuerySchema.safeParse({ lat: "91", lon: "51" }).success).toBe(false);
    expect(reverseGeocodeQuerySchema.safeParse({ lat: "", lon: "51" }).success).toBe(false);
  });

  it("checks map bounding boxes and geocoding limits", () => {
    expect(boundingBoxQuerySchema.safeParse("51.0,35.5,51.7,35.9").success).toBe(true);
    expect(boundingBoxQuerySchema.safeParse("51.7,35.5,51.0,35.9").success).toBe(false);
    expect(geocodeQuerySchema.parse({ q: "  Azadi Square  " })).toMatchObject({ q: "Azadi Square", limit: 5 });
    expect(geocodeQuerySchema.parse({ q: "Cafe", limit: "30" }).limit).toBe(30);
    expect(geocodeQuerySchema.safeParse({ q: "Cafe", limit: "31" }).success).toBe(false);
    expect(geocodeQuerySchema.safeParse({ q: "", limit: "0" }).success).toBe(false);
  });
});
