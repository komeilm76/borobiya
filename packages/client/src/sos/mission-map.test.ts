import { describe, expect, it } from "vitest";
import { missionMapCamera } from "./mission-map";

describe("post-accept mission map camera (T3.5.4)", () => {
  const incident = { lat: 35.71, lon: 51.43 };
  it("fits the rescuer and incident in [longitude, latitude] order with breathing room", () => {
    expect(missionMapCamera(incident, { lat: 35.66, lon: 51.38 })).toEqual({
      kind: "both", bounds: [[51.38, 35.66], [51.43, 35.71]], padding: 64, maxZoom: 15
    });
    expect(missionMapCamera(incident, { lat: 35.75, lon: 51.49 })).toEqual({
      kind: "both", bounds: [[51.43, 35.71], [51.49, 35.75]], padding: 64, maxZoom: 15
    });
  });
  it("frames the incident alone when location permission is unavailable or fixes overlap", () => {
    expect(missionMapCamera(incident, null)).toEqual({ kind: "incident", center: [51.43, 35.71], zoom: 14 });
    expect(missionMapCamera(incident, incident).kind).toBe("incident");
  });
});
