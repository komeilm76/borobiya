import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DEFAULT_MAP_CONFIG, parseMapConfig } from "./map-config.mjs";

test("uses the documented Tehran defaults", () => {
  assert.deepEqual(parseMapConfig({}), DEFAULT_MAP_CONFIG);
  assert.equal(DEFAULT_MAP_CONFIG.maxZoom, 18); // camera can overzoom existing z14 tiles
});

test("parses the public map settings from environment values", () => {
  assert.deepEqual(parseMapConfig({
    MAP_REGION: "middle-east",
    MAP_BBOX: "44,25,63,39",
    MAP_DATA_VERSION: "2026-10-19.1",
    MAP_MIN_ZOOM: "2",
    MAP_MAX_ZOOM: "14",
    MAP_VIEW_MAX_ZOOM: "19"
  }), {
    region: "middle-east",
    bbox: [44, 25, 63, 39],
    dataVersion: "2026-10-19.1",
    minZoom: 2,
    maxZoom: 19
  });
  assert.equal(parseMapConfig({ MAP_MAX_ZOOM: "16" }).maxZoom, 18);
});

test("both local styles overzoom the installed z14 source and keep alley-size roads legible", () => {
  for (const theme of ["light", "dark"]) {
    const style = JSON.parse(readFileSync(new URL(`../styles/${theme}.json`, import.meta.url), "utf8"));
    assert.equal(style.sources.borobiya.maxzoom, 14, "do not request unbuilt z15+ tiles");
    const local = style.layers.find((layer) => layer.id === "roads-local");
    assert.deepEqual(local.paint["line-width"].slice(-6), [14, 1.7, 16, 2.4, 18, 3.2]);
    assert.ok(local.filter[2].includes("service") && local.filter[2].includes("living_street"));
  }
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
    { MAP_VIEW_MAX_ZOOM: "21" },
    { MAP_MIN_ZOOM: "15", MAP_MAX_ZOOM: "14" },
    { MAP_MIN_ZOOM: "15", MAP_VIEW_MAX_ZOOM: "14" }
  ]) {
    assert.throws(() => parseMapConfig(source));
  }
});
