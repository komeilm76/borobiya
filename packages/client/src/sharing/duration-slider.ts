import { MAX_LOCATION_SHARE_MINUTES } from "@shared/index";

/** A single 15-minute-to-30-day slider hides three different step sizes. Keep each scale linear. */
export type DurationScale = "minutes" | "hours" | "days";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 1440;

export function durationRange(scale: DurationScale): { min: number; max: number; step: number } {
  switch (scale) {
    case "minutes": return { min: 15, max: 360, step: 15 };
    case "hours": return { min: 1, max: 24, step: 1 };
    case "days": return { min: 1, max: MAX_LOCATION_SHARE_MINUTES / MINUTES_PER_DAY, step: 1 };
  }
}

export function minutesForScaleValue(scale: DurationScale, value: number): number {
  const { min, max, step } = durationRange(scale);
  const bounded = Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : min;
  const snapped = min + Math.round((bounded - min) / step) * step;
  return snapped * (scale === "minutes" ? 1 : scale === "hours" ? MINUTES_PER_HOUR : MINUTES_PER_DAY);
}

/** Switching scale preserves an exact value where possible and otherwise snaps to its nearest valid value. */
export function scaleValueForMinutes(scale: DurationScale, minutes: number): number {
  const unit = scale === "minutes" ? 1 : scale === "hours" ? MINUTES_PER_HOUR : MINUTES_PER_DAY;
  const { min, max, step } = durationRange(scale);
  const bounded = Number.isFinite(minutes) ? Math.max(min, Math.min(max, minutes / unit)) : min;
  return min + Math.round((bounded - min) / step) * step;
}

export function scaleForPreset(minutes: number): DurationScale {
  return minutes < MINUTES_PER_HOUR ? "minutes" : minutes < MINUTES_PER_DAY ? "hours" : "days";
}
