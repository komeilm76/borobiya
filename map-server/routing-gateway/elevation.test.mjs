import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createElevationProvider, decodePolyline, elevationForRoute, tileName } from "./elevation.mjs";
import { handleRoutingRequest } from "./routing.mjs";

const n = 1201;
const dir = mkdtempSync(join(tmpdir(), "borobiya-dem-"));
const name = "N35E051";
// Smooth synthetic hillside: 100 m at SW, 200 m at NW and 200 m at SE.
const data = Buffer.alloc(n * n * 2);
for (let row = 0; row < n; row++) {
  for (let col = 0; col < n; col++) data.writeInt16BE(100 + (n - 1 - row) / 12 + col / 12 | 0, (row * n + col) * 2);
}
const sha256 = createHash("sha256").update(data).digest("hex");
const url = `https://s3.amazonaws.com/elevation-tiles-prod/skadi/N35/${name}.hgt.gz`;
const manifest = { format: "skadi-hgt-v1", source: "mapzen-skadi", tiles: { [name]: { samples: n, sha256, url } } };
function writeManifest(value = manifest) { writeFileSync(join(dir, "manifest.json"), JSON.stringify(value)); }
function encode(points) {
  let previousLat = 0;
  let previousLon = 0;
  function part(delta) {
    let value = delta < 0 ? -delta * 2 - 1 : delta * 2;
    let result = "";
    while (value >= 32) { result += String.fromCharCode((32 | (value & 31)) + 63); value >>>= 5; }
    return result + String.fromCharCode(value + 63);
  }
  return points.map(({ lat, lon }) => {
    const y = Math.round(lat * 1e5);
    const x = Math.round(lon * 1e5);
    const text = part(y - previousLat) + part(x - previousLon);
    previousLat = y;
    previousLon = x;
    return text;
  }).join("");
}

test("HGT bilinear interpolation, route ascent/descent and no-data cases", () => {
  writeFileSync(join(dir, `${name}.hgt`), data);
  writeManifest();
  const logs = [];
  const provider = createElevationProvider(dir, (line) => logs.push(line));
  assert.equal(tileName(35.2, 51.3), name);
  assert.equal(tileName(-1.2, -3.4), "S02W004");
  assert.equal(provider.sample(35, 51), 100);
  assert.ok(Math.abs(provider.sample(36 - 1 / 1200, 51) - 199) < 1e-6);
  assert.equal(provider.sample(35, 51 + 1 / 1200), 100); // rounded sample in the fixture
  assert.equal(provider.sample(35.5, 51.5), 200);
  assert.equal(provider.sample(35.5, 52.5), null); // never extrapolate uncovered DEM
  const path = encode([{ lat: 35.1, lon: 51.1 }, { lat: 35.2, lon: 51.1 }, { lat: 35.1, lon: 51.1 }]);
  assert.deepEqual(decodePolyline(path), [
    { lat: 35.1, lon: 51.1 }, { lat: 35.2, lon: 51.1 }, { lat: 35.1, lon: 51.1 }
  ]);
  const result = elevationForRoute(path, provider);
  assert.equal(result.source, "mapzen-skadi");
  assert.ok(result.gain_m >= 9 && result.gain_m <= 11);
  assert.ok(result.loss_m >= 9 && result.loss_m <= 11);
  assert.equal(result.start_m, result.end_m);
  assert.equal(elevationForRoute(encode([{ lat: 35.1, lon: 51.9 }, { lat: 35.1, lon: 52.1 }]), provider), null);
  assert.equal(elevationForRoute(path, null), null);
  assert.equal(elevationForRoute("?", provider), null);
  assert.equal(elevationForRoute(encode([{ lat: 35.1, lon: 51.1 }, { lat: 35.1, lon: 52.9 }]), provider), null);
  assert.equal(logs.length, 0);
});

test("bounded distance profile retains a short elevation peak and never invents void samples", () => {
  const path = encode([{ lat: 35.1, lon: 51.1 }, { lat: 35.1, lon: 51.9 }]);
  const elevation = elevationForRoute(path, { sample: (_lat, lon) => lon >= 51.499 && lon <= 51.502 ? 1000 : 100 });
  assert.ok(elevation.profile.length >= 3 && elevation.profile.length <= 96);
  assert.equal(elevation.profile[0].distance_m, 0);
  assert.ok(elevation.profile.at(-1).distance_m > 70_000);
  assert.ok(elevation.profile.some((point) => point.elevation_m === 1000));
  assert.ok(elevation.profile.every((point, index) => index === 0 ||
    point.distance_m >= elevation.profile[index - 1].distance_m));
  assert.equal(elevation.gain_m, 900);
  assert.equal(elevation.loss_m, 900);
  assert.equal(elevationForRoute(path, { sample: (_lat, lon) => lon > 51.5 ? null : 100 }), null);
  const still = elevationForRoute(encode([{ lat: 35.1, lon: 51.1 }, { lat: 35.1, lon: 51.1 }]),
    { sample: () => 100 });
  assert.deepEqual(still.profile, [{ distance_m: 0, elevation_m: 100 }, { distance_m: 0, elevation_m: 100 }]);
});

test("void, corrupt, missing and invalid manifest data cannot imply an altitude", () => {
  const temp = mkdtempSync(join(tmpdir(), "borobiya-dem-void-"));
  try {
    const voidTile = Buffer.from(data);
    voidTile.writeInt16BE(-32768, ((n / 2 | 0) * n + (n / 2 | 0)) * 2);
    writeFileSync(join(temp, `${name}.hgt`), voidTile);
    writeFileSync(join(temp, "manifest.json"), JSON.stringify({ ...manifest, tiles: { [name]: { samples: n,
      sha256: createHash("sha256").update(voidTile).digest("hex"), url } } }));
    const provider = createElevationProvider(temp);
    assert.equal(provider.sample(35.5, 51.5), null);
    assert.equal(provider.sample(35.1, 51.1) !== null, true);
    writeFileSync(join(temp, `${name}.hgt`), Buffer.alloc(4));
    const warnings = [];
    const invalid = createElevationProvider(temp, (message) => warnings.push(message));
    assert.equal(invalid.sample(35.5, 51.5), null);
    assert.match(warnings[0], /SHA-256 mismatch/);
    assert.equal(invalid.sample(35.5, 51.5), null);
    assert.equal(warnings.length, 1);
    writeFileSync(join(temp, "manifest.json"), JSON.stringify({ ...manifest, tiles: { "../oops": { samples: n, sha256 } } }));
    assert.equal(createElevationProvider(temp, () => {}), null);
    writeFileSync(join(temp, "manifest.json"), JSON.stringify({ ...manifest, tiles: { [name]: { samples: n, sha256, url: "https://example.com/not-a-source" } } }));
    assert.equal(createElevationProvider(temp, () => {}), null);
    assert.equal(createElevationProvider(join(temp, "missing"), () => {}), null);
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("staging verifies offline compressed fixtures and writes a reproducible manifest", () => {
  const temp = mkdtempSync(join(tmpdir(), "borobiya-stage-dem-"));
  try {
    mkdirSync(join(temp, "source"));
    writeFileSync(join(temp, "source", `${name}.hgt.gz`), gzipSync(data));
    const result = spawnSync("python3", [resolve("map-server/scripts/stage-elevation.py"),
      "--bbox", "51.1,35.1,51.8,35.8", "--dir", join(temp, "output"), "--source-dir", join(temp, "source")],
    { encoding: "utf8" });
    assert.equal(result.status, 0, result.stderr);
    const staged = JSON.parse(readFileSync(join(temp, "output", "manifest.json"), "utf8"));
    assert.equal(staged.tiles[name].sha256, sha256);
    assert.equal(staged.tiles[name].url, `fixture:${name}.hgt.gz`);
    assert.equal(staged.source, "fixture");
    assert.equal(createElevationProvider(join(temp, "output"), () => {}), null); // fixtures cannot impersonate real tiles
  } finally { rmSync(temp, { recursive: true, force: true }); }
});

test("each returned OSRM alternative gets its own optional DEM summary", async () => {
  const first = encode([{ lat: 35.1, lon: 51.1 }, { lat: 35.2, lon: 51.2 }]);
  const second = encode([{ lat: 35.1, lon: 51.1 }, { lat: 35.2, lon: 52.2 }]);
  const routes = [first, second].map((geometry) => ({ distance: 1500, duration: 300, geometry, legs: [] }));
  const response = await handleRoutingRequest(new Request("http://local/route", { method: "POST",
    headers: { "content-type": "application/json" }, body: JSON.stringify({ from: { lat: 35.1, lon: 51.1 },
      to: { lat: 35.2, lon: 51.2 }, profile: "foot" }) }), {
    fetchImpl: async () => Response.json({ code: "Ok", routes, waypoints: [] }),
    elevation: { sample: (lat, lon) => lon < 52 ? 100 + 100 * (lat - 35) : null }
  });
  assert.equal(response.status, 200);
  const parsed = await response.json();
  assert.equal(parsed.routes[0].elevation.gain_m, 10);
  assert.equal(parsed.routes[1].elevation, null);
});

test.after(() => rmSync(dir, { recursive: true, force: true }));
