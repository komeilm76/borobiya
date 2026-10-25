import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { once } from "node:events";
import { join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const serverPath = resolve(repositoryRoot, "map-server/routing-gateway/server.mjs");
// Synthetic route in N35E051 (not a downloaded DEM).
function encodePoint(lat, lon) {
  const part = (number) => {
    let value = number < 0 ? -number * 2 - 1 : number * 2;
    let text = "";
    while (value >= 32) { text += String.fromCharCode((32 | (value & 31)) + 63); value >>>= 5; }
    return text + String.fromCharCode(value + 63);
  };
  return part(Math.round(lat * 1e5)) + part(Math.round(lon * 1e5));
}
const routeFixture = {
  code: "Ok",
  waypoints: [{ name: "Start" }, { name: "Finish" }],
  routes: [{
    distance: 5230.5,
    duration: 754.2,
    geometry: encodePoint(35.68, 51.38) + encodePoint(0.02, 0.03),
    legs: [{ distance: 5230.5, duration: 754.2, steps: [] }]
  }]
};

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

async function waitForStartup(child) {
  let output = "";
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Routing gateway failed to start: ${output}`)), 5000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => {
      output += chunk;
      if (output.includes("Routing gateway listening")) {
        clearTimeout(timer);
        resolve();
      }
    });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { output += chunk; });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Routing gateway exited with ${code}: ${output}`));
    });
  });
}

test("serves route with local DEM, geocode, and reverse requests offline through local services", async () => {
  const elevationDir = mkdtempSync(join(tmpdir(), "borobiya-server-dem-"));
  const samples = 1201;
  const tile = Buffer.alloc(samples * samples * 2);
  for (let i = 0; i < samples * samples; i++) tile.writeInt16BE(500, i * 2);
  writeFileSync(join(elevationDir, "N35E051.hgt"), tile);
  writeFileSync(join(elevationDir, "manifest.json"), JSON.stringify({ format: "skadi-hgt-v1", source: "mapzen-skadi",
    tiles: { N35E051: { samples, sha256: createHash("sha256").update(tile).digest("hex"),
      url: "https://s3.amazonaws.com/elevation-tiles-prod/skadi/N35/N35E051.hgt.gz" } } }));
  const upstreamRequests = [];
  const photonRequests = [];
  const photonFixture = {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      geometry: { type: "Point", coordinates: [51.38, 35.7] },
      properties: { name: "Azadi Square", city: "Tehran", country: "Iran" }
    }]
  };
  const photon = createServer((incoming, outgoing) => {
    photonRequests.push(incoming.url);
    outgoing.writeHead(200, { "content-type": "application/geo+json" });
    outgoing.end(JSON.stringify(photonFixture));
  });
  const photonPort = await listen(photon);
  const photonBase = `http://127.0.0.1:${photonPort}`;

  const osrm = createServer(async (incoming, outgoing) => {
    let body = "";
    for await (const chunk of incoming) body += chunk;
    upstreamRequests.push({ path: incoming.url, body: JSON.parse(body) });
    outgoing.writeHead(200, { "content-type": "application/json" });
    outgoing.end(JSON.stringify(routeFixture));
  });
  const osrmPort = await listen(osrm);
  const upstreamBase = `http://127.0.0.1:${osrmPort}`;

  const portProbe = createServer();
  const gatewayPort = await listen(portProbe);
  await close(portProbe);

  const child = spawn(process.execPath, [serverPath], {
    cwd: repositoryRoot,
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(gatewayPort),
      OSRM_CAR_URL: `${upstreamBase}/route/v1/car`,
      OSRM_BICYCLE_URL: `${upstreamBase}/route/v1/bike`,
      OSRM_FOOT_URL: `${upstreamBase}/route/v1/foot`,
      PHOTON_GEOCODE_URL: `${photonBase}/api`,
      PHOTON_REVERSE_URL: `${photonBase}/reverse`,
      MAP_REGION: "tehran",
      MAP_BBOX: "51.0,35.5,51.7,35.9",
      MAP_DATA_VERSION: "development",
      MAP_MIN_ZOOM: "0",
      MAP_MAX_ZOOM: "14",
      ELEVATION_DIR: elevationDir
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  try {
    await waitForStartup(child);
    const health = await fetch(`http://127.0.0.1:${gatewayPort}/health`);
    assert.equal(health.status, 200);
    const configResponse = await fetch(`http://127.0.0.1:${gatewayPort}/config`);
    assert.equal(configResponse.status, 200);
    assert.deepEqual(await configResponse.json(), {
      region: "tehran",
      bbox: [51, 35.5, 51.7, 35.9],
      dataVersion: "development",
      minZoom: 0,
      maxZoom: 18 // camera overzooms existing z14 tiles
    });

    for (const profile of ["car", "bicycle", "foot"]) {
      const response = await fetch(`http://127.0.0.1:${gatewayPort}/route`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          from: { lat: 35.68, lon: 51.38 },
          to: { lat: 35.70, lon: 51.41 },
          profile,
          alternatives: true
        })
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.profile, profile);
      assert.equal(body.routes[0].distance_m, routeFixture.routes[0].distance);
      assert.equal(body.routes[0].duration_s, routeFixture.routes[0].duration);
      assert.equal(body.routes[0].polyline, routeFixture.routes[0].geometry);
      assert.ok(Array.isArray(body.routes[0].legs));
      assert.equal(body.routes[0].elevation.source, "mapzen-skadi");
      assert.equal(body.routes[0].elevation.gain_m, 0);
      assert.equal(body.routes[0].elevation.loss_m, 0);
      assert.equal(body.routes[0].elevation.start_m, 500);
      assert.equal(body.routes[0].elevation.end_m, 500);
      assert.ok(body.routes[0].elevation.profile.length >= 2);
      assert.ok(body.routes[0].elevation.profile.length <= 96);
      assert.equal(body.routes[0].elevation.profile[0].distance_m, 0);
    }

    assert.deepEqual(upstreamRequests.map(({ path }) => path), [
      "/route/v1/car",
      "/route/v1/bike",
      "/route/v1/foot"
    ]);
    assert.deepEqual(upstreamRequests[0].body.coordinates, [[51.38, 35.68], [51.41, 35.70]]);

    const geocodeResponse = await fetch(`http://127.0.0.1:${gatewayPort}/geocode?q=Azadi%20Square`);
    assert.equal(geocodeResponse.status, 200);
    assert.deepEqual(await geocodeResponse.json(), photonFixture);

    const reverseResponse = await fetch(`http://127.0.0.1:${gatewayPort}/reverse?lat=35.7&lon=51.4`);
    assert.equal(reverseResponse.status, 200);
    assert.deepEqual(await reverseResponse.json(), photonFixture);

    const geocodeUrl = new URL(photonRequests[0], photonBase);
    const reverseUrl = new URL(photonRequests[1], photonBase);
    assert.equal(geocodeUrl.pathname, "/api");
    assert.equal(geocodeUrl.searchParams.get("q"), "Azadi Square");
    assert.equal(geocodeUrl.searchParams.get("limit"), "5");
    assert.equal(reverseUrl.pathname, "/reverse");
    assert.equal(reverseUrl.searchParams.get("lat"), "35.7");
    assert.equal(reverseUrl.searchParams.get("lon"), "51.4");
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await close(osrm);
    await close(photon);
    rmSync(elevationDir, { recursive: true, force: true });
  }
});
