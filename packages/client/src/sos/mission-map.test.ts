import { describe, expect, it } from "vitest";
import { missionMapCamera, missionRouteStop } from "./mission-map";

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
  it("follows the server's optimized stop order without losing the fixed incident destination", () => {
    const origin = { lat: 35.6, lon: 51.2 };
    const stops = [{ lat: 35.65, lon: 51.3 }, { lat: 35.75, lon: 51.5 }];
    const order = [0, 2, 1, 3];
    expect(missionRouteStop(incident, origin, stops, order, 0)).toEqual(origin);
    expect(missionRouteStop(incident, origin, stops, order, 1)).toEqual(stops[1]);
    expect(missionRouteStop(incident, origin, stops, order, 2)).toEqual(stops[0]);
    expect(missionRouteStop(incident, origin, stops, order, 3)).toEqual(incident);
    expect(missionRouteStop(incident, null, stops, order, 0)).toBeNull();
    expect(missionRouteStop(incident, origin, stops, order, 99)).toBeNull();
  });
  it("includes the incident and all stops when a selected route snaps far away from either endpoint", () => {
    const origin = { lat: 35.60, lon: 51.20 };
    const stop = { lat: 35.85, lon: 51.75 };
    // The routing service's decoded line follows only the reachable road.
    const snappedRoad: [[number, number], [number, number]] = [[51.30, 35.65], [51.40, 35.69]];
    expect(missionMapCamera(incident, origin, [stop], snappedRoad)).toEqual({
      kind: "both", bounds: [[51.20, 35.60], [51.75, 35.85]], padding: 64, maxZoom: 15
    });
    expect(missionMapCamera(incident, null, [], snappedRoad)).toEqual({
      kind: "both", bounds: [[51.30, 35.65], [51.43, 35.71]], padding: 64, maxZoom: 15
    });
  });
  it("keeps every edited waypoint visible before a route is calculated, even without GPS", () => {
    const stops = [{ lat: 35.63, lon: 51.55 }, { lat: 35.78, lon: 51.3 }];
    expect(missionMapCamera(incident, null, stops)).toEqual({
      kind: "both", bounds: [[51.3, 35.63], [51.55, 35.78]], padding: 64, maxZoom: 15
    });
    expect(missionMapCamera(incident, { lat: 35.6, lon: 51.4 }, stops)).toEqual({
      kind: "both", bounds: [[51.3, 35.6], [51.55, 35.78]], padding: 64, maxZoom: 15
    });
  });
});
