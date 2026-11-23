import { afterEach, describe, expect, it, vi } from "vitest";
import { getMapConfig, MAP_CONFIG_TIMEOUT_MS, MapConfigError } from "./map-config";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const config = {
  region: "borobiya",
  bbox: [51, 35.5, 51.7, 35.9] as [number, number, number, number],
  dataVersion: "development",
  minZoom: 0,
  maxZoom: 14
};

describe("same-origin map configuration client", () => {
  it("fetches and validates the public map settings without exposing server URLs", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(config), {
      status: 200,
      headers: { "content-type": "application/json" }
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getMapConfig()).resolves.toEqual(config);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/map-config");
    expect(init.credentials).toBe("same-origin");
    expect(new Headers(init.headers).get("accept")).toBe("application/json");
  });

  it("times out a stalled configuration request so the map can fall back and retry", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => {
      requestSignal = init.signal ?? undefined;
      return new Promise<Response>(() => {});
    }));

    const pending = getMapConfig();
    const rejected = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(MAP_CONFIG_TIMEOUT_MS);
    await rejected;
    expect(requestSignal?.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out a stalled response body, not just a stalled fetch", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: () => new Promise<unknown>(() => {})
    })));
    const rejected = expect(getMapConfig()).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(MAP_CONFIG_TIMEOUT_MS);
    await rejected;
    expect(vi.getTimerCount()).toBe(0);
  });

  it("honors caller cancellation even when fetch does not settle after abort", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>(() => {})));
    const pending = getMapConfig(controller.signal);
    const rejected = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await rejected;
  });

  it("rejects non-OK responses and malformed public config", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("not found", { status: 404 })));
    await expect(getMapConfig()).rejects.toBeInstanceOf(MapConfigError);

    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ...config, maxZoom: 99 }), {
      status: 200,
      headers: { "content-type": "application/json" }
    })));
    await expect(getMapConfig()).rejects.toThrow("invalid configuration");
  });
});
