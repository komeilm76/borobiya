import { parseMapConfig } from "./map-config.mjs";
import { DEFAULT_PHOTON_UPSTREAMS, handleGeocodeRequest } from "./geocoding.mjs";
import { describeUpstream, formatUpstreamLog, readUpstreamBody } from "./upstream.mjs";

const DEFAULT_UPSTREAMS = Object.freeze({
  car: "http://osrm-car:5000/route/v1/car",
  bicycle: "http://osrm-bicycle:5000/route/v1/bike",
  foot: "http://osrm-foot:5000/route/v1/foot"
});

function configuredUpstreams(env = process.env) {
  return {
    car: env.OSRM_CAR_URL || DEFAULT_UPSTREAMS.car,
    bicycle: env.OSRM_BICYCLE_URL || DEFAULT_UPSTREAMS.bicycle,
    foot: env.OSRM_FOOT_URL || DEFAULT_UPSTREAMS.foot
  };
}

function configuredGeocodingUpstreams(env = process.env) {
  return {
    geocode: env.PHOTON_GEOCODE_URL || DEFAULT_PHOTON_UPSTREAMS.geocode,
    reverse: env.PHOTON_REVERSE_URL || DEFAULT_PHOTON_UPSTREAMS.reverse
  };
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function isPoint(point) {
  return point !== null && typeof point === "object" &&
    Number.isFinite(point.lat) && point.lat >= -90 && point.lat <= 90 &&
    Number.isFinite(point.lon) && point.lon >= -180 && point.lon <= 180;
}

function validAlternatives(value) {
  return value === undefined || typeof value === "boolean" ||
    (Number.isInteger(value) && value >= 0 && value <= 3);
}

function routeResult(osrmResponse, profile, diagnosis = {}) {
  if (!Array.isArray(osrmResponse.routes)) {
    return json({
      error: "invalid_upstream_response",
      profile,
      message: "OSRM answered code=Ok without a routes array.",
      ...diagnosis
    }, 502);
  }
  if (osrmResponse.routes.length === 0) {
    return json({ error: "no_route", message: "OSRM returned no routes." }, 422);
  }

  const routes = [];
  for (const route of osrmResponse.routes) {
    if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration) ||
        typeof route.geometry !== "string" || !Array.isArray(route.legs)) {
      return json({
        error: "invalid_upstream_response",
        profile,
        message: "OSRM returned an incomplete route.",
        route_index: routes.length,
        ...diagnosis
      }, 502);
    }
    routes.push({
      distance_m: route.distance,
      duration_s: route.duration,
      polyline: route.geometry,
      legs: route.legs
    });
  }

  return json({ profile, routes, waypoints: osrmResponse.waypoints ?? [] });
}

export async function handleRoutingRequest(request, {
  upstreams = configuredUpstreams(),
  geocodingUpstreams = configuredGeocodingUpstreams(),
  mapConfig = parseMapConfig(process.env),
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000,
  log = console.error
} = {}) {
  const { pathname } = new URL(request.url);
  if (pathname === "/health") {
    return request.method === "GET" ? json({ status: "ok" }) : json({ error: "method_not_allowed" }, 405);
  }
  if (pathname === "/config") {
    return request.method === "GET" ? json(mapConfig) : json({ error: "method_not_allowed" }, 405);
  }
  if (pathname === "/geocode" || pathname === "/reverse") {
    return handleGeocodeRequest(request, { upstreams: geocodingUpstreams, fetchImpl, timeoutMs, log });
  }
  if (pathname !== "/route") return json({ error: "not_found" }, 404);
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim().toLowerCase();
  if (contentType !== "application/json") {
    return json({ error: "content_type_must_be_json" }, 415);
  }

  let input;
  try {
    input = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return json({ error: "invalid_request" }, 400);
  }
  if (!isPoint(input.from) || !isPoint(input.to)) {
    return json({ error: "invalid_coordinates", message: "from/to require WGS84 lat/lon values." }, 400);
  }
  if (!["car", "bicycle", "foot"].includes(input.profile)) {
    return json({ error: "invalid_profile", message: "profile must be car, bicycle, or foot." }, 400);
  }
  if (!validAlternatives(input.alternatives)) {
    return json({ error: "invalid_alternatives", message: "alternatives must be boolean or an integer from 0 to 3." }, 400);
  }

  const endpoint = upstreams[input.profile];
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return json({ error: "routing_profile_unavailable", profile: input.profile }, 503);
  }

  const osrmRequest = {
    coordinates: [[input.from.lon, input.from.lat], [input.to.lon, input.to.lat]],
    alternatives: input.alternatives ?? true,
    steps: true,
    geometries: "polyline",
    overview: "full"
  };

  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(osrmRequest),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    // The 503 body stays a fixed shape for clients; the container log is where "connection refused" and
    // "timed out after 15s" have to be told apart, because that difference is the whole diagnosis.
    const reason = `${error?.name ?? "Error"}: ${String(error?.message ?? "unknown").slice(0, 200)}`;
    log(`${input.profile} routing: no HTTP answer from ${endpoint} (${reason})`);
    return json({ error: "routing_unavailable", profile: input.profile }, 503);
  }

  const { text, parsed, readFailed } = await readUpstreamBody(response);
  const upstream = describeUpstream({ endpoint, status: response.status, text, parsed, readFailed });
  const report = (error, fallback) => {
    log(formatUpstreamLog(`${input.profile} routing`, { status: response.status, endpoint, ...upstream }));
    return json({ error, profile: input.profile, message: upstream.message ?? fallback, ...upstream.fields }, 502);
  };

  if (readFailed || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return report("invalid_upstream_response", readFailed
      ? "The OSRM response body could not be read."
      : "OSRM answered with something that is not a JSON object.");
  }
  if (parsed.code === "NoRoute" || parsed.code === "NoSegment") {
    return json({ error: "no_route", message: parsed.message ?? "No route was found." }, 422);
  }
  if (!response.ok || parsed.code !== "Ok") {
    return report("routing_failed", "The OSRM profile answered with an error and no message.");
  }

  return routeResult(parsed, input.profile, upstream.fields);
}

export { DEFAULT_UPSTREAMS, configuredGeocodingUpstreams, DEFAULT_PHOTON_UPSTREAMS };
