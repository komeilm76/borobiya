import { parseMapConfig } from "./map-config.mjs";

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

function routeResult(osrmResponse, profile) {
  if (!Array.isArray(osrmResponse.routes)) {
    return json({ error: "invalid_upstream_response", message: "OSRM omitted routes." }, 502);
  }
  if (osrmResponse.routes.length === 0) {
    return json({ error: "no_route", message: "OSRM returned no routes." }, 422);
  }

  const routes = [];
  for (const route of osrmResponse.routes) {
    if (!Number.isFinite(route.distance) || !Number.isFinite(route.duration) ||
        typeof route.geometry !== "string" || !Array.isArray(route.legs)) {
      return json({ error: "invalid_upstream_response", message: "OSRM returned an incomplete route." }, 502);
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
  mapConfig = parseMapConfig(process.env),
  fetchImpl = globalThis.fetch,
  timeoutMs = 15_000
} = {}) {
  const { pathname } = new URL(request.url);
  if (pathname === "/health") {
    return request.method === "GET" ? json({ status: "ok" }) : json({ error: "method_not_allowed" }, 405);
  }
  if (pathname === "/config") {
    return request.method === "GET" ? json(mapConfig) : json({ error: "method_not_allowed" }, 405);
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
  } catch {
    return json({ error: "routing_unavailable", profile: input.profile }, 503);
  }

  let osrmResponse;
  try {
    osrmResponse = await response.json();
  } catch {
    return json({ error: "invalid_upstream_response" }, 502);
  }

  if (osrmResponse?.code === "NoRoute" || osrmResponse?.code === "NoSegment") {
    return json({ error: "no_route", message: osrmResponse.message ?? "No route was found." }, 422);
  }
  if (!response.ok || osrmResponse?.code !== "Ok") {
    return json({ error: "routing_failed", message: osrmResponse?.message ?? "OSRM returned an error." }, 502);
  }

  return routeResult(osrmResponse, input.profile);
}

export { DEFAULT_UPSTREAMS };
