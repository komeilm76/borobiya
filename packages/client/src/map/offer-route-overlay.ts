import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';

export const OFFER_SOURCE = 'mission-offer-route-preview';
export const OFFER_CASING = 'mission-offer-route-preview-casing';
export const OFFER_LAYER = 'mission-offer-route-preview-line';

type RouteData = { type: 'FeatureCollection'; features: Array<{
  type: 'Feature'; properties: Record<string, never>;
  geometry: { type: 'LineString'; coordinates: [number, number][] };
}> };
type OverlayMap = Pick<MapLibreMap, 'getLayer' | 'getSource' | 'addSource' | 'addLayer' | 'removeLayer' | 'removeSource'>;

/** Restore a selected offer's route on the existing map. MapLibre can report
 * isStyleLoaded()=false while tiles are still pending even though a new style
 * already accepts overlays. Attempt to add and retry on styledata/idle instead
 * of waiting forever for every raster/vector tile to finish. */
export function paintOfferRoute(map: OverlayMap, data: RouteData): boolean {
  try {
    if (map.getLayer(OFFER_LAYER) && map.getLayer(OFFER_CASING) && map.getSource(OFFER_SOURCE)) return true;
    const source = map.getSource(OFFER_SOURCE) as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else map.addSource(OFFER_SOURCE, { type: 'geojson', data });
    if (!map.getLayer(OFFER_CASING)) map.addLayer({
      id: OFFER_CASING, source: OFFER_SOURCE, type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#ffffff', 'line-width': 10, 'line-opacity': .95 }
    });
    if (!map.getLayer(OFFER_LAYER)) map.addLayer({
      id: OFFER_LAYER, source: OFFER_SOURCE, type: 'line',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#087f75', 'line-width': 6, 'line-opacity': 1 }
    });
    return true;
  } catch {
    // A style may have been replaced between getSource and addLayer. The
    // caller retries after styledata/idle or on explicit user request.
    return false;
  }
}

export function clearOfferRoute(map: OverlayMap): void {
  try {
    if (map.getLayer(OFFER_LAYER)) map.removeLayer(OFFER_LAYER);
    if (map.getLayer(OFFER_CASING)) map.removeLayer(OFFER_CASING);
    if (map.getSource(OFFER_SOURCE)) map.removeSource(OFFER_SOURCE);
  } catch { /* The map may already be switching styles or unmounting. */ }
}
