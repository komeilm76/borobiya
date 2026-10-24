import { ref, nextTick } from "vue";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { useRouteNavigation, type NavigationRuntime } from "./use-route-navigation";

const route = { distance_m: 1420, duration_s: 420, polyline: "_p~iF~ps|U_ulLnnqC" };
const mission = "50000000-0000-4000-8000-000000000005";

describe("foreground mission navigation (T3.5.6)", () => {
  it("wires the active mission map to north-up reset on navigation exit", () => {
    const view = readFileSync(new URL("../views/_user/UserMissionView.vue", import.meta.url), "utf8");
    expect(view).toContain('routeMap?.easeTo({ pitch: 0, bearing: 0, duration: 450 })');
    expect(view).toContain('@click="navigation.stop()"');
    expect(view).toContain('navigation.stop();'); // also closes on mission/account/unmount
  });

  it("starts only with an owned selected route, follows at most once per second, and clears watch on stop", () => {
    let onFix!: (fix: { lat: number; lon: number }) => void;
    let now = 1000;
    const clear = vi.fn();
    const subscribe = vi.fn((fix: typeof onFix) => { onFix = fix; return clear; });
    const runtime: NavigationRuntime = { subscribe, now: () => now };
    const camera = vi.fn();
    const selected = ref<typeof route | null>(route);
    const nav = useRouteNavigation(ref("rescuer"), ref(mission), selected, ref("car"), camera, runtime);
    expect(nav.start()).toBe(true);
    expect(nav.start()).toBe(false);
    onFix({ lat: 38.5, lon: -120.2 });
    onFix({ lat: 38.51, lon: -120.19 });
    expect(camera).toHaveBeenCalledTimes(1);
    expect(camera.mock.calls[0]?.[0]).toMatchObject({ pitch: 60, zoom: 17, center: [-120.2, 38.5] });
    now += 1001;
    onFix({ lat: 38.51, lon: -120.19 });
    expect(camera).toHaveBeenCalledTimes(2);
    onFix({ lat: 200, lon: 2 });
    expect(camera).toHaveBeenCalledTimes(2);
    nav.stop();
    expect(clear).toHaveBeenCalledOnce();
    onFix({ lat: 38.52, lon: -120.18 });
    expect(camera).toHaveBeenCalledTimes(2);
    expect(nav.fix.value).toBeNull();
    selected.value = null;
    expect(nav.start()).toBe(false);
  });

  it("stops on mission/owner/route/profile changes and on permission denial", async () => {
    let fix!: (point: { lat: number; lon: number }) => void;
    let fail!: (denied: boolean) => void;
    const clear = vi.fn();
    const runtime: NavigationRuntime = {
      subscribe: (onFix, onError) => { fix = onFix; fail = onError; return clear; }, now: () => 1000
    };
    const owner = ref<string | null>("rescuer");
    const missionId = ref<string | null>(mission);
    const selected = ref<typeof route | null>(route);
    const profile = ref<"car" | "foot" | "bicycle">("car");
    const camera = vi.fn();
    const nav = useRouteNavigation(owner, missionId, selected, profile, camera, runtime);
    expect(nav.start()).toBe(true);
    profile.value = "foot";
    fix({ lat: 38.5, lon: -120.2 }); // event arriving before Vue's watcher flush is guarded too
    await nextTick();
    expect(nav.active.value).toBe(false);
    expect(camera).not.toHaveBeenCalled();
    expect(nav.start()).toBe(true);
    fail(true);
    expect(nav.error.value).toContain("متوقف");
    expect(nav.active.value).toBe(false);
    expect(nav.start()).toBe(true);
    missionId.value = null;
    await nextTick();
    expect(nav.active.value).toBe(false);
    expect(clear).toHaveBeenCalledTimes(3);
  });

  it("ignores queued callbacks from a stopped watch after a fresh navigation start", () => {
    const fixes: Array<(fix: { lat: number; lon: number }) => void> = [];
    const failures: Array<(denied: boolean) => void> = [];
    const clear = vi.fn();
    const camera = vi.fn();
    const nav = useRouteNavigation(ref("rescuer"), ref(mission), ref(route), ref("car"), camera, {
      subscribe: (onFix, onError) => { fixes.push(onFix); failures.push(onError); return clear; }, now: () => 1000
    });
    expect(nav.start()).toBe(true);
    nav.stop();
    expect(nav.start()).toBe(true);
    fixes[0]?.({ lat: 38.5, lon: -120.2 });
    failures[0]?.(true);
    expect(nav.active.value).toBe(true);
    expect(nav.error.value).toBeNull();
    fixes[1]?.({ lat: 38.51, lon: -120.19 });
    expect(camera).toHaveBeenCalledOnce();
    nav.stop();
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("returns to a level north-up camera once on exit, denial, and mission change", async () => {
    let deny!: (denied: boolean) => void;
    const clear = vi.fn();
    const reset = vi.fn();
    const owner = ref<string | null>("rescuer");
    const missionId = ref<string | null>(mission);
    const nav = useRouteNavigation(owner, missionId, ref(route), ref("car"), vi.fn(), {
      subscribe: (_fix, onError) => { deny = onError; return clear; }, now: () => 1000
    }, reset);
    nav.stop(); // never started: no camera movement
    expect(reset).not.toHaveBeenCalled();
    expect(nav.start()).toBe(true);
    expect(reset).not.toHaveBeenCalled();
    nav.stop();
    expect(reset).toHaveBeenCalledTimes(1);
    nav.stop(); // repeated stop is idempotent
    expect(reset).toHaveBeenCalledTimes(1);
    expect(nav.start()).toBe(true);
    deny(true);
    expect(reset).toHaveBeenCalledTimes(2);
    expect(nav.start()).toBe(true);
    missionId.value = null;
    await nextTick();
    expect(reset).toHaveBeenCalledTimes(3);
    expect(clear).toHaveBeenCalledTimes(3);
  });

  it("does not let a disposed map's camera error mask GPS cleanup", () => {
    const clear = vi.fn();
    const nav = useRouteNavigation(ref("rescuer"), ref(mission), ref(route), ref("car"), vi.fn(), {
      subscribe: () => clear, now: () => 1000
    }, () => { throw new Error("map removed"); });
    expect(nav.start()).toBe(true);
    expect(() => nav.stop()).not.toThrow();
    expect(clear).toHaveBeenCalledOnce();
    expect(nav.active.value).toBe(false);
    expect(nav.fix.value).toBeNull();
  });

  it("clears the GPS watch when subscription reports denial synchronously", () => {
    const clear = vi.fn();
    const nav = useRouteNavigation(ref("rescuer"), ref(mission), ref(route), ref("car"), vi.fn(), {
      subscribe: (_onFix, onError) => { onError(true); return clear; }, now: () => 1000
    });
    expect(nav.start()).toBe(false);
    expect(nav.active.value).toBe(false);
    expect(clear).toHaveBeenCalledOnce();
  });

  it("reports missing GPS support without claiming navigation started", () => {
    const nav = useRouteNavigation(ref("rescuer"), ref(mission), ref(route), ref("car"), vi.fn(), {
      subscribe: () => { throw new Error("unavailable"); }, now: () => 0
    });
    expect(nav.start()).toBe(false);
    expect(nav.active.value).toBe(false);
    expect(nav.error.value).toContain("در دسترس نیست");
  });
});
