import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_UPSTREAMS, handleRoutingRequest } from "./routing.mjs";

function postRoute(body, { contentType = "application/json" } = {}) {
  return new Request("http://routing-gateway/route", {
    method: "POST",
    headers: { "content-type": contentType },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

const validInput = {
  from: { lat: 35.68, lon: 51.38 },
  to: { lat: 35.70, lon: 51.41 },
  profile: "car",
  alternatives: 2
};

const osrmFixture = {
  code: "Ok",
  waypoints: [{ name: "Start" }, { name: "Finish" }],
  routes: [{
    distance: 5230.5,
    duration: 754.2,
    geometry: "encoded-polyline",
    legs: [{ distance: 5230.5, duration: 754.2, steps: [] }]
  }]
};

test("maps a POST /route request to the OSRM profile API and normalizes route fields", async () => {
  let requestedUrl;
  let requestedBody;
  const response = await handleRoutingRequest(postRoute(validInput), {
    fetchImpl: async (url, options) => {
      requestedUrl = url;
      requestedBody = JSON.parse(options.body);
      return Response.json(osrmFixture);
    }
  });

  assert.equal(response.status, 200);
  assert.equal(requestedUrl, DEFAULT_UPSTREAMS.car);
  assert.deepEqual(requestedBody, {
    coordinates: [[51.38, 35.68], [51.41, 35.70]],
    alternatives: 2,
    steps: true,
    geometries: "polyline",
    overview: "full"
  });
  assert.deepEqual(await response.json(), {
    profile: "car",
    routes: [{
      distance_m: 5230.5,
      duration_s: 754.2,
      polyline: "encoded-polyline",
      legs: osrmFixture.routes[0].legs,
      elevation: null
    }],
    waypoints: osrmFixture.waypoints
  });
});

test("maps bicycle to OSRM's bike profile path and keeps requests local", async () => {
  let requestedUrl;
  const response = await handleRoutingRequest(postRoute({ ...validInput, profile: "bicycle" }), {
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return Response.json(osrmFixture);
    }
  });
  assert.equal(response.status, 200);
  assert.equal(requestedUrl.pathname, "/route/v1/bike");
  assert.equal(requestedUrl.hostname, "osrm-bicycle");
});

test("routes foot requests to the dedicated foot graph", async () => {
  let requestedUrl;
  const response = await handleRoutingRequest(postRoute({ ...validInput, profile: "foot" }), {
    fetchImpl: async (url) => {
      requestedUrl = url;
      return Response.json(osrmFixture);
    }
  });
  assert.equal(response.status, 200);
  assert.equal(requestedUrl, DEFAULT_UPSTREAMS.foot);
});

test("rejects malformed requests before contacting OSRM", async () => {
  let calls = 0;
  const fetchImpl = async () => { calls += 1; return Response.json(osrmFixture); };

  for (const [request, status] of [
    [postRoute("{"), 400],
    [postRoute({ ...validInput, profile: "train" }), 400],
    [postRoute({ ...validInput, from: { lat: 91, lon: 51.38 } }), 400],
    [postRoute(validInput, { contentType: "text/plain" }), 415]
  ]) {
    assert.equal((await handleRoutingRequest(request, { fetchImpl })).status, status);
  }
  assert.equal(calls, 0);
});

test("returns a useful no-route response", async () => {
  const response = await handleRoutingRequest(postRoute(validInput), {
    fetchImpl: async () => Response.json({ code: "NoRoute", message: "No route found" }, { status: 400 })
  });
  assert.equal(response.status, 422);
  assert.deepEqual(await response.json(), { error: "no_route", message: "No route found" });
});

test("reports local OSRM unavailability as 503", async () => {
  const response = await handleRoutingRequest(postRoute(validInput), {
    fetchImpl: async () => { throw new Error("connection refused"); }
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "routing_unavailable", profile: "car" });
});

test("names the upstream status and code when OSRM answers an error without a message", async () => {
  const lines = [];
  const response = await handleRoutingRequest(postRoute(validInput), {
    fetchImpl: async () => new Response('{"code":"InvalidValue"}', { status: 400 }),
    log: (line) => lines.push(line)
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "routing_failed");
  assert.equal(body.profile, "car");
  assert.equal(body.upstream, "osrm-car:5000/route/v1/car");
  assert.equal(body.upstream_status, 400);
  assert.equal(body.upstream_code, "InvalidValue");
  assert.match(body.message, /error and no message/);
  assert.equal(lines.length, 1);
  assert.match(lines[0], /car routing: upstream osrm-car:5000\/route\/v1\/car answered HTTP 400 code=InvalidValue/);
});

test("forwards OSRM's own message instead of the canned one", async () => {
  const response = await handleRoutingRequest(postRoute(validInput), {
    fetchImpl: async () => new Response(
      '{"code":"InvalidValue","message":"Failed to find near matching edges for start point"}',
      { status: 400, headers: { "content-type": "application/json" } }
    ),
    log: () => {}
  });
  const body = await response.json();
  assert.equal(body.error, "routing_failed");
  assert.equal(body.message, "Failed to find near matching edges for start point");
  assert.equal(body.upstream_code, "InvalidValue");
});

test("shows an excerpt when the upstream answers with something that is not JSON", async () => {
  const response = await handleRoutingRequest(postRoute(validInput), {
    fetchImpl: async () => new Response("<html><body>Bad Gateway</body></html>", { status: 502 }),
    log: () => {}
  });
  const body = await response.json();
  assert.equal(body.error, "invalid_upstream_response");
  assert.equal(body.upstream_status, 502);
  assert.equal(body.upstream_body, "<html><body>Bad Gateway</body></html>");
});

test("treats a JSON scalar or array as an invalid upstream answer, not a crash", async () => {
  for (const payload of ["null", "[]", '"busy"', "42"]) {
    const response = await handleRoutingRequest(postRoute(validInput), {
      fetchImpl: async () => new Response(payload, { status: 200, headers: { "content-type": "application/json" } }),
      log: () => {}
    });
    assert.equal(response.status, 502, payload);
    const body = await response.json();
    assert.equal(body.error, "invalid_upstream_response", payload);
    assert.equal(body.upstream_status, 200, payload);
  }
});

test("flags an Ok reply that carries no routes array", async () => {
  const response = await handleRoutingRequest(postRoute(validInput), {
    fetchImpl: async () => Response.json({ code: "Ok" }),
    log: () => {}
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "invalid_upstream_response");
  assert.match(body.message, /without a routes array/);
  assert.equal(body.upstream_status, 200);
});

test("rejects malformed Ok route entries as 502 instead of throwing or serving unusable routes", async () => {
  for (const invalid of [
    null,
    42,
    { ...osrmFixture.routes[0], distance: -1 },
    { ...osrmFixture.routes[0], duration: -1 },
    { ...osrmFixture.routes[0], geometry: "" },
    { ...osrmFixture.routes[0], geometry: "x".repeat(200_001) }
  ]) {
    const response = await handleRoutingRequest(postRoute(validInput), {
      fetchImpl: async () => Response.json({ ...osrmFixture, routes: [osrmFixture.routes[0], invalid] }),
      log: () => {}
    });
    assert.equal(response.status, 502, JSON.stringify(invalid)?.slice(0, 60));
    const body = await response.json();
    assert.equal(body.error, "invalid_upstream_response");
    assert.equal(body.route_index, 1);
    assert.equal(body.upstream_status, 200);
  }
});

test("truncates a huge non-JSON upstream body before echoing it", async () => {
  const response = await handleRoutingRequest(postRoute(validInput), {
    fetchImpl: async () => new Response("x".repeat(5000), { status: 500 }),
    log: () => {}
  });
  const body = await response.json();
  assert.equal(body.upstream_body.length, 401); // 400 characters plus the ellipsis
});

test("logs the failure but keeps the 503 body fixed when the profile container is unreachable", async () => {
  const lines = [];
  const response = await handleRoutingRequest(postRoute(validInput), {
    fetchImpl: async () => { throw Object.assign(new Error("connect ECONNREFUSED 172.30.0.9:5000"), { name: "TypeError" }); },
    log: (line) => lines.push(line)
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "routing_unavailable", profile: "car" });
  assert.match(lines[0], /no HTTP answer from http:\/\/osrm-car:5000\/route\/v1\/car/);
  assert.match(lines[0], /TypeError: connect ECONNREFUSED/);
});

test("serves public map settings on GET /config", async () => {
  const mapConfig = {
    region: "tehran",
    bbox: [51, 35.5, 51.7, 35.9],
    dataVersion: "development",
    minZoom: 0,
    maxZoom: 14
  };
  const response = await handleRoutingRequest(new Request("http://routing-gateway/config"), { mapConfig });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), mapConfig);
});

test("serves a liveness endpoint without any external request", async () => {
  const response = await handleRoutingRequest(new Request("http://routing-gateway/health"));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok" });
});
