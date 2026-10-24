import { ref } from "vue";
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
    picker.reset();
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
    active.reset();
    oldRoute.resolve([route]);
    await pendingRoute;
    expect(active.routes.value).toEqual([]);
    expect(active.target.value).toBeNull();
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
