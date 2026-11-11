import { afterEach, describe, expect, it, vi } from "vitest";
import { PlaceSearchError, photonAddress, photonPlaces, reversePlace, searchPlaces } from "./geocoding";

const GEOCODING_DEADLINE_MS = 12_000;
const feature = (name: string, coordinates: number[] = [51.38, 35.7], extras = {}) => ({
  type: "Feature", geometry: { type: "Point", coordinates },
  properties: { name, city: "Tehran", country: "Iran", osm_type: "N", osm_id: 123, osm_key: "place", ...extras }
});
const collection = (features: unknown[]) => ({ type: "FeatureCollection", features });
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

function stalledBody(): Response {
  return new Response(new ReadableStream<Uint8Array>({ start(controller) {
    controller.enqueue(new TextEncoder().encode('{"type":"FeatureCollection","features":'));
  } }));
}

describe("local Photon place search", () => {
  it("times out a successful reply whose JSON body stalls after headers", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return stalledBody();
    }));
    const result = searchPlaces({ q: "کافه" }).then(() => "unexpected success", (error: PlaceSearchError) => error.code);
    await vi.advanceTimersByTimeAsync(GEOCODING_DEADLINE_MS + 1);
    expect(requestSignal?.aborted).toBe(true);
    expect(await Promise.race([result, Promise.resolve("still pending")])).toBe("NETWORK_ERROR");
  });

  it("bounds the diagnostic limit-five probe as part of the same search deadline", async () => {
    vi.useFakeTimers();
    const signals: AbortSignal[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      signals.push(init?.signal as AbortSignal);
      return signals.length === 1
        ? Response.json({ error: "invalid_geocode_query" }, { status: 400 }) : stalledBody();
    }));
    const result = searchPlaces({ q: "کافه", limit: 30 }).then(() => "unexpected success", (error: PlaceSearchError) => error.code);
    await vi.advanceTimersByTimeAsync(GEOCODING_DEADLINE_MS + 1);
    expect(signals).toHaveLength(2);
    expect(signals[1]?.aborted).toBe(true);
    expect(await Promise.race([result, Promise.resolve("still pending")])).toBe("NETWORK_ERROR");
  });

  it("ends a pending search immediately on caller cancellation even if fetch ignores abort", async () => {
    const caller = new AbortController();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    }));
    const result = searchPlaces({ q: "کافه" }, caller.signal).then(() => "unexpected success", (error: Error) => error.name);
    caller.abort();
    expect(requestSignal?.aborted).toBe(true);
    expect(await Promise.race([result, new Promise(resolve => setTimeout(() => resolve("still pending"), 100))]))
      .toBe("AbortError");
  });
  it("validates q/limit/bbox and calls only the same-origin gateway with an abort signal", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(collection([feature("Azadi Square")])));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const result = await searchPlaces({ q: "  Azadi Square ", bbox: "51,35,52,36" }, controller.signal);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/geocode?q=Azadi+Square&limit=5&bbox=51%2C35%2C52%2C36");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", credentials: "same-origin",
      signal: expect.any(AbortSignal) });
    expect(result).toEqual([{ placeId: "osm:N:123", name: "Azadi Square",
      address: "Azadi Square, Tehran, Iran", lon: 51.38, lat: 35.7, type: "place" }]);
    await expect(searchPlaces({ q: " " })).rejects.toThrow();
    await expect(searchPlaces({ q: "valid", bbox: "51,91,52,92" })).rejects.toThrow();
    await expect(searchPlaces({ q: "valid", limit: 31 })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("supports a 30-place local search without changing the default limit", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => Response.json(collection(
      Array.from({ length: 35 }, (_, i) => feature(`Cafe ${i}`, [51.1 + i / 1000, 35.7], { osm_id: i }))
    )));
    vi.stubGlobal("fetch", fetcher);
    const hits = await searchPlaces({ q: "کافه", bbox: "51,35,52,36", limit: 30 });
    expect(fetcher.mock.calls[0]?.[0]).toBe("/geocode?q=%DA%A9%D8%A7%D9%81%D9%87&limit=30&bbox=51%2C35%2C52%2C36");
    expect(hits).toHaveLength(30);
    expect(hits.at(-1)?.name).toBe("Cafe 29");
  });

  it("distinguishes safe gateway status from network and invalid-response failures", async () => {
    const request = { q: "کافه", bbox: "51,35,52,36", limit: 30 };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "geocoding_unavailable", message: "private café query" }, { status: 503 })));
    await expect(searchPlaces(request)).rejects.toMatchObject({ code: "HTTP_ERROR", status: 503,
      gatewayCode: "geocoding_unavailable" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "private café query" }, { status: 400 })));
    await expect(searchPlaces(request)).rejects.toMatchObject({ code: "HTTP_ERROR", status: 400,
      gatewayCode: null });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network: private café query"); }));
    await expect(searchPlaces(request)).rejects.toMatchObject({ code: "NETWORK_ERROR", status: null });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>login</html>", { status: 200 })));
    await expect(searchPlaces(request)).rejects.toMatchObject({ code: "INVALID_RESPONSE", status: 200 });
    expect(new PlaceSearchError("NETWORK_ERROR").message).not.toContain("کافه");
  });

  it("safely probes limit five with the SAME bbox when limit thirty is rejected", async () => {
    const fetcher = vi.fn(async (url: RequestInfo | URL) => {
      const params = new URL(String(url), "http://local").searchParams;
      return params.get("limit") === "30"
        ? Response.json({ error: "invalid_geocode_query" }, { status: 400 })
        : Response.json(collection([]));
    });
    vi.stubGlobal("fetch", fetcher);
    await expect(searchPlaces({ q: "کافه", limit: 30, bbox: "50.8,35.7,51,35.9" }))
      .rejects.toMatchObject({ code: "HTTP_ERROR", status: 400, gatewayCode: "invalid_geocode_query",
        probe: "LIMIT_5_ACCEPTED" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    const main = new URL(String(fetcher.mock.calls[0]?.[0]), "http://local").searchParams;
    const probe = new URL(String(fetcher.mock.calls[1]?.[0]), "http://local").searchParams;
    expect(probe.get("q")).toBe(main.get("q"));
    expect(probe.get("bbox")).toBe(main.get("bbox"));
    expect(probe.get("limit")).toBe("5");
  });

  it("does not misdiagnose an invalid bbox or unavailable probe as a version mismatch", async () => {
    const request = { q: "کافه", limit: 30, bbox: "50.8,35.7,51,35.9" };
    const fetcher = vi.fn(async () => Response.json({ error: "invalid_geocode_query" }, { status: 400 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(searchPlaces(request)).rejects.toMatchObject({ probe: "LIMIT_5_REJECTED" });
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockImplementationOnce(async () => Response.json({ error: "invalid_geocode_query" }, { status: 400 }))
      .mockImplementationOnce(async () => { throw new TypeError("private URL"); });
    await expect(searchPlaces(request)).rejects.toMatchObject({ probe: "LIMIT_5_UNAVAILABLE" });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("does not probe other HTTP failures or leak an aborted probe", async () => {
    const controller = new AbortController();
    let rejectProbe!: (reason: Error) => void;
    let probeStarted!: () => void;
    const enteredProbe = new Promise<void>((resolve) => { probeStarted = resolve; });
    const fetcher = vi.fn().mockResolvedValueOnce(Response.json({ error: "invalid_geocode_query" }, { status: 400 }))
      .mockImplementationOnce(() => new Promise<Response>((_, reject) => {
        rejectProbe = reject;
        probeStarted();
      }));
    vi.stubGlobal("fetch", fetcher);
    const pending = searchPlaces({ q: "کافه", limit: 30, bbox: "50.8,35.7,51,35.9" }, controller.signal);
    const aborted = expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await enteredProbe;
    controller.abort();
    rejectProbe(new DOMException("aborted", "AbortError"));
    await aborted;
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "geocoding_unavailable" }, { status: 503 })));
    await expect(searchPlaces({ q: "کافه", limit: 30 })).rejects.toMatchObject({ probe: null });
    expect(fetch).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_geocode_query" }, { status: 400 })));
    await expect(searchPlaces({ q: "کافه", limit: 5, bbox: "50.8,35.7,51,35.9" }))
      .rejects.toMatchObject({ probe: null });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("drops malformed, duplicate, unnamed, non-point and out-of-bounds features, then caps valid results", () => {
    const places = photonPlaces(collection([
      { type: "Feature", geometry: { type: "LineString", coordinates: [[51, 35]] }, properties: { name: "line" } },
      feature("bad latitude", [51.4, 91]),
      feature("", [51.4, 35.7], { city: null, country: null }),
      feature("Azadi Square"),
      feature("duplicate with same OSM id"),
      feature("Tehran Museum", [51.5, 35.8], { osm_id: 456 })
    ]), 2);
    expect(places.map((item) => item.name)).toEqual(["Azadi Square", "Tehran Museum"]);
    expect(photonPlaces(collection([feature("A"), feature("B", [51.5, 35.8], { osm_id: 456 })]), 1)).toHaveLength(1);
    expect(() => photonPlaces({ type: "Feature", features: [] }, 5)).toThrow();
  });

  it("preserves only a present Photon OSM value for honest map-pin classification", () => {
    const [cafe, plain] = photonPlaces(collection([
      feature("Cafe", [51.4, 35.7], { osm_key: "amenity", osm_value: "cafe" }),
      feature("Other", [51.5, 35.8], { osm_id: 789, osm_key: "amenity", osm_value: " " })
    ]), 5);
    expect(cafe).toMatchObject({ type: "amenity", subtype: "cafe" });
    expect(plain).not.toHaveProperty("subtype");
  });

  it("uses a bounded local fallback identity for Photon features without an OSM id", () => {
    const [item] = photonPlaces(collection([feature("Bazar", [51.4, 35.6], { osm_type: null, osm_id: null,
      street: "Bazar St", housenumber: "12" })]), 5);
    expect(item).toMatchObject({ placeId: "geo:51.4:35.6:Bazar", name: "Bazar",
      address: "Bazar, 12, Bazar St, Tehran, Iran" });
  });

  it("does not turn an unavailable gateway or invalid GeoJSON into a successful empty list", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "geocoding_unavailable" }, { status: 503 })));
    await expect(searchPlaces({ q: "Azadi" })).rejects.toThrow("PLACE_SEARCH_UNAVAILABLE");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ type: "FeatureCollection", features: {} })));
    await expect(searchPlaces({ q: "Azadi" })).rejects.toThrow();
  });
});

describe("local Photon reverse geocoding", () => {
  it("times out a reverse reply stalled after headers instead of leaving its point sheet loading", async () => {
    vi.useFakeTimers();
    let requestSignal: AbortSignal | undefined;
    vi.stubGlobal("fetch", vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      requestSignal = init?.signal ?? undefined;
      return stalledBody();
    }));
    const result = reversePlace({ lat: 35, lon: 51 })
      .then(() => "unexpected success", (error: Error) => error.message);
    await vi.advanceTimersByTimeAsync(GEOCODING_DEADLINE_MS + 1);
    expect(requestSignal?.aborted).toBe(true);
    expect(await Promise.race([result, Promise.resolve("still pending")])).toBe("REVERSE_GEOCODE_UNAVAILABLE");
  });

  it("calls only the same-origin reverse gateway with validated coordinates and abort signal", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(collection([feature("Azadi Square", [51.38, 35.7], { housenumber: "12", street: "Azadi" })])));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const result = await reversePlace({ lat: 35.7, lon: 51.38 }, controller.signal);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/reverse?lat=35.7&lon=51.38");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "same-origin", signal: expect.any(AbortSignal) });
    expect(result).toEqual({ formattedAddress: "Azadi Square, 12, Azadi, Tehran, Iran", country: "Iran",
      city: "Tehran", street: "Azadi", houseNumber: "12" });
    await expect(reversePlace({ lat: 91, lon: 51 })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("distinguishes no address from unavailable gateway or invalid GeoJSON", async () => {
    expect(photonAddress(collection([]))).toBeNull();
    expect(photonAddress(collection([feature("", [51, 35], { city: null, country: null })]))).toBeNull();
    expect(photonAddress(collection([feature("outside", [51, 91]), feature("valid")]))?.formattedAddress)
      .toBe("valid, Tehran, Iran");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(collection([]))));
    await expect(reversePlace({ lat: 35, lon: 51 })).resolves.toBeNull();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "offline" }, { status: 503 })));
    await expect(reversePlace({ lat: 35, lon: 51 })).rejects.toThrow("REVERSE_GEOCODE_UNAVAILABLE");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ type: "FeatureCollection", features: null })));
    await expect(reversePlace({ lat: 35, lon: 51 })).rejects.toThrow();
  });
});
