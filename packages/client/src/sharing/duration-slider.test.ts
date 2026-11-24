import { describe, expect, it } from "vitest";
import { MAX_LOCATION_SHARE_MINUTES } from "@shared/index";
import { durationRange, minutesForScaleValue, scaleForPreset, scaleValueForMinutes } from "./duration-slider";

describe("live sharing duration scales", () => {
  it("offers predictable linear minute, hour, and day ranges through exactly 30 days", () => {
    expect(durationRange("minutes")).toEqual({ min: 15, max: 360, step: 15 });
    expect(durationRange("hours")).toEqual({ min: 1, max: 24, step: 1 });
    expect(durationRange("days")).toEqual({ min: 1, max: 30, step: 1 });
    for (const scale of ["minutes", "hours", "days"] as const) {
      const { min, max, step } = durationRange(scale);
      for (let value = min; value <= max; value += step) {
        const minutes = minutesForScaleValue(scale, value);
        expect(scaleValueForMinutes(scale, minutes)).toBe(value);
        expect(minutes).toBeGreaterThanOrEqual(15);
        expect(minutes).toBeLessThanOrEqual(MAX_LOCATION_SHARE_MINUTES);
      }
    }
    expect(minutesForScaleValue("days", 30)).toBe(MAX_LOCATION_SHARE_MINUTES);
  });

  it("clamps and snaps values across scales instead of silently exceeding the contract", () => {
    expect(minutesForScaleValue("minutes", 33)).toBe(30);
    expect(minutesForScaleValue("hours", 99)).toBe(1440);
    expect(minutesForScaleValue("days", Number.NaN)).toBe(1440);
    expect(scaleValueForMinutes("minutes", 360)).toBe(360);
    expect(scaleValueForMinutes("minutes", 720)).toBe(360);
    expect(scaleValueForMinutes("hours", 15)).toBe(1);
    expect(scaleValueForMinutes("days", MAX_LOCATION_SHARE_MINUTES + 1)).toBe(30);
  });

  it("places one-tap durations on the same scale the custom slider will show", () => {
    expect([15, 60, 360, 1440, 4320, 10080].map(scaleForPreset))
      .toEqual(["minutes", "hours", "hours", "days", "days", "days"]);
  });
});
