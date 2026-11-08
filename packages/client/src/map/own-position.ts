import type { OwnMapFix } from "@/composables/use-own-map-position";

/** A private GPS watch is distinct from the outgoing broadcast, even when both are on. */
export function ownPositionTone(position: OwnMapFix | null, active: boolean, error: string | null): "idle" | "warn" | "active" | "error" {
  if (error) return "error";
  if (!active) return "idle";
  return position ? "active" : "warn";
}

/**
 * Announce phase transitions without speaking changing coordinates/accuracy on every GPS fix.
 * The exact fix remains visible and readable on demand in the card.
 */
export function ownPositionAnnouncement(position: OwnMapFix | null, active: boolean, error: string | null, ready: boolean): string {
  if (error) return error;
  if (!ready && !active) return "نقشه در حال بارگذاری است؛ نمایش موقعیت پس از بارگذاری در دسترس خواهد بود.";
  if (!active) return "نمایش موقعیت شخصی خاموش است.";
  if (!position) return "در انتظار دریافت موقعیت GPS…";
  return "موقعیت شما روی نقشه پیدا شد؛ فقط روی این دستگاه نمایش داده می‌شود و اشتراک‌گذاری فعال نشده است.";
}

/** Explicitly describe a live fix, or why no current fix may be shown. */
export function ownPositionLabel(position: OwnMapFix | null, active: boolean, error: string | null): string {
  if (error) return error;
  if (!active) return "نمایش موقعیت خاموش است.";
  if (!position) return "در انتظار موقعیت GPS…";
  const accuracy = position.accuracy === null ? "" : `، دقت ±${Math.round(position.accuracy)} متر`;
  return `عرض ${position.lat.toFixed(5)}، طول ${position.lon.toFixed(5)}${accuracy}`;
}
