import { describe, expect, it } from "vitest";
import { MAX_LOCATION_SHARE_MINUTES } from "@shared/index";
import { DURATION_SLIDER_MAX, minutesForSliderStep, sliderStepForMinutes } from "./duration-slider";

describe("live sharing slider", () => {
  it("covers 15 minutes through exactly 30 days with useful small and large increments", () => {
    expect(minutesForSliderStep(0)).toBe(15);
    expect(minutesForSliderStep(3)).toBe(60);
    expect(minutesForSliderStep(23)).toBe(360);
    expect(minutesForSliderStep(24)).toBe(420);
    expect(minutesForSliderStep(41)).toBe(1440);
    expect(minutesForSliderStep(42)).toBe(2880);
    expect(minutesForSliderStep(DURATION_SLIDER_MAX)).toBe(MAX_LOCATION_SHARE_MINUTES);
    expect(minutesForSliderStep(999)).toBe(MAX_LOCATION_SHARE_MINUTES);
    for (let step = 0; step <= DURATION_SLIDER_MAX; step++) {
      expect(sliderStepForMinutes(minutesForSliderStep(step))).toBe(step);
    }
  });
});
