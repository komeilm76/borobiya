import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createMapStartupAttempt, prepareMapRuntime, waitForMapCacheStartup, MAP_CACHE_STARTUP_BUDGET_MS } from "./map-cache";

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
    expect(canvas).toContain("initializeMap(controller, maplibre)");
    expect(canvas).not.toContain("waitForMapCacheStartup(registerMapCacheWorker).then(() => {");
    expect(canvas).toContain("() => !controller.signal.aborted && !!container.value && !map.value");
    expect(canvas).toContain("import type { Map as MapLibreMap } from \"maplibre-gl\";");
  });

  it("retries startup only after the failed attempt settles and never starts twice concurrently", async () => {
    let reject!: (error: Error) => void;
    const first = new Promise<string>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const load = vi.fn().mockReturnValueOnce(first).mockResolvedValue("maplibre");
    const ready = vi.fn();
    const failed = vi.fn();
    const active = vi.fn(() => true);
    const start = createMapStartupAttempt(load, ready, failed, active);
    start();
    start();
    await Promise.resolve();
    expect(load).toHaveBeenCalledOnce();
    reject(new Error("map chunk failed"));
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    start();
    await vi.waitFor(() => expect(ready).toHaveBeenCalledExactlyOnceWith("maplibre"));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("reports a constructor failure and permits a clean second attempt", async () => {
    const load = vi.fn(async () => "maplibre");
    const ready = vi.fn().mockImplementationOnce(() => { throw new Error("WebGL unavailable"); });
    const failed = vi.fn();
    const start = createMapStartupAttempt(load, ready, failed, () => true);
    start();
    await vi.waitFor(() => expect(failed).toHaveBeenCalledOnce());
    expect(failed.mock.calls[0]?.[0]).toEqual(new Error("WebGL unavailable"));
    start();
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(2));
    expect(load).toHaveBeenCalledTimes(2);
    expect(failed).toHaveBeenCalledOnce();
  });

  it("ignores a late success or failure after the canvas is disposed", async () => {
    const controller = new AbortController();
    let resolve!: (value: string) => void;
    let reject!: (error: Error) => void;
    const load = vi.fn().mockImplementationOnce(() => new Promise<string>((done) => { resolve = done; }))
      .mockImplementationOnce(() => new Promise<string>((_done, fail) => { reject = fail; }));
    const ready = vi.fn();
    const failed = vi.fn();
    const start = createMapStartupAttempt(load, ready, failed, () => !controller.signal.aborted);
    start();
    await Promise.resolve();
    controller.abort();
    resolve("stale maplibre");
    await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
    start();
    expect(load).toHaveBeenCalledOnce();

    const another = new AbortController();
    const next = createMapStartupAttempt(() => load(), ready, failed, () => !another.signal.aborted);
    next();
    await Promise.resolve();
    another.abort();
    reject(new Error("stale import failure"));
    await Promise.resolve();
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();
    expect(failed).not.toHaveBeenCalled();
  });

  it("wires Retry to startup when no map exists and re-fetches failed configuration", () => {
    const retry = canvas.slice(canvas.indexOf("function retryMap()"), canvas.indexOf("function handleServiceWorkerMessage"));
    expect(retry).toContain("if (!instance)");
    expect(retry).toContain("startMap?.()");
    expect(retry).toContain("configFailed");
    expect(retry).toContain("fetchRuntimeConfig");
    expect(retry).toContain("lastNoticeAt = Number.NEGATIVE_INFINITY");
  });
});
