import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_MAP_CONFIG, parseMapConfig } from "./map-config.mjs";

test("uses the documented Tehran defaults", () => {
  assert.deepEqual(parseMapConfig({}), DEFAULT_MAP_CONFIG);
});

test("parses the public map settings from environment values", () => {
  assert.deepEqual(parseMapConfig({
    MAP_REGION: "middle-east",
    MAP_BBOX: "44,25,63,39",
    MAP_DATA_VERSION: "2026-10-19.1",
    MAP_MIN_ZOOM: "2",
    MAP_MAX_ZOOM: "16"
  }), {
    region: "middle-east",
    bbox: [44, 25, 63, 39],
    dataVersion: "2026-10-19.1",
    minZoom: 2,
    maxZoom: 16
  });
});

test("rejects malformed region, bbox, data-version, and zoom environment", () => {
  for (const source of [
    { MAP_REGION: "../iran" },
    { MAP_BBOX: "51,35,50,36" },
    { MAP_BBOX: "181,35,182,36" },
    { MAP_BBOX: "0x1,35,51,36" },
    { MAP_BBOX: "1e2,35,101,36" },
    { MAP_DATA_VERSION: "../secret" },
    { MAP_MIN_ZOOM: "1.5" },
    { MAP_MAX_ZOOM: "17" },
    { MAP_MIN_ZOOM: "15", MAP_MAX_ZOOM: "14" }
  ]) {
    assert.throws(() => parseMapConfig(source));
  }
});
