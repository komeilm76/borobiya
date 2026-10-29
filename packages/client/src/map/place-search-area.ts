import type { GeocodeResult } from "@shared/index";
import type { PlaceSearchArea } from "@/composables/use-place-search";

type Bounds = {
  getWest(): number;
  getSouth(): number;
  getEast(): number;
  getNorth(): number;
};

/** Intersect the camera's visible rectangle with the installed map library's coverage.
 * Capture scalar coordinates, never a mutable map-bound object, for the request and its results.
 */
export function placeSearchArea(library: Bounds | null, visible: Bounds | null): PlaceSearchArea | null {
  if (!library || !visible) return null;
  const west = Math.max(library.getWest(), visible.getWest());
  const south = Math.max(library.getSouth(), visible.getSouth());
  const east = Math.min(library.getEast(), visible.getEast());
  const north = Math.min(library.getNorth(), visible.getNorth());
  if (![west, south, east, north].every(Number.isFinite) ||
    west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return null;
  return {
    bbox: [west, south, east, north].join(","),
    contains: (place: GeocodeResult) => place.lon >= west && place.lon <= east && place.lat >= south && place.lat <= north
  };
}
