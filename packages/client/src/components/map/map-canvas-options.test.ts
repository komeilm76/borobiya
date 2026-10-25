import { describe, expect, it, vi } from "vitest";
import { mapConfigSchema } from "@shared/schemas/map";
import {
  DEFAULT_DARK_MAP_STYLE,
  DEFAULT_MAP_BOUNDS,
  DEFAULT_MAP_STYLE,
  DEFAULT_MAP_ZOOM,
  MAP_TILE_CACHE_ZOOM_LEVELS,
  bboxCenter,
  createMapCanvasOptions,
  lngLatInBbox,
  mapStyleForTheme,
  resolveMapStyleUrl,
  switchMapStyle
} from "./map-canvas-options";

const runtimeConfig = mapConfigSchema.parse({
  region: "borobiya",
  bbox: [51, 35.5, 51.7, 35.9],
  dataVersion: "development",
  minZoom: 2,
  maxZoom: 16
});

describe("MapCanvas style switching", () => {
  it("uses the map style matching the resolved app theme", () => {
    expect(mapStyleForTheme(false)).toBe(DEFAULT_MAP_STYLE);
    expect(mapStyleForTheme(true)).toBe(DEFAULT_DARK_MAP_STYLE);
  });

  it("normalizes empty style URLs to the default light style", () => {
    expect(resolveMapStyleUrl()).toBe(DEFAULT_MAP_STYLE);
    expect(resolveMapStyleUrl("  ")).toBe(DEFAULT_MAP_STYLE);
    expect(resolveMapStyleUrl("  /map/style/dark  ")).toBe("/map/style/dark");
  });

  it("diffs the requested style into the existing map instance", () => {
    const setStyle = vi.fn();
    const map = { setStyle } as unknown as Parameters<typeof switchMapStyle>[0];

    expect(switchMapStyle(map, "/map/style/dark")).toBe("/map/style/dark");
    expect(setStyle).toHaveBeenCalledExactlyOnceWith("/map/style/dark", { diff: true });
  });
});

describe("MapCanvas initial options", () => {
  it("uses local fallback bounds and zoom limits when runtime configuration is unavailable", () => {
    expect(createMapCanvasOptions(null, { zoom: 99 })).toMatchObject({
      style: DEFAULT_MAP_STYLE,
      center: bboxCenter(DEFAULT_MAP_BOUNDS),
      zoom: 18,
      minZoom: 0,
      maxZoom: 18,
      maxBounds: DEFAULT_MAP_BOUNDS
    });
  });

  it("defaults to the fallback bounds center with same-origin style, zoom limits, and attribution", () => {
    const options = createMapCanvasOptions();
    expect(options).toMatchObject({
      style: DEFAULT_MAP_STYLE,
      center: bboxCenter(DEFAULT_MAP_BOUNDS),
      zoom: DEFAULT_MAP_ZOOM,
      minZoom: 0,
      maxZoom: 18,
      maxBounds: DEFAULT_MAP_BOUNDS,
      maxTileCacheZoomLevels: MAP_TILE_CACHE_ZOOM_LEVELS
    });
    expect(options.attributionControl).not.toBe(false);
  });

  it("uses validated runtime bounds and clamps the initial zoom", () => {
    expect(createMapCanvasOptions(runtimeConfig, { zoom: 99, styleUrl: "/map/style/dark" })).toMatchObject({
      style: "/map/style/dark",
      center: bboxCenter(runtimeConfig.bbox),
      zoom: 16,
      minZoom: 2,
      maxZoom: 16,
      maxBounds: runtimeConfig.bbox
    });
    expect(createMapCanvasOptions(runtimeConfig, { zoom: -5 }).zoom).toBe(2);
  });

  it("centers on the configured areas rather than a hard-coded city", () => {
    const Frankfurt = { bbox: [8.44, 50.01, 8.81, 50.23] as [number, number, number, number], minZoom: 0, maxZoom: 14 };
    expect(createMapCanvasOptions(Frankfurt).center).toEqual([8.625, 50.12]);
    expect(lngLatInBbox([8.682, 50.111], Frankfurt.bbox)).toBe(true);
    expect(lngLatInBbox(bboxCenter(DEFAULT_MAP_BOUNDS), Frankfurt.bbox)).toBe(false);
  });

  it("supports a caller-provided center and falls back on invalid zoom input", () => {
    expect(createMapCanvasOptions(runtimeConfig, { center: [51.4, 35.7], zoom: Number.NaN })).toMatchObject({
      center: [51.4, 35.7],
      zoom: DEFAULT_MAP_ZOOM
    });
  });

  it("omits maxBounds when constrainBounds is disabled so real out-of-bbox SOS coordinates stay reachable", () => {
    const options = createMapCanvasOptions(runtimeConfig, { constrainBounds: false });
    expect(options.maxBounds).toBeUndefined();
    expect(options.center).toEqual(bboxCenter(runtimeConfig.bbox));
  });
});
