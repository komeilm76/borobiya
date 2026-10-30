import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_PHOTON_UPSTREAMS, handleGeocodeRequest } from "./geocoding.mjs";

const featureCollection = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    geometry: { type: "Point", coordinates: [51.38, 35.7] },
    properties: { name: "Azadi Square", city: "Tehran", country: "Iran" }
  }]
};

function get(path) {
  return new Request(`http://map-server${path}`);
}

test("GET /geocode proxies a bounded Photon search and preserves GeoJSON", async () => {
  let requestedUrl;
  let requestedOptions;
  const response = await handleGeocodeRequest(get("/geocode?q=Azadi%20Square&bbox=51.0%2C35.5%2C51.7%2C35.9"), {
    fetchImpl: async (url, options) => {
      requestedUrl = new URL(url);
      requestedOptions = options;
      return Response.json(featureCollection);
    }
  });

  assert.equal(response.status, 200);
  assert.equal(requestedUrl.origin, "http://photon:2322");
  assert.equal(requestedUrl.pathname, "/api");
  assert.equal(requestedUrl.searchParams.get("q"), "Azadi Square");
  assert.equal(requestedUrl.searchParams.get("limit"), "5");
  assert.equal(requestedUrl.searchParams.get("bbox"), "51,35.5,51.7,35.9");
  assert.equal(requestedOptions.method, "GET");
  assert.deepEqual(await response.json(), featureCollection);
});

test("GET /geocode forwards a validated result limit", async () => {
  let requestedUrl;
  const response = await handleGeocodeRequest(get("/geocode?q=Tehran&limit=30"), {
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return Response.json({ type: "FeatureCollection", features: [] });
    }
  });
  assert.equal(response.status, 200);
  assert.equal(requestedUrl.searchParams.get("limit"), "30");
});

test("GET /reverse validates WGS84 coordinates and proxies to Photon", async () => {
  let requestedUrl;
  const response = await handleGeocodeRequest(get("/reverse?lat=35.70&lon=51.40"), {
    fetchImpl: async (url) => {
      requestedUrl = new URL(url);
      return Response.json(featureCollection);
    }
  });
  assert.equal(response.status, 200);
  assert.equal(requestedUrl.origin, "http://photon:2322");
  assert.equal(requestedUrl.pathname, "/reverse");
  assert.equal(requestedUrl.searchParams.get("lat"), "35.7");
  assert.equal(requestedUrl.searchParams.get("lon"), "51.4");
});

test("geocode and reverse reject malformed/unknown query parameters before upstream calls", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    return Response.json(featureCollection);
  };

  for (const path of [
    "/geocode",
    "/geocode?q=%20%20",
    "/geocode?q=Tehran&limit=0",
    "/geocode?q=Tehran&limit=31",
    "/geocode?q=Tehran&limit=5.5",
    "/geocode?q=Tehran&bbox=51,91,52,92",
    "/geocode?q=Tehran&unexpected=1",
    "/geocode?q=Tehran&q=Iran",
    "/reverse?lat=91&lon=51",
    "/reverse?lat=35.7",
    "/reverse?lat=35.7&lon=51&extra=1",
    "/reverse?lat=35.7&lat=35.8&lon=51"
  ]) {
    const response = await handleGeocodeRequest(get(path), { fetchImpl });
    assert.equal(response.status, 400, path);
  }
  assert.equal(calls, 0);
});

test("geocode transport failures identify Photon without logging the user's search or exception URL", async () => {
  const lines = [];
  const response = await handleGeocodeRequest(get("/geocode?q=Private%20Home%20Address"), {
    fetchImpl: async (url) => {
      throw Object.assign(new Error(`request failed: ${url}`), { cause: { code: "PRIVATE_HOME_ADDRESS" } });
    },
    log: (line) => lines.push(line)
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "geocoding_unavailable" });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /geocoding: no HTTP answer from photon:2322\/api \(Error\)/);
  assert.doesNotMatch(lines[0], /private|home|address|q=|request failed/i);
});

test("reverse transport failures log a safe socket code but not private coordinates", async () => {
  const lines = [];
  const response = await handleGeocodeRequest(get("/reverse?lat=35.712345&lon=51.412345"), {
    fetchImpl: async (url) => {
      throw Object.assign(new Error(`get ${url} failed`), { cause: { code: "ECONNREFUSED" } });
    },
    log: (line) => lines.push(line)
  });
  assert.equal(response.status, 503);
  assert.deepEqual(await response.json(), { error: "geocoding_unavailable" });
  assert.equal(lines.length, 1);
  assert.match(lines[0], /photon:2322\/reverse \(Error: ECONNREFUSED\)/);
  assert.doesNotMatch(lines[0], /35\.712345|51\.412345|lat=|lon=|get http/);
});

test("returns 502 when Photon returns malformed JSON GeoJSON, naming the upstream answer", async () => {
  const response = await handleGeocodeRequest(get("/reverse?lat=35.7&lon=51.4"), {
    fetchImpl: async () => Response.json({ type: "Feature", features: [] }),
    log: () => {}
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "invalid_geocoder_response");
  assert.equal(body.upstream, "photon:2322/reverse");
  assert.equal(body.upstream_status, 200);
  assert.match(body.message, /FeatureCollection/);
});

test("preserves a Photon error for the caller without logging the search text", async () => {
  const lines = [];
  const response = await handleGeocodeRequest(get("/geocode?q=Azadi%20Square"), {
    fetchImpl: async () => new Response('{"code":"InternalServerError","message":"db is busy"}', {
      status: 500,
      headers: { "content-type": "application/json" }
    }),
    log: (line) => lines.push(line)
  });
  assert.equal(response.status, 502);
  const body = await response.json();
  assert.equal(body.error, "geocoding_failed");
  assert.equal(body.message, "db is busy");
  assert.equal(body.upstream_status, 500);
  // A search string is user data: the query must not be echoed into the response or the log line.
  const text = JSON.stringify(body) + lines.join("\n");
  assert.doesNotMatch(text, /Azadi/);
  assert.match(body.upstream, /^photon:2322\/api$/);
});

test("Photon error bodies cannot inject private search text or reverse coordinates into diagnostics", async () => {
  for (const [path, reply, forbidden] of [
    ["/geocode?q=Private%20Home%20Address", new Response(
      '{"code":"InternalServerError","message":"failed q=Private Home Address"}', { status: 500 }),
    /Private|Home|Address|q=/],
    ["/reverse?lat=35.712345&lon=51.412345", new Response(
      '<html>upstream failed for /reverse?lat=35.712345&lon=51.412345</html>', { status: 502 }),
    /35\.712345|51\.412345|lat=|lon=/]
  ]) {
    const lines = [];
    const response = await handleGeocodeRequest(get(path), {
      fetchImpl: async () => reply,
      log: (line) => lines.push(line)
    });
    assert.equal(response.status, 502);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /geocoding: upstream photon:2322\/(?:api|reverse) answered HTTP 5\d\d/);
    assert.doesNotMatch(lines[0], forbidden);
  }
});

test("uses fixed offline Photon upstreams by default", () => {
  assert.equal(DEFAULT_PHOTON_UPSTREAMS.geocode, "http://photon:2322/api");
  assert.equal(DEFAULT_PHOTON_UPSTREAMS.reverse, "http://photon:2322/reverse");
});
