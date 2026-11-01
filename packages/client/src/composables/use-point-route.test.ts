import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { usePointRoute, pointDistance } from "./use-point-route";
import type { RouteChoice, TransportProfile } from "@/api/mission-routing";
import type { OwnMapFix } from "./use-own-map-position";
import type { GeocodeResult } from "@shared/index";

const poi: GeocodeResult = { placeId: "poi-azadi", name: "میدان آزادی", address: "تهران، میدان آزادی",
  lat: 40, lon: -120, type: "میدان" };

const polyline = "_p~iF~ps|U_ulLnnqC_mqNvxq`@";
const short = { polyline, distance_m: 4000, duration_s: 600 } satisfies RouteChoice;
const fast = { polyline, distance_m: 6000, duration_s: 420 } satisfies RouteChoice;
async function settle(): Promise<void> {
  await nextTick();
  // A guarded, abortable route request resolves through a race and then Vue watchers.
  for (let turn = 0; turn < 8; turn++) await Promise.resolve();
}

const deferred = <T>() => { let resolve!: (value: T) => void; let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
function setup(routes: (from: { lat: number; lon: number }, to: { lat: number; lon: number }, profile: TransportProfile,
  signal?: AbortSignal) => Promise<RouteChoice[]> = async () => [short, fast]) {
  const scope = effectScope(); const owner = ref<string | null>("owner");
  const fix = ref<OwnMapFix | null>({ lat: 38.5, lon: -120.2, accuracy: 8 }); const gpsError = ref<string | null>(null);
  const follow = vi.fn(); const level = vi.fn(); const alert = vi.fn(); const close = vi.fn(); const select = vi.fn();
  const reverse = { close, select, address: ref(null) } as unknown as Parameters<typeof usePointRoute>[3];
  const journey = scope.run(() => usePointRoute(owner, fix, gpsError, reverse, follow, routes, level, alert))!;
  return { scope, owner, fix, gpsError, follow, level, alert, close, select, journey };
}

describe("private point-to-point route", () => {
  it("uses the fastest returned alternative, changes mode safely, and never reuses stale replies", async () => {
    const old = deferred<RouteChoice[]>(); const calls: AbortSignal[] = [];
    const get = vi.fn((_from, _to, _mode, signal) => { calls.push(signal!); return calls.length === 1 ? old.promise : Promise.resolve([short, fast]); });
    const { journey, scope, select } = setup(get);
    journey.select({ lat: 40.7, lon: -120.2 }); expect(select).toHaveBeenCalledWith(40.7, -120.2);
    journey.changeProfile("bicycle"); expect(calls[0]!.aborted).toBe(true);
    await settle();
    old.resolve([short]); await old.promise; await settle();
    expect(journey.selectedRoute.value).toEqual(fast);
    expect(journey.routes.value).toHaveLength(2);
    expect(journey.durationLabel.value).toContain("۷");
    journey.choose(1); expect(journey.selectedRoute.value).toEqual(short);
    journey.choose(99); expect(journey.selectedRoute.value).toEqual(short);
    scope.stop();
  });
  it("retains the exact GPS request origin even when the road route snaps to another point", async () => {
    const { journey, fix, scope } = setup();
    const origin = { lat: 38.5004, lon: -120.2003, accuracy: 8 };
    fix.value = origin;
    journey.select({ lat: 40, lon: -120 }); await settle();
    expect(journey.plannedFrom.value).toEqual({ lat: origin.lat, lon: origin.lon });
    expect(journey.routePoints.value[0]).not.toEqual([origin.lon, origin.lat]);
    journey.clear();
    expect(journey.plannedFrom.value).toBeNull();
    scope.stop();
  });
  it("waits for a GPS fix, retries on first fix, and distinguishes no route and invalid geometry", async () => {
    const get = vi.fn().mockRejectedValueOnce(new Error("NO_ROUTE")).mockResolvedValueOnce([{ ...short, polyline: "invalid!" }]);
    const { journey, fix, scope } = setup(get);
    fix.value = null; journey.select({ lat: 40, lon: -120 }); expect(get).not.toHaveBeenCalled();
    fix.value = { lat: 39, lon: -120, accuracy: 5 }; await settle();
    expect(journey.error.value).toContain("مسیری پیدا نشد");
    await journey.findRoutes(); expect(journey.error.value).toContain("مسیر قابل‌اعتماد");
    expect(journey.routes.value).toEqual([]); scope.stop();
  });
  it("tracks live fixes on a pitched map without sharing, detects accurate arrival, and stops on permission loss", async () => {
    const { journey, follow, fix, gpsError, level, scope } = setup();
    journey.select({ lat: 38.505, lon: -120.2 }); await settle();
    expect(journey.start()).toBe(true);
    expect(follow).toHaveBeenCalled(); expect(follow.mock.lastCall?.[0].pitch).toBeGreaterThanOrEqual(50);
    fix.value = { lat: 38.505, lon: -120.2, accuracy: 100 }; expect(journey.navigating.value).toBe(true);
    fix.value = { lat: 38.505, lon: -120.2, accuracy: 5 };
    expect(journey.arrived.value).toBe(true); expect(journey.sheetOpen.value).toBe(true); expect(level).toHaveBeenCalledTimes(1);
    fix.value = { lat: 38.5, lon: -120.2, accuracy: 8 };
    journey.select({ lat: 40, lon: -120 }); await settle();
    expect(journey.start()).toBe(true); gpsError.value = "دسترسی مکان قطع شد";
    expect(journey.navigating.value).toBe(false); expect(journey.error.value).toContain("دسترسی");
    scope.stop();
  });
  it("can remove the destination immediately while its first route is still loading", async () => {
    const pending = deferred<RouteChoice[]>();
    const get = vi.fn((_from: unknown, _to: unknown, _mode: TransportProfile, _signal?: AbortSignal) => pending.promise);
    const { journey, scope } = setup(get);
    journey.select({ lat: 40, lon: -120 });
    expect(journey.loading.value).toBe(true);
    journey.clear();
    expect(get.mock.calls[0]?.[3]?.aborted).toBe(true);
    pending.resolve([fast]); await pending.promise; await settle();
    expect(journey.point.value).toBeNull();
    expect(journey.selectedRoute.value).toBeNull();
    expect(journey.routesVisible.value).toBe(false);
    scope.stop();
  });
  it("removes an active route, markers' source state and any pending reroute without reviving them", async () => {
    const pending = deferred<RouteChoice[]>();
    const get = vi.fn().mockResolvedValueOnce([fast]).mockImplementationOnce(() => pending.promise);
    const { journey, fix, level, scope } = setup(get);
    const clock = vi.spyOn(Date, "now"); clock.mockReturnValue(100_000);
    try {
      journey.select({ lat: 40, lon: -120 }); await settle();
      expect(journey.start()).toBe(true);
      fix.value = { lat: 38.5, lon: -120.21, accuracy: 8 };
      clock.mockReturnValue(103_000);
      fix.value = { lat: 38.5001, lon: -120.2101, accuracy: 8 };
      expect(journey.replanning.value).toBe(true);
      journey.clear();
      expect(get.mock.calls[1]?.[3].aborted).toBe(true);
      expect(level).toHaveBeenCalledTimes(1);
      expect(journey.point.value).toBeNull();
      expect(journey.routes.value).toEqual([]);
      expect(journey.routesVisible.value).toBe(false);
      expect(journey.sheetOpen.value).toBe(false);
      expect(journey.navigating.value).toBe(false);
      expect(journey.rerouteMessage.value).toBeNull();
      pending.resolve([fast]); await pending.promise; await settle();
      expect(journey.point.value).toBeNull();
      expect(journey.routes.value).toEqual([]);
    } finally { clock.mockRestore(); scope.stop(); }
  });
  it("clears aborted work and private data on account change or disposal", async () => {
    const pending = deferred<RouteChoice[]>(); let signal!: AbortSignal;
    const { journey, owner, close, scope } = setup(async (_from, _to, _mode, s) => { signal = s!; return pending.promise; });
    journey.select({ lat: 40, lon: -120 }); owner.value = null;
    expect(signal.aborted).toBe(true); expect(journey.point.value).toBeNull(); expect(journey.routes.value).toEqual([]);
    pending.resolve([fast]); await pending.promise; await settle(); expect(journey.routes.value).toEqual([]);
    expect(close).toHaveBeenCalled(); scope.stop();
  });
  it("waits for a precise fix and refuses to navigate a route planned from an old position", async () => {
    const get = vi.fn(async () => [fast]);
    const { journey, fix, scope } = setup(get);
    fix.value = { lat: 38.5, lon: -120.2, accuracy: 500 };
    journey.select({ lat: 40, lon: -120 }); expect(get).not.toHaveBeenCalled();
    expect(journey.error.value).toContain("دقت کافی");
    fix.value = { lat: 38.5, lon: -120.2, accuracy: 12 };
    await settle(); expect(get).toHaveBeenCalledTimes(1);
    fix.value = { lat: 38.5, lon: -120.2, accuracy: 90 };
    expect(journey.start()).toBe(false); expect(journey.error.value).toContain("دقت موقعیت");
    fix.value = { lat: 38.51, lon: -120.2, accuracy: 8 };
    expect(journey.start()).toBe(false);
    await settle(); expect(get).toHaveBeenCalledTimes(2);
    expect(journey.start()).toBe(true);
    scope.stop();
  });
  it("uses a selected search result's trusted title and address without a redundant reverse lookup", async () => {
    const { journey, select, close, scope } = setup();
    journey.select({ lat: 40, lon: -120 }, { ...poi, name: "  میدان آزادی  ", address: "  تهران، میدان آزادی  " });
    await settle();
    expect(journey.sheetOpen.value).toBe(true);
    expect(journey.title.value).toBe("میدان آزادی");
    expect(journey.address.value).toBe("تهران، میدان آزادی");
    expect(select).not.toHaveBeenCalled();
    journey.changeProfile("foot"); await settle();
    expect(journey.title.value).toBe("میدان آزادی");
    journey.clear();
    expect(journey.knownPlace.value).toBeNull();
    expect(journey.address.value).toBeNull();
    journey.select({ lat: 39, lon: -121 });
    expect(select).toHaveBeenCalledWith(39, -121);
    expect(journey.title.value).toBe("نقطهٔ انتخاب‌شده");
    expect(close).toHaveBeenCalled();
    scope.stop();
  });
  it("retains a selected POI's full details after search refresh, but clears them on new selection or logout", async () => {
    const { journey, owner, select, scope } = setup();
    const searchList = ref<GeocodeResult[]>([poi]);
    journey.select({ lat: poi.lat, lon: poi.lon }, searchList.value[0]);
    searchList.value = []; // Viewport/search replacement must not remove the selected route's POI details.
    expect(journey.knownPlace.value?.placeId).toBe("poi-azadi");
    expect(journey.knownPlace.value?.type).toBe("میدان");
    expect(journey.address.value).toBe(poi.address);
    expect(select).not.toHaveBeenCalled();
    journey.select({ lat: 38.51, lon: -120.1 });
    expect(journey.knownPlace.value).toBeNull();
    journey.select({ lat: poi.lat, lon: poi.lon }, poi);
    owner.value = null;
    expect(journey.point.value).toBeNull();
    expect(journey.knownPlace.value).toBeNull();
    scope.stop();
  });
  it("keeps valid route alternatives when another candidate has corrupt geometry", async () => {
    const { journey, scope } = setup(async () => [{ ...short, polyline: "invalid!" }, fast]);
    journey.select({ lat: poi.lat, lon: poi.lon });
    await settle();
    expect(journey.error.value).toBeNull();
    expect(journey.routes.value).toEqual([fast]);
    expect(journey.selectedRoute.value).toEqual(fast);
    scope.stop();
  });
  it("replans instead of showing an obsolete origin when GPS moves during or after a request", async () => {
    const first = deferred<RouteChoice[]>(), second = deferred<RouteChoice[]>();
    const get = vi.fn().mockImplementationOnce(() => first.promise).mockImplementationOnce(() => second.promise)
      .mockResolvedValue([fast]);
    const { journey, fix, scope } = setup(get);
    journey.select({ lat: 40, lon: -120 });
    fix.value = { lat: 38.51, lon: -120.2, accuracy: 8 }; // More than 150 m during the first request.
    first.resolve([fast]); await first.promise; await settle();
    expect(get).toHaveBeenCalledTimes(2);
    expect(journey.routes.value).toEqual([]); // Do not flash the old estimate.
    expect(get.mock.calls[1]?.[0]).toEqual({ lat: 38.51, lon: -120.2 });
    second.resolve([fast]); await second.promise; await settle();
    expect(journey.routes.value).toEqual([fast]);
    fix.value = { lat: 38.52, lon: -120.2, accuracy: 8 };
    await settle();
    expect(get).toHaveBeenCalledTimes(3);
    expect(get.mock.calls[2]?.[0]).toEqual({ lat: 38.52, lon: -120.2 });
    scope.stop();
  });
  it("retries an old-origin routing failure against the latest GPS position", async () => {
    const pending = deferred<RouteChoice[]>();
    const get = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue([fast]);
    const { journey, fix, scope } = setup(get);
    journey.select({ lat: 40, lon: -120 });
    fix.value = { lat: 38.51, lon: -120.2, accuracy: 8 };
    pending.reject(new Error("NO_ROUTE"));
    await pending.promise.catch(() => {}); await settle();
    expect(get).toHaveBeenCalledTimes(2);
    expect(journey.error.value).toBeNull();
    expect(journey.routes.value).toEqual([fast]);
    scope.stop();
  });
  it("discards a route that resolves after GPS disappears, then retries when a precise fix returns", async () => {
    const pending = deferred<RouteChoice[]>();
    const get = vi.fn().mockImplementationOnce(() => pending.promise).mockResolvedValue([fast]);
    const { journey, fix, scope } = setup(get);
    journey.select({ lat: 40, lon: -120 });
    fix.value = null;
    pending.resolve([fast]); await pending.promise; await settle();
    expect(journey.routes.value).toEqual([]);
    expect(journey.error.value).toContain("GPS");
    fix.value = { lat: 38.51, lon: -120.2, accuracy: 9 };
    await settle();
    expect(get).toHaveBeenCalledTimes(2);
    expect(journey.routes.value).toEqual([fast]);
    scope.stop();
  });
  it("does not follow or display a misleading remaining distance for a coarse navigation fix", async () => {
    const { journey, follow, fix, scope } = setup();
    journey.select({ lat: 38.505, lon: -120.2 }); await settle();
    expect(journey.start()).toBe(true);
    const followed = follow.mock.calls.length;
    fix.value = { lat: 40, lon: -121, accuracy: 400 };
    expect(journey.navigating.value).toBe(true);
    expect(journey.remaining.value).toBeNull();
    expect(follow).toHaveBeenCalledTimes(followed);
    fix.value = null; expect(journey.remaining.value).toBeNull();
    fix.value = { lat: 38.501, lon: -120.2, accuracy: 7 };
    expect(journey.remaining.value).toBeGreaterThan(0);
    scope.stop();
  });
  it("starts with the default car route and pauses guidance for safe mode/route editing", async () => {
    const get = vi.fn(async (_from: unknown, _to: unknown, _profile: TransportProfile) => [short, fast]);
    const { journey, scope, level } = setup(get);
    journey.select({ lat: 40, lon: -120 }); await settle();
    expect(journey.profile.value).toBe("car");
    expect(journey.routesVisible.value).toBe(false);
    expect(journey.start()).toBe(true);
    expect(journey.routesVisible.value).toBe(true);
    journey.editNavigation();
    expect(journey.navigating.value).toBe(false);
    expect(journey.sheetOpen.value).toBe(true);
    expect(level).toHaveBeenCalledTimes(1);
    journey.choose(1); expect(journey.selectedRoute.value).toEqual(short);
    journey.changeProfile("foot"); await settle();
    expect(get.mock.lastCall?.[2]).toBe("foot");
    expect(journey.start()).toBe(true);
    scope.stop();
  });
  it("ignores drift and reroutes once after two reliable off-route fixes, with an audible alert", async () => {
    const second = deferred<RouteChoice[]>();
    const get = vi.fn().mockResolvedValueOnce([fast]).mockImplementationOnce(() => second.promise);
    const { journey, fix, alert, scope } = setup(get);
    const clock = vi.spyOn(Date, "now"); clock.mockReturnValue(100_000);
    try {
      journey.select({ lat: 40, lon: -120 }); await settle();
      expect(journey.start()).toBe(true);
      fix.value = { lat: 38.5, lon: -120.2, accuracy: 300 };
      expect(alert).not.toHaveBeenCalled();
      clock.mockReturnValue(101_000);
      fix.value = { lat: 38.5, lon: -120.21, accuracy: 8 }; // First good fix, no alert.
      expect(alert).not.toHaveBeenCalled();
      clock.mockReturnValue(103_100);
      fix.value = { lat: 38.5001, lon: -120.2101, accuracy: 8 };
      expect(alert).toHaveBeenCalledTimes(1);
      expect(get).toHaveBeenCalledTimes(2);
      expect(journey.replanning.value).toBe(true);
      expect(journey.remaining.value).toBeNull();
      expect(journey.rerouteMessage.value).toContain("در حال محاسبه");
      journey.stop(); // Stop must cancel and silence an in-flight reply.
      expect(journey.selectedRoute.value).toBeNull(); // Old off-route line must not be resumed.
      expect(journey.error.value).toContain("مسیر پیشین معتبر نیست");
      expect(get.mock.calls[1]?.[3].aborted).toBe(true);
      second.resolve([fast]); await second.promise; await nextTick();
      expect(journey.navigating.value).toBe(false);
      expect(alert).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); scope.stop(); }
  });
  it("replaces the stale route with the latest GPS-origin route without replaying the alert", async () => {
    const pending = deferred<RouteChoice[]>();
    const get = vi.fn().mockResolvedValueOnce([short]).mockImplementationOnce(() => pending.promise);
    const { journey, fix, follow, alert, scope } = setup(get);
    const clock = vi.spyOn(Date, "now"); clock.mockReturnValue(100_000);
    try {
      journey.select({ lat: 40, lon: -120 }); await settle();
      expect(journey.start()).toBe(true);
      fix.value = { lat: 38.5, lon: -120.21, accuracy: 8 };
      clock.mockReturnValue(103_000);
      fix.value = { lat: 38.5001, lon: -120.2101, accuracy: 8 };
      expect(journey.selectedRoute.value).toEqual(short); // Keep context, but do not follow the old route.
      expect(journey.replanning.value).toBe(true);
      const beforeNewBearing = follow.mock.calls.length;
      pending.resolve([fast]); await pending.promise; await settle();
      expect(journey.selectedRoute.value).toEqual(fast);
      expect(journey.replanning.value).toBe(false);
      expect(journey.navigating.value).toBe(true);
      expect(follow.mock.calls.length).toBeGreaterThan(beforeNewBearing);
      expect(journey.rerouteMessage.value).toContain("مسیر تازه");
      expect(get.mock.calls[1]?.[0]).toEqual({ lat: 38.5001, lon: -120.2101 });
      expect(alert).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); scope.stop(); }
  });
  it("fails safely when rerouting cannot produce a valid path", async () => {
    const get = vi.fn().mockResolvedValueOnce([fast]).mockRejectedValueOnce(new Error("NO_ROUTE"));
    const { journey, fix, scope } = setup(get);
    const clock = vi.spyOn(Date, "now"); clock.mockReturnValue(100_000);
    try {
      journey.select({ lat: 40, lon: -120 }); await settle();
      expect(journey.start()).toBe(true);
      fix.value = { lat: 38.5, lon: -120.21, accuracy: 8 };
      clock.mockReturnValue(103_000);
      fix.value = { lat: 38.5001, lon: -120.2101, accuracy: 8 };
      await settle();
      expect(journey.navigating.value).toBe(false);
      expect(journey.sheetOpen.value).toBe(true);
      expect(journey.error.value).toContain("راهبری متوقف شد");
      expect(journey.selectedRoute.value).toBeNull(); // Unsafe stale route must not be startable.
    } finally { clock.mockRestore(); scope.stop(); }
  });
  it("does not publish a reroute from a coarse GPS fix; waits for precision and replans", async () => {
    const pending = deferred<RouteChoice[]>();
    const get = vi.fn().mockResolvedValueOnce([short]).mockImplementationOnce(() => pending.promise).mockResolvedValue([fast]);
    const { journey, fix, follow, alert, scope } = setup(get);
    const clock = vi.spyOn(Date, "now"); clock.mockReturnValue(100_000);
    try {
      journey.select({ lat: 40, lon: -120 }); await settle();
      expect(journey.start()).toBe(true);
      fix.value = { lat: 38.5, lon: -120.21, accuracy: 8 };
      clock.mockReturnValue(103_000);
      fix.value = { lat: 38.5001, lon: -120.2101, accuracy: 8 };
      const followed = follow.mock.calls.length;
      fix.value = { lat: 38.5002, lon: -120.2101, accuracy: 110 };
      pending.resolve([fast]); await pending.promise; await settle();
      expect(journey.selectedRoute.value).toEqual(short);
      expect(journey.remaining.value).toBeNull();
      expect(journey.rerouteWaitingForFix.value).toBe(true);
      expect(journey.replanning.value).toBe(false);
      expect(follow).toHaveBeenCalledTimes(followed);
      fix.value = { lat: 38.5002, lon: -120.2101, accuracy: 8 };
      await settle();
      expect(get).toHaveBeenCalledTimes(3);
      expect(journey.selectedRoute.value).toEqual(fast);
      expect(journey.rerouteWaitingForFix.value).toBe(false);
      expect(alert).toHaveBeenCalledTimes(1);
    } finally { clock.mockRestore(); scope.stop(); }
  });
  it("waits for precise GPS even if an obsolete reroute request fails", async () => {
    const pending = deferred<RouteChoice[]>();
    const get = vi.fn().mockResolvedValueOnce([short]).mockImplementationOnce(() => pending.promise).mockResolvedValue([fast]);
    const { journey, fix, scope } = setup(get);
    const clock = vi.spyOn(Date, "now"); clock.mockReturnValue(100_000);
    try {
      journey.select({ lat: 40, lon: -120 }); await settle();
      expect(journey.start()).toBe(true);
      fix.value = { lat: 38.5, lon: -120.21, accuracy: 8 };
      clock.mockReturnValue(103_000);
      fix.value = { lat: 38.5001, lon: -120.2101, accuracy: 8 };
      fix.value = null;
      pending.reject(new Error("NO_ROUTE")); await pending.promise.catch(() => {}); await settle();
      expect(journey.navigating.value).toBe(true);
      expect(journey.rerouteWaitingForFix.value).toBe(true);
      expect(journey.error.value).toBeNull();
      fix.value = { lat: 38.5002, lon: -120.2101, accuracy: 8 };
      await settle();
      expect(get).toHaveBeenCalledTimes(3);
      expect(journey.selectedRoute.value).toEqual(fast);
    } finally { clock.mockRestore(); scope.stop(); }
  });
  it("times out a stalled initial route request so planning can be retried", async () => {
    vi.useFakeTimers();
    const { journey, scope } = setup(() => new Promise(() => {}));
    try {
      journey.select({ lat: 40, lon: -120 });
      expect(journey.loading.value).toBe(true);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(journey.loading.value).toBe(false);
      expect(journey.error.value).toContain("سرور مسیر بیش از ۱۵ ثانیه");
    } finally { scope.stop(); vi.useRealTimers(); }
  });
  it("stops unsafe guidance if the rerouting service never responds", async () => {
    vi.useFakeTimers(); vi.setSystemTime(100_000);
    const get = vi.fn().mockResolvedValueOnce([fast]).mockImplementationOnce(() => new Promise(() => {}));
    const { journey, fix, scope } = setup(get);
    try {
      journey.select({ lat: 40, lon: -120 }); await settle();
      expect(journey.start()).toBe(true);
      fix.value = { lat: 38.5, lon: -120.21, accuracy: 8 };
      vi.setSystemTime(103_000);
      fix.value = { lat: 38.5001, lon: -120.2101, accuracy: 8 };
      expect(journey.replanning.value).toBe(true);
      await vi.advanceTimersByTimeAsync(15_000);
      expect(journey.navigating.value).toBe(false);
      expect(journey.selectedRoute.value).toBeNull();
      expect(journey.error.value).toContain("راهبری متوقف شد");
    } finally { scope.stop(); vi.useRealTimers(); }
  });
  it("recognizes accurate arrival during rerouting and cancels the obsolete request", async () => {
    const pending = deferred<RouteChoice[]>();
    const get = vi.fn().mockResolvedValueOnce([fast]).mockImplementationOnce(() => pending.promise);
    const { journey, fix, level, scope } = setup(get);
    const clock = vi.spyOn(Date, "now"); clock.mockReturnValue(100_000);
    try {
      journey.select({ lat: 40, lon: -120 }); await settle();
      expect(journey.start()).toBe(true);
      fix.value = { lat: 38.5, lon: -120.21, accuracy: 8 };
      clock.mockReturnValue(103_000);
      fix.value = { lat: 38.5001, lon: -120.2101, accuracy: 8 };
      expect(journey.replanning.value).toBe(true);
      fix.value = { lat: 40, lon: -120, accuracy: 5 };
      expect(journey.arrived.value).toBe(true);
      expect(journey.navigating.value).toBe(false);
      expect(journey.sheetOpen.value).toBe(true);
      expect(get.mock.calls[1]?.[3].aborted).toBe(true);
      pending.resolve([fast]); await pending.promise; await settle();
      expect(level).toHaveBeenCalledTimes(1);
      expect(journey.rerouteMessage.value).toBeNull();
    } finally { clock.mockRestore(); scope.stop(); }
  });
  it("respects the selected transport camera pitch, including flat walking guidance", async () => {
    const { journey, follow, scope } = setup();
    journey.select({ lat: 40, lon: -120 }); await settle();
    journey.changeProfile("foot"); await settle();
    expect(journey.start()).toBe(true);
    expect(follow.mock.lastCall?.[0].pitch).toBe(0);
    scope.stop();
  });
  it("can restore the selected-mode camera immediately without fabricating a GPS update", async () => {
    const { journey, follow, fix, scope } = setup();
    journey.select({ lat: 40, lon: -120 }); await settle();
    expect(journey.start()).toBe(true);
    follow.mockClear();
    journey.focus();
    expect(follow).toHaveBeenCalledTimes(1);
    fix.value = { lat: 38.5, lon: -120.2, accuracy: 180 };
    follow.mockClear(); journey.focus();
    expect(follow).not.toHaveBeenCalled();
    journey.stop(); journey.focus();
    expect(follow).not.toHaveBeenCalled();
    scope.stop();
  });
  it("calculates proximity in metres and rejects invalid point selection", () => {
    expect(pointDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 0 })).toBe(0);
    expect(pointDistance({ lat: 0, lon: 0 }, { lat: 0, lon: 1 })).toBeGreaterThan(110_000);
    const { journey, scope } = setup(); journey.select({ lat: 99, lon: 0 }); expect(journey.point.value).toBeNull(); scope.stop();
  });
});
