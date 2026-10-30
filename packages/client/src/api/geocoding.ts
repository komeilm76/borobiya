import { z } from "zod";
import { geocodeQuerySchema, geocodeResponseSchema, geocodeResultSchema,
  reverseGeocodeQuerySchema, reverseGeocodeResultSchema,
  type GeocodeQueryInput, type GeocodeResponse, type ReverseGeocodeQuery,
  type ReverseGeocodeResult } from "@shared/index";

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

/** Query-free failure facts safe to show or copy on a phone. Never store URL, q,
 * bbox, response text or arbitrary upstream messages in this error.
 */
export type PlaceSearchErrorCode = "INVALID_QUERY" | "NETWORK_ERROR" | "HTTP_ERROR" | "INVALID_RESPONSE";
export type PlaceSearchLimitProbe = "LIMIT_5_ACCEPTED" | "LIMIT_5_REJECTED" | "LIMIT_5_UNAVAILABLE";
const GATEWAY_CODES = new Set([
  "invalid_geocode_query", "geocoding_unavailable", "geocoding_failed", "invalid_geocoder_response",
  "not_found", "internal_error", "method_not_allowed"
]);

export class PlaceSearchError extends Error {
  constructor(public readonly code: PlaceSearchErrorCode, public readonly status: number | null = null,
    public readonly gatewayCode: string | null = null, public readonly probe: PlaceSearchLimitProbe | null = null) {
    super("PLACE_SEARCH_UNAVAILABLE");
    this.name = "PlaceSearchError";
  }
}

/** Diagnose a 400 for limit=30 without falling back to five displayed hits.
 * Same-origin, same query and bbox: only limit changes. Do not retain or expose
 * the response (which may include private place information).
 */
async function probeFiveResultLimit(query: { q: string; bbox?: string }, signal?: AbortSignal): Promise<PlaceSearchLimitProbe> {
  const params = new URLSearchParams({ q: query.q, limit: "5" });
  if (query.bbox) params.set("bbox", query.bbox);
  try {
    const response = await fetch(`/geocode?${params}`, {
      method: "GET", headers: { accept: "application/json" }, credentials: "same-origin", signal
    });
    if (response.status === 400) return "LIMIT_5_REJECTED";
    if (!response.ok) return "LIMIT_5_UNAVAILABLE";
    const parsed = collectionSchema.safeParse(await response.json());
    return parsed.success && parsed.data.features.length <= 5 ? "LIMIT_5_ACCEPTED" : "LIMIT_5_UNAVAILABLE";
  } catch (error) {
    if ((error as { name?: unknown } | null)?.name === "AbortError") throw error;
    return "LIMIT_5_UNAVAILABLE";
  }
}

/** Local-only Photon gateway; never send place queries to a third-party browser origin. */
export async function searchPlaces(input: GeocodeQueryInput, signal?: AbortSignal): Promise<GeocodeResponse> {
  const parsed = geocodeQuerySchema.safeParse(input);
  if (!parsed.success) throw new PlaceSearchError("INVALID_QUERY");
  const query = parsed.data;
  const params = new URLSearchParams({ q: query.q, limit: String(query.limit) });
  if (query.bbox) params.set("bbox", query.bbox);
  let response: Response;
  try {
    response = await fetch(`/geocode?${params}`, {
      method: "GET", headers: { accept: "application/json" }, credentials: "same-origin", signal
    });
  } catch (error) {
    if ((error as { name?: unknown } | null)?.name === "AbortError") throw error;
    throw new PlaceSearchError("NETWORK_ERROR");
  }
  if (!response.ok) {
    let gatewayCode: string | null = null;
    try {
      const body: unknown = await response.json();
      if (body && typeof body === "object" && !Array.isArray(body) &&
          "error" in body && typeof body.error === "string" && GATEWAY_CODES.has(body.error)) {
        gatewayCode = body.error;
      }
    } catch { /* A reverse proxy may answer HTML. The HTTP status remains useful. */ }
    const probe = response.status === 400 && gatewayCode === "invalid_geocode_query" && query.limit === 30
      ? await probeFiveResultLimit(query, signal) : null;
    throw new PlaceSearchError("HTTP_ERROR", response.status, gatewayCode, probe);
  }
  try {
    return photonPlaces(await response.json(), query.limit);
  } catch {
    throw new PlaceSearchError("INVALID_RESPONSE", response.status);
  }
}

/** Photon reverse returns a GeoJSON collection, not the app's single-address contract. */
export function photonAddress(payload: unknown): ReverseGeocodeResult | null {
  const collection = collectionSchema.parse(payload);
  for (const raw of collection.features) {
    const parsed = pointSchema.safeParse(raw);
    if (!parsed.success) continue;
    const [lon, lat] = parsed.data.geometry.coordinates;
    const props = parsed.data.properties;
    const parts = [props.name, props.housenumber, props.street, props.district,
      props.city, props.state, props.country].map(text);
    const formattedAddress = parts.filter((part, index) => part !== null && parts.indexOf(part) === index).join(", ");
    const candidate = reverseGeocodeResultSchema.safeParse({
      formattedAddress,
      ...(text(props.country) ? { country: text(props.country) } : {}),
      ...(text(props.city) ? { city: text(props.city) } : {}),
      ...(text(props.street) ? { street: text(props.street) } : {}),
      ...(text(props.housenumber) ? { houseNumber: text(props.housenumber) } : {})
    });
    if (candidate.success && geocodeResultSchema.shape.lon.safeParse(lon).success &&
      geocodeResultSchema.shape.lat.safeParse(lat).success) return candidate.data;
  }
  return null;
}

/** Same-origin offline reverse endpoint; null means Photon found no usable address. */
export async function reversePlace(input: ReverseGeocodeQuery, signal?: AbortSignal): Promise<ReverseGeocodeResult | null> {
  const { lat, lon } = reverseGeocodeQuerySchema.parse(input);
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon) });
  const response = await fetch(`/reverse?${params}`, {
    method: "GET", headers: { accept: "application/json" }, credentials: "same-origin", signal
  });
  if (!response.ok) throw new Error("REVERSE_GEOCODE_UNAVAILABLE");
  return photonAddress(await response.json());
}
