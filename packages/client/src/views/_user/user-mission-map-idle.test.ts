import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");
const credits = readFileSync(new URL("../../../public/terrain-attribution.html", import.meta.url), "utf8");

describe("mission map style restoration", () => {
  it("shows measured elevation only when present and credits the offline DEM", () => {
    expect(view).toContain('v-if="choice.elevation"');
    expect(view).toContain("choice.elevation.gain_m");
    expect(view).toContain("choice.elevation.loss_m");
    expect(view).toContain('v-else>ارتفاع: دادهٔ آفلاین');
    expect(view).toContain('href="/terrain-attribution.html"');
    expect(credits).toContain("SRTM terrain data courtesy of the U.S. Geological Survey");
    expect(credits).toContain("Europe terrain data produced using Copernicus");
  });
  it("does not call GeoJSON setData on every map idle when the route layer is already present", () => {
    expect(view).toContain('map.on("idle", onStyleReady)');
    expect(view).toContain("function restoreRouteLayer()");
    expect(view).toMatch(/const onStyleReady = \(\) => restoreRouteLayer\(\)/);
    expect(view).toContain("needsOverlayRestore(");
    expect(view).toContain("applyRouteLayer()");
  });
});
