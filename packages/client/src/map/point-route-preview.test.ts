import { describe, expect, it } from "vitest";
import { pointRouteExtent, pointRouteFeatures, pointRouteOverviewBottom, pointRouteSelectionExtent,
  pointRouteOverlayNeedsSync } from "./point-route-preview";

const routes = [
  [[51, 35], [51.2, 35.2]] as const,
  [[51, 35], [51.3, 35.15]] as const
];

describe("nonmodal route preview", () => {
  it("paints alternatives alongside a highlighted choice and hides them during guidance", () => {
    const features = pointRouteFeatures(routes, 0, false);
    expect(features).toHaveLength(2);
    expect(features.map((feature) => feature.properties)).toEqual([
      { index: 0, selected: true }, { index: 1, selected: false }
    ]);
    expect(pointRouteFeatures(routes, 1, false).map((feature) => feature.properties.selected)).toEqual([false, true]);
    expect(pointRouteFeatures(routes, 1, true).map((feature) => feature.properties)).toEqual([{ index: 1, selected: true }]);
    expect(pointRouteFeatures([], 0, false)).toEqual([]);
  });

  it("refits a chosen route with the exact GPS start and destination, not a remote alternative", () => {
    const selected = [[51, 35], [51.01, 35.01]] as const;
    const detour = [[49, 36], [52, 36]] as const;
    expect(pointRouteExtent([selected, detour])).toEqual([[49, 35], [52, 36]]);
    expect(pointRouteSelectionExtent(selected, [50.999, 34.999], [51.011, 35.011]))
      .toEqual([[50.999, 34.999], [51.011, 35.011]]);
  });

  it("clears a route after a late style load, including partially restored overlays", () => {
    expect(pointRouteOverlayNeedsSync(false, true, true, true)).toBe(true);
    expect(pointRouteOverlayNeedsSync(false, false, false, true)).toBe(true);
    expect(pointRouteOverlayNeedsSync(false, false, false, false)).toBe(false);
    expect(pointRouteOverlayNeedsSync(true, false, false, false)).toBe(true);
    expect(pointRouteOverlayNeedsSync(true, true, true, true)).toBe(false);
  });

  it("frames the union of all choices and reserves only the actual sheet occlusion", () => {
    expect(pointRouteExtent(routes)).toEqual([[51, 35], [51.3, 35.2]]);
    expect(pointRouteExtent([])).toBeNull();
    expect(pointRouteOverviewBottom({ top: 0, bottom: 640, height: 640 }, { top: 390, bottom: 550 })).toBe(266);
    expect(pointRouteOverviewBottom({ top: 0, bottom: 640, height: 640 }, { top: 680, bottom: 900 })).toBe(56);
    expect(pointRouteOverviewBottom({ top: 0, bottom: 320, height: 320 }, { top: 22, bottom: 320 })).toBe(208);
  });
});
