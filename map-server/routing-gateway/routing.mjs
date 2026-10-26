import { parseMapConfig } from "./map-config.mjs";
import { elevationForRoute } from "./elevation.mjs";
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

function routeResult(osrmResponse, profile, diagnosis = {}, elevation = null, optimized = false, stopCount = 2) {
  // Trip waypoints are indexed in input order; waypoint_index is the position in the trip.
  // Fail closed if OSRM ever changes either endpoint or returns an ambiguous/malformed order.
  let order;
  if (optimized) {
    if (!Array.isArray(osrmResponse.waypoints) || osrmResponse.waypoints.length !== stopCount) {
      return json({ error: "invalid_upstream_response", profile, message: "Incomplete optimized waypoint order." }, 502);
    }
    const indices = osrmResponse.waypoints.map((point) => point?.waypoint_index);
    if (indices.some((index) => !Number.isInteger(index) || index < 0 || index >= stopCount) ||
        new Set(indices).size !== stopCount || indices[0] !== 0 || indices[stopCount - 1] !== stopCount - 1 ||
        osrmResponse.waypoints.some((point) => point?.trips_index !== 0)) {
      return json({ error: "invalid_upstream_response", profile, message: "Optimized order changed a fixed endpoint." }, 502);
    }
    order = indices.map((_, index) => indices.indexOf(index));
  }
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
    // OSRM is local, but an Ok response can still be malformed. Do not throw on a null
    // entry or return a 200 that the client must reject (or an unbounded polyline).
    if (!route || typeof route !== "object" || Array.isArray(route) ||
        !Number.isFinite(route.distance) || route.distance < 0 ||
        !Number.isFinite(route.duration) || route.duration < 0 ||
        typeof route.geometry !== "string" || route.geometry.length === 0 ||
        route.geometry.length > 200_000 || !Array.isArray(route.legs) ||
        (stopCount > 2 && route.legs.length !== stopCount - 1)) {
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
      legs: route.legs,
      elevation: elevationForRoute(route.geometry, elevation)
    });
  }

  return json({ profile, routes, waypoints: osrmResponse.waypoints ?? [], ...(optimized ? { order } : {}) });
}

export async function handleRoutingRequest(request, {
  upstreams = configuredUpstreams(),
  geocodingUpstreams = configuredGeocodingUpstreams(),
  mapConfig = parseMapConfig(process.env),
  elevation = null,
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
  if ((input.via !== undefined && !Array.isArray(input.via)) || input.via?.length > 6 ||
      (input.via ?? []).some((point) => !isPoint(point))) {
    return json({ error: "invalid_waypoints", message: "via requires at most six WGS84 points." }, 400);
  }
  if (input.optimize !== undefined && typeof input.optimize !== "boolean") {
    return json({ error: "invalid_optimization", message: "optimize must be boolean." }, 400);
  }
  if (input.optimize && !input.via?.length) {
    return json({ error: "invalid_optimization", message: "Optimization requires a waypoint." }, 400);
  }
  if (!validAlternatives(input.alternatives)) {
    return json({ error: "invalid_alternatives", message: "alternatives must be boolean or an integer from 0 to 3." }, 400);
  }

  const endpoint = upstreams[input.profile];
  if (typeof endpoint !== "string" || endpoint.length === 0) {
    return json({ error: "routing_profile_unavailable", profile: input.profile }, 503);
  }

  const optimized = input.optimize === true;
  const stops = [input.from, ...(input.via ?? []), input.to];
  const coordinates = stops.map((point) => [point.lon, point.lat]);
  const osrmRequest = {
    coordinates,
    // OSRM alternatives are only supported for a two-stop route.
    alternatives: stops.length === 2 ? (input.alternatives ?? true) : false,
    steps: true,
    geometries: "polyline",
    overview: "full"
  };

  const upstreamEndpoint = optimized ? endpoint.replace("/route/v1/", "/trip/v1/") : endpoint;
  if (optimized && upstreamEndpoint === endpoint) return json({ error: "routing_profile_unavailable", profile: input.profile }, 503);
  // OSRM accepts JSON POST for route/table/match, but its trip service only accepts GET.
  // The bounded (<=8 stops) validated numbers keep the local URL short. Never put this URL
  // into gateway logs/diagnostics: unlike the route POST it contains private GPS points.
  let requestUrl = upstreamEndpoint;
  if (optimized) {
    try {
      const tripUrl = new URL(upstreamEndpoint);
      tripUrl.pathname += `/${coordinates.map(([lon, lat]) => `${lon},${lat}`).join(";")}`;
      for (const [key, value] of Object.entries({ roundtrip: "false", source: "first", destination: "last",
        steps: "true", geometries: "polyline", overview: "full" })) {
        tripUrl.searchParams.set(key, value);
      }
      requestUrl = tripUrl.toString();
    } catch {
      return json({ error: "routing_profile_unavailable", profile: input.profile }, 503);
    }
  }
  let response;
  try {
    response = await fetchImpl(requestUrl, optimized ? {
      method: "GET", headers: { accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs)
    } : {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(osrmRequest),
      signal: AbortSignal.timeout(timeoutMs)
    });
  } catch (error) {
    // Fetch errors can contain the full request URL. Keep transport error names and safe
    // socket codes for trips, but not the exception message (which may contain GPS points).
    const transportCode = error?.cause?.code;
    const reason = optimized
      ? `${error?.name === "TimeoutError" ? "TimeoutError" : "Error"}${
        typeof transportCode === "string" && /^[A-Z_0-9]+$/.test(transportCode)
          ? `: ${transportCode}` : ""}`
      : `${error?.name ?? "Error"}: ${String(error?.message ?? "unknown").slice(0, 200)}`;
    log(`${input.profile} routing: no HTTP answer from ${upstreamEndpoint} (${reason})`);
    return json({ error: "routing_unavailable", profile: input.profile }, 503);
  }

  const { text, parsed, readFailed } = await readUpstreamBody(response);
  // An OSRM error body can also echo the GET path. Only report status and code for trips.
  const safeParsed = optimized ? (parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? { code: parsed.code } : undefined) : parsed;
  const upstream = describeUpstream({ endpoint: upstreamEndpoint, status: response.status,
    text: optimized ? "" : text, parsed: safeParsed, readFailed });
  const report = (error, fallback) => {
    log(formatUpstreamLog(`${input.profile} routing`, { status: response.status, endpoint: upstreamEndpoint, ...upstream }));
    return json({ error, profile: input.profile, message: upstream.message ?? fallback, ...upstream.fields }, 502);
  };

  if (readFailed || parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return report("invalid_upstream_response", readFailed
      ? "The OSRM response body could not be read."
      : "OSRM answered with something that is not a JSON object.");
  }
  if (parsed.code === "NoRoute" || parsed.code === "NoSegment" || (optimized && parsed.code === "NoTrips")) {
    return json({ error: "no_route", message: optimized ? "No connected trip was found." :
      (parsed.message ?? "No route was found.") }, 422);
  }
  if (!response.ok || parsed.code !== "Ok") {
    return report("routing_failed", "The OSRM profile answered with an error and no message.");
  }

  if (optimized) {
    if (!Array.isArray(parsed.trips) || parsed.trips.length !== 1) {
      return report("invalid_upstream_response", "OSRM did not return exactly one optimized trip.");
    }
    return routeResult({ ...parsed, routes: parsed.trips }, input.profile, upstream.fields, elevation, true, stops.length);
  }
  return routeResult(parsed, input.profile, upstream.fields, elevation, false, stops.length);
}

export { DEFAULT_UPSTREAMS, configuredGeocodingUpstreams, DEFAULT_PHOTON_UPSTREAMS };
