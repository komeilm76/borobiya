import type { GeocodeResult } from "@shared/index";

/** Photon supplies osm_key and (when available) osm_value. Never infer a place's
 * category from its name, or treat a broad osm_key such as amenity as a cafe. */
export type ResultAppearance = { icon: string; color: string; label: string };
const generic: ResultAppearance = { icon: "mdi-map-marker", color: "#475569", label: "مکان" };
const mixed: ResultAppearance = { icon: "mdi-map-marker-multiple", color: "#4059a9", label: "مکان‌های نزدیک" };
const styles: Record<string, ResultAppearance> = {
  "amenity:cafe": { icon: "mdi-coffee", color: "#087988", label: "کافه" },
  "amenity:restaurant": { icon: "mdi-silverware-fork-knife", color: "#c54b35", label: "رستوران" },
  "amenity:fast_food": { icon: "mdi-food", color: "#c54b35", label: "غذاخوری" },
  "tourism:hotel": { icon: "mdi-bed", color: "#7050ae", label: "هتل" },
  "tourism:guest_house": { icon: "mdi-bed", color: "#7050ae", label: "اقامتگاه" },
  "amenity:fuel": { icon: "mdi-gas-station", color: "#335ca9", label: "جایگاه سوخت" },
  "leisure:park": { icon: "mdi-tree", color: "#18745d", label: "پارک" },
  "highway:bus_stop": { icon: "mdi-bus-stop", color: "#295f9a", label: "ایستگاه اتوبوس" },
  "amenity:bus_station": { icon: "mdi-bus", color: "#295f9a", label: "پایانهٔ اتوبوس" },
  "railway:station": { icon: "mdi-train", color: "#295f9a", label: "ایستگاه قطار" }
};
export function resultAppearance(place: GeocodeResult): ResultAppearance {
  return styles[`${place.type}:${place.subtype ?? ""}`] ?? generic;
}
/** A geocoder may refresh a name, address or category without moving the
 * selected OSM place. The route owns that pin until its identity/point changes;
 * its independently saved label must not be overwritten by a search refresh.
 */
export function matchesSelectedSearchDestination(
  selected: GeocodeResult | null, routePlace: GeocodeResult | null,
  point: { lat: number; lon: number } | null
): boolean {
  return !!selected && !!routePlace && !!point &&
    selected.placeId === routePlace.placeId &&
    selected.lat === routePlace.lat && selected.lon === routePlace.lon &&
    point.lat === routePlace.lat && point.lon === routePlace.lon;
}

export function clusterAppearance(places: readonly GeocodeResult[]): ResultAppearance {
  const first = places[0] && resultAppearance(places[0]);
  return first && first !== generic && places.every(place => resultAppearance(place) === first) ? first : mixed;
}
