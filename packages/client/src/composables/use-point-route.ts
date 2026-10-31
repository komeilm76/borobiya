import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { getMissionRouteChoices, type RouteChoice, type RoutePoint, type TransportProfile } from "@/api/mission-routing";
import { decodeRoutePolyline, formatRouteDistance, formatRouteDuration } from "@/sos/route-preview";
import { navigationCamera, type NavigationCamera } from "@/sos/navigation-follow";
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
  level?: () => void) {
  const point = ref<RoutePoint | null>(null);
  const sheetOpen = ref(false);
  const profile = ref<TransportProfile>("car");
  const routes = ref<RouteChoice[]>([]);
  const index = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const navigating = ref(false);
  const arrived = ref(false);
  const remaining = ref<number | null>(null);
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
  let plannedFrom: RoutePoint | null = null;
  let lastCameraAt = Number.NEGATIVE_INFINITY;
  const invalidate = () => { ++generation; controller?.abort(); controller = null; loading.value = false; };
  function originIsStale(origin: RoutePoint): boolean {
    const latest = position.value;
    return !latest || latest.accuracy === null || latest.accuracy > 150 || pointDistance(latest, origin) > 150;
  }
  function stop(): void {
    const wasActive = navigating.value;
    navigating.value = false;
    lastCameraAt = Number.NEGATIVE_INFINITY;
    if (wasActive) { try { level?.(); } catch { /* The map may already be disposing. */ } }
  }
  function clear(): void {
    invalidate(); stop(); reverse.close(); point.value = null; sheetOpen.value = false;
    routes.value = []; index.value = 0; error.value = null; arrived.value = false; remaining.value = null; waitingForFix = false; plannedFrom = null;
    knownPlace.value = null;
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
    if (!to || !account || loading.value || navigating.value) return;
    invalidate(); routes.value = []; index.value = 0; arrived.value = false; plannedFrom = null;
    if (!fix || fix.accuracy === null || fix.accuracy > 150) {
      waitingForFix = true;
      error.value = !fix ? (gpsError.value ?? "برای محاسبهٔ مسیر، موقعیت GPS خود را فعال کنید.")
        : "برای محاسبهٔ مسیر، منتظر موقعیت GPS با دقت کافی هستیم.";
      return;
    }
    waitingForFix = false;
    const origin = { lat: fix.lat, lon: fix.lon };
    const current = generation, transport = profile.value;
    const signal = (controller = new AbortController()).signal;
    loading.value = true; error.value = null;
    let retryFromLatestFix = false;
    try {
      const choices = await getRoutes(origin, to, transport, signal);
      if (current !== generation || owner.value !== account || point.value !== to || profile.value !== transport) return;
      if (originIsStale(origin)) {
        // The reply belongs to an old GPS origin. Do not show its ETA, even briefly.
        retryFromLatestFix = true;
      } else {
        // A bad alternative must not hide a valid route or become a navigation bearing.
        const valid = choices.filter((choice) => {
          try { decodeRoutePolyline(choice.polyline); return true; } catch { return false; }
        });
        if (!valid.length) throw new Error("INVALID_ROUTE");
        routes.value = valid.sort((a, b) => a.duration_s - b.duration_s || a.distance_m - b.distance_m);
        plannedFrom = origin;
      }
    } catch (reason) {
      if (current !== generation || signal.aborted) return;
      if (originIsStale(origin)) retryFromLatestFix = true;
      else error.value = (reason as Error)?.message === "NO_ROUTE"
        ? "برای این وسیله در شبکهٔ محلی مسیری پیدا نشد. وسیلهٔ دیگری را امتحان کنید."
        : "مسیر قابل‌اعتماد دریافت نشد. اتصال سرور مسیر را بررسی و دوباره تلاش کنید.";
    } finally {
      if (current === generation) { loading.value = false; controller = null; }
    }
    if (retryFromLatestFix && current === generation && owner.value === account &&
        point.value === to && profile.value === transport) void findRoutes();
  }
  function changeProfile(next: TransportProfile): void {
    if (next === profile.value || !["car", "bicycle", "foot"].includes(next)) return;
    stop(); invalidate(); routes.value = []; index.value = 0; error.value = null; arrived.value = false; plannedFrom = null;
    profile.value = next; if (point.value) void findRoutes();
  }
  function choose(indexValue: number): void {
    if (navigating.value || !Number.isInteger(indexValue) || indexValue < 0 || indexValue >= routes.value.length) return;
    index.value = indexValue;
  }
  function start(): boolean {
    if (!owner.value || !point.value || !position.value || !selectedRoute.value || !routePoints.value.length || loading.value) return false;
    if (position.value.accuracy === null || position.value.accuracy > 80) {
      error.value = "دقت موقعیت GPS برای شروع راهبری کافی نیست."; sheetOpen.value = true; return false;
    }
    if (!plannedFrom || pointDistance(position.value, plannedFrom) > 150) {
      void findRoutes(); // A stale route must not be followed from a different starting position.
      return false;
    }
    error.value = null; arrived.value = false; navigating.value = true; sheetOpen.value = false;
    updateFix(position.value);
    return navigating.value;
  }
  function updateFix(fix: OwnMapFix | null): void {
    if (!navigating.value || !point.value) return;
    if (!fix || fix.accuracy === null || fix.accuracy > 80) {
      // A coarse fix must not yank the camera away or present a false live distance.
      remaining.value = null;
      lastCameraAt = Number.NEGATIVE_INFINITY; // Follow immediately when reliable GPS returns.
      return;
    }
    remaining.value = pointDistance(fix, point.value);
    // Do not declare arrival on a coarse/inaccurate fix.
    if (fix.accuracy !== null && fix.accuracy <= 35 && remaining.value <= 25) {
      stop(); arrived.value = true; sheetOpen.value = true; return;
    }
    const now = Date.now();
    if (now - lastCameraAt < 1000) return;
    lastCameraAt = now;
    try {
      const camera = navigationCamera(fix, routePoints.value, profile.value);
      follow({ ...camera, pitch: Math.max(camera.pitch, 50) });
    } catch { stop(); error.value = "نمایش نقشهٔ راهبری ممکن نشد؛ مسیر را بررسی کنید."; sheetOpen.value = true; }
  }
  watch(position, (fix) => {
    if (navigating.value) updateFix(fix);
    else if (waitingForFix && point.value && fix) void findRoutes();
    else if (point.value && plannedFrom && !loading.value && fix && fix.accuracy !== null &&
             fix.accuracy <= 150 && pointDistance(fix, plannedFrom) > 150) {
      void findRoutes(); // Keep the planned distance/time tied to the user's actual origin.
    }
  }, { flush: "sync" });
  watch(gpsError, (message) => {
    if (message && navigating.value && message.includes("دسترسی")) {
      stop(); error.value = message; sheetOpen.value = true;
    }
  }, { flush: "sync" });
  watch(owner, clear, { flush: "sync" });
  onScopeDispose(clear);
  return { point, sheetOpen, profile, routes, index, loading, error, navigating, arrived,
    remaining, selectedRoute, routePoints, title, address, knownPlace, select, findRoutes, changeProfile, choose, start, stop, clear,
    distanceLabel: computed(() => selectedRoute.value ? formatRouteDistance(selectedRoute.value.distance_m) : "—"),
    durationLabel: computed(() => selectedRoute.value ? formatRouteDuration(selectedRoute.value.duration_s) : "—") };
}
