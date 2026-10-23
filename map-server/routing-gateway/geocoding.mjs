import { describeUpstream, formatUpstreamLog, readUpstreamBody } from "./upstream.mjs";

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

async function proxyPhotonRequest(target, { fetchImpl, timeoutMs, log = console.error }) {
  let response;
  try {
    response = await fetchImpl(target, {
      method: "GET",
      headers: { accept: "application/geo+json, application/json" },
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    const reason = `${error?.name ?? "Error"}: ${String(error?.message ?? "unknown").slice(0, 200)}`;
    log(`geocoding: no HTTP answer from ${target} (${reason})`);
    return json({ error: "geocoding_unavailable" }, 503);
  }

  const { text, parsed: body, readFailed } = await readUpstreamBody(response);
  const upstream = describeUpstream({ endpoint: target, status: response.status, text, parsed: body, readFailed });
  const report = (error, fallback) => {
    log(formatUpstreamLog("geocoding", { status: response.status, endpoint: target, ...upstream }));
    return json({ error, message: upstream.message ?? fallback, ...upstream.fields }, 502);
  };

  if (readFailed || body === null || typeof body !== "object" || Array.isArray(body)) {
    return report("invalid_geocoder_response", readFailed
      ? "The Photon response body could not be read."
      : "Photon answered with something that is not a JSON object.");
  }
  if (!response.ok) return report("geocoding_failed", "Photon answered with an error and no message.");
  if (body.type !== "FeatureCollection" || !Array.isArray(body.features)) {
    return report("invalid_geocoder_response", "Photon did not answer with a GeoJSON FeatureCollection.");
  }
  return json(body);
}

export async function handleGeocodeRequest(request, {
  upstreams = DEFAULT_PHOTON_UPSTREAMS,
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  log = console.error
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
    return proxyPhotonRequest(target, { fetchImpl, timeoutMs, log });
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
  return proxyPhotonRequest(target, { fetchImpl, timeoutMs, log });
}

export { DEFAULT_PHOTON_UPSTREAMS };
