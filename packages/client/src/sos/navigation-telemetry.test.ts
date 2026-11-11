import { describe, expect, it } from "vitest";
import { estimateRemainingRouteSeconds, currentSpeedKmh, formatRemainingTime, formatRemainingTimeCompact, navigationStatusAnnouncement } from "./navigation-telemetry";

const line = [[0, 0], [0.01, 0], [0.02, 0]] as const;

describe("private navigation telemetry", () => {
  it("announces guidance phases without narrating every changing distance", () => {
    const active = { navigationPending: false, calculating: false, replanning: false,
      waitingForFix: false, remainingMetres: 1500, hasPosition: true };
    expect(navigationStatusAnnouncement(active)).toBe("راهبری فعال است");
    expect(navigationStatusAnnouncement({ ...active, remainingMetres: 1490 })).toBe("راهبری فعال است");
    expect(navigationStatusAnnouncement({ ...active, remainingMetres: 20 })).toBe("راهبری فعال است");
    expect(navigationStatusAnnouncement({ ...active, remainingMetres: null })).toContain("فاصلهٔ باقیمانده نامشخص");
    expect(navigationStatusAnnouncement({ ...active, remainingMetres: null, hasPosition: false })).toContain("در انتظار GPS");
    expect(navigationStatusAnnouncement({ ...active, navigationPending: true, calculating: true })).toContain("در حال محاسبهٔ مسیر");
    expect(navigationStatusAnnouncement({ ...active, navigationPending: true, calculating: false })).toContain("در انتظار GPS برای محاسبه");
    expect(navigationStatusAnnouncement({ ...active, replanning: true })).toContain("در حال محاسبهٔ مسیر تازه");
    expect(navigationStatusAnnouncement({ ...active, waitingForFix: true })).toContain("منتظر GPS دقیق");
  });

  it("uses GPS speed in m/s only for a recent precise fix, never inventing it from route duration", () => {
    const fix = { lat: 0, lon: 0.01, accuracy: 10, speed: 10 };
    expect(currentSpeedKmh(fix, 100_000, 110_000)).toBe(36);
    expect(currentSpeedKmh({ ...fix, speed: 0 }, 100_000, 110_000)).toBe(0);
    expect(currentSpeedKmh(fix, 100_000, 116_000)).toBeNull();
    expect(currentSpeedKmh(fix, 100_000, 99_000)).toBeNull();
    expect(currentSpeedKmh({ ...fix, accuracy: 60 }, 100_000, 100_000)).toBeNull();
    expect(currentSpeedKmh({ ...fix, speed: undefined }, 100_000, 100_000)).toBeNull();
    expect(currentSpeedKmh({ ...fix, speed: Number.NaN }, 100_000, 100_000)).toBeNull();
    expect(currentSpeedKmh({ ...fix, speed: Number.MAX_VALUE }, 100_000, 100_000)).toBeNull();
  });

  it("estimates remaining route time from progress along the actual line, not straight-line distance or live speed", () => {
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0 }, line, 600, "car")).toBe(600);
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0.005 }, line, 600, "car")).toBeCloseTo(450, 0);
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0.01 }, line, 600, "car")).toBeCloseTo(300, 0);
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0.02 }, line, 600, "car")).toBe(0);
    expect(formatRemainingTime(450)).toBe("۸ دقیقه");
    expect(formatRemainingTime(65)).toBe("۲ دقیقه");
    expect(formatRemainingTime(3700)).toBe("۱ ساعت و ۲ دقیقه");
  });

  it("uses short Persian time units on a phone without rounding remaining time down", () => {
    expect(formatRemainingTimeCompact(0)).toBe("زیر ۱د");
    expect(formatRemainingTimeCompact(60)).toBe("۱د");
    expect(formatRemainingTimeCompact(61)).toBe("۲د");
    expect(formatRemainingTimeCompact(3540)).toBe("۵۹د");
    expect(formatRemainingTimeCompact(3599)).toBe("۱س");
    expect(formatRemainingTimeCompact(3600)).toBe("۱س");
    expect(formatRemainingTimeCompact(3700)).toBe("۱س ۲د");
    expect(formatRemainingTimeCompact(2 * 3600 + 60)).toBe("۲س ۱د");
  });

  it("refuses a misleading ETA on an off-route fix or an invalid route", () => {
    expect(estimateRemainingRouteSeconds({ lat: 0.01, lon: 0.01, accuracy: 8 }, line, 600, "car")).toBeNull();
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0.01, accuracy: 100 }, line, 600, "car")).toBeNull();
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0.01 }, [[0, 0]], 600, "car")).toBeNull();
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0.01 }, line, -1, "car")).toBeNull();
  });
});
