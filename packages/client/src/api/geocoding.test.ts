import { afterEach, describe, expect, it, vi } from "vitest";
import { photonAddress, photonPlaces, reversePlace, searchPlaces } from "./geocoding";

const feature = (name: string, coordinates: number[] = [51.38, 35.7], extras = {}) => ({
  type: "Feature", geometry: { type: "Point", coordinates },
  properties: { name, city: "Tehran", country: "Iran", osm_type: "N", osm_id: 123, osm_key: "place", ...extras }
});
const collection = (features: unknown[]) => ({ type: "FeatureCollection", features });
afterEach(() => vi.unstubAllGlobals());

describe("local Photon place search", () => {
  it("validates q/limit/bbox and calls only the same-origin gateway with an abort signal", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(collection([feature("Azadi Square")])));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const result = await searchPlaces({ q: "  Azadi Square ", bbox: "51,35,52,36" }, controller.signal);
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]?.[0]).toBe("/geocode?q=Azadi+Square&limit=5&bbox=51%2C35%2C52%2C36");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: "GET", credentials: "same-origin", signal: controller.signal });
    expect(result).toEqual([{ placeId: "osm:N:123", name: "Azadi Square",
      address: "Azadi Square, Tehran, Iran", lon: 51.38, lat: 35.7, type: "place" }]);
    await expect(searchPlaces({ q: " " })).rejects.toThrow();
    await expect(searchPlaces({ q: "valid", bbox: "51,91,52,92" })).rejects.toThrow();
    await expect(searchPlaces({ q: "valid", limit: 21 })).rejects.toThrow();
    expect(fetcher).toHaveBeenCalledOnce();
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
  it("calls only the same-origin reverse gateway with validated coordinates and abort signal", async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(collection([feature("Azadi Square", [51.38, 35.7], { housenumber: "12", street: "Azadi" })])));
    vi.stubGlobal("fetch", fetcher);
    const controller = new AbortController();
    const result = await reversePlace({ lat: 35.7, lon: 51.38 }, controller.signal);
    expect(fetcher.mock.calls[0]?.[0]).toBe("/reverse?lat=35.7&lon=51.38");
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ credentials: "same-origin", signal: controller.signal });
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
