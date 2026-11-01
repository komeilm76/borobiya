import { describe, expect, it } from "vitest";
import { navigationCamera, navigationCameraOffset, routeBearing } from "./navigation-follow";

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
  it("ignores duplicate polyline vertices rather than returning a northbound bearing", () => {
    expect(routeBearing({ lat: 35, lon: 51 }, [[51, 35], [51, 35], [51.01, 35]])).toBeCloseTo(90, 1);
  });
  it("keeps the GPS target visible below the top guidance bar, with more road ahead in car than bike or walk", () => {
    const car = navigationCameraOffset("car", 640, 160, 56)[1];
    const bike = navigationCameraOffset("bicycle", 640, 160, 56)[1];
    const walk = navigationCameraOffset("foot", 640, 160, 56)[1];
    expect(car).toBeGreaterThan(bike);
    expect(bike).toBeGreaterThan(walk);
    for (const offset of [car, bike, walk]) {
      expect(320 + offset).toBeGreaterThan(176);
      expect(320 + offset).toBeLessThan(584);
    }
    expect(navigationCameraOffset("car", 320, 190, 56)[1] + 160).toBeGreaterThanOrEqual(190);
    expect(navigationCameraOffset("foot", 0, 0, 0)).toEqual([0, 0]);
  });
  it("uses the specified pitched/flat transport cameras", () => {
    expect(navigationCamera({ lat: 35.68, lon: 51.38 }, east, "bicycle")).toMatchObject({ pitch: 45, zoom: 16 });
    expect(navigationCamera({ lat: 35.68, lon: 51.38 }, east, "foot")).toMatchObject({ pitch: 0, zoom: 17 });
  });
});
