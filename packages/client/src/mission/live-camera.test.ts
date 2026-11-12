import { describe, expect, it } from "vitest";
import { missionLiveCamera } from "./live-camera";

describe("live mission markers camera", () => {
  it("keeps an empty map stable and uses [lon,lat] for a single fix", () => {
    expect(missionLiveCamera([])).toBeNull();
    expect(missionLiveCamera([{ lat: 35.7, lon: 51.4 }])).toEqual({ kind: "single", center: [51.4, 35.7], zoom: 14 });
  });
  it("fits nearby consented fixes across the date line without a world-scale zoom", () => {
    const camera = missionLiveCamera([{ lat: 6, lon: 179.8 }, { lat: 6.1, lon: -179.8 },
      { lat: 6.05, lon: -179.9 }]);
    expect(camera?.kind).toBe("bounds");
    if (camera?.kind !== "bounds") return;
    expect(camera.bounds[0][0]).toBeCloseTo(179.8);
    expect(camera.bounds[1][0]).toBeCloseTo(180.2);
    expect(camera.bounds[1][0] - camera.bounds[0][0]).toBeCloseTo(.4);
    expect(camera.bounds[0][1]).toBe(6);
    expect(camera.bounds[1][1]).toBe(6.1);
  });
  it("frames three roles with padding and handles coincident fixes", () => {
    expect(missionLiveCamera([{ lat: 35.7, lon: 51.4 }, { lat: 35.72, lon: 51.39 },
      { lat: 35.71, lon: 51.42 }])).toEqual({ kind: "bounds",
      bounds: [[51.39, 35.7], [51.42, 35.72]], padding: 44, maxZoom: 14 });
    const overlap = missionLiveCamera([{ lat: 35.7, lon: 51.4 }, { lat: 35.7, lon: 51.4 }]);
    expect(overlap?.kind).toBe("bounds");
    if (overlap?.kind !== "bounds") throw new Error("Expected a padded bounds camera");
    expect(overlap.bounds[0][0]).toBeCloseTo(51.3996);
    expect(overlap.bounds[0][1]).toBeCloseTo(35.6996);
    expect(overlap.bounds[1][0]).toBeCloseTo(51.4004);
    expect(overlap.bounds[1][1]).toBeCloseTo(35.7004);
  });
});
