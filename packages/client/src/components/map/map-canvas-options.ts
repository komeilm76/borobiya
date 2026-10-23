import type { MapConfig } from "@shared/schemas/map";
import type { LngLatLike, Map as MapLibreMap, MapOptions } from "maplibre-gl";

export type MapCanvasRuntimeConfig = Pick<MapConfig, "bbox" | "minZoom" | "maxZoom">;

export const DEFAULT_MAP_STYLE = "/map/style/light";
export const DEFAULT_DARK_MAP_STYLE = "/map/style/dark";
export const DEFAULT_MAP_ZOOM = 11;
export const DEFAULT_MAP_BOUNDS: [number, number, number, number] = [51.0, 35.5, 51.7, 35.9];
export const MAP_TILE_CACHE_ZOOM_LEVELS = 8;

const FALLBACK_RUNTIME_CONFIG: MapCanvasRuntimeConfig = {
  bbox: DEFAULT_MAP_BOUNDS,
  minZoom: 0,
  maxZoom: 14
};

/** Center of a [west, south, east, north] bbox as [lng, lat]. */
export function bboxCenter(bbox: readonly [number, number, number, number]): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

/** Whether a [lng, lat] point lies inside a [west, south, east, north] bbox. */
export function lngLatInBbox(
  lngLat: readonly [number, number],
  bbox: readonly [number, number, number, number]
): boolean {
  return lngLat[0] >= bbox[0] && lngLat[0] <= bbox[2] && lngLat[1] >= bbox[1] && lngLat[1] <= bbox[3];
}

export interface MapCanvasDisplayOptions {
  styleUrl?: string;
  center?: LngLatLike;
  zoom?: number;
  /** Keep camera clamped inside `bbox` (default `true`; `false` for SOS coordinate pickers/dispatch). */
  constrainBounds?: boolean;
}

/** Resolve a style URL consistently for both initial map creation and theme switches. */
export function resolveMapStyleUrl(styleUrl?: string): string {
  return styleUrl?.trim() || DEFAULT_MAP_STYLE;
}

/** Select the local style that matches the app-wide resolved theme. */
export function mapStyleForTheme(isDark: boolean): string {
  return isDark ? DEFAULT_DARK_MAP_STYLE : DEFAULT_MAP_STYLE;
}

/** Diff the new style into the existing map instance so its camera and DOM markers survive. */
export function switchMapStyle(map: Pick<MapLibreMap, "setStyle">, styleUrl?: string): string {
  const nextStyleUrl = resolveMapStyleUrl(styleUrl);
  map.setStyle(nextStyleUrl, { diff: true });
  return nextStyleUrl;
}

/** Build a same-origin MapLibre setup centered on the configured bounds. */
export function createMapCanvasOptions(
  config: MapCanvasRuntimeConfig | null = FALLBACK_RUNTIME_CONFIG,
  display: MapCanvasDisplayOptions = {}
): Omit<MapOptions, "container"> {
  const runtimeConfig = config ?? FALLBACK_RUNTIME_CONFIG;
  const minZoom = runtimeConfig.minZoom;
  const maxZoom = runtimeConfig.maxZoom;
  const requestedZoom = Number.isFinite(display.zoom) ? display.zoom! : DEFAULT_MAP_ZOOM;
  const zoom = Math.min(maxZoom, Math.max(minZoom, requestedZoom));
  const constrainBounds = display.constrainBounds !== false;

  return {
    style: resolveMapStyleUrl(display.styleUrl),
    center: display.center ?? bboxCenter(runtimeConfig.bbox),
    zoom,
    minZoom,
    maxZoom,
    ...(constrainBounds ? { maxBounds: runtimeConfig.bbox } : {}),
    maxTileCacheZoomLevels: MAP_TILE_CACHE_ZOOM_LEVELS,
    attributionControl: {}
  };
}
