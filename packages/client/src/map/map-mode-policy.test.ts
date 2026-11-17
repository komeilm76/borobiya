import { describe, expect, it } from "vitest";
import { mapModeAvailability } from "./map-mode-policy";

describe("single-map mode availability", () => {
  it("permits every mode when idle", () => {
    expect(mapModeAvailability(false, false)).toEqual({ missions: true, trips: true, sharing: true, history: true });
  });
  it("locks Missions and History during a personal trip without hiding offers or Sharing", () => {
    expect(mapModeAvailability(true, false)).toEqual({ missions: false, trips: true, sharing: true, history: false });
  });
  it("keeps Trips browsable while assignment status is unknown but never unlocks History or a confirmed mission", () => {
    expect(mapModeAvailability(false, false, false)).toEqual({ missions: true, trips: true, sharing: true, history: false });
    expect(mapModeAvailability(true, false, false)).toEqual({ missions: false, trips: true, sharing: true, history: false });
    expect(mapModeAvailability(false, true, false)).toEqual({ missions: true, trips: false, sharing: true, history: false });
  });
  it("locks Trips and History for an active mission, even during a transient overlap", () => {
    expect(mapModeAvailability(false, true)).toEqual({ missions: true, trips: false, sharing: true, history: false });
    expect(mapModeAvailability(true, true)).toEqual({ missions: true, trips: false, sharing: true, history: false });
  });
});
