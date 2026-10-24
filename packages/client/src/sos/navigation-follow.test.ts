import { describe, expect, it } from "vitest";
import { navigationCamera, routeBearing } from "./navigation-follow";

const east: [number, number][] = [[51.38, 35.68], [51.39, 35.68], [51.40, 35.68]];
describe("route-follow camera math (T3.5.6)", () => {
  it("follows the nearest ahead polyline segment without swapping latitude/longitude", () => {
    expect(routeBearing({ lat: 35.68, lon: 51.38 }, east)).toBeCloseTo(90, 1);
    expect(routeBearing({ lat: 35.68, lon: 51.4 }, east)).toBeCloseTo(90, 1);
    expect(navigationCamera({ lat: 35.68, lon: 51.38 }, east, "car")).toEqual({
      center: [51.38, 35.68], bearing: expect.closeTo(90, 1), pitch: 60, zoom: 17, duration: 550
    });
  });
  it("uses the specified pitched/flat transport cameras", () => {
    expect(navigationCamera({ lat: 35.68, lon: 51.38 }, east, "bicycle")).toMatchObject({ pitch: 45, zoom: 16 });
    expect(navigationCamera({ lat: 35.68, lon: 51.38 }, east, "foot")).toMatchObject({ pitch: 0, zoom: 17 });
  });
});
