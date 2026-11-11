import { getCurrentScope, onScopeDispose, ref, watch, type Ref } from "vue";
import { coordinatesSchema } from "@shared/index";
import type { RouteChoice, TransportProfile } from "@/api/mission-routing";
import { decodeRoutePolyline } from "@/sos/route-preview";
import { navigationCamera, type NavigationCamera } from "@/sos/navigation-follow";

export type NavigationFix = { lat: number; lon: number };
export interface NavigationRuntime {
  subscribe: (onFix: (fix: NavigationFix) => void, onError: (denied: boolean) => void) => () => void;
  now: () => number;
}
const browserRuntime: NavigationRuntime = {
  subscribe: (onFix, onError) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) throw new Error("GEOLOCATION_UNAVAILABLE");
    const id = navigator.geolocation.watchPosition(
      ({ coords }) => onFix({ lat: coords.latitude, lon: coords.longitude }),
      (error) => onError(error.code === 1),
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 12_000 }
    );
    return () => navigator.geolocation.clearWatch(id);
  },
  now: () => Date.now()
};

/** Foreground-only GPS camera follow: never keep a watcher after stop, logout, or mission/route change. */
export function useRouteNavigation(
  owner: Ref<string | null>, missionId: Ref<string | null>, selectedRoute: Ref<RouteChoice | null>,
  profile: Ref<TransportProfile>, follow: (camera: NavigationCamera) => void,
  runtime: NavigationRuntime = browserRuntime,
  resetCamera?: () => void
) {
  const active = ref(false);
  const fix = ref<NavigationFix | null>(null);
  const error = ref<string | null>(null);
  let unsubscribe: (() => void) | null = null;
  let generation = 0;
  let lastCameraAt = Number.NEGATIVE_INFINITY;
  let removePageListeners: (() => void) | null = null;
  const BACKGROUND_MESSAGE = "راهبری در پس‌زمینه متوقف شد؛ برای ادامه دوباره شروع کنید.";
  // Match the private map GPS freshness window: a silent native watch is not a live fix.
  const FIX_STALE_AFTER_MS = 20_000;
  let freshnessTimer: ReturnType<typeof setTimeout> | null = null;
  function clearFreshnessTimer(): void {
    if (freshnessTimer !== null) clearTimeout(freshnessTimer);
    freshnessTimer = null;
  }

  function stop(): void {
    generation++;
    removePageListeners?.();
    removePageListeners = null;
    clearFreshnessTimer();
    const cleanup = unsubscribe;
    const wasActive = active.value;
    unsubscribe = null;
    active.value = false;
    fix.value = null;
    lastCameraAt = Number.NEGATIVE_INFINITY;
    // A native bridge may fail to clearWatch; do not let that preserve the private fix,
    // block route teardown, or prevent the camera from returning to overview.
    try { cleanup?.(); } catch { /* Watch callbacks are already invalidated by generation. */ }
    // Stop (manual, permission loss, mission/account change or closing the route)
    // always returns the map to a level, north-up overview. Starting a fresh
    // watch calls stop() first, but must not reset a camera that was never following.
    if (wasActive) {
      // A map may already be disposing while a route/mission switch stops GPS.
      // Camera failure must never interrupt the watch cleanup or mask the original error.
      try { resetCamera?.(); } catch { /* Map no longer exists. GPS is already stopped. */ }
    }
  }
  function start(): boolean {
    if (active.value || !owner.value || !missionId.value || !selectedRoute.value) return false;
    const page = typeof document !== "undefined" ? document : null;
    const isHidden = () => page?.visibilityState === "hidden";
    if (isHidden()) { error.value = BACKGROUND_MESSAGE; return false; }
    stop();
    error.value = null;
    let coordinates: [number, number][];
    try { coordinates = decodeRoutePolyline(selectedRoute.value.polyline); }
    catch { error.value = "مسیر معتبر نیست؛ دوباره مسیرها را دریافت کنید."; return false; }
    const current = generation;
    const account = owner.value;
    const mission = missionId.value;
    const route = selectedRoute.value;
    const transport = profile.value;
    active.value = true;
    try {
      const cleanup = runtime.subscribe((candidate) => {
        // A browser callback can remain queued after clearWatch. It must never stop a
        // *newer* navigation watch started for the same route or a different mission.
        if (current !== generation) return;
        if (owner.value !== account || missionId.value !== mission ||
            selectedRoute.value !== route || profile.value !== transport) { stop(); return; }
        const result = coordinatesSchema.safeParse(candidate);
        if (!result.success) return;
        clearFreshnessTimer();
        fix.value = result.data;
        error.value = null;
        if (current !== generation || !active.value) return;
        freshnessTimer = setTimeout(() => {
          freshnessTimer = null;
          if (current !== generation || !active.value || owner.value !== account || missionId.value !== mission ||
              selectedRoute.value !== route || profile.value !== transport) return;
          fix.value = null;
          lastCameraAt = Number.NEGATIVE_INFINITY;
          error.value = "دادهٔ GPS تازه دریافت نشد؛ موقعیت قبلی دیگر زنده نیست.";
        }, FIX_STALE_AFTER_MS);
        const now = runtime.now();
        if (now - lastCameraAt < 1000) return;
        lastCameraAt = now;
        try { follow(navigationCamera(result.data, coordinates, transport)); }
        catch {
          stop();
          error.value = "نقشه در دسترس نیست؛ راهبری متوقف شد. دوباره تلاش کنید.";
        }
      }, (denied) => {
        if (current !== generation) return;
        // A timeout/outage invalidates the displayed fix immediately, but the watch
        // stays armed so the next valid observation can recover without a new Start.
        clearFreshnessTimer();
        fix.value = null;
        lastCameraAt = Number.NEGATIVE_INFINITY;
        error.value = denied ? "دسترسی موقعیت قطع شده است؛ راهبری متوقف شد." :
          "موقعیت تازه دریافت نشد؛ اتصال GPS را بررسی کنید.";
        if (denied) stop();
      });
      // A test/native bridge can report a fix or denial before returning the disposer.
      // Do not retain an already-stopped GPS watch in that case.
      if (current !== generation || !active.value) { cleanup(); return false; }
      unsubscribe = cleanup;
      // Guidance is a foreground-only camera/GPS watch, not opt-in background
      // location sharing. A locked screen, background tab, or page navigation
      // must revoke this watch without auto-restarting it when focus returns.
      const browser = typeof window !== "undefined" ? window : null;
      const onBackground = () => {
        if (!active.value || current !== generation) return;
        stop();
        error.value = BACKGROUND_MESSAGE;
      };
      const onVisibility = () => { if (isHidden()) onBackground(); };
      page?.addEventListener("visibilitychange", onVisibility);
      browser?.addEventListener("pagehide", onBackground);
      removePageListeners = () => {
        page?.removeEventListener("visibilitychange", onVisibility);
        browser?.removeEventListener("pagehide", onBackground);
      };
      // The page may have disappeared between subscribe and listener setup.
      if (isHidden()) onBackground();
      return current === generation && active.value;
    } catch {
      stop();
      error.value = "مکان‌یابی پیوسته در این دستگاه در دسترس نیست.";
      return false;
    }
  }
  function dismissError(): void { error.value = null; }
  // Logout or a route/mission switch revokes this GPS consent at the ref change,
  // not at Vue's next tick (which could coalesce a logout and new login).
  watch([owner, missionId, selectedRoute, profile], () => { if (active.value) stop(); }, { flush: "sync" });
  if (getCurrentScope()) onScopeDispose(stop);
  return { active, fix, error, start, stop, dismissError };
}
