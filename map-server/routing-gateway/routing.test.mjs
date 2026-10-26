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

const multiStopFixture = { ...osrmFixture, routes: [{ ...osrmFixture.routes[0],
  legs: Array.from({ length: 3 }, () => osrmFixture.routes[0].legs[0]) }] };

test("routes A via B via C to incident in entered order on the local graph", async () => {
  const via = [{ lat: 35.69, lon: 51.39 }, { lat: 35.695, lon: 51.395 }];
  let body;
  let url;
  const response = await handleRoutingRequest(postRoute({ ...validInput, via }), {
    fetchImpl: async (endpoint, options) => {
      url = endpoint;
      body = JSON.parse(options.body);
      return Response.json(multiStopFixture);
    }
  });
  assert.equal(response.status, 200);
  assert.equal(url, DEFAULT_UPSTREAMS.car);
  assert.deepEqual(body.coordinates, [[51.38, 35.68], [51.39, 35.69], [51.395, 35.695], [51.41, 35.7]]);
  assert.equal(body.alternatives, false);
});

test("optimizes intermediates while fixing A and the incident, rejecting an untrustworthy OSRM order", async () => {
  const via = [{ lat: 35.69, lon: 51.39 }, { lat: 35.695, lon: 51.395 }];
  const stops = [{ waypoint_index: 0, trips_index: 0 }, { waypoint_index: 2, trips_index: 0 },
    { waypoint_index: 1, trips_index: 0 }, { waypoint_index: 3, trips_index: 0 }];
  const fixture = { code: "Ok", trips: multiStopFixture.routes, waypoints: stops };
  let tripUrl;
  const response = await handleRoutingRequest(postRoute({ ...validInput, via, optimize: true }), {
    fetchImpl: async (url, options) => {
      tripUrl = new URL(url);
      assert.equal(options.method, "GET");
      assert.equal(options.body, undefined);
      return Response.json(fixture);
    }
  });
  assert.equal(response.status, 200);
  assert.equal(tripUrl.pathname, "/trip/v1/car/51.38,35.68;51.39,35.69;51.395,35.695;51.41,35.7");
  assert.deepEqual(Object.fromEntries(tripUrl.searchParams), {
    roundtrip: "false", source: "first", destination: "last", steps: "true",
    geometries: "polyline", overview: "full"
  });
  assert.deepEqual((await response.json()).order, [0, 2, 1, 3]);
  for (const waypoints of [stops.slice(1), [{ ...stops[0], waypoint_index: 1 }, ...stops.slice(1)],
    [stops[0], stops[1], { ...stops[2], waypoint_index: 2 }, stops[3]],
    [stops[0], stops[1], { ...stops[2], trips_index: 1 }, stops[3]]]) {
    const rejected = await handleRoutingRequest(postRoute({ ...validInput, via, optimize: true }), {
      fetchImpl: async () => Response.json({ ...fixture, waypoints })
    });
    assert.equal(rejected.status, 502);
  }
});

test("rejects unbounded, malformed or meaningless waypoint requests before OSRM", async () => {
  let calls = 0;
  for (const changes of [
    { via: null }, { via: Array.from({ length: 7 }, () => validInput.from) },
    { via: [{ lat: 92, lon: 51 }] }, { via: [null] },
    { via: [], optimize: true }, { via: [validInput.to], optimize: "true" }
  ]) {
    const answer = await handleRoutingRequest(postRoute({ ...validInput, ...changes }), {
      fetchImpl: async () => { calls++; return Response.json(osrmFixture); }
    });
    assert.equal(answer.status, 400);
  }
  assert.equal(calls, 0);
});

test("optimized trip uses OSRM v26.10 GET URL (POST JSON is route/table/match-only) without logging private coordinates", async () => {
  const via = [{ lat: 35.69, lon: 51.39 }];
  const lines = [];
  const fixture = { code: "Ok", trips: [{ ...osrmFixture.routes[0],
    legs: [osrmFixture.routes[0].legs[0], osrmFixture.routes[0].legs[0]] }],
  waypoints: [{ waypoint_index: 0, trips_index: 0 }, { waypoint_index: 1, trips_index: 0 },
    { waypoint_index: 2, trips_index: 0 }] };
  const response = await handleRoutingRequest(postRoute({ ...validInput, via, optimize: true }), {
    log: (line) => lines.push(line),
    fetchImpl: async (address, options) => {
      const url = new URL(address);
      if (options.method !== "GET" || options.body !== undefined || url.pathname !==
        "/trip/v1/car/51.38,35.68;51.39,35.69;51.41,35.7") {
        return Response.json({ code: "InvalidUrl", message: "GET trip URL required" }, { status: 405 });
      }
      assert.equal(url.searchParams.get("roundtrip"), "false");
      assert.equal(url.searchParams.get("source"), "first");
      assert.equal(url.searchParams.get("destination"), "last");
      assert.equal(url.searchParams.get("steps"), "true");
      assert.equal(url.searchParams.get("geometries"), "polyline");
      assert.equal(url.searchParams.get("overview"), "full");
      return Response.json(fixture);
    }
  });
  assert.equal(response.status, 200);
  assert.deepEqual((await response.json()).order, [0, 1, 2]);
  assert.deepEqual(lines, []);

  // A failed upstream can have sensitive coordinates in the GET path; neither logs nor
  // browser-facing diagnostics may contain them, including on a transport failure.
  const failed = await handleRoutingRequest(postRoute({ ...validInput, via, optimize: true }), {
    log: (line) => lines.push(line),
    fetchImpl: async () => Response.json({ code: "NotImplemented",
      message: "GET /trip/v1/car/51.38,35.68;51.39,35.69;51.41,35.7 failed" }, { status: 400 })
  });
  assert.equal(failed.status, 502);
  assert.doesNotMatch(JSON.stringify(await failed.json()) + lines.join("\n"), /51\.39,35\.69/);
  const networkFailure = await handleRoutingRequest(postRoute({ ...validInput, via, optimize: true }), {
    log: (line) => lines.push(line),
    fetchImpl: async () => { throw new TypeError("fetch GET /trip/v1/car/51.38,35.68;51.39,35.69 failed", {
      cause: { code: "ECONNREFUSED" }
    }); }
  });
  assert.equal(networkFailure.status, 503);
  assert.match(lines.at(-1), /ECONNREFUSED/);
  assert.doesNotMatch(lines.join("\n"), /51\.39,35\.69/);
  const noTrip = await handleRoutingRequest(postRoute({ ...validInput, via, optimize: true }), {
    fetchImpl: async () => Response.json({ code: "NoTrips", message: "51.39,35.69 is disconnected" }, { status: 400 })
  });
  assert.equal(noTrip.status, 422);
  assert.doesNotMatch(JSON.stringify(await noTrip.json()), /51\.39,35\.69/);
});
