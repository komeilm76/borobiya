import type { TransportProfile, RoutePoint } from "@/api/mission-routing";
import type { OwnMapFix } from "@/composables/use-own-map-position";
import { deviationThreshold } from "@/map/route-deviation";

export interface NavigationAnnouncementState {
  navigationPending: boolean;
  calculating: boolean;
  replanning: boolean;
  waitingForFix: boolean;
  remainingMetres: number | null;
  hasPosition: boolean;
}

/** Announce state transitions, not every GPS distance update in the visible guidance banner. */
export function navigationStatusAnnouncement(state: NavigationAnnouncementState): string {
  if (state.navigationPending) return state.calculating ? "در حال محاسبهٔ مسیر…" : "در انتظار GPS برای محاسبهٔ مسیر…";
  if (state.replanning) return "در حال محاسبهٔ مسیر تازه…";
  if (state.waitingForFix) return "منتظر GPS دقیق برای مسیر تازه…";
  if (state.remainingMetres === null) return state.hasPosition
    ? "GPS دقیق نیست؛ فاصلهٔ باقیمانده نامشخص است" : "در انتظار GPS؛ موقعیت زنده در دسترس نیست";
  return "راهبری فعال است";
}

/** A browser GPS speed is metres/second; a route's average speed is NOT the vehicle's speed. */
export function currentSpeedKmh(fix: OwnMapFix | null, observedAtMs: number | null, nowMs: number): number | null {
  if (!fix || fix.accuracy === null || !Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 35 ||
    fix.speed === undefined || !Number.isFinite(fix.speed) || fix.speed < 0 || !Number.isFinite(fix.speed * 3.6) ||
    observedAtMs === null || !Number.isFinite(nowMs) || nowMs < observedAtMs || nowMs - observedAtMs > 15_000) return null;
  return Math.round(fix.speed * 3.6);
}

function segmentMetres(a: readonly [number, number], b: readonly [number, number]): number {
  const radians = Math.PI / 180;
  const dLat = (b[1] - a[1]) * radians, dLon = (b[0] - a[0]) * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * radians) * Math.cos(b[1] * radians) * Math.sin(dLon / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(value)));
}

/** Proportion of the selected OSRM route still ahead, multiplied by its estimated duration.
 * No live traffic or legal speed-limit data is supplied by /route. Do not use straight-line
 * distance or GPS speed as an arrival-time promise. Refuse off-route/coarse fixes. */
export function estimateRemainingRouteSeconds(fix: RoutePoint & { accuracy?: number | null },
  line: readonly (readonly [number, number])[], durationS: number, profile: TransportProfile): number | null {
  if (line.length < 2 || !Number.isFinite(durationS) || durationS <= 0 ||
    fix.accuracy === null || (fix.accuracy !== undefined &&
      (!Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > 80))) return null;
  const latScale = Math.cos(fix.lat * Math.PI / 180);
  const x = fix.lon * latScale, y = fix.lat;
  let nearest = Infinity, progress = 0, total = 0;
  for (let index = 1; index < line.length; index++) {
    const a = line[index - 1]!, b = line[index]!;
    const ax = a[0] * latScale, ay = a[1];
    const dx = (b[0] - a[0]) * latScale, dy = b[1] - a[1];
    const length2 = dx * dx + dy * dy;
    const fraction = length2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length2)) : 0;
    const separation = Math.hypot(x - ax - fraction * dx, y - ay - fraction * dy) * 111_195;
    const length = segmentMetres(a, b);
    // On a loop or crossing, favor the earlier segment when both are equally close.
    if (separation < nearest - 0.01) { nearest = separation; progress = total + length * fraction; }
    total += length;
  }
  if (!Number.isFinite(total) || total <= 0 ||
    nearest > deviationThreshold(profile, fix.accuracy ?? 80)) return null;
  return Math.ceil(durationS * Math.max(0, Math.min(1, (total - progress) / total)));
}

export function formatRemainingTime(seconds: number): string {
  if (seconds < 60) return "کمتر از ۱ دقیقه";
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes.toLocaleString("fa-IR")} دقیقه`;
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `${hours.toLocaleString("fa-IR")} ساعت${rest ? ` و ${rest.toLocaleString("fa-IR")} دقیقه` : ""}`;
}
