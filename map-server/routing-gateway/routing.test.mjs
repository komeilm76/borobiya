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
      legs: osrmFixture.routes[0].legs
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
