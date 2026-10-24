import { effectScope } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GeocodeResponse } from "@shared/index";
import { usePlaceSearch } from "./use-place-search";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => { resolve = res; });
  return { promise, resolve };
}
const hit = (name: string): GeocodeResponse => [{ placeId: name, name, address: name, lon: 51, lat: 35, type: "place" }];
function mount(search: NonNullable<Parameters<typeof usePlaceSearch>[0]>["search"],
  withinBounds?: (place: GeocodeResponse[number]) => boolean) {
  const scope = effectScope();
  const api = scope.run(() => usePlaceSearch({ search, bbox: () => "50,34,52,36", withinBounds }))!;
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
