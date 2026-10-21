import { describe, expect, it } from "vitest";
import { mapConfigSchema } from "./map";

const validMapConfig = {
  region: "tehran",
  bbox: [51.0, 35.5, 51.7, 35.9] as [number, number, number, number],
  dataVersion: "2026-10-19",
  minZoom: 0,
  maxZoom: 14
};

describe("public map configuration schema", () => {
  it("accepts the bounded public map settings", () => {
    expect(mapConfigSchema.parse(validMapConfig)).toEqual(validMapConfig);
  });

  it("rejects malformed regions, versions, and bounds", () => {
    expect(mapConfigSchema.safeParse({ ...validMapConfig, region: "../tehran" }).success).toBe(false);
    expect(mapConfigSchema.safeParse({ ...validMapConfig, dataVersion: "../private" }).success).toBe(false);
    expect(mapConfigSchema.safeParse({ ...validMapConfig, bbox: [51, 36, 50, 35] }).success).toBe(false);
    expect(mapConfigSchema.safeParse({ ...validMapConfig, bbox: [181, 35, 182, 36] }).success).toBe(false);
  });

  it("rejects unsupported zoom levels and inverted ranges", () => {
    expect(mapConfigSchema.safeParse({ ...validMapConfig, maxZoom: 17 }).success).toBe(false);
    expect(mapConfigSchema.safeParse({ ...validMapConfig, minZoom: 15, maxZoom: 14 }).success).toBe(false);
  });

  it("rejects unknown fields so server-only values cannot leak into public config", () => {
    expect(mapConfigSchema.safeParse({ ...validMapConfig, MAP_SERVER_URL: "http://internal" }).success).toBe(false);
  });
});
