import type { RoutePoint } from "@/api/mission-routing";

/** Ignore duplicate sends and results from a dismissed/replaced share attempt. */
export function createShareAttemptFence() {
  let generation = 0;
  let busy = false;
  return {
    get busy() { return busy; },
    begin(): number | null {
      if (busy) return null;
      busy = true;
      return ++generation;
    },
    isCurrent(attempt: number): boolean { return busy && generation === attempt; },
    finish(attempt: number): void { if (generation === attempt) busy = false; },
    reset(): void { generation++; busy = false; },
  };
}

/** Share the selected destination only. Never include the user's live GPS origin. */
export function selectedPointShare(point: RoutePoint | null): { title: string; text: string; url: string } | null {
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lon) ||
    Math.abs(point.lat) > 90 || Math.abs(point.lon) > 180) return null;
  const lat = point.lat.toFixed(5), lon = point.lon.toFixed(5);
  const url = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`;
  return { title: "موقعیت انتخاب‌شده", text: "موقعیت انتخاب‌شده روی نقشه", url };
}
