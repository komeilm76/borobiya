import type { OwnMapFix } from "@/composables/use-own-map-position";

/** Explicitly describe a live fix, or why no current fix may be shown. */
export function ownPositionLabel(position: OwnMapFix | null, active: boolean, error: string | null): string {
  if (error) return error;
  if (!active) return "نمایش موقعیت خاموش است.";
  if (!position) return "در انتظار موقعیت GPS…";
  const accuracy = position.accuracy === null ? "" : `، دقت ±${Math.round(position.accuracy)} متر`;
  return `عرض ${position.lat.toFixed(5)}، طول ${position.lon.toFixed(5)}${accuracy}`;
}
