import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MapCanvas from '../src/client/components/MapCanvas.vue';
import { useMapStore } from '../src/client/stores/map.ts';
import { useSosStore } from '../src/client/stores/sos.ts';
import { worldCoordinate } from '../src/shared/geo.ts';

/**
 * The map canvas is the emergency surface: a red incident marker that lands in the wrong place, or
 * a tile layer that collapses to nothing, is not a cosmetic bug. Everything below is asserted
 * against the geometry the component actually publishes to the DOM — marker positions, tile keys
 * and tile URLs — rather than against internal helpers.
 *
 * The projection is the important part. `MapCanvas` originally carried its own copy of the
 * Web-Mercator formula and `src/shared/geo.ts` carried another, and they disagreed: the shared one
 * clamps latitude to ±85.05112878 (the latitude at which the Mercator world becomes square), the
 * component's copy did not. At exactly ±90 that makes `log((1 + sin) / (1 - sin))` infinite, the
 * tile loop never advances, and the browser hangs. The component now uses the shared helper, and
 * the first test below is the one that would have caught the hang.
 */

const VIEW_WIDTH = 393;
const VIEW_HEIGHT = 852;
const TILE_SIZE = 256;

interface Seed {
  map?: (map: ReturnType<typeof useMapStore>) => void;
  sos?: (sos: ReturnType<typeof useSosStore>) => void;
}

/** A point at the rendered frame's centre must round-trip to the store centre. */
describe('manual placement', () => {
  it('ignores taps while not armed', async () => {
    const before = { latitude: 35.7219, longitude: 51.3347 };
    const { wrapper, sos } = await render({ map: (map) => { map.center = { ...before }; map.zoom = 14; } });
    const canvas = wrapper.find('[data-testid="map-canvas"]');
    await canvas.trigger('click', { clientX: 100, clientY: 100 });
    expect(sos.draft.isManual).toBe(false);
    expect(sos.draft.latitude).toBeCloseTo(35.7219, 6);
    wrapper.unmount();
  });

  it('drops the incident pin where the user taps when armed', async () => {
    const { wrapper, sos } = await render({ map: (map) => { map.center = { latitude: 35.7219, longitude: 51.3347 }; map.zoom = 16; } });
    // jsdom reports a zero rect, so the tap point is used verbatim as canvas pixels.
    sos.armPlacement();
    await flushPromises();
    const canvas = wrapper.find('[data-testid="map-canvas"]');
    // Tapping the exact centre of the frame must land on the current centre coordinate.
    await canvas.trigger('click', { clientX: 393 / 2, clientY: 852 / 2 });
    expect(sos.draft.isManual).toBe(true);
    expect(sos.placementArmed).toBe(false);
    expect(sos.draft.latitude).toBeCloseTo(35.7219, 3);
    expect(sos.draft.longitude).toBeCloseTo(51.3347, 3);
    expect(sos.draft.accuracy).toBe(0);
    wrapper.unmount();
  });

  it('renders the manual incident pin while armed or placed', async () => {
    const { wrapper } = await render({ sos: (sos) => { sos.draft.isManual = true; sos.draft.latitude = 35.7219; sos.draft.longitude = 51.3347; } });
    expect(wrapper.find('[data-testid="incident-pin"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

/** Mounts the canvas against freshly seeded stores. */
async function render(seed: Seed = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const map = useMapStore();
  const sos = useSosStore();
  seed.map?.(map);
  seed.sos?.(sos);
  const wrapper = mount(MapCanvas, {
    attachTo: document.body,
    global: { plugins: [pinia] }
  });
  await flushPromises();
  return { wrapper, map, sos };
}

/** Reads a marker's inline `inset-*` offsets as numbers. */
function offset(element: Element, property: 'inlineStart' | 'blockStart') {
  const style = (element as HTMLElement).style;
  const value = property === 'inlineStart' ? style.insetInlineStart : style.insetBlockStart;
  return Number.parseFloat(value);
}

/** The expected screen position of a coordinate at the store's centre. */
function expectedPosition(latitude: number, longitude: number, center: { latitude: number; longitude: number }, zoom: number) {
  const world = worldCoordinate(latitude, longitude, zoom);
  const origin = worldCoordinate(center.latitude, center.longitude, zoom);
  return {
    x: world.x - origin.x + VIEW_WIDTH / 2,
    y: world.y - origin.y + VIEW_HEIGHT / 2
  };
}

const PLACE = {
  id: 'plc_1',
  label: 'انبار مرکزی',
  address: 'خیابان انبار ۱۲',
  latitude: 35.7219,
  longitude: 51.4047,
  icon: 'warehouse',
  rank: 1
};

const INCIDENT = {
  id: 'sos_1',
  incidentLabel: 'آتش‌سوزی',
  status: 'pending' as const,
  latitude: 35.73,
  longitude: 51.35
};

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('the projected surface', () => {
  it('renders a tile grid around the centre', async () => {
    const { wrapper } = await render();
    const tiles = wrapper.findAll('.map-tiles img');
    // A 393x852 viewport covers at least two tiles in each direction.
    expect(tiles.length).toBeGreaterThanOrEqual(4);

    const src = tiles[0].attributes('src')!;
    // The URL is the same in-process SVG renderer the service worker caches; the format is a
    // contract with the tile route, so it is asserted exactly.
    expect(src).toMatch(/^\/_public\/map\/tiles\/14\/\d+\/\d+\.svg$/);
    expect(tiles[0].attributes('width')).toBe(String(TILE_SIZE));
    expect(tiles[0].attributes('height')).toBe(String(TILE_SIZE));
  });

  it('keeps the whole visible grid inside the world bounds', async () => {
    const { wrapper } = await render();
    const max = 2 ** 14;
    for (const tile of wrapper.findAll('.map-tiles img')) {
      const [, x, y] = tile.attributes('src')!.match(/tiles\/14\/(\d+)\/(\d+)\.svg/)!;
      // A tile outside [0, max) has no image and would render as a hole in the map.
      expect(Number(x)).toBeGreaterThanOrEqual(0);
      expect(Number(x)).toBeLessThan(max);
      expect(Number(y)).toBeGreaterThanOrEqual(0);
      expect(Number(y)).toBeLessThan(max);
    }
  });

  it('covers the viewport with no gaps between tiles', async () => {
    const { wrapper } = await render();
    const tiles = wrapper.findAll('.map-tiles img');
    const tops = new Set(tiles.map((tile) => offset(tile.element, 'blockStart')));
    const lefts = new Set(tiles.map((tile) => offset(tile.element, 'inlineStart')));
    // Every row shares one column set and every column one row set; anything else means the grid
    // has a hole in it, and a hole in a map is a missing street.
    const byTop = new Map<number, number[]>();
    for (const tile of tiles) {
      const top = offset(tile.element, 'blockStart');
      byTop.set(top, [...(byTop.get(top) ?? []), offset(tile.element, 'inlineStart')]);
    }
    const sorted = [...byTop.values()].map((row) => [...row].sort((a, b) => a - b).join(','));
    expect(new Set(sorted).size).toBe(1);
    expect(tops.size * lefts.size).toBe(tiles.length);
  });

  it('survives a centre at the poles instead of hanging', async () => {
    // The regression this file exists for. Without the latitude clamp the Mer- cator y term is
    // infinite, both loop bounds are infinite and the renderer never terminates.
    for (const latitude of [90, -90, 89.999]) {
      const { wrapper } = await render({
        map: (map) => {
          map.center = { latitude, longitude: 51.3347 };
        }
      });
      const tiles = wrapper.findAll('.map-tiles img');
      expect(tiles.length, String(latitude)).toBeGreaterThan(0);
      expect(tiles.length, String(latitude)).toBeLessThan(64);
      wrapper.unmount();
    }
  });

  it('survives a centre far outside the latitude range', async () => {
    // A corrupt config or a bad projection upstream must not blank the map either.
    const { wrapper } = await render({
      map: (map) => {
        map.center = { latitude: 1_000, longitude: 51.3 };
      }
    });
    expect(wrapper.findAll('.map-tiles img').length).toBeGreaterThan(0);
  });

  it('clips tiles at the antimeridian rather than requesting tiles that do not exist', async () => {
    // At longitude ±180 the viewport straddles the edge of the world. The x bounds check is what
    // stops it asking for tile -1 or tile 2^zoom, neither of which has an image.
    for (const longitude of [179.999, -179.999]) {
      const { wrapper } = await render({ map: (map) => { map.center = { latitude: 35.7219, longitude }; } });
      const max = 2 ** 14;
      const tiles = wrapper.findAll('.map-tiles img');
      expect(tiles.length, String(longitude)).toBeGreaterThan(0);
      for (const tile of tiles) {
        const [, x] = tile.attributes('src')!.match(/tiles\/14\/(\d+)\//)!;
        expect(Number(x), String(longitude)).toBeLessThan(max);
        expect(tile.attributes('src')).not.toContain('/-');
      }
      wrapper.unmount();
    }
  });

  it('renders the scale label from the formatter', async () => {
    const { wrapper } = await render();
    // The scale is a promise to the user about distance; it must not be an empty div.
    expect(wrapper.find('.map-scale').text().trim().length).toBeGreaterThan(0);
    expect(wrapper.find('.map-scale span').exists()).toBe(true);
  });

  it('describes itself to assistive technology', async () => {
    const { wrapper } = await render();
    const canvas = wrapper.find('.map-canvas');
    expect(canvas.attributes('role')).toBe('img');
    expect(canvas.attributes('aria-label')).toBeTruthy();
  });

  it('hides the decorative tile images from assistive technology', async () => {
    const { wrapper } = await render();
    // The tiles carry the cartography, but the accessible description is the canvas label; a screen
    // reader announcing each empty image would bury it.
    for (const tile of wrapper.findAll('.map-tiles img')) {
      expect(tile.attributes('alt')).toBe('');
      expect(tile.attributes('aria-hidden')).toBe('true');
    }
  });
});

describe('markers', () => {
  it('places a saved place where the projection says it belongs', async () => {
    const { wrapper } = await render({
      map: (map) => {
        map.places = [PLACE, { ...PLACE, id: 'plc_2', label: 'دفتر', latitude: 35.75, longitude: 51.3 }] as never;
      }
    });
    const markers = wrapper.findAll('.map-marker--place');
    expect(markers).toHaveLength(2);

    for (const [index, place] of [PLACE, { latitude: 35.75, longitude: 51.3 }].entries()) {
      const expected = expectedPosition(place.latitude, place.longitude, { latitude: 35.7219, longitude: 51.3347 }, 14);
      // Sub-pixel agreement: the marker must be at the coordinate, not merely near it.
      expect(offset(markers[index].element, 'inlineStart')).toBeCloseTo(expected.x, 6);
      expect(offset(markers[index].element, 'blockStart')).toBeCloseTo(expected.y, 6);
    }
  });

  it('labels each place marker with its name', async () => {
    const { wrapper } = await render({ map: (map) => { map.places = [PLACE] as never; } });
    expect(wrapper.find('.map-marker--place').attributes('title')).toBe(PLACE.label);
    // The place's own icon decides the marker glyph.
    expect(wrapper.find('.map-marker--place .mdi').classes()).toContain('mdi-warehouse');
  });

  it('falls back to a default glyph for a place with no icon', async () => {
    const { wrapper } = await render({
      map: (map) => {
        map.places = [{ ...PLACE, icon: '' }] as never;
      }
    });
    // An empty icon would otherwise produce the class `mdi-`, which renders nothing at all — a
    // marker that is in the DOM but invisible on the map.
    expect(wrapper.find('.map-marker--place .mdi').classes()).toContain('mdi-map-marker-outline');
  });

  it('places a peer at its fix and falls back to the user id for a label', async () => {
    const { wrapper } = await render({
      map: (map) => {
        map.liveFixes = {
          usr_1: { userId: 'usr_1', username: 'مریم', latitude: 35.7, longitude: 51.4, recordedAt: Date.now() } as never,
          usr_2: { userId: 'usr_2', username: null, latitude: 35.74, longitude: 51.3, recordedAt: Date.now() } as never
        };
      }
    });
    const peers = wrapper.findAll('.map-marker--peer');
    expect(peers).toHaveLength(2);
    const labels = peers.map((peer) => peer.attributes('title'));
    expect(labels).toContain('مریم');
    // A peer with no username must still be identifiable rather than rendering as an unlabelled dot.
    expect(labels).toContain('usr_2');

    const expected = expectedPosition(35.7, 51.4, { latitude: 35.7219, longitude: 51.3347 }, 14);
    expect(offset(peers[0].element, 'inlineStart')).toBeCloseTo(expected.x, 6);
    expect(offset(peers[0].element, 'blockStart')).toBeCloseTo(expected.y, 6);
  });

  it('shows the incident marker for a live request', async () => {
    const { wrapper } = await render({ sos: (sos) => { sos.requests = [INCIDENT] as never; } });
    const markers = wrapper.findAll('.map-marker--incident');
    expect(markers).toHaveLength(1);
    expect(markers[0].attributes('title')).toBe(INCIDENT.incidentLabel);

    const expected = expectedPosition(INCIDENT.latitude, INCIDENT.longitude, { latitude: 35.7219, longitude: 51.3347 }, 14);
    expect(offset(markers[0].element, 'inlineStart')).toBeCloseTo(expected.x, 6);
    expect(offset(markers[0].element, 'blockStart')).toBeCloseTo(expected.y, 6);
  });

  it('hides requests that are already over', async () => {
    // `requests` keeps history. Only the live ones belong on the map; an old resolved incident
    // rendered as an active alarm is a false emergency.
    for (const status of ['completed', 'cancelled', 'expired', 'resolved']) {
      const { wrapper } = await render({
        sos: (sos) => {
          sos.requests = [{ ...INCIDENT, status }] as never;
        }
      });
      expect(wrapper.findAll('.map-marker--incident'), status).toHaveLength(0);
      wrapper.unmount();
    }
  });

  it('shows pending and dispatched requests', async () => {
    const { wrapper } = await render({
      sos: (sos) => {
        sos.requests = [{ ...INCIDENT, id: 'sos_1', status: 'pending' }, { ...INCIDENT, id: 'sos_2', status: 'dispatched' }] as never;
      }
    });
    expect(wrapper.findAll('.map-marker--incident')).toHaveLength(2);
  });

  it('omits the self marker when there is no fix', async () => {
    const { wrapper } = await render();
    // No fix means no position; a self marker at the origin would be worse than none.
    expect(wrapper.find('.user-marker').exists()).toBe(false);
  });

  it('draws the self marker when geolocation reports a fix', async () => {
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition: vi.fn(() => 1), clearWatch: vi.fn(), getCurrentPosition: vi.fn() }
    });
    const { wrapper, map } = await render();
    // The store exposes its vueuse handle, so drive the coordinates through the store rather than
    // through the browser API: the assertion is about the marker, not about geolocation.
    // Pinia unwraps nested refs, so `map.geolocation.coords` is the coordinate object itself: the
    // assignment goes through the reactive proxy and Vue writes it into the underlying shallowRef.
    map.geolocation.coords = {
      latitude: 35.71, longitude: 51.41, accuracy: 12, heading: null, speed: null
    } as never;
    await flushPromises();

    const self = wrapper.find('.user-marker');
    expect(self.exists()).toBe(true);
    expect(self.attributes('aria-label')).toBeTruthy();
    const expected = expectedPosition(35.71, 51.41, { latitude: 35.7219, longitude: 51.3347 }, 14);
    expect(offset(self.element, 'inlineStart')).toBeCloseTo(expected.x, 6);
    expect(offset(self.element, 'blockStart')).toBeCloseTo(expected.y, 6);
  });

  it('moves the markers when the map is recentred', async () => {
    const { wrapper, map } = await render({ map: (store) => { store.places = [PLACE] as never; } });
    const before = offset(wrapper.find('.map-marker--place').element, 'inlineStart');
    map.center = { latitude: 35.7219, longitude: 51.3047 };
    await flushPromises();
    const after = offset(wrapper.find('.map-marker--place').element, 'inlineStart');
    // Panning east must move the marker west, and by a visible amount.
    expect(after).toBeGreaterThan(before);

    const expected = expectedPosition(PLACE.latitude, PLACE.longitude, map.center, map.zoom);
    expect(after).toBeCloseTo(expected.x, 6);
  });

  it('zooms the tile level and the marker geometry together', async () => {
    const { wrapper, map } = await render({ map: (store) => { store.places = [PLACE] as never; } });
    map.zoom = 12;
    await flushPromises();
    expect(wrapper.find('.map-tiles img').attributes('src')).toContain('/tiles/12/');
    const expected = expectedPosition(PLACE.latitude, PLACE.longitude, map.center, 12);
    expect(offset(wrapper.find('.map-marker--place').element, 'inlineStart')).toBeCloseTo(expected.x, 6);
  });
});
