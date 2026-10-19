import { describe, expect, it } from "vitest";
import { mapConfigSchema } from "@shared/schemas/map";
import {
  DEFAULT_MAP_BOUNDS,
  DEFAULT_MAP_STYLE,
  DEFAULT_MAP_ZOOM,
  DEFAULT_TEHRAN_CENTER,
  createMapCanvasOptions
} from "./map-canvas-options";

const runtimeConfig = mapConfigSchema.parse({
  region: "tehran",
  bbox: [51, 35.5, 51.7, 35.9],
  dataVersion: "development",
  minZoom: 2,
  maxZoom: 16
});

describe("MapCanvas initial options", () => {
  it("defaults to Tehran with same-origin style, map bounds, zoom limits, and attribution", () => {
    const options = createMapCanvasOptions();
    expect(options).toMatchObject({
      style: DEFAULT_MAP_STYLE,
      center: DEFAULT_TEHRAN_CENTER,
      zoom: DEFAULT_MAP_ZOOM,
      minZoom: 0,
      maxZoom: 14,
      maxBounds: DEFAULT_MAP_BOUNDS
    });
    expect(options.attributionControl).not.toBe(false);
  });

  it("uses validated runtime bounds and clamps the initial zoom", () => {
    expect(createMapCanvasOptions(runtimeConfig, { zoom: 99, styleUrl: "/map/style/dark" })).toMatchObject({
      style: "/map/style/dark",
      center: DEFAULT_TEHRAN_CENTER,
      zoom: 16,
      minZoom: 2,
      maxZoom: 16,
      maxBounds: runtimeConfig.bbox
    });
    expect(createMapCanvasOptions(runtimeConfig, { zoom: -5 }).zoom).toBe(2);
  });

  it("supports a caller-provided center and falls back on invalid zoom input", () => {
    expect(createMapCanvasOptions(runtimeConfig, { center: [51.4, 35.7], zoom: Number.NaN })).toMatchObject({
      center: [51.4, 35.7],
      zoom: DEFAULT_MAP_ZOOM
    });
  });
});
