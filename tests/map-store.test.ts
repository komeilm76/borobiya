import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMapStore } from '../src/client/stores/map.ts';

/**
 * The map store owns the live configuration, the saved places and shares, and the bottom-sheet
 * detent. Its failure paths are the substance: a public map that cannot load its configuration must
 * surface a localized error rather than a blank map, and the user's own fix must be honest about
 * what is known — an inaccurate heading must read as `null`, not `NaN`, and an accuracy the browser
 * cannot report must read as a conservative constant, not zero.
 */

/** Builds a success envelope response like the API returns. */
function envelope<T>(data: T): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_test', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

/** Builds an error envelope response like the API returns. */
function failure(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, requestId: 'req_test', error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

/** Mocks `fetch` routing by URL substring to a handler. */
function stubFetch(routes: Array<[string, () => Response | Promise<Response>]>) {
  const calls: string[] = [];
  const mock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    for (const [needle, handler] of routes) {
      if (url.includes(needle)) return handler();
    }
    return failure(404, 'NOT_FOUND', 'unmocked route');
  });
  vi.stubGlobal('fetch', mock);
  return { mock, calls };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('map store loading', () => {
  it('surfaces the API failure message when the configuration request fails', async () => {
    stubFetch([
      ['/_public/map/config', () => failure(500, 'INTERNAL', 'سرویس نقشه در دسترس نیست.')],
      ['/_user/places', () => envelope({ items: [] })],
      ['/_user/location/shares', () => envelope({ items: [] })]
    ]);
    const map = useMapStore();
    await map.load();
    expect(map.loading).toBe(false);
    expect(map.error).toBe('سرویس نقشه در دسترس نیست.');
    expect(map.config).toBe(null);
  });

  it('normalizes a transport throw to the API network message', async () => {
    // The API client converts any fetch failure — even a thrown string — into an ApiError with the
    // localized `NETWORK` message, so what the store surfaces is always that message.
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw 'kaboom';
    }));
    const map = useMapStore();
    await map.load();
    expect(map.error).toBe('ارتباط با سرور برقرار نشد.');
    expect(map.loading).toBe(false);
  });

  it('accepts a configuration without a center or a zoom and payloads without items', async () => {
    stubFetch([
      ['/_public/map/config', () => envelope({ tileTemplate: '/_public/map/tiles/{z}/{x}/{y}.svg' })],
      ['/_user/places', () => envelope({})],
      ['/_user/location/shares', () => envelope({})]
    ]);
    const map = useMapStore();
    const centerBefore = { ...map.center };
    const zoomBefore = map.zoom;
    await map.load();
    expect(map.error).toBe(null);
    // A partial config must not overwrite the canonical Tehran center or the default zoom.
    expect(map.center).toEqual(centerBefore);
    expect(map.zoom).toBe(zoomBefore);
    // A missing `items` array decodes to an empty list, not `undefined` leaking into the template.
    expect(map.places).toEqual([]);
    expect(map.shares).toEqual([]);
  });
});

describe('map store own fix', () => {
  function fix(coords: Record<string, number | null>) {
    const map = useMapStore();
    map.geolocation.coords = coords as never;
    return map;
  }

  it('reports a conservative accuracy when the browser cannot report one', () => {
    // A fix without a usable accuracy must read as imprecise (25m), never as survey grade (0m).
    const map = fix({ latitude: 35.7, longitude: 51.3, accuracy: Number.NaN as never, heading: null, speed: null });
    expect(map.ownFix?.accuracy).toBe(25);
  });

  it('keeps a finite heading and speed', () => {
    const map = fix({ latitude: 35.7, longitude: 51.3, accuracy: 8, heading: 270, speed: 4.2 });
    expect(map.ownFix?.heading).toBe(270);
    expect(map.ownFix?.speed).toBe(4.2);
  });

  it('reports an unknown heading and speed as null, not NaN', () => {
    const map = fix({ latitude: 35.7, longitude: 51.3, accuracy: 8, heading: Number.NaN as never, speed: Number.NaN as never });
    expect(map.ownFix?.heading).toBe(null);
    expect(map.ownFix?.speed).toBe(null);
  });

  it('treats a zero latitude as no fix at all', () => {
    // (0,0) is the Gulf of Guinea, not a location in Tehran; some phones emit it before a lock.
    const map = fix({ latitude: 0, longitude: 0, accuracy: 5, heading: null, speed: null });
    expect(map.ownFix).toBe(null);
  });
});

describe('map store saved places', () => {
  const base = { id: '', name: 'x', rank: 0, latitude: 35, longitude: 51, kind: 'home' as const, address: 'a', createdAt: 0 };

  it('inserts places sorted by rank and replaces an existing place in place', () => {
    const map = useMapStore();
    map.upsertPlace({ ...base, id: 'a', name: 'ناجا', rank: 5 } as never);
    map.upsertPlace({ ...base, id: 'b', name: 'خانه', rank: 1 } as never);
    map.upsertPlace({ ...base, id: 'c', name: 'کار', rank: 3 } as never);
    expect(map.places.map((place) => place.id)).toEqual(['b', 'c', 'a']);
    // Updating the rank of an existing place re-sorts instead of duplicating it.
    map.upsertPlace({ ...base, id: 'c', name: 'کار', rank: 9 } as never);
    expect(map.places.map((place) => place.id)).toEqual(['b', 'a', 'c']);
    expect(map.places).toHaveLength(3);
  });

  it('removes a saved place by id and tolerates removing one that is gone', () => {
    const map = useMapStore();
    map.upsertPlace({ ...base, id: 'a', name: 'خانه', rank: 1 } as never);
    map.upsertPlace({ ...base, id: 'b', name: 'کار', rank: 2 } as never);
    map.removePlace('a');
    expect(map.places.map((place) => place.id)).toEqual(['b']);
    // A double-delete (stale list, two screens) must not throw.
    map.removePlace('a');
    expect(map.places.map((place) => place.id)).toEqual(['b']);
  });

  it('starts and stops the geolocation watch', () => {
    // happy-dom exposes no `navigator.geolocation`; stub the browser API before the store exists,
    // the same way a browser would provide it, and assert through the real vueuse watcher.
    const watchPosition = vi.fn(() => 7);
    const clearWatch = vi.fn();
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition, clearWatch, getCurrentPosition: vi.fn() }
    });
    const map = useMapStore();
    map.startLocation();
    expect(watchPosition).toHaveBeenCalledTimes(1);
    map.stopLocation();
    expect(clearWatch).toHaveBeenCalledWith(7);
  });
});
