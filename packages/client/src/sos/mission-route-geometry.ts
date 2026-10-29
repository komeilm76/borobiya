import { computed, type Ref } from "vue";
import type { RouteChoice } from "@/api/mission-routing";
import { decodeRoutePolyline } from "./route-preview";

type RouteLineData = {
  type: "FeatureCollection";
  features: Array<{ type: "Feature"; properties: Record<string, never>;
    geometry: { type: "LineString"; coordinates: [number, number][] } }>;
};

/** One decoded snapshot serves the camera and map source, including style restores. */
export function useMissionRouteGeometry(selected: Ref<RouteChoice | null>, decode = decodeRoutePolyline) {
  return computed(() => {
    const route = selected.value;
    if (!route) return { bounds: null, data: { type: "FeatureCollection", features: [] } as RouteLineData };
    const points = decode(route.polyline);
    let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
    for (const [lon, lat] of points) {
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon);
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat);
    }
    const bounds: [[number, number], [number, number]] = [[minLon, minLat], [maxLon, maxLat]];
    const data: RouteLineData = { type: "FeatureCollection", features: [{ type: "Feature", properties: {},
      geometry: { type: "LineString", coordinates: points } }] };
    return { bounds, data };
  });
}
