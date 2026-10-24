import { describe, expect, it } from "vitest";
import { missionLiveCamera } from "./live-camera";

describe("live mission markers camera", () => {
  it("keeps an empty map stable and uses [lon,lat] for a single fix", () => {
    expect(missionLiveCamera([])).toBeNull();
    expect(missionLiveCamera([{ lat: 35.7, lon: 51.4 }])).toEqual({ kind: "single", center: [51.4, 35.7], zoom: 14 });
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
