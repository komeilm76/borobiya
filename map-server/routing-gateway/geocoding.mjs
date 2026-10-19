const DEFAULT_PHOTON_UPSTREAMS = Object.freeze({
  geocode: "http://photon:2322/api",
  reverse: "http://photon:2322/reverse"
});

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function readParams(searchParams, allowedKeys) {
  const values = new Map();
  for (const [key, value] of searchParams) {
    if (!allowedKeys.has(key) || values.has(key)) return null;
    values.set(key, value);
  }
  return values;
}

function validBbox(value) {
  const parts = value.split(",").map((part) => part.trim());
  if (parts.length !== 4 || parts.some((part) => !DECIMAL_PATTERN.test(part))) return false;
  const bbox = parts.map(Number);
  if (!bbox.every(Number.isFinite)) return false;
  const [west, south, east, north] = bbox;
  return west >= -180 && east <= 180 && west < east &&
    south >= -90 && north <= 90 && south < north;
}

function validCoordinate(value, min, max) {
  if (typeof value !== "string" || !DECIMAL_PATTERN.test(value.trim())) return false;
  const coordinate = Number(value);
  return Number.isFinite(coordinate) && coordinate >= min && coordinate <= max;
}

function photonUrl(endpoint, params) {
  const target = new URL(endpoint);
  target.search = new URLSearchParams(params).toString();
  return target;
}

async function proxyPhotonRequest(target, fetchImpl, timeoutMs) {
  let response;
  try {
    response = await fetchImpl(target, {
      method: "GET",
      headers: { accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch {
    return json({ error: "geocoding_unavailable" }, 503);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    return json({ error: "invalid_geocoder_response" }, 502);
  }
  if (!response.ok) return json({ error: "geocoding_failed" }, 502);
  if (body?.type !== "FeatureCollection" || !Array.isArray(body.features)) {
    return json({ error: "invalid_geocoder_response" }, 502);
  }
  return json(body);
}

export async function handleGeocodeRequest(request, {
  upstreams = DEFAULT_PHOTON_UPSTREAMS,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000
} = {}) {
  const url = new URL(request.url);
  const isReverse = url.pathname === "/reverse";
  if (!isReverse && url.pathname !== "/geocode") return json({ error: "not_found" }, 404);
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);

  if (isReverse) {
    const params = readParams(url.searchParams, new Set(["lat", "lon"]));
    const lat = params?.get("lat");
    const lon = params?.get("lon");
    if (!params || params.size !== 2 || !validCoordinate(lat, -90, 90) || !validCoordinate(lon, -180, 180)) {
      return json({ error: "invalid_reverse_query" }, 400);
    }
    let target;
    try {
      target = photonUrl(upstreams.reverse, { lat: String(Number(lat)), lon: String(Number(lon)) });
    } catch {
      return json({ error: "geocoding_unavailable" }, 503);
    }
    return proxyPhotonRequest(target, fetchImpl, timeoutMs);
  }

  const params = readParams(url.searchParams, new Set(["q", "limit", "bbox"]));
  const query = params?.get("q")?.trim();
  const limitText = params?.get("limit") ?? "5";
  const limit = Number(limitText);
  const bbox = params?.get("bbox");
  if (!params || !query || query.length > 200 || !/^\d+$/.test(limitText) ||
      !Number.isInteger(limit) || limit < 1 || limit > 20 || (bbox !== undefined && !validBbox(bbox))) {
    return json({ error: "invalid_geocode_query" }, 400);
  }

  const upstreamParams = { q: query, limit: String(limit) };
  if (bbox !== undefined) upstreamParams.bbox = bbox.split(",").map((part) => String(Number(part.trim()))).join(",");
  let target;
  try {
    target = photonUrl(upstreams.geocode, upstreamParams);
  } catch {
    return json({ error: "geocoding_unavailable" }, 503);
  }
  return proxyPhotonRequest(target, fetchImpl, timeoutMs);
}

export { DEFAULT_PHOTON_UPSTREAMS };
