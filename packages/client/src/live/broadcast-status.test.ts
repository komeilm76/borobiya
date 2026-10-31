import { describe, expect, it } from "vitest";
import { describeBroadcastState, type BroadcastPrioritySnapshot } from "./broadcast-status";

const basePriority: BroadcastPrioritySnapshot = {
  hasMultipleDevices: false,
  broadcastingCount: 1,
  ignoredCount: 0,
  hasShares: true
};

describe("describeBroadcastState", () => {
  it("explains when browser geolocation is unsupported", () => {
    const view = describeBroadcastState({
      status: "idle",
      lastErrorCode: null,
      peerCount: 0,
      isSupported: false,
      priority: basePriority
    });
    expect(view.tone).toBe("error");
    expect(view.isActive).toBe(false);
    expect(view.detail).toContain("HTTPS");
  });

  it("guides non-priority devices to their per-share controls on WRONG_DEVICE rejection or ignored shares", () => {
    const rejected = describeBroadcastState({
      status: "rejected",
      lastErrorCode: "WRONG_DEVICE",
      peerCount: 0,
      isSupported: true,
      priority: { hasMultipleDevices: true, broadcastingCount: 0, ignoredCount: 2, hasShares: true }
    });
    expect(rejected.tone).toBe("warn");
    expect(rejected.detail).toContain("اشتراک‌های من");

    const passiveWarning = describeBroadcastState({
      status: "broadcasting",
      lastErrorCode: null,
      peerCount: 0,
      isSupported: true,
      priority: { hasMultipleDevices: true, broadcastingCount: 0, ignoredCount: 2, hasShares: true }
    });
    expect(passiveWarning.tone).toBe("warn");
  });

  it("distinguishes geolocation permission denial from generic socket errors", () => {
    const denied = describeBroadcastState({
      status: "rejected",
      lastErrorCode: "GEOLOCATION_DENIED",
      peerCount: 0,
      isSupported: true,
      priority: basePriority
    });
    expect(denied.tone).toBe("error");
    expect(denied.headline).toContain("رد شد");
  });

  it("reports active live recipient count when broadcasting", () => {
    const active = describeBroadcastState({
      status: "broadcasting",
      lastErrorCode: null,
      peerCount: 3,
      isSupported: true,
      priority: basePriority
    });
    expect(active.tone).toBe("active");
    expect(active.isActive).toBe(true);
    expect(active.detail).toContain("۳");
  });
});
