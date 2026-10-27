import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { prepareMapRuntime, waitForMapCacheStartup, MAP_CACHE_STARTUP_BUDGET_MS } from "./map-cache";

// Source-pinned: the repo's Vitest suite deliberately does not mount Vue SFCs.
const canvas = readFileSync(new URL("../components/map/MapCanvas.vue", import.meta.url), "utf8");

afterEach(() => vi.useRealTimers());

describe("map startup cache budget", () => {
  it("starts as soon as the worker is ready, without leaving a timer behind", async () => {
    vi.useFakeTimers();
    await waitForMapCacheStartup(() => Promise.resolve());
    expect(vi.getTimerCount()).toBe(0);
  });

  it("stops waiting after a bounded budget if registration or ready never settles", async () => {
    vi.useFakeTimers();
    let started = false;
    const wait = waitForMapCacheStartup(() => new Promise<void>(() => undefined)).then(() => { started = true; });
    await vi.advanceTimersByTimeAsync(MAP_CACHE_STARTUP_BUDGET_MS - 1);
    expect(started).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await wait;
    expect(started).toBe(true);
    expect(MAP_CACHE_STARTUP_BUDGET_MS).toBeLessThan(500);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("allows map startup even if worker registration rejects or throws synchronously", async () => {
    vi.useFakeTimers();
    await waitForMapCacheStartup(() => Promise.reject(new Error("worker blocked")));
    await waitForMapCacheStartup(() => { throw new Error("worker API blocked"); });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps handling a late registration failure after the map has started", async () => {
    vi.useFakeTimers();
    let rejectRegistration!: (error: Error) => void;
    const registration = new Promise<void>((_resolve, reject) => { rejectRegistration = reject; });
    const wait = waitForMapCacheStartup(() => registration);
    await vi.advanceTimersByTimeAsync(MAP_CACHE_STARTUP_BUDGET_MS);
    await wait;
    rejectRegistration(new Error("late worker failure"));
    await Promise.resolve();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts the MapLibre download while the cache worker gets its bounded head start", async () => {
    vi.useFakeTimers();
    const load = vi.fn(async () => ({ library: "maplibre" }));
    const pending = prepareMapRuntime(() => new Promise<void>(() => undefined), load);
    await Promise.resolve();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(MAP_CACHE_STARTUP_BUDGET_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ library: "maplibre" });
    expect(vi.getTimerCount()).toBe(0);
  });

  it("waits for a slow library import after a fast worker, without starting a map early", async () => {
    let release!: (value: number) => void;
    const slowImport = new Promise<number>((resolve) => { release = resolve; });
    let done = false;
    const pending = prepareMapRuntime(() => Promise.resolve(), () => slowImport).then((value) => { done = true; return value; });
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toBe(false);
    release(42);
    await expect(pending).resolves.toBe(42);
  });

  it("reports an import failure rather than swallowing it as a cache registration error", async () => {
    await expect(prepareMapRuntime(() => Promise.resolve(), async () => {
      throw new Error("map chunk failed");
    })).rejects.toThrow("map chunk failed");
  });

  it("starts both operations only when MapCanvas mounts and rejects stale unmounted instances", () => {
    expect(canvas).toContain('prepareMapRuntime(registerMapCacheWorker, () => import("maplibre-gl"))');
    expect(canvas).toContain("return initializeMap(controller, maplibre);");
    expect(canvas).not.toContain("waitForMapCacheStartup(registerMapCacheWorker).then(() => {");
    expect(canvas).toContain("if (controller.signal.aborted) return;");
    expect(canvas).toContain("import type { Map as MapLibreMap } from \"maplibre-gl\";");
  });
});
