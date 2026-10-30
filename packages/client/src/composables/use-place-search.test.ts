import { effectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeocodeResponse } from "@shared/index";
import { PlaceSearchError } from "@/api/geocoding";
import { usePlaceSearch, placeSearchDiagnostic } from "./use-place-search";
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
  it("debounces a trimmed query, applies loaded map bounds and caps the gateway request at thirty", async () => {
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
    expect(search.mock.calls[0]?.[0]).toEqual({ q: "Azadi", limit: 30, bbox: "50.5,34.5,51.5,35.5" });
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
    expect(api.scope.value).toBe("viewport");
    api.update("park");
    await vi.advanceTimersByTimeAsync(300);
    const signal = search.mock.calls[0]?.[1] as AbortSignal;
    await api.setScope("library");
    expect(signal.aborted).toBe(true);
    expect(search.mock.calls[1]?.[0]).toEqual({ q: "park", limit: 30, bbox: "50,34,52,36" });
    old.resolve(hit("stale"));
    await Promise.resolve();
    expect(api.results.value).toEqual(hit("visible"));
    await api.setScope("viewport");
    expect(search.mock.calls[2]?.[0]).toEqual({ q: "park", limit: 30, bbox: "50.5,34.5,51.5,35.5" });
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
    await vi.advanceTimersByTimeAsync(300);
    expect(search).toHaveBeenCalledTimes(1);
    expect(api.select(hit("first")[0]!)).toBe(true);
    api.refreshForViewport(); // A selected-result fly-to is filtered at the map event source.
    expect(search).toHaveBeenCalledTimes(1);
    expect(api.selectedPlaceId.value).toBe("first");
    expect(api.results.value).toEqual(hit("first"));

    bbox = "50.5,34.5,51.5,35.5";
    api.refreshForViewport();
    expect(search.mock.calls[1]?.[0]).toEqual({ q: "park", limit: 30, bbox });
    expect(api.results.value).toEqual(hit("first")); // No flash while a new viewport is loading.
    expect(api.selectedPlaceId.value).toBe("first");
    expect(api.loading.value).toBe(true);
    const signal = search.mock.calls[1]?.[1] as AbortSignal;
    bbox = "51,35,52,36";
    api.refreshForViewport();
    expect(signal.aborted).toBe(true);
    expect(search.mock.calls[2]?.[0]).toEqual({ q: "park", limit: 30, bbox });
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

  it("prunes the current-bbox list on movement even before Show All is used", async () => {
    const karaj = { ...hit("karaj")[0]!, lon: 50.9, lat: 35.8 };
    const tehran = { ...hit("tehran")[0]!, lon: 51.4, lat: 35.7 };
    const pending = deferred<GeocodeResponse>();
    const search = vi.fn().mockResolvedValueOnce([karaj]).mockImplementationOnce(() => pending.promise);
    let bbox = "50.8,35.6,51,35.9";
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => {
      const [west, south, east, north] = bbox.split(",").map(Number);
      return { bbox, contains: (place) => place.lon >= west! && place.lon <= east! &&
        place.lat >= south! && place.lat <= north! };
    } }))!;
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    expect(api.scope.value).toBe("viewport");
    expect(api.results.value).toEqual([karaj]);
    expect(api.select(karaj)).toBe(true);
    bbox = "51.2,35.6,51.6,35.9";
    api.refreshForViewport();
    expect(api.results.value).toEqual([]);
    expect(api.selectedPlaceId.value).toBeNull();
    expect(api.select(karaj)).toBe(false);
    pending.resolve([tehran]); await Promise.resolve(); await Promise.resolve();
    expect(api.results.value).toEqual([tehran]);
    scope.stop();
  });

  it("replaces Karaj results with Tehran's top thirty and removes out-of-bbox pins before the reply", async () => {
    const karaj = Array.from({ length: 30 }, (_, i) => ({ ...hit(`karaj-${i}`)[0]!, lon: 50.9, lat: 35.83 }));
    const tehran = Array.from({ length: 30 }, (_, i) => ({ ...hit(`tehran-${i}`)[0]!, lon: 51.43, lat: 35.72 }));
    const pending = deferred<GeocodeResponse>();
    const search = vi.fn().mockResolvedValueOnce(karaj).mockImplementationOnce(() => pending.promise);
    let bbox = "50.8,35.7,51,35.9";
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: (kind) => {
      const [west, south, east, north] = (kind === "viewport" ? bbox : "50,35,52,36").split(",").map(Number);
      return { bbox: kind === "viewport" ? bbox : "50,35,52,36", contains: (place) =>
        place.lon >= west! && place.lon <= east! && place.lat >= south! && place.lat <= north! };
    } }))!;
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    expect(search.mock.calls[0]?.[0]).toEqual({ q: "کافه", limit: 30, bbox: "50.8,35.7,51,35.9" });
    expect(api.results.value).toHaveLength(30);
    expect(api.showOnMap()).toBe(true);
    expect(api.mapResults.value).toEqual(karaj);
    expect(api.select(karaj[0]!)).toBe(true);

    bbox = "51.2,35.6,51.6,35.9";
    api.refreshForViewport(true);
    expect(api.scope.value).toBe("viewport");
    expect(search.mock.calls[1]?.[0]).toEqual({ q: "کافه", limit: 30, bbox });
    expect(api.loading.value).toBe(true);
    expect(api.results.value).toEqual([]); // Karaj is not in the Tehran bbox.
    expect(api.mapResults.value).toEqual([]);
    expect(api.selectedPlaceId.value).toBeNull();
    expect(api.select(karaj[0]!)).toBe(false);
    pending.resolve(tehran);
    await Promise.resolve(); await Promise.resolve();
    expect(api.results.value).toEqual(tehran);
    expect(api.mapResults.value).toEqual(tehran);
    expect(api.select(tehran[29]!)).toBe(true);
    expect(api.mapResults.value.some(place => place.name.startsWith("karaj"))).toBe(false);
    scope.stop();
  });

  it("drops Karaj markers while the camera is still moving, before a new bbox request", async () => {
    const karaj = { ...hit("karaj")[0]!, lon: 50.9, lat: 35.8 };
    const tehran = { ...hit("tehran")[0]!, lon: 51.4, lat: 35.7 };
    const stale = deferred<GeocodeResponse>();
    const search = vi.fn().mockResolvedValueOnce([karaj]).mockImplementationOnce(() => stale.promise)
      .mockResolvedValueOnce([tehran]);
    let bbox = "50.8,35.6,51,35.9";
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => {
      const [west, south, east, north] = bbox.split(",").map(Number);
      return { bbox, contains: (place) => place.lon >= west! && place.lon <= east! &&
        place.lat >= south! && place.lat <= north! };
    } }))!;
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    api.showOnMap();
    bbox = "50.85,35.6,51.05,35.9";
    api.refreshForViewport(true); // An old read is still pending when the next drag begins.
    const staleSignal = search.mock.calls[1]?.[1] as AbortSignal;
    bbox = "51.2,35.6,51.6,35.9";
    api.pruneForViewport(true); // The camera hasn't emitted moveend yet.
    expect(staleSignal.aborted).toBe(true);
    expect(search).toHaveBeenCalledTimes(2); // No per-frame network requests.
    expect(api.results.value).toEqual([]);
    expect(api.mapResults.value).toEqual([]);
    expect(api.loading.value).toBe(true);
    stale.resolve([karaj]); await Promise.resolve(); await Promise.resolve();
    expect(api.mapResults.value).toEqual([]); // The aborted response cannot revive old POIs.
    api.refreshForViewport(true);
    await Promise.resolve(); await Promise.resolve();
    expect(search.mock.calls[2]?.[0]).toEqual({ q: "کافه", limit: 30, bbox });
    expect(api.mapResults.value).toEqual([tehran]);
    scope.stop();
  });

  it("switches an explicit library-wide search to viewport on a user pan", async () => {
    const karaj = { ...hit("karaj")[0]!, lon: 50.9, lat: 35.8 };
    const tehran = { ...hit("tehran")[0]!, lon: 51.4, lat: 35.7 };
    let bbox = "50.8,35.6,51,35.9";
    const search = vi.fn().mockResolvedValueOnce([karaj]).mockResolvedValueOnce([karaj])
      .mockResolvedValueOnce([tehran]);
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: (kind) => {
      const bounds = kind === "viewport" ? bbox : "50.8,35.6,51.6,35.9";
      const [west, south, east, north] = bounds.split(",").map(Number);
      return { bbox: bounds, contains: (place) => place.lon >= west! && place.lon <= east! &&
        place.lat >= south! && place.lat <= north! };
    } }))!;
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    await api.setScope("library");
    expect(api.results.value).toEqual([karaj]);
    bbox = "51.2,35.6,51.6,35.9";
    api.pruneForViewport(true); // Real gesture, regardless of Show All state.
    expect(api.scope.value).toBe("viewport");
    expect(api.results.value).toEqual([]);
    api.refreshForViewport(true); await Promise.resolve(); await Promise.resolve();
    expect(search.mock.calls[2]?.[0]).toEqual({ q: "کافه", limit: 30, bbox });
    expect(api.results.value).toEqual([tehran]);
    scope.stop();
  });

  it("refetches when a drag returns to its starting bbox after pruning hits", async () => {
    const karaj = { ...hit("karaj")[0]!, lon: 50.9, lat: 35.8 };
    let bbox = "50.8,35.6,51,35.9";
    const search = vi.fn().mockResolvedValue([karaj]);
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => {
      const [west, south, east, north] = bbox.split(",").map(Number);
      return { bbox, contains: (place) => place.lon >= west! && place.lon <= east! &&
        place.lat >= south! && place.lat <= north! };
    } }))!;
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    api.showOnMap();
    bbox = "51.2,35.6,51.6,35.9";
    api.pruneForViewport(true);
    expect(api.mapResults.value).toEqual([]);
    bbox = "50.8,35.6,51,35.9";
    api.pruneForViewport(true);
    api.refreshForViewport(true); // Same bbox as the original read, but its hits were pruned.
    await Promise.resolve(); await Promise.resolve();
    expect(search).toHaveBeenCalledTimes(2);
    expect(api.loading.value).toBe(false);
    expect(api.mapResults.value).toEqual([karaj]);
    scope.stop();
  });

  it("reports unavailable map coverage rather than getting stuck loading", async () => {
    const karaj = { ...hit("karaj")[0]!, lon: 50.9, lat: 35.8 };
    let available = true;
    const search = vi.fn().mockResolvedValue([karaj]);
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => available ? ({
      bbox: "50.8,35.6,51,35.9", contains: () => true
    }) : null }))!;
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    api.showOnMap();
    available = false;
    api.pruneForViewport(true);
    expect(api.mapResults.value).toEqual([]);
    api.refreshForViewport(true);
    expect(api.loading.value).toBe(false);
    expect(api.failed.value).toBe(true);
    expect(search).toHaveBeenCalledTimes(1);
    scope.stop();
  });

  it("prunes zoomed-out POIs after a selection flight without issuing another search", async () => {
    const near = { ...hit("near")[0]!, lon: 51.4, lat: 35.7 };
    const far = { ...hit("far")[0]!, lon: 50.9, lat: 35.8 };
    let bbox = "50.8,35.6,51.6,35.9";
    const search = vi.fn().mockResolvedValueOnce([near, far]);
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => {
      const [west, south, east, north] = bbox.split(",").map(Number);
      return { bbox, contains: (place) => place.lon >= west! && place.lon <= east! &&
        place.lat >= south! && place.lat <= north! };
    } }))!;
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    api.showOnMap();
    expect(api.select(near)).toBe(true);
    bbox = "51.2,35.6,51.6,35.9"; // A selection flight zooms in; it does not request.
    api.pruneForViewport(true, false);
    expect(search).toHaveBeenCalledTimes(1);
    expect(api.loading.value).toBe(false);
    expect(api.results.value).toEqual([near]);
    expect(api.mapResults.value).toEqual([near]);
    expect(api.selectedPlaceId.value).toBe("near");
    expect(api.select(far)).toBe(false);
    scope.stop();
  });

  it("retains only in-bbox hits during a failing refresh, aborts older reads, and retries in place", async () => {
    const karaj = { ...hit("karaj")[0]!, lon: 50.9, lat: 35.83 };
    const tehran = { ...hit("tehran")[0]!, lon: 51.43, lat: 35.72 };
    const stale = deferred<GeocodeResponse>();
    const failure = deferred<GeocodeResponse>();
    const search = vi.fn().mockResolvedValueOnce([karaj, tehran])
      .mockImplementationOnce(() => stale.promise).mockImplementationOnce(() => failure.promise)
      .mockResolvedValueOnce([tehran]);
    let bbox = "50.8,35.6,51.6,35.9";
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => {
      const [west, south, east, north] = bbox.split(",").map(Number);
      return { bbox, contains: (place) => place.lon >= west! && place.lon <= east! &&
        place.lat >= south! && place.lat <= north! };
    } }))!;
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    api.showOnMap();
    bbox = "50.85,35.6,51.6,35.9"; api.refreshForViewport(true);
    const oldSignal = search.mock.calls[1]?.[1] as AbortSignal;
    bbox = "51.2,35.6,51.6,35.9"; api.refreshForViewport(true);
    expect(oldSignal.aborted).toBe(true);
    expect(api.mapResults.value).toEqual([tehran]);
    stale.resolve([karaj]); await Promise.resolve();
    expect(api.mapResults.value).toEqual([tehran]);
    failure.reject(new Error("offline"));
    await Promise.resolve(); await Promise.resolve();
    expect(api.failed.value).toBe(true);
    expect(api.loading.value).toBe(false);
    expect(api.results.value).toEqual([tehran]);
    expect(api.select(karaj)).toBe(false);
    api.retry(); await Promise.resolve(); await Promise.resolve();
    expect(search).toHaveBeenCalledTimes(4);
    expect(api.failed.value).toBe(false);
    expect(api.mapResults.value).toEqual([tehran]);
    scope.stop();
  });

  it("clears the old bbox even when no new results exist, then refills on the next move", async () => {
    let bbox = "a";
    const search = vi.fn().mockResolvedValueOnce(hit("first")).mockResolvedValueOnce([]).mockResolvedValueOnce(hit("third"));
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => ({
      bbox, contains: (place) => bbox === "a" ? place.name === "first" : place.name === "third"
    }) }))!;
    api.update("park"); await vi.advanceTimersByTimeAsync(300);
    api.showOnMap();
    bbox = "b"; api.refreshForViewport(true);
    expect(api.mapResults.value).toEqual([]);
    await Promise.resolve(); await Promise.resolve();
    expect(api.mapActive.value).toBe(true);
    expect(api.mapResults.value).toEqual([]);
    expect(api.showOnMap()).toBe(false);
    bbox = "c"; api.refreshForViewport(true);
    await Promise.resolve(); await Promise.resolve();
    expect(api.mapResults.value).toEqual(hit("third"));
    expect(api.showOnMap()).toBe(true);
    api.update("new term");
    expect(api.mapResults.value).toEqual([]);
    expect(api.mapActive.value).toBe(false);
    scope.stop();
  });

  it("keeps map follow mode through a failed empty-bbox refresh and its retry", async () => {
    const karaj = { ...hit("karaj")[0]!, lon: 50.9, lat: 35.8 };
    const tehran = { ...hit("tehran")[0]!, lon: 51.4, lat: 35.7 };
    const search = vi.fn().mockResolvedValueOnce([karaj]).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce([tehran]);
    let bbox = "50.8,35.6,51,35.9";
    const scope = effectScope();
    const api = scope.run(() => usePlaceSearch({ search, area: () => {
      const [west, south, east, north] = bbox.split(",").map(Number);
      return { bbox, contains: (place) => place.lon >= west! && place.lon <= east! &&
        place.lat >= south! && place.lat <= north! };
    } }))!;
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    api.showOnMap();
    bbox = "51.2,35.6,51.6,35.9";
    api.refreshForViewport(true); await Promise.resolve(); await Promise.resolve();
    expect(api.mapActive.value).toBe(true);
    expect(api.failed.value).toBe(true);
    expect(api.mapResults.value).toEqual([]);
    api.retry(); await Promise.resolve(); await Promise.resolve();
    expect(search).toHaveBeenCalledTimes(3);
    expect(api.mapActive.value).toBe(true);
    expect(api.mapResults.value).toEqual([tehran]);
    scope.stop();
  });

  it("limits the snapshot even if an injected upstream returns more than thirty hits", async () => {
    const tooMany = Array.from({ length: 31 }, (_, i) => ({ ...hit(`cafe-${i}`)[0]!, lon: 51 + i / 1000 }));
    const { api, scope } = mount(async () => tooMany);
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    expect(api.results.value).toHaveLength(30);
    expect(api.showOnMap()).toBe(true);
    expect(api.mapResults.value).toHaveLength(30);
    expect(api.select(tooMany[30]!)).toBe(false);
    scope.stop();
  });

  it("keeps map mode after resubmitting and retrying an explicit library-wide search", async () => {
    const first = hit("first");
    const second = hit("second");
    const pending = deferred<GeocodeResponse>();
    const search = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(first)
      .mockImplementationOnce(() => pending.promise).mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(second);
    const { api, scope } = mount(search);
    api.update("cafe"); await vi.advanceTimersByTimeAsync(300);
    await api.setScope("library");
    expect(api.showOnMap()).toBe(true);
    const resubmit = api.run(api.mapActive.value);
    expect(api.mapActive.value).toBe(true);
    expect(api.mapResults.value).toEqual(first);
    pending.resolve(first); await resubmit;
    await api.run(api.mapActive.value);
    expect(api.failed.value).toBe(true);
    expect(api.mapResults.value).toEqual(first);
    api.retry(); await Promise.resolve(); await Promise.resolve();
    expect(api.failed.value).toBe(false);
    expect(api.mapActive.value).toBe(true);
    expect(api.mapResults.value).toEqual(second);
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
    expect(search.mock.calls[0]?.[0]).toEqual({ q: "park", limit: 30, bbox });
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

  it("reports a query-free mobile diagnostic and clears it on retry or a new term", async () => {
    const search = vi.fn().mockRejectedValueOnce(new PlaceSearchError("HTTP_ERROR", 503, "geocoding_unavailable"))
      .mockResolvedValueOnce(hit("cafe"));
    const { api, scope } = mount(search);
    api.update("کافه"); await vi.advanceTimersByTimeAsync(300);
    expect(api.failed.value).toBe(true);
    expect(api.diagnostic.value).toBe("GET /geocode · HTTP_ERROR · HTTP 503 · geocoding_unavailable");
    expect(api.diagnostic.value).not.toContain("کافه");
    expect(placeSearchDiagnostic(new Error("private café 51.4,35.7"))).toBe("GET /geocode · UNKNOWN_ERROR");
    expect(placeSearchDiagnostic(new PlaceSearchError("HTTP_ERROR", 502, "private café")))
      .toBe("GET /geocode · HTTP_ERROR · HTTP 502");
    expect(placeSearchDiagnostic(new PlaceSearchError("HTTP_ERROR", 400, "invalid_geocode_query", "LIMIT_5_ACCEPTED")))
      .toBe("GET /geocode · HTTP_ERROR · HTTP 400 · invalid_geocode_query · LIMIT_5_ACCEPTED");
    api.retry(); await Promise.resolve(); await Promise.resolve();
    expect(api.failed.value).toBe(false);
    expect(api.diagnostic.value).toBeNull();
    api.update("خانه خصوصی");
    expect(api.diagnostic.value).toBeNull();
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
    expect(api.diagnostic.value).toBe("GET /geocode · MAP_BOUNDS_UNAVAILABLE");
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
