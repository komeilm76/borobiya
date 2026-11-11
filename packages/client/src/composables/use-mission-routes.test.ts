import { readFileSync } from "node:fs";
import { effectScope, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import { useMissionRoutes } from "./use-mission-routes";

const mission = "50000000-0000-4000-8000-000000000005";
const incident = { lat: 35.7, lon: 51.4 };
const from = { lat: 35.68, lon: 51.38 };
const route = { distance_m: 1450, duration_s: 320, polyline: "_p~iF~ps|U_ulLnnqC" };
const target = { missionId: mission, incident };
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}

describe("active rescuer mission route picker", () => {
  it("requires an owned target and explicit position consent, then selects validated alternatives", async () => {
    const getTarget = vi.fn(async () => target);
    const getPosition = vi.fn(async () => from);
    const getRoutes = vi.fn(async () => [route, { ...route, distance_m: 1700 }]);
    const picker = useMissionRoutes(ref("bearer"), ref("rescuer"), ref(mission), undefined,
      { getTarget, getPosition, getRoutes });
    await picker.open();
    expect(getTarget).toHaveBeenCalledWith("bearer", mission, expect.any(AbortSignal));
    expect(getPosition).not.toHaveBeenCalled();
    expect(picker.target.value).toEqual(target);
    picker.selectProfile("foot");
    await picker.findRoutes();
    expect(getRoutes).toHaveBeenCalledWith(from, incident, "foot", expect.any(AbortSignal));
    expect(picker.routes.value).toHaveLength(2);
    picker.selectRoute(1);
    expect(picker.selectedRoute.value?.distance_m).toBe(1700);
    picker.selectRoute(20);
    expect(picker.selectedIndex.value).toBe(1);
    picker.selectProfile("car");
    expect(picker.routes.value).toEqual([]);
    expect(picker.from.value).toEqual(from);
    picker.reset();
    expect(picker.target.value).toBeNull();
    expect(picker.from.value).toBeNull();
  });

  it("ignores a late private target after account switch, and a late route after logout", async () => {
    const userId = ref<string | null>("rescuer");
    const token = ref<string | null>("bearer");
    const id = ref<string | null>(mission);
    const oldTarget = deferred<typeof target>();
    const oldRoute = deferred<typeof route[]>();
    const picker = useMissionRoutes(token, userId, id, undefined, {
      getTarget: () => oldTarget.promise,
      getPosition: async () => from,
      getRoutes: () => oldRoute.promise
    });
    const pendingTarget = picker.open();
    userId.value = "someone-else";
    oldTarget.resolve(target);
    await pendingTarget;
    expect(picker.target.value).toBeNull();
    userId.value = "rescuer";
    // A new instance exercises the in-flight route path independently.
    const active = useMissionRoutes(token, userId, id, undefined, {
      getTarget: async () => target, getPosition: async () => from, getRoutes: () => oldRoute.promise
    });
    await active.open();
    const pendingRoute = active.findRoutes();
    await vi.waitFor(() => expect(active.loading.value).toBe(true));
    token.value = null;
    userId.value = null;
    oldRoute.resolve([route]);
    await pendingRoute;
    expect(active.routes.value).toEqual([]);
    expect(active.target.value).toBeNull();
  });

  it("revokes private target and route state synchronously when the mission or session disappears", async () => {
    const scope = effectScope();
    const userId = ref<string | null>("rescuer");
    const token = ref<string | null>("bearer");
    const id = ref<string | null>(mission);
    const picker = scope.run(() => useMissionRoutes(token, userId, id, undefined, {
      getTarget: async () => target,
      getPosition: async () => from,
      getRoutes: async () => [route]
    }))!;
    try {
      await picker.open();
      await picker.findRoutes();
      expect(picker.selectedRoute.value).toEqual(route);
      id.value = "another-mission";
      expect(picker.visible.value).toBe(false);
      expect(picker.target.value).toBeNull();
      expect(picker.from.value).toBeNull();
      expect(picker.routes.value).toEqual([]);
      id.value = mission;
      await picker.open();
      await picker.findRoutes();
      token.value = "refreshed-bearer";
      expect(picker.visible.value).toBe(true);
      expect(picker.selectedRoute.value).toEqual(route);
      token.value = null;
      expect(picker.visible.value).toBe(false);
      expect(picker.target.value).toBeNull();
      expect(picker.from.value).toBeNull();
      expect(picker.routes.value).toEqual([]);
    } finally { scope.stop(); }
  });

  it("drops the incident and route at a JWT session switch before the displayed profile catches up", async () => {
    const bearer = (sub: string, sessionId: string, revision = 0) =>
      `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub, sessionId, revision }))}.signature`;
    const owner = ref("rescuer");
    const token = ref(bearer("rescuer", "login-a"));
    const getTarget = vi.fn(async () => target);
    const getRoutes = vi.fn(async () => [route]);
    const scope = effectScope();
    const picker = scope.run(() => useMissionRoutes(token, owner, ref(mission), undefined, {
      getTarget, getPosition: async () => from, getRoutes
    }))!;
    try {
      await picker.open();
      await picker.findRoutes();
      expect(picker.target.value).toEqual(target);
      expect(picker.selectedRoute.value).toEqual(route);

      token.value = bearer("rescuer", "login-a", 1);
      expect(picker.target.value).toEqual(target); // Routine bearer renewal is not a new login.
      token.value = bearer("another-account", "login-b");
      expect(picker.visible.value).toBe(false);
      expect(picker.target.value).toBeNull();
      expect(picker.selectedRoute.value).toBeNull();
      await picker.open(); // Do not request an incident with a bearer for another account.
      expect(getTarget).toHaveBeenCalledTimes(1);

      token.value = bearer("rescuer", "login-b");
      await picker.open();
      await picker.findRoutes();
      expect(picker.target.value).toEqual(target);
      token.value = bearer("rescuer", "login-c");
      expect(picker.target.value).toBeNull();
      expect(picker.selectedRoute.value).toBeNull();
    } finally { scope.stop(); }
  });

  it("aborts an in-flight route when the same account signs in with a different JWT session", async () => {
    const bearer = (sessionId: string) =>
      `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ sub: "rescuer", sessionId }))}.signature`;
    const token = ref(bearer("login-a"));
    const delayed = deferred<typeof route[]>();
    let routeSignal: AbortSignal | undefined;
    const scope = effectScope();
    const picker = scope.run(() => useMissionRoutes(token, ref("rescuer"), ref(mission), undefined, {
      getTarget: async () => target,
      getPosition: async () => from,
      getRoutes: async (_from, _to, _profile, signal) => { routeSignal = signal; return delayed.promise; }
    }))!;
    try {
      await picker.open();
      const pending = picker.findRoutes();
      await vi.waitFor(() => expect(routeSignal).toBeDefined());
      token.value = bearer("login-b");
      expect(routeSignal?.aborted).toBe(true);
      expect(picker.target.value).toBeNull();
      delayed.resolve([route]);
      await pending;
      expect(picker.routes.value).toEqual([]);
    } finally { delayed.resolve([route]); scope.stop(); }
  });

  it("aborts and ignores pending private replies on account switch without requiring a view reset", async () => {
    const scope = effectScope();
    const userId = ref<string | null>("rescuer");
    const oldRoute = deferred<typeof route[]>();
    let routeSignal: AbortSignal | undefined;
    const picker = scope.run(() => useMissionRoutes(ref("bearer"), userId, ref(mission), undefined, {
      getTarget: async () => target,
      getPosition: async () => from,
      getRoutes: async (_from, _to, _profile, signal) => { routeSignal = signal; return oldRoute.promise; }
    }))!;
    try {
      await picker.open();
      const pending = picker.findRoutes();
      await vi.waitFor(() => expect(routeSignal).toBeDefined());
      userId.value = "different-rescuer";
      expect(routeSignal?.aborted).toBe(true);
      expect(picker.target.value).toBeNull();
      expect(picker.from.value).toBeNull();
      expect(picker.visible.value).toBe(false);
      oldRoute.resolve([route]);
      await pending;
      expect(picker.routes.value).toEqual([]);
    } finally { oldRoute.resolve([route]); scope.stop(); }
  });

  it("does not route from an old fix after an explicit GPS refresh is denied", async () => {
    const updated = { lat: 35.69, lon: 51.39 };
    const getPosition = vi.fn().mockResolvedValueOnce(from)
      .mockRejectedValueOnce(new Error("permission denied"))
      .mockResolvedValueOnce(updated);
    const getRoutes = vi.fn(async () => [route]);
    const picker = useMissionRoutes(ref("bearer"), ref("rescuer"), ref(mission), undefined,
      { getTarget: async () => target, getPosition, getRoutes });
    await picker.open();
    await picker.findRoutes();
    expect(picker.from.value).toEqual(from);
    await picker.findRoutes(true);
    expect(picker.from.value).toBeNull();
    expect(picker.routes.value).toEqual([]);
    expect(picker.error.value).toContain("مکان‌یابی");
    await picker.findRoutes();
    expect(getPosition).toHaveBeenCalledTimes(3);
    expect(getRoutes).toHaveBeenCalledTimes(2);
    expect(getRoutes).toHaveBeenLastCalledWith(updated, incident, "car", expect.any(AbortSignal));
  });

  it("handles denied location, gateway failure, no route and invalid polyline without showing misleading choices", async () => {
    const getPosition = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(from);
    const getRoutes = vi.fn().mockRejectedValueOnce(new Error("NO_ROUTE"))
      .mockResolvedValueOnce([{ ...route, polyline: "?" }]);
    const picker = useMissionRoutes(ref("bearer"), ref("rescuer"), ref(mission), undefined, {
      getTarget: async () => target, getPosition, getRoutes
    });
    await picker.open();
    await picker.findRoutes();
    expect(picker.error.value).toContain("مکان‌یابی");
    await picker.findRoutes();
    expect(picker.error.value).toContain("مسیر قابل‌استفاده");
    await picker.findRoutes();
    expect(picker.routes.value).toEqual([]);
    expect(picker.error.value).toContain("پاسخ معتبری");
  });
});

describe("waypoint editing", () => {
  it("clears the plan and GPS origin without deleting the private incident or its session", async () => {
    const getPosition = vi.fn(async () => from);
    const getRoutes = vi.fn(async () => [route]);
    const picker = useMissionRoutes(ref("bearer"), ref("rescuer"), ref(mission), undefined,
      { getTarget: async () => target, getPosition, getRoutes });
    await picker.open();
    picker.selectProfile("foot");
    await picker.findRoutes();
    picker.addWaypoint({ lat: 35.69, lon: 51.39 });
    picker.clearPlan();
    expect(picker.visible.value).toBe(true);
    expect(picker.target.value).toEqual(target);
    expect(picker.profile.value).toBe("foot");
    expect(picker.from.value).toBeNull();
    expect(picker.via.value).toEqual([]);
    expect(picker.selectedRoute.value).toBeNull();
    await picker.findRoutes();
    expect(getPosition).toHaveBeenCalledTimes(2); // New plan requires fresh GPS consent.
    expect(getRoutes).toHaveBeenCalledTimes(2);
  });
  it("clears a pending route reply without allowing it to repaint the incident map", async () => {
    const pending = deferred<typeof route[]>();
    const picker = useMissionRoutes(ref("bearer"), ref("rescuer"), ref(mission), undefined, {
      getTarget: async () => target, getPosition: async () => from, getRoutes: () => pending.promise
    });
    await picker.open();
    const request = picker.findRoutes();
    await vi.waitFor(() => expect(picker.loading.value).toBe(true));
    picker.clearPlan();
    pending.resolve([route]);
    await request;
    expect(picker.target.value).toEqual(target);
    expect(picker.routes.value).toEqual([]);
    expect(picker.loading.value).toBe(false);
  });
  it("rejects invalid map coordinates without throwing or clearing a valid plan", async () => {
    const picker = useMissionRoutes(ref("bearer"), ref("rescuer"), ref(mission), undefined, {
      getTarget: async () => target, getPosition: async () => from, getRoutes: async () => [route]
    });
    await picker.open();
    await picker.findRoutes();
    expect(picker.addWaypoint({ lat: NaN, lon: 51.4 })).toBe(false);
    expect(picker.addWaypoint({ lat: 35.7, lon: 540 })).toBe(false);
    expect(picker.routes.value).toEqual([route]);
    expect(picker.addWaypoint({ lat: 35.69, lon: 51.39 })).toBe(true);
    expect(picker.routes.value).toEqual([]);
    expect(picker.via.value).toEqual([{ lat: 35.69, lon: 51.39 }]);
  });
  it("discards a late invalid route without decoding it after a mission switch", async () => {
    const pending = deferred<typeof route[]>();
    const id = ref<string | null>(mission);
    const picker = useMissionRoutes(ref("bearer"), ref("rescuer"), id, undefined, {
      getTarget: async () => target, getPosition: async () => from, getRoutes: () => pending.promise
    });
    await picker.open();
    const request = picker.findRoutes();
    await vi.waitFor(() => expect(picker.from.value).toEqual(from));
    id.value = null;
    pending.resolve([{ ...route, polyline: "?" }]);
    await request;
    expect(picker.routes.value).toEqual([]);
    expect(picker.error.value).toBeNull();
  });
  it("reorders by drag/button index, optimizes only via points, and invalidates displayed routes on every edit", async () => {
    const first = { lat: 35.69, lon: 51.39 };
    const second = { lat: 35.695, lon: 51.395 };
    const getPlan = vi.fn(async () => ({ routes: [route], order: [0, 2, 1, 3] }));
    const picker = useMissionRoutes(ref("bearer"), ref("rescuer"), ref(mission), undefined, {
      getTarget: async () => target, getPosition: async () => from, getPlan
    });
    await picker.open();
    picker.addWaypoint(first);
    picker.addWaypoint(second);
    picker.moveWaypoint(0, 1);
    expect(picker.via.value).toEqual([second, first]);
    picker.setOptimize(true);
    await picker.findRoutes();
    expect(getPlan).toHaveBeenCalledWith(from, incident, "car", [second, first], true, expect.any(AbortSignal));
    expect(picker.order.value).toEqual([0, 2, 1, 3]);
    picker.selectStep(2);
    expect(picker.step.value).toBe(2);
    picker.removeWaypoint(0);
    expect(picker.routes.value).toEqual([]);
    expect(picker.order.value).toEqual([]);
    expect(picker.step.value).toBe(0);
    picker.removeWaypoint(0);
    expect(picker.optimize.value).toBe(false);
    picker.reset();
    expect(picker.via.value).toEqual([]);
  });
  it("drops a late optimized reply when waypoint ordering or mission identity changes", async () => {
    const pending = deferred<{ routes: typeof route[]; order: number[] }>();
    const getPlan = vi.fn(() => pending.promise);
    const picker = useMissionRoutes(ref("bearer"), ref("rescuer"), ref(mission), undefined, {
      getTarget: async () => target, getPosition: async () => from, getPlan
    });
    await picker.open();
    picker.addWaypoint({ lat: 35.69, lon: 51.39 });
    const request = picker.findRoutes();
    await vi.waitFor(() => expect(getPlan).toHaveBeenCalled());
    picker.setOptimize(true);
    pending.resolve({ routes: [route], order: [0, 1, 2] });
    await request;
    expect(picker.routes.value).toEqual([]);
    expect(picker.order.value).toEqual([]);
  });
});

it("wires waypoint editing, keyboard reorder, map picking, slider, and picker cleanup without mounting Vue", () => {
  const view = readFileSync(new URL("../views/_user/UserMissionView.vue", import.meta.url), "utf8");
  for (const token of ["onRouteMapClick", 'map.on("click", onRouteMapClick)', 'map.off("click", onRouteMapClick)',
    "routing.addWaypoint", "routing.removeWaypoint", "routing.moveWaypoint", "routing.setOptimize",
    "routing.selectStep", "onWaypointDrop", "مختصات معتبر WGS84", "navigation.active.value"]) {
    expect(view).toContain(token);
  }
});
