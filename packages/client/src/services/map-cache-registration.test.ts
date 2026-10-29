import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => vi.resetModules());
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function fakeWorker(register: ReturnType<typeof vi.fn>, ready: Promise<unknown> = Promise.resolve()) {
  vi.stubGlobal("navigator", { serviceWorker: { register, ready } });
}

describe("map cache registration recovery", () => {
  it("coalesces concurrent registration, but retries after an initial rejection and memoizes a later success", async () => {
    const register = vi.fn().mockRejectedValueOnce(new Error("temporarily offline")).mockResolvedValue({});
    fakeWorker(register);
    const { registerMapCacheWorker } = await import("./map-cache");

    const first = registerMapCacheWorker();
    const concurrent = registerMapCacheWorker();
    expect(concurrent).toBe(first);
    await expect(first).resolves.toBeUndefined(); // Cache is optional; never block map paint.
    expect(register).toHaveBeenCalledTimes(1);

    await expect(registerMapCacheWorker()).resolves.toBeUndefined();
    expect(register).toHaveBeenCalledTimes(2);
    await registerMapCacheWorker();
    expect(register).toHaveBeenCalledTimes(2);
  });

  it("also permits retry when registration rejects after the map's bounded startup wait", async () => {
    vi.useFakeTimers();
    let reject!: (error: Error) => void;
    const delayed = new Promise<unknown>((_resolve, rejectPromise) => { reject = rejectPromise; });
    const register = vi.fn().mockReturnValueOnce(delayed).mockResolvedValue({});
    fakeWorker(register);
    const { registerMapCacheWorker, waitForMapCacheStartup, MAP_CACHE_STARTUP_BUDGET_MS } = await import("./map-cache");

    const registration = registerMapCacheWorker();
    const paint = waitForMapCacheStartup(registerMapCacheWorker);
    await vi.advanceTimersByTimeAsync(MAP_CACHE_STARTUP_BUDGET_MS);
    await paint;
    expect(register).toHaveBeenCalledTimes(1);

    reject(new Error("worker registration failed after map startup"));
    await registration; // The background failure must settle and clear the memoized attempt.
    await registerMapCacheWorker();
    expect(register).toHaveBeenCalledTimes(2);
  });

  it("does not throw from the app's fire-and-forget call if register throws synchronously", async () => {
    const register = vi.fn().mockImplementationOnce(() => { throw new Error("service worker API blocked"); })
      .mockResolvedValue({});
    fakeWorker(register);
    const { registerMapCacheWorker } = await import("./map-cache");
    await expect(registerMapCacheWorker()).resolves.toBeUndefined();
    await expect(registerMapCacheWorker()).resolves.toBeUndefined();
    expect(register).toHaveBeenCalledTimes(2);
  });

  it("clears the readiness timeout when the worker is already ready", async () => {
    vi.useFakeTimers();
    const register = vi.fn().mockResolvedValue({});
    fakeWorker(register);
    const { registerMapCacheWorker } = await import("./map-cache");
    await registerMapCacheWorker();
    expect(vi.getTimerCount()).toBe(0);
  });
});
