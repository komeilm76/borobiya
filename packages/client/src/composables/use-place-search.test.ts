import { effectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeocodeResponse } from "@shared/index";
import { usePlaceSearch } from "./use-place-search";
import type { PlaceSearchScope } from "./use-place-search";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
const hit = (name: string): GeocodeResponse => [{ placeId: name, name, address: name, lon: 51, lat: 35, type: "place" }];
function mount(search: NonNullable<Parameters<typeof usePlaceSearch>[0]>["search"],
  withinBounds?: (place: GeocodeResponse[number]) => boolean) {
  const scope = effectScope();
  const api = scope.run(() => usePlaceSearch({ search, area: (searchScope: PlaceSearchScope) => ({
    bbox: searchScope === "viewport" ? "50.5,34.5,51.5,35.5" : "50,34,52,36",
    contains: withinBounds ?? (() => true)
  }) }))!;
  return { api, scope };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("place search UI decisions", () => {
  it("debounces a trimmed query, applies loaded map bounds and caps the gateway request at five", async () => {
    const search = vi.fn(async (_input: unknown, _signal?: AbortSignal) => hit("Azadi"));
    const { api, scope } = mount(search);
    api.update("A");
    await vi.advanceTimersByTimeAsync(400);
    expect(search).not.toHaveBeenCalled();
    api.update("  Az");
    await vi.advanceTimersByTimeAsync(200);
    api.update("  Azadi  ");
    await vi.advanceTimersByTimeAsync(299);
    expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]?.[0]).toEqual({ q: "Azadi", limit: 5, bbox: "50,34,52,36" });
    expect(api.results.value).toEqual(hit("Azadi"));
    expect(api.searched.value).toBe(true);
    scope.stop();
  });

  it("invalidates at the keystroke even if the aborted request resolves during debounce", async () => {
    const old = deferred<GeocodeResponse>();
    const search = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce(hit("new"));
    const { api, scope } = mount(search);
    api.update("old");
    await vi.advanceTimersByTimeAsync(300);
    const signal = search.mock.calls[0]?.[1] as AbortSignal;
    api.update("new");
    expect(signal.aborted).toBe(true);
    old.resolve(hit("old"));
    await Promise.resolve();
    expect(api.results.value).toEqual([]);
    expect(api.loading.value).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    expect(api.results.value).toEqual(hit("new"));
    scope.stop();
  });

  it("does not offer out-of-coverage hits that the clamped map cannot fly to", async () => {
    const { api, scope } = mount(async () => [...hit("outside"), ...hit("inside")],
      (place) => place.name === "inside");
    api.update("city");
    await vi.advanceTimersByTimeAsync(300);
    expect(api.results.value).toEqual(hit("inside"));
    scope.stop();
  });

  it("retains results and term while switching between multiple selected places", async () => {
    const places = [...hit("first"), ...hit("second")];
    const { api, scope } = mount(async () => places);
    api.update("square");
    await vi.advanceTimersByTimeAsync(300);
    expect(api.select(places[0]!)).toBe(true);
    expect(api.selectedPlaceId.value).toBe("first");
    expect(api.select(places[1]!)).toBe(true);
    expect(api.selectedPlaceId.value).toBe("second");
    expect(api.term.value).toBe("square");
    expect(api.results.value).toEqual(places);
    expect(api.select(hit("unlisted")[0]!)).toBe(false);
    api.update("street");
    expect(api.selectedPlaceId.value).toBeNull();
    expect(api.results.value).toEqual([]);
    scope.stop();
  });

  it("switches between all installed map coverage and the visible bbox, aborting stale replies", async () => {
    const old = deferred<GeocodeResponse>();
    const search = vi.fn().mockImplementationOnce(() => old.promise).mockResolvedValueOnce(hit("visible"))
      .mockResolvedValueOnce(hit("library"));
    const { api, scope } = mount(search);
    expect(api.scope.value).toBe("library");
    api.update("park");
    await vi.advanceTimersByTimeAsync(300);
    const signal = search.mock.calls[0]?.[1] as AbortSignal;
    await api.setScope("viewport");
    expect(signal.aborted).toBe(true);
    expect(search.mock.calls[1]?.[0]).toEqual({ q: "park", limit: 5, bbox: "50.5,34.5,51.5,35.5" });
    old.resolve(hit("stale"));
    await Promise.resolve();
    expect(api.results.value).toEqual(hit("visible"));
    await api.setScope("library");
    expect(search.mock.calls[2]?.[0]).toEqual({ q: "park", limit: 5, bbox: "50,34,52,36" });
    expect(api.results.value).toEqual(hit("library"));
    scope.stop();
  });

  it("filters against the request's bbox snapshot even if the viewport changes while loading", async () => {
    const pending = deferred<GeocodeResponse>();
    let current = "old";
    const search = vi.fn(() => pending.promise);
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => {
      const snapshot = current;
      return { bbox: "50,34,52,36", contains: (place) => place.name === snapshot };
    } }))!;
    api.update("park");
    await vi.advanceTimersByTimeAsync(300);
    current = "new";
    pending.resolve([...hit("old"), ...hit("new")]);
    await Promise.resolve();
    await Promise.resolve();
    expect(api.results.value).toEqual(hit("old"));
    scope.stop();
  });

  it("fails closed if map bounds are not available, instead of searching the whole world", async () => {
    const search = vi.fn(async () => hit("outside"));
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => null }))!;
    api.update("place");
    await vi.advanceTimersByTimeAsync(300);
    expect(search).not.toHaveBeenCalled();
    expect(api.failed.value).toBe(true);
    expect(api.results.value).toEqual([]);
    scope.stop();
  });

  it("separates empty success from failure, retries, and clears after selection/disposal", async () => {
    const late = deferred<GeocodeResponse>();
    const search = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]).mockImplementationOnce(() => late.promise);
    const { api, scope } = mount(search);
    api.update("place");
    await vi.advanceTimersByTimeAsync(300);
    expect(api.failed.value).toBe(true);
    expect(api.searched.value).toBe(false);
    await api.run();
    expect(api.failed.value).toBe(false);
    expect(api.searched.value).toBe(true);
    expect(api.results.value).toEqual([]);
    const pending = api.run();
    api.clear();
    expect(api.term.value).toBe("");
    expect(api.results.value).toEqual([]);
    late.resolve(hit("late"));
    await pending;
    expect(api.results.value).toEqual([]);
    api.update("another");
    scope.stop();
    await vi.advanceTimersByTimeAsync(400);
    expect(search).toHaveBeenCalledTimes(3);
  });
});
