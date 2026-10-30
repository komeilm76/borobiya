import { effectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeocodeResponse } from "@shared/index";
import { usePlaceSearch } from "./use-place-search";
import type { PlaceSearchScope } from "./use-place-search";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
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

  it("refreshes a visible-area search when the map bbox changes, without clearing results on selection", async () => {
    const old = deferred<GeocodeResponse>();
    const search = vi.fn().mockResolvedValueOnce(hit("first")).mockImplementationOnce(() => old.promise)
      .mockResolvedValueOnce(hit("current"));
    let bbox = "50,34,51,35";
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: (kind) => ({
      bbox: kind === "viewport" ? bbox : "50,34,52,36", contains: () => true
    }) }))!;
    api.update("park");
    await api.setScope("viewport");
    expect(search).toHaveBeenCalledTimes(1);
    expect(api.select(hit("first")[0]!)).toBe(true);
    api.refreshForViewport(); // A selected-result fly-to is filtered at the map event source.
    expect(search).toHaveBeenCalledTimes(1);
    expect(api.selectedPlaceId.value).toBe("first");
    expect(api.results.value).toEqual(hit("first"));

    bbox = "50.5,34.5,51.5,35.5";
    api.refreshForViewport();
    expect(search.mock.calls[1]?.[0]).toEqual({ q: "park", limit: 5, bbox });
    expect(api.results.value).toEqual(hit("first")); // No flash while a new viewport is loading.
    expect(api.selectedPlaceId.value).toBe("first");
    expect(api.loading.value).toBe(true);
    const signal = search.mock.calls[1]?.[1] as AbortSignal;
    bbox = "51,35,52,36";
    api.refreshForViewport();
    expect(signal.aborted).toBe(true);
    expect(search.mock.calls[2]?.[0]).toEqual({ q: "park", limit: 5, bbox });
    old.resolve(hit("stale"));
    await Promise.resolve();
    expect(api.results.value).toEqual(hit("current"));
    api.refreshForViewport();
    expect(search).toHaveBeenCalledTimes(3);
    await api.setScope("library");
    bbox = "50,34,51,35";
    api.refreshForViewport();
    expect(search).toHaveBeenCalledTimes(4);
    scope.stop();
  });

  it("keeps previously explored map hits selectable as the viewport finds new POIs", async () => {
    const next = deferred<GeocodeResponse>();
    const search = vi.fn().mockResolvedValueOnce(hit("first")).mockImplementationOnce(() => next.promise);
    let bbox = "50,34,51,35";
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: (kind) => ({
      bbox: kind === "viewport" ? bbox : "50,34,52,36", contains: (place) => place.name !== "outside"
    }) }))!;
    api.update("park");
    await vi.advanceTimersByTimeAsync(300);
    expect(api.showOnMap()).toBe(true);
    expect(api.mapResults.value).toEqual(hit("first"));
    bbox = "51,35,52,36";
    api.refreshForViewport(true); // Show All follows the map without losing the library batch.
    expect(api.scope.value).toBe("viewport");
    expect(api.results.value).toEqual(hit("first"));
    expect(api.mapResults.value).toEqual(hit("first"));
    expect(api.loading.value).toBe(true);
    next.resolve([...hit("second"), ...hit("outside")]);
    await Promise.resolve();
    await Promise.resolve();
    expect(api.results.value).toEqual(hit("second"));
    expect(api.mapResults.value).toEqual([...hit("first"), ...hit("second")]);
    expect(api.select(hit("first")[0]!)).toBe(true);
    expect(api.selectedPlaceId.value).toBe("first");
    search.mockResolvedValueOnce([]);
    bbox = "52,35,53,36";
    api.refreshForViewport(true);
    await Promise.resolve(); await Promise.resolve();
    expect(api.results.value).toEqual([]);
    expect(api.mapResults.value).toEqual([...hit("first"), ...hit("second")]);
    expect(api.showOnMap()).toBe(true); // Refit is still possible with no new nearby results.
    api.update("new term");
    expect(api.mapActive.value).toBe(false);
    expect(api.mapResults.value).toEqual([]);
    expect(api.select(hit("first")[0]!)).toBe(false);
    scope.stop();
  });

  it("aborts obsolete viewport reads and retains visited pins on failed refresh, then retries", async () => {
    const stale = deferred<GeocodeResponse>();
    const failure = deferred<GeocodeResponse>();
    const search = vi.fn().mockResolvedValueOnce(hit("first"))
      .mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => failure.promise)
      .mockResolvedValueOnce(hit("recovered"));
    let bbox = "50,34,51,35";
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => ({ bbox, contains: () => true }) }))!;
    api.update("park"); await vi.advanceTimersByTimeAsync(300);
    api.showOnMap();
    bbox = "51,35,52,36"; api.refreshForViewport(true);
    const oldSignal = search.mock.calls[1]?.[1] as AbortSignal;
    bbox = "52,35,53,36"; api.refreshForViewport(true);
    expect(oldSignal.aborted).toBe(true);
    stale.resolve(hit("obsolete")); await Promise.resolve();
    expect(api.mapResults.value).toEqual(hit("first"));
    failure.reject(new Error("offline"));
    await Promise.resolve(); await Promise.resolve();
    expect(api.failed.value).toBe(true);
    expect(api.loading.value).toBe(false);
    expect(api.results.value).toEqual(hit("first"));
    expect(api.select(hit("first")[0]!)).toBe(true);
    api.retry(); await Promise.resolve(); await Promise.resolve();
    expect(search).toHaveBeenCalledTimes(4);
    expect(api.failed.value).toBe(false);
    expect(api.mapResults.value).toEqual([...hit("first"), ...hit("recovered")]);
    scope.stop();
  });

  it("bounds accumulated POIs while preserving both the selected hit and newest viewport", async () => {
    let bbox = "0";
    let sequence = 0;
    const search = vi.fn(async () => Array.from({ length: 5 }, (_, i) => hit(`area-${sequence}-${i}`)[0]!));
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => ({ bbox, contains: () => true }) }))!;
    api.update("park"); await vi.advanceTimersByTimeAsync(300);
    api.showOnMap();
    expect(api.select(hit("area-0-0")[0]!)).toBe(true);
    for (sequence = 1; sequence <= 7; sequence++) {
      bbox = String(sequence);
      api.refreshForViewport(true);
      await Promise.resolve(); await Promise.resolve();
    }
    expect(api.mapResults.value).toHaveLength(30);
    expect(api.mapResults.value[0]?.placeId).toBe("area-0-0");
    expect(api.mapResults.value.some(place => place.placeId === "area-7-4")).toBe(true);
    expect(api.selectedPlaceId.value).toBe("area-0-0");
    await api.setScope("library");
    expect(api.mapResults.value).toEqual([]);
    expect(api.selectedPlaceId.value).toBeNull();
    scope.stop();
  });

  it("lets a pending term debounce search the latest viewport without an extra request", async () => {
    let bbox = "50,34,51,35";
    const search = vi.fn(async (_input: unknown, _signal?: AbortSignal) => hit("latest"));
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => ({ bbox, contains: () => true }) }))!;
    await api.setScope("viewport");
    api.update("park");
    bbox = "51,35,52,36";
    api.refreshForViewport();
    expect(search).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(search).toHaveBeenCalledOnce();
    expect(search.mock.calls[0]?.[0]).toEqual({ q: "park", limit: 5, bbox });
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
