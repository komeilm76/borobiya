import { describe, expect, it } from "vitest";
import { navigationArrowBearing, navigationCamera, navigationCameraOffset, navigationFollowZoom, routeBearing } from "./navigation-follow";

const east: [number, number][] = [[51.38, 35.68], [51.39, 35.68], [51.40, 35.68]];
describe("route-follow camera math (T3.5.6)", () => {
  it("follows the nearest ahead polyline segment without swapping latitude/longitude", () => {
    expect(routeBearing({ lat: 35.68, lon: 51.38 }, east)).toBeCloseTo(90, 1);
    expect(routeBearing({ lat: 35.68, lon: 51.4 }, east)).toBeCloseTo(90, 1);
    expect(navigationCamera({ lat: 35.68, lon: 51.38 }, east, "car")).toEqual({
      center: [51.38, 35.68], bearing: expect.closeTo(90, 1), pitch: 60, zoom: 17, duration: 550
    });
  });
  it("tracks the nearest route segment, not the nearest vertex or the GPS-to-vertex diagonal", () => {
    const corner: [number, number][] = [[51, 35], [51.01, 35], [51.01, 35.01]];
    // Just before a sharp turn, the closest vertex is the corner, but the car is still on the eastbound road.
    expect(routeBearing({ lat: 35, lon: 51.009 }, corner)).toBeCloseTo(90, 1);
    // GPS cross-track error must not swing the camera toward a distant vertex.
    expect(routeBearing({ lat: 35.0001, lon: 51.004 }, corner)).toBeCloseTo(90, 1);
    expect(routeBearing({ lat: 35.004, lon: 51.01 }, corner)).toBeCloseTo(0, 1);
  });
  it("uses actual travel heading when reliable and moving, otherwise the route tangent", () => {
    const north: [number, number][] = [[51.38, 35.68], [51.38, 35.69]];
    const moving = { lat: 35.68, lon: 51.38, accuracy: 8, heading: 90, speed: 6 };
    expect(navigationArrowBearing(moving, north, "car")).toBe(90);
    expect(navigationArrowBearing({ ...moving, speed: 0 }, north, "car")).toBeCloseTo(0, 1);
    expect(navigationArrowBearing({ ...moving, accuracy: 90 }, north, "car")).toBeCloseTo(0, 1);
    expect(navigationArrowBearing({ ...moving, heading: Number.NaN }, north, "car")).toBeCloseTo(0, 1);
    expect(navigationArrowBearing({ ...moving, speed: 0.9 }, north, "foot")).toBe(90);
    expect(navigationArrowBearing({ ...moving, speed: 0.9 }, north, "bicycle")).toBeCloseTo(0, 1);
  });
  it("ignores duplicate polyline vertices rather than returning a northbound bearing", () => {
    expect(routeBearing({ lat: 35, lon: 51 }, [[51, 35], [51, 35], [51.01, 35]])).toBeCloseTo(90, 1);
  });
  it("keeps the GPS target visible below the top guidance bar, with more road ahead in car than bike or walk", () => {
    const car = navigationCameraOffset("car", 640, 160, 56)[1];
    const bike = navigationCameraOffset("bicycle", 640, 160, 56)[1];
    const walk = navigationCameraOffset("foot", 640, 160, 56)[1];
    expect(car).toBe(123); // Normal-screen camera composition stays exactly as before.
    expect(car).toBeGreaterThan(bike);
    expect(bike).toBeGreaterThan(walk);
    for (const offset of [car, bike, walk]) {
      expect(320 + offset).toBeGreaterThan(176);
      expect(320 + offset).toBeLessThan(584);
    }
    expect(navigationCameraOffset("car", 320, 190, 56)[1] + 160).toBeGreaterThanOrEqual(190);
    expect(navigationCameraOffset("foot", 0, 0, 0)).toEqual([0, 0]);
  });
  it("keeps the GPS marker in a narrow visible corridor on landscape phones", () => {
    // A tall guidance sheet can leave 14–20px of exposed canvas. Fixed 16px margins on both
    // sides previously returned [0, 0], which put the marker behind the top bar or sheet.
    const height = 320;
    const betweenBarAndSheet = height / 2 + navigationCameraOffset("car", height, 190, 116)[1];
    expect(betweenBarAndSheet).toBeGreaterThan(190);
    expect(betweenBarAndSheet).toBeLessThan(204);
    const aboveSheet = height / 2 + navigationCameraOffset("foot", height, 0, 300)[1];
    expect(aboveSheet).toBeGreaterThan(0);
    expect(aboveSheet).toBeLessThan(20);
    // A completely covered map has no safe camera target to invent.
    expect(navigationCameraOffset("car", height, 190, 140)).toEqual([0, 0]);
  });

  it("adapts all three guidance zooms to usable screen space and preserves mode separation under a zoom cap", () => {
    const modes = ["car", "bicycle", "foot"] as const;
    const portrait = modes.map(mode => navigationFollowZoom(mode, 35.68, 640, 160, 56, 0, 18));
    const landscape = modes.map(mode => navigationFollowZoom(mode, 35.68, 320, 160, 56, 0, 18));
    expect(portrait[0]).toBeLessThan(portrait[1]!);
    expect(portrait[1]).toBeLessThan(portrait[2]!);
    for (let i = 0; i < modes.length; i++) expect(landscape[i]).toBeLessThan(portrait[i]!);
    const capped = modes.map(mode => navigationFollowZoom(mode, 35.68, 640, 160, 56, 0, 16));
    expect(capped[0]).toBeLessThan(capped[1]!);
    expect(capped[1]).toBeLessThan(capped[2]!);
    expect(capped[2]).toBe(16);
    expect(navigationFollowZoom("foot", 35.68, 0, 0, 0, 3, 16)).toBeGreaterThanOrEqual(3);
  });
  it("uses the specified pitched/flat transport cameras", () => {
    expect(navigationCamera({ lat: 35.68, lon: 51.38 }, east, "bicycle")).toMatchObject({ pitch: 45, zoom: 16 });
    expect(navigationCamera({ lat: 35.68, lon: 51.38 }, east, "foot")).toMatchObject({ pitch: 0, zoom: 17 });
  });
});
