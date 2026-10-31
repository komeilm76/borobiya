import { MAX_LOCATION_SHARE_MINUTES } from "@shared/index";

// Nonlinear steps keep 15-minute choices usable without losing the 30-day ceiling:
// quarters up to 6 h, hours up to 1 day, then whole days. Presets are only shortcuts.
export const DURATION_SLIDER_MAX = 23 + 18 + 29;

export function minutesForSliderStep(step: number): number {
  const index = Math.min(DURATION_SLIDER_MAX, Math.max(0, Math.round(step)));
  if (index <= 23) return (index + 1) * 15;
  if (index <= 41) return 360 + (index - 23) * 60;
  return Math.min(MAX_LOCATION_SHARE_MINUTES, 1440 + (index - 41) * 1440);
}

export function sliderStepForMinutes(minutes: number): number {
  if (minutes <= 360) return Math.min(23, Math.max(0, Math.round(minutes / 15) - 1));
  if (minutes <= 1440) return Math.min(41, 23 + Math.round((minutes - 360) / 60));
  return Math.min(DURATION_SLIDER_MAX, 41 + Math.round((minutes - 1440) / 1440));
}
