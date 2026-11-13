import { describe, expect, it } from "vitest";
import { incidentDistanceMetres } from "./incident-distance";

describe("fresh-fix incident distance", () => {
  it("reports straight-line distance in metres, not route progress or ETA", () => {
    expect(incidentDistanceMetres({ lat: 35, lon: 51 }, { lat: 35, lon: 51 })).toBe(0);
    expect(incidentDistanceMetres({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeCloseTo(111_195, -2);
    expect(incidentDistanceMetres({ lat: 0, lon: 179.9 }, { lat: 0, lon: -179.9 })).toBeCloseTo(22_239, -2);
  });
  it("refuses missing or invalid coordinates instead of displaying a misleading distance", () => {
    expect(incidentDistanceMetres(null, { lat: 35, lon: 51 })).toBeNull();
    expect(incidentDistanceMetres({ lat: 35, lon: 51 }, null)).toBeNull();
    expect(incidentDistanceMetres({ lat: 91, lon: 51 }, { lat: 35, lon: 51 })).toBeNull();
    expect(incidentDistanceMetres({ lat: 35, lon: 51 }, { lat: 35, lon: Infinity })).toBeNull();
  });
});
