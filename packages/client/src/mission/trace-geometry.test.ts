import { describe, expect, it } from "vitest";
import { buildMissionTraces, rescuerComparisonTrace, suggestedLine } from "./trace-geometry";
import type { MissionTracePoint } from "@/api/mission";

const point = (role: MissionTracePoint["role"], lat: number, seconds: number,
  accuracy: number | null = 12): MissionTracePoint => ({ role, lat, lon: 51.4, accuracy,
  observedAt: new Date(Date.UTC(2026, 9, 23, 10, 0, seconds)).toISOString() });

describe("recorded mission GPS geometry", () => {
  it("sorts each member's samples and never joins an outage or low-accuracy fix as a journey", () => {
    const traces = buildMissionTraces([
      point("rescuer", 35.7002, 5), point("requester", 35.7, 0),
      point("rescuer", 35.7, 0), point("rescuer", 35.8, 30), // impossible jump
      point("rescuer", 35.8002, 35, 300), point("rescuer", 35.8004, 40)
    ]);
    expect(traces.map((item) => item.role)).toEqual(["requester", "rescuer"]);
    expect(traces[1]).toMatchObject({ count: 5, gaps: 3 });
    expect(traces[1]?.segments).toHaveLength(1);
    expect(traces[1]?.segments[0]).toEqual([[51.4, 35.7], [51.4, 35.7002]]);
    expect(traces[1]!.measuredMetres).toBeGreaterThan(20);
  });
  it("compares only the responder's samples at or after the saved route selection", () => {
    const trace = { points: [point("rescuer", 35.69, 0), point("rescuer", 35.7, 5),
      point("rescuer", 35.7002, 15)], suggestedRoute: {
      profile: "car" as const, polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@", distanceM: 1000,
      selectedAt: new Date(Date.UTC(2026, 9, 23, 10, 0, 5)).toISOString()
    }, incomplete: false };
    expect(rescuerComparisonTrace(trace)?.count).toBe(2);
    expect(rescuerComparisonTrace(trace)?.measuredMetres).toBeGreaterThan(20);
    expect(rescuerComparisonTrace({ ...trace, suggestedRoute: null })).toBeNull();
  });
  it("decodes a saved preview but refuses malformed geometry rather than inventing a route", () => {
    expect(suggestedLine({ profile: "car", polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@", distanceM: 8500,
      selectedAt: new Date().toISOString() })).toHaveLength(3);
    expect(suggestedLine({ profile: "car", polyline: "bad", distanceM: 1,
      selectedAt: new Date().toISOString() })).toBeNull();
    expect(suggestedLine(null)).toBeNull();
  });
});
