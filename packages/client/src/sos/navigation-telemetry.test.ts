import { describe, expect, it } from "vitest";
import { estimateRemainingRouteSeconds, currentSpeedKmh, formatRemainingTime } from "./navigation-telemetry";

const line = [[0, 0], [0.01, 0], [0.02, 0]] as const;

describe("private navigation telemetry", () => {
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

  it("refuses a misleading ETA on an off-route fix or an invalid route", () => {
    expect(estimateRemainingRouteSeconds({ lat: 0.01, lon: 0.01, accuracy: 8 }, line, 600, "car")).toBeNull();
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0.01, accuracy: 100 }, line, 600, "car")).toBeNull();
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0.01 }, [[0, 0]], 600, "car")).toBeNull();
    expect(estimateRemainingRouteSeconds({ lat: 0, lon: 0.01 }, line, -1, "car")).toBeNull();
  });
});
