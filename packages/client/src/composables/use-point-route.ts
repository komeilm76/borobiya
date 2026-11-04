import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { getMissionRouteChoices, type RouteChoice, type RoutePoint, type TransportProfile } from "@/api/mission-routing";
import { decodeRoutePolyline, formatRouteDistance, formatRouteDuration } from "@/sos/route-preview";
import { navigationCamera, type NavigationCamera } from "@/sos/navigation-follow";
import { deviationThreshold, distanceFromRoute } from "@/map/route-deviation";
import type { GeocodeResult } from "@shared/index";
import type { OwnMapFix } from "./use-own-map-position";
import type { useReversePlace } from "./use-reverse-place";

export function pointDistance(a: RoutePoint, b: RoutePoint): number {
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians, dLon = (b.lon - a.lon) * radians;
  const value = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLon / 2) ** 2;
  return 12_742_000 * Math.asin(Math.min(1, Math.sqrt(value)));
}

/** Routing is private, same-origin and tied to the map owner's current selection. No SOS or broadcast is started. */
export function usePointRoute(owner: Ref<string | null>, position: Ref<OwnMapFix | null>,
  gpsError: Ref<string | null>, reverse: ReturnType<typeof useReversePlace>,
  follow: (camera: NavigationCamera) => void,
  getRoutes: typeof getMissionRouteChoices = getMissionRouteChoices,
  level?: () => void, alertOffRoute?: () => void) {
  const point = ref<RoutePoint | null>(null);
  const sheetOpen = ref(false);
  const routesVisible = ref(false);
  const profile = ref<TransportProfile>("car");
  const routes = ref<RouteChoice[]>([]);
  const index = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const navigating = ref(false);
  // A Start request is allowed before GPS/route planning completes; no camera or live
  // distance is published until a usable fix and a route actually exist.
  const navigationPending = ref(false);
  const gpsWarning = computed(() => {
    if (!navigating.value) return null;
    const fix = position.value;
    if (!fix) return navigationPending.value
      ? "GPS در دسترس نیست؛ درخواست راهبری ثبت شد. پس از دریافت موقعیت، مسیر محاسبه می‌شود."
      : "GPS در دسترس نیست؛ مسیر انتخابی باقی می‌ماند اما موقعیت زنده و فاصلهٔ باقیمانده نامشخص‌اند.";
    if (fix.accuracy === null || fix.accuracy > 80) return navigationPending.value
      ? "سیگنال GPS ضعیف است؛ تا دریافت موقعیت قابل‌استفاده، مسیر تأیید یا محاسبه نمی‌شود."
      : "سیگنال GPS ضعیف است؛ مسیر فعلی برآوردی است و موقعیت زنده و فاصلهٔ باقیمانده تا بهبود دقت نمایش داده نمی‌شوند.";
    return null;
  });
  const arrived = ref(false);
  const remaining = ref<number | null>(null);
  const replanning = ref(false);
  const rerouteWaitingForFix = ref(false);
  const rerouteMessage = ref<string | null>(null);
  // Search results already carry a validated title/address. Keep that snapshot even if
  // the search list refreshes; don't replace a known POI with a reverse-geocoded street.
  const knownPlace = ref<GeocodeResult | null>(null);
  const selectedRoute = computed(() => routes.value[index.value] ?? null);
  const routePoints = computed(() => {
    try { return selectedRoute.value ? decodeRoutePolyline(selectedRoute.value.polyline) : []; }
    catch { return []; }
  });
  const title = computed(() => knownPlace.value?.name ?? (reverse.address.value?.street
    ? `${reverse.address.value.street}${reverse.address.value.houseNumber ? ` ${reverse.address.value.houseNumber}` : ""}`
    : reverse.address.value?.city ?? "نقطهٔ انتخاب‌شده"));
  const address = computed(() => knownPlace.value?.address ?? reverse.address.value?.formattedAddress ?? null);
  let controller: AbortController | null = null;
  let generation = 0;
  let waitingForFix = false;
  // Start may be allowed from a previously planned route while GPS is weak.
  // Its first reliable fix must be compared with that route's origin before following.
  let awaitingFirstPreciseFix = false;
  const plannedFrom = ref<RoutePoint | null>(null);
  // A route requested from coordinates with poor/unknown accuracy is only a preview.
  // Recalculate once from a precise fix before publishing live camera guidance.
  const provisionalRoute = ref(false);
  let lastCameraAt = Number.NEGATIVE_INFINITY;
  let firstDeviationAt: number | null = null;
  let lastRerouteAt = Number.NEGATIVE_INFINITY;
  let statusTimer: ReturnType<typeof setTimeout> | null = null;
  const invalidate = () => { ++generation; controller?.abort(); controller = null; loading.value = false; };
  function originIsStale(origin: RoutePoint, provisional = false): boolean {
    const latest = position.value;
    if (!latest) return true;
    // Coarse fixes can drift hundreds of metres; retrying each noisy sample can loop
    // forever. Once a precise fix arrives, however, replace any provisional reply.
    if (provisional && latest.accuracy !== null && latest.accuracy <= 80) return true;
    if (latest.accuracy === null || latest.accuracy > 80) return false;
    return pointDistance(latest, origin) > 150;
  }
  /** An unresponsive routing gateway must not leave Start disabled or unsafe guidance pending forever.
   * Race even a test/adapter that ignores AbortSignal; always remove the abort listener/timer. */
  async function requestChoices(from: RoutePoint, to: RoutePoint, transport: TransportProfile,
    requestController: AbortController): Promise<RouteChoice[]> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let rejectAbort: ((reason: Error) => void) | null = null;
    const onAbort = () => rejectAbort?.(new Error("ROUTE_ABORTED"));
    const cancelled = new Promise<never>((_, reject) => {
      rejectAbort = reject;
      requestController.signal.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => {
        reject(new Error("ROUTE_TIMEOUT"));
        requestController.abort();
      }, 15_000);
    });
    try { return await Promise.race([getRoutes(from, to, transport, requestController.signal), cancelled]); }
    finally {
      if (timer !== null) clearTimeout(timer);
      requestController.signal.removeEventListener("abort", onAbort);
    }
  }
  function stop(): void {
    const wasActive = navigating.value;
    const oldRouteUnsafe = replanning.value || rerouteWaitingForFix.value;
    const pendingStart = navigationPending.value;
    if (oldRouteUnsafe || pendingStart) {
      // Drop the untrusted line before synchronous map watchers repaint on state change.
      invalidate(); routes.value = []; index.value = 0; plannedFrom.value = null; provisionalRoute.value = false;
      error.value = oldRouteUnsafe ? "مسیر پیشین معتبر نیست؛ برای ادامه، مسیر را دوباره محاسبه کنید." : null;
      waitingForFix = false;
    }
    navigating.value = false;
    navigationPending.value = false;
    awaitingFirstPreciseFix = false;
    replanning.value = false; rerouteWaitingForFix.value = false;
    firstDeviationAt = null; rerouteMessage.value = null;
    if (statusTimer) clearTimeout(statusTimer); statusTimer = null;
    lastCameraAt = Number.NEGATIVE_INFINITY;
    if (wasActive) { try { level?.(); } catch { /* The map may already be disposing. */ } }
  }
  function clear(): void {
    invalidate(); stop(); reverse.close();
    // The point watcher paints map overlays synchronously. Drop route geometry first so
    // clearing the point cannot briefly repaint a ghost route or origin marker.
    routesVisible.value = false; routes.value = []; index.value = 0;
    point.value = null; sheetOpen.value = false;
    error.value = null; arrived.value = false; remaining.value = null; waitingForFix = false; plannedFrom.value = null; provisionalRoute.value = false;
    knownPlace.value = null; lastRerouteAt = Number.NEGATIVE_INFINITY;
  }
  function select(candidate: RoutePoint, place?: GeocodeResult): void {
    if (!owner.value || !Number.isFinite(candidate.lat) || Math.abs(candidate.lat) > 90 ||
      !Number.isFinite(candidate.lon) || Math.abs(candidate.lon) > 180) return;
    clear(); point.value = { ...candidate }; sheetOpen.value = true; profile.value = "car";
    if (place?.name.trim() && place.address.trim() && place.lat === candidate.lat && place.lon === candidate.lon) {
      knownPlace.value = { ...place, name: place.name.trim(), address: place.address.trim() };
    } else reverse.select(candidate.lat, candidate.lon);
    void findRoutes();
  }
  async function findRoutes(): Promise<void> {
    const to = point.value, fix = position.value, account = owner.value;
    if (!to || !account || loading.value || (navigating.value && !navigationPending.value)) return;
    invalidate(); routes.value = []; index.value = 0; arrived.value = false; plannedFrom.value = null; provisionalRoute.value = false;
    if (!fix) {
      waitingForFix = true;
      error.value = navigating.value ? null : (gpsError.value ?? "برای محاسبهٔ مسیر، موقعیت GPS خود را فعال کنید.");
      return;
    }
    waitingForFix = false;
    const origin = { lat: fix.lat, lon: fix.lon };
    const provisional = fix.accuracy === null || fix.accuracy > 80;
    const current = generation, transport = profile.value;
    const requestController = (controller = new AbortController()), signal = requestController.signal;
    loading.value = true; error.value = null;
    let retryFromLatestFix = false;
    try {
      const choices = await requestChoices(origin, to, transport, requestController);
      if (current !== generation || owner.value !== account || point.value !== to || profile.value !== transport) return;
      if (originIsStale(origin, provisional)) {
        // The reply belongs to an old GPS origin or an imprecise fix superseded by a precise one.
        retryFromLatestFix = true;
      } else {
        // A bad alternative must not hide a valid route or become a navigation bearing.
        const valid = choices.filter((choice) => {
          try { decodeRoutePolyline(choice.polyline); return true; } catch { return false; }
        });
        if (!valid.length) throw new Error("INVALID_ROUTE");
        routes.value = valid.sort((a, b) => a.duration_s - b.duration_s || a.distance_m - b.distance_m);
        plannedFrom.value = origin;
        provisionalRoute.value = provisional;
      }
    } catch (reason) {
      if (current !== generation || (signal.aborted && (reason as Error)?.message !== "ROUTE_TIMEOUT")) return;
      if (originIsStale(origin, provisional)) retryFromLatestFix = true;
      else error.value = (reason as Error)?.message === "NO_ROUTE"
        ? "برای این وسیله در شبکهٔ محلی مسیری پیدا نشد. وسیلهٔ دیگری را امتحان کنید."
        : (reason as Error)?.message === "ROUTE_TIMEOUT"
          ? "پاسخ سرور مسیر بیش از ۱۵ ثانیه طول کشید؛ دوباره تلاش کنید."
          : "مسیر قابل‌اعتماد دریافت نشد. اتصال سرور مسیر را بررسی و دوباره تلاش کنید.";
    } finally {
      if (current === generation) { loading.value = false; controller = null; }
    }
    if (retryFromLatestFix && current === generation && owner.value === account &&
        point.value === to && profile.value === transport) { void findRoutes(); return; }
    if (current === generation && navigating.value && navigationPending.value) {
      if (selectedRoute.value) {
        navigationPending.value = false;
        const latest = position.value;
        if (latest && latest.accuracy !== null && latest.accuracy <= 80) awaitingFirstPreciseFix = false;
        updateFix(latest); // The warning stays until GPS becomes reliable.
      } else if (error.value) {
        const failure = error.value;
        stop(); error.value = failure; sheetOpen.value = true;
      }
    }
  }
  function changeProfile(next: TransportProfile): void {
    if (next === profile.value || !["car", "bicycle", "foot"].includes(next)) return;
    stop(); invalidate(); routes.value = []; index.value = 0; error.value = null; arrived.value = false; plannedFrom.value = null; provisionalRoute.value = false;
    profile.value = next; if (point.value) void findRoutes();
  }
  function choose(indexValue: number): void {
    if (navigating.value || !Number.isInteger(indexValue) || indexValue < 0 || indexValue >= routes.value.length) return;
    index.value = indexValue;
  }
  function start(): boolean {
    if (!owner.value || !point.value) return false;
    if (navigating.value) return true;
    const fix = position.value;
    // Starting is a user intent, not proof of a valid GPS route. Never follow a
    // lost/stale origin, but do not trap the user behind a disabled Start button.
    const usable = !loading.value && !!selectedRoute.value && routePoints.value.length >= 2 &&
      !!fix && !!plannedFrom.value && (fix.accuracy === null || fix.accuracy > 80 ||
        pointDistance(fix, plannedFrom.value) <= 150);
    navigationPending.value = !usable;
    awaitingFirstPreciseFix = !fix || fix.accuracy === null || fix.accuracy > 80;
    error.value = null; arrived.value = false; navigating.value = true; sheetOpen.value = false;
    firstDeviationAt = null; rerouteWaitingForFix.value = false;
    rerouteMessage.value = null; routesVisible.value = true;
    if (navigationPending.value) {
      remaining.value = null;
      if (!loading.value && fix) void findRoutes();
    } else updateFix(fix);
    return navigating.value;
  }
  /** Explicitly pause guidance before changing a mode or choosing another route. */
  function editNavigation(): void { if (navigating.value) stop(); sheetOpen.value = true; routesVisible.value = true; }
  async function replanFromDeviation(): Promise<void> {
    const to = point.value, account = owner.value, fix = position.value, transport = profile.value;
    if (!to || !account || !fix || fix.accuracy === null || fix.accuracy > 80 ||
      replanning.value || !navigating.value) return;
    const origin = { lat: fix.lat, lon: fix.lon };
    const current = ++generation;
    const requestController = (controller = new AbortController()), signal = requestController.signal;
    replanning.value = true; rerouteWaitingForFix.value = false; remaining.value = null;
    rerouteMessage.value = "از مسیر خارج شده‌اید؛ در حال محاسبهٔ مسیر تازه…";
    let published = false;
    // A lost/coarse fix is not a routing-server failure. Hold guidance until precision
    // returns; a response from a moved origin must be retried, not published or followed.
    function originStillUsable(): boolean {
      const latest = position.value;
      if (!latest || latest.accuracy === null || latest.accuracy > 80) {
        rerouteWaitingForFix.value = true;
        rerouteMessage.value = "GPS دقیق نیست؛ در انتظار موقعیت معتبر برای بازمحاسبهٔ مسیر…";
        return false;
      }
      if (originIsStale(origin)) {
        // Keep the old line hidden while replacing this stale request with a fresh one.
        rerouteWaitingForFix.value = true; replanning.value = false; controller = null;
        void replanFromDeviation();
        return false;
      }
      return true;
    }
    try {
      const choices = await requestChoices(origin, to, transport, requestController);
      if (current !== generation || !navigating.value || owner.value !== account || point.value !== to || profile.value !== transport) return;
      if (!originStillUsable()) return;
      const valid = choices.filter((choice) => {
        try { decodeRoutePolyline(choice.polyline); return true; } catch { return false; }
      });
      if (!valid.length) throw new Error("INVALID_ROUTE");
      routes.value = valid.sort((a, b) => a.duration_s - b.duration_s || a.distance_m - b.distance_m);
      index.value = 0; plannedFrom.value = origin; provisionalRoute.value = false; firstDeviationAt = null;
      remaining.value = position.value ? pointDistance(position.value, to) : null;
      rerouteMessage.value = "مسیر تازه آماده است؛ با احتیاط ادامه دهید.";
      statusTimer = setTimeout(() => { rerouteMessage.value = null; statusTimer = null; }, 5000);
      published = true;
    } catch (reason) {
      if (current !== generation || (signal.aborted && (reason as Error)?.message !== "ROUTE_TIMEOUT")) return;
      if (!originStillUsable()) return;
      stop(); routes.value = []; index.value = 0; plannedFrom.value = null; provisionalRoute.value = false;
      error.value = "بازمحاسبهٔ مسیر ممکن نشد؛ راهبری متوقف شد. موقعیت و مسیر را بررسی و دوباره تلاش کنید.";
      sheetOpen.value = true;
    } finally {
      if (current === generation) {
        replanning.value = false; controller = null;
        if (published) focus(); // New bearing immediately, without waiting for another GPS event.
      }
    }
  }
  function updateFix(fix: OwnMapFix | null): void {
    if (!navigating.value || navigationPending.value || !point.value) return;
    if (!fix || fix.accuracy === null || fix.accuracy > 80) {
      // A coarse fix must not yank the camera away or present a false live distance.
      remaining.value = null;
      lastCameraAt = Number.NEGATIVE_INFINITY; // Follow immediately when reliable GPS returns.
      firstDeviationAt = null;
      return;
    }
    // An accurate arrival still counts while a reroute request is in flight. A coarse
    // fix must never declare arrival or expose an untrusted remaining distance.
    const directDistance = pointDistance(fix, point.value);
    if (fix.accuracy <= 35 && directDistance <= 25) {
      // Arrival ends guidance immediately. The map view acknowledges it separately;
      // do not open the editable route planner or leave the old route line on screen.
      stop(); error.value = null; remaining.value = 0;
      routesVisible.value = false; sheetOpen.value = false; arrived.value = true; return;
    }
    if (replanning.value) return;
    if (rerouteWaitingForFix.value) { void replanFromDeviation(); return; }
    remaining.value = directDistance;
    const now = Date.now();
    if (fix.accuracy <= 35 && distanceFromRoute(fix, routePoints.value) > deviationThreshold(profile.value, fix.accuracy)) {
      if (firstDeviationAt === null || now - firstDeviationAt > 10_000) firstDeviationAt = now;
      else if (now - firstDeviationAt >= 2000 && now - lastRerouteAt >= 20_000) {
        firstDeviationAt = null; lastRerouteAt = now;
        try { alertOffRoute?.(); } catch { /* Audio is optional; rerouting must continue. */ }
        void replanFromDeviation(); return;
      }
    } else firstDeviationAt = null;
    if (now - lastCameraAt < 1000) return;
    focus();
  }
  /** Recenter immediately without synthesizing a second GPS fix or rechecking deviation. */
  function focus(): void {
    const fix = position.value;
    if (!navigating.value || navigationPending.value || replanning.value || rerouteWaitingForFix.value ||
      !fix || fix.accuracy === null || fix.accuracy > 80 || routePoints.value.length < 2) return;
    lastCameraAt = Date.now();
    try { follow(navigationCamera(fix, routePoints.value, profile.value)); }
    catch { stop(); error.value = "نمایش نقشهٔ راهبری ممکن نشد؛ مسیر را بررسی کنید."; sheetOpen.value = true; }
  }
  watch(position, (fix) => {
    if (navigating.value && navigationPending.value) {
      if (!loading.value && fix) void findRoutes();
    } else if (navigating.value) {
      if (fix && fix.accuracy !== null && fix.accuracy <= 80) {
        const originMovedWhileWeak = awaitingFirstPreciseFix && !!plannedFrom.value &&
          pointDistance(fix, plannedFrom.value) > 150;
        awaitingFirstPreciseFix = false;
        if (provisionalRoute.value || originMovedWhileWeak) {
          navigationPending.value = true; remaining.value = null;
          void findRoutes(); // Replace an obsolete origin before following the camera.
          return;
        }
      }
      updateFix(fix);
    } else if (waitingForFix && point.value && fix) void findRoutes();
    else if (point.value && plannedFrom.value && !loading.value && fix &&
             (provisionalRoute.value && fix.accuracy !== null && fix.accuracy <= 80 ||
              fix.accuracy !== null && fix.accuracy <= 150 && pointDistance(fix, plannedFrom.value) > 150)) {
      void findRoutes(); // Keep the planned distance/time tied to the user's actual origin.
    }
  }, { flush: "sync" });
  watch(gpsError, (message) => {
    if (message && navigating.value && !navigationPending.value && message.includes("دسترسی")) {
      stop(); error.value = message; sheetOpen.value = true;
    }
  }, { flush: "sync" });
  // A route request may fail (or still be draining) when connectivity returns.
  // Recalculate only the current owner's unplanned point; never resume guidance,
  // replay a write, or reuse a result from before the outage.
  const onOnline = () => {
    if (!owner.value || !point.value || !position.value || navigating.value || selectedRoute.value ||
        (!loading.value && !error.value)) return;
    invalidate();
    void findRoutes();
  };
  if (typeof window !== "undefined" && typeof window.addEventListener === "function") {
    window.addEventListener("online", onOnline);
  }
  watch(owner, clear, { flush: "sync" });
  onScopeDispose(() => {
    if (typeof window !== "undefined" && typeof window.removeEventListener === "function") {
      window.removeEventListener("online", onOnline);
    }
    clear();
  });
  return { point, sheetOpen, routesVisible, profile, routes, index, loading, error, navigating, navigationPending, gpsWarning, arrived,
    replanning, rerouteWaitingForFix, rerouteMessage,
    remaining, selectedRoute, routePoints, plannedFrom, provisionalRoute, title, address, knownPlace, select, findRoutes, changeProfile, choose, start, stop, focus, editNavigation, clear,
    distanceLabel: computed(() => selectedRoute.value ? formatRouteDistance(selectedRoute.value.distance_m) : "—"),
    durationLabel: computed(() => selectedRoute.value ? formatRouteDuration(selectedRoute.value.duration_s) : "—") };
}
