import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");

describe("mission map style restoration", () => {
  it("does not call GeoJSON setData on every map idle when the route layer is already present", () => {
    expect(view).toContain('map.on("idle", onStyleReady)');
    expect(view).toContain("function restoreRouteLayer()");
    expect(view).toMatch(/const onStyleReady = \(\) => restoreRouteLayer\(\)/);
    expect(view).toContain("needsOverlayRestore(");
    expect(view).toContain("applyRouteLayer()");
  });
});
