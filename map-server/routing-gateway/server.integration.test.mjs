import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = fileURLToPath(new URL("../..", import.meta.url));
const serverPath = resolve(repositoryRoot, "map-server/routing-gateway/server.mjs");
const routeFixture = {
  code: "Ok",
  waypoints: [{ name: "Start" }, { name: "Finish" }],
  routes: [{
    distance: 5230.5,
    duration: 754.2,
    geometry: "encoded-polyline",
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

test("serves POST /route offline through a local OSRM-compatible endpoint", async () => {
  const upstreamRequests = [];
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
      MAP_REGION: "tehran",
      MAP_BBOX: "51.0,35.5,51.7,35.9",
      MAP_DATA_VERSION: "development",
      MAP_MIN_ZOOM: "0",
      MAP_MAX_ZOOM: "14"
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
      maxZoom: 14
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
    }

    assert.deepEqual(upstreamRequests.map(({ path }) => path), [
      "/route/v1/car",
      "/route/v1/bike",
      "/route/v1/foot"
    ]);
    assert.deepEqual(upstreamRequests[0].body.coordinates, [[51.38, 35.68], [51.41, 35.70]]);
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, "exit");
      child.kill("SIGTERM");
      await exited;
    }
    await close(osrm);
  }
});
