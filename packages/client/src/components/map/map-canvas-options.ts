import type { MapConfig } from "@shared/schemas/map";
import type { LngLatLike, MapOptions } from "maplibre-gl";

export type MapCanvasRuntimeConfig = Pick<MapConfig, "bbox" | "minZoom" | "maxZoom">;

export const DEFAULT_MAP_STYLE = "/map/style/light";
export const DEFAULT_MAP_ZOOM = 11;
export const DEFAULT_TEHRAN_CENTER: [number, number] = [51.389, 35.6892];
export const DEFAULT_MAP_BOUNDS: [number, number, number, number] = [51.0, 35.5, 51.7, 35.9];

const FALLBACK_RUNTIME_CONFIG: MapCanvasRuntimeConfig = {
  bbox: DEFAULT_MAP_BOUNDS,
  minZoom: 0,
  maxZoom: 14
};

export interface MapCanvasDisplayOptions {
  styleUrl?: string;
  center?: LngLatLike;
  zoom?: number;
}

/** Build a same-origin, Tehran-centered MapLibre setup from the public map settings. */
export function createMapCanvasOptions(
  config: MapCanvasRuntimeConfig | null = FALLBACK_RUNTIME_CONFIG,
  display: MapCanvasDisplayOptions = {}
): Omit<MapOptions, "container"> {
  const runtimeConfig = config ?? FALLBACK_RUNTIME_CONFIG;
  const minZoom = runtimeConfig.minZoom;
  const maxZoom = runtimeConfig.maxZoom;
  const requestedZoom = Number.isFinite(display.zoom) ? display.zoom! : DEFAULT_MAP_ZOOM;
  const zoom = Math.min(maxZoom, Math.max(minZoom, requestedZoom));

  return {
    style: display.styleUrl?.trim() || DEFAULT_MAP_STYLE,
    center: display.center ?? DEFAULT_TEHRAN_CENTER,
    zoom,
    minZoom,
    maxZoom,
    maxBounds: runtimeConfig.bbox,
    attributionControl: {}
  };
}
