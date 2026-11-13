import { describe, expect, it } from "vitest";
import { missionRouteCue, type MissionRouteCueInputs } from "./route-cue";

const initial: MissionRouteCueInputs = {
  blocked: false, routeError: false, navigationError: false, navigationActive: false,
  freshFix: false, targetLoading: false, routeLoading: false, hasRoute: false, hasTarget: false
};

describe("map-first mission route cue", () => {
  it("distinguishes loading, plan, and active guidance without pretending a saved origin is live", () => {
    expect(missionRouteCue(initial).label).toBe("محل نامشخص");
    expect(missionRouteCue({ ...initial, targetLoading: true }).label).toBe("دریافت محل");
    expect(missionRouteCue({ ...initial, hasTarget: true }).label).toBe("دریافت مسیر");
    expect(missionRouteCue({ ...initial, hasTarget: true, routeLoading: true }).label).toBe("محاسبهٔ مسیر");
    expect(missionRouteCue({ ...initial, hasTarget: true, hasRoute: true }).label).toBe("مسیر آماده");
    expect(missionRouteCue({ ...initial, navigationActive: true }).label).toBe("در انتظار GPS");
    expect(missionRouteCue({ ...initial, navigationActive: true, freshFix: true }).label).toBe("راهبری GPS");
  });
  it("prioritizes uncertainty and blocked changes over reassuring route states", () => {
    expect(missionRouteCue({ ...initial, navigationActive: true, freshFix: true, navigationError: true }).label).toBe("نیاز به بررسی");
    expect(missionRouteCue({ ...initial, hasRoute: true, routeError: true }).tone).toBe("warning");
    expect(missionRouteCue({ ...initial, hasRoute: true, blocked: true }).label).toBe("نیاز به تأیید");
    expect(missionRouteCue({ ...initial, navigationActive: true, freshFix: true, blocked: true }).tone).toBe("warning");
  });
});
