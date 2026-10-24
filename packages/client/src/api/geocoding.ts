import { z } from "zod";
import { geocodeQuerySchema, geocodeResponseSchema, geocodeResultSchema,
  type GeocodeQueryInput, type GeocodeResponse } from "@shared/index";

/** Photon returns GeoJSON, while the app's place-search contract uses named, bounded results. */
const collectionSchema = z.object({
  type: z.literal("FeatureCollection"),
  features: z.array(z.unknown()).max(1000)
});
const pointSchema = z.object({
  type: z.literal("Feature"),
  geometry: z.object({ type: z.literal("Point"), coordinates: z.tuple([z.number(), z.number()]) }),
  properties: z.record(z.string(), z.unknown())
});

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Skip malformed/unnamed Photon features rather than letting one bad hit hide valid places. */
export function photonPlaces(payload: unknown, limit: number): GeocodeResponse {
  const collection = collectionSchema.parse(payload);
  const places: GeocodeResponse = [];
  const ids = new Set<string>();
  for (const raw of collection.features) {
    if (places.length >= limit) break;
    const parsed = pointSchema.safeParse(raw);
    if (!parsed.success) continue;
    const { geometry, properties } = parsed.data;
    const [lon, lat] = geometry.coordinates;
    const name = text(properties.name) ?? text(properties.street) ?? text(properties.city) ??
      text(properties.state) ?? text(properties.country);
    if (!name) continue;
    const address = [name, properties.housenumber, properties.street, properties.district,
      properties.city, properties.state, properties.country]
      .map(text).filter((part, index, parts) => part !== null && parts.indexOf(part) === index).join(", ");
    const osmId = properties.osm_id;
    const osmType = text(properties.osm_type);
    const placeId = osmType && (typeof osmId === "string" || typeof osmId === "number")
      ? `osm:${osmType}:${osmId}` : `geo:${lon}:${lat}:${name}`;
    const candidate = geocodeResultSchema.safeParse({ placeId, name, address, lon, lat,
      type: text(properties.osm_key) ?? "place",
      ...(typeof properties.importance === "number" && Number.isFinite(properties.importance)
        ? { importance: properties.importance } : {}) });
    if (!candidate.success || ids.has(placeId)) continue;
    places.push(candidate.data);
    ids.add(placeId);
  }
  return geocodeResponseSchema.parse(places);
}

/** Local-only Photon gateway; never send place queries to a third-party browser origin. */
export async function searchPlaces(input: GeocodeQueryInput, signal?: AbortSignal): Promise<GeocodeResponse> {
  const query = geocodeQuerySchema.parse(input);
  const params = new URLSearchParams({ q: query.q, limit: String(query.limit) });
  if (query.bbox) params.set("bbox", query.bbox);
  const response = await fetch(`/geocode?${params}`, {
    method: "GET", headers: { accept: "application/json" }, credentials: "same-origin", signal
  });
  if (!response.ok) throw new Error("PLACE_SEARCH_UNAVAILABLE");
  return photonPlaces(await response.json(), query.limit);
}
