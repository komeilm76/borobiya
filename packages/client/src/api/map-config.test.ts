import { afterEach, describe, expect, it, vi } from "vitest";
import { getMapConfig, MapConfigError } from "./map-config";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
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
