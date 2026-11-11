import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import MapView from '../src/client/views/map/MapView.vue';
import { useMapStore } from '../src/client/stores/map.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The destination sheet is the map's only controls. Its two failure modes are both quiet:
 *
 * The sheet must be able to collapse, or it covers the map it is describing. And each quick chip
 * promises to move the map to that place — a chip that renders but does not recentre is worse than
 * no chip, because the user believes the map is showing their choice.
 *
 * Views do not load their own data (the shell calls the store), so every test seeds the store
 * before mounting.
 */

/** A saved place as the store holds it. */
const PLACE = {
  id: 'plc_1',
  label: 'انبار مرکزی',
  address: 'خیابان انبار ۱۲',
  latitude: 35.7219,
  longitude: 51.4047,
  icon: 'warehouse',
  rank: 1
};

/** Builds `count` distinct saved places. */
function places(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...PLACE,
    id: `plc_${index + 1}`,
    label: `مقصد ${index + 1}`,
    latitude: 35.7 + index / 100,
    longitude: 51.4 + index / 100,
    rank: index + 1
  }));
}

/** Mounts the sheet with a seeded store. */
async function render(seed: (map: ReturnType<typeof useMapStore>) => void = () => {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  const map = useMapStore();
  seed(map);

  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.map });
  await router.isReady();
  const wrapper = mount(MapView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, map, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('saved destinations', () => {
  it('lists the saved places with their address', async () => {
    const { wrapper } = await render((map) => {
      map.places = places(2) as never;
    });
    const rows = wrapper.findAll('.place-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('مقصد 1');
    expect(rows[0].text()).toContain('خیابان انبار ۱۲');
    wrapper.unmount();
  });

  it('shows at most four places so the sheet stays a sheet', async () => {
    const { wrapper } = await render((map) => {
      map.places = places(6) as never;
    });
    // The cap is the reason the sheet fits on a phone; exceeding it pushes the trip button off.
    expect(wrapper.findAll('.place-row')).toHaveLength(4);
    expect(wrapper.findAll('.quick-chip')).toHaveLength(4);
    wrapper.unmount();
  });

  it('falls back to a generic marker icon when a place has none', async () => {
    const { wrapper } = await render((map) => {
      map.places = [{ ...PLACE, icon: '' }] as never;
    });
    const icon = wrapper.find('.place-row .mdi');
    expect(icon.classes()).toContain('mdi-map-marker-outline');
    wrapper.unmount();
  });

  it('uses the place icon when one is stored', async () => {
    const { wrapper } = await render((map) => {
      map.places = places(1) as never;
    });
    expect(wrapper.find('.place-row .mdi').classes()).toContain('mdi-warehouse');
    wrapper.unmount();
  });
});

describe('quick chips', () => {
  it('moves the map to the place the chip names', async () => {
    const seeded = places(3);
    const { wrapper, map } = await render((store) => {
      store.places = seeded as never;
    });

    await wrapper.findAll('.quick-chip')[1].trigger('click');
    await flushPromises();

    // The chip's whole purpose is this recentre; rendering without moving is a dead control.
    expect(map.center).toEqual({ latitude: seeded[1].latitude, longitude: seeded[1].longitude });
    wrapper.unmount();
  });

  it('labels each chip with the same place as the row below it', async () => {
    const { wrapper } = await render((map) => {
      map.places = places(2) as never;
    });
    const chips = wrapper.findAll('.quick-chip').map((chip) => chip.text());
    const rows = wrapper.findAll('.place-row strong').map((row) => row.text());
    // A chip pointing at a different place than its label is worse than no chip.
    expect(chips).toEqual(rows);
    wrapper.unmount();
  });
});

describe('sheet state', () => {
  it('reports a loading map instead of an empty one', async () => {
    const { wrapper } = await render((map) => {
      map.loading = true;
    });
    expect(wrapper.find('.sheet__status').text()).toContain('در حال خواندن نقشه');
    wrapper.unmount();
  });

  it('shows the store error when the map failed to load', async () => {
    const { wrapper } = await render((map) => {
      map.error = 'ارتباط با سرور برقرار نشد.';
    });
    expect(wrapper.find('.sheet__status--error').text()).toContain('ارتباط با سرور');
    wrapper.unmount();
  });

  it('expands the sheet and then collapses it again', async () => {
    const { wrapper, map } = await render();
    const toggle = wrapper.find('.sheet__expand');

    await toggle.trigger('click');
    await flushPromises();
    expect(map.detent).toBe('open');

    // A sheet that only ever expands covers the map it exists to explain.
    await toggle.trigger('click');
    await flushPromises();
    expect(map.detent).toBe('half');
    wrapper.unmount();
  });
});

describe('location and peers', () => {
  it('asks for location permission rather than showing a placeholder coordinate', async () => {
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('در انتظار اجازه موقعیت‌یابی');
    wrapper.unmount();
  });

  it('formats a known position to four decimals', async () => {
    // The store binds VueUse's geolocation when it is created, so the stub must exist first — and
    // `useGeolocation` only ever calls `watchPosition`, so the stub has to invoke the callback.
    const watchPosition = vi.fn((success: PositionCallback) => {
      success({
        coords: {
          latitude: 35.721945,
          longitude: 51.404712,
          accuracy: 10,
          heading: null,
          speed: null,
          altitude: null,
          altitudeAccuracy: null
        },
        timestamp: Date.now()
      } as GeolocationPosition);
      return 1;
    });
    // Define the property rather than replacing `navigator`: happy-dom exposes `navigator` as an
    // accessor, so spreading it and re-stubbing the whole object leaves `geolocation` null.
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: { watchPosition, clearWatch: vi.fn(), getCurrentPosition: vi.fn() }
    });

    // The view does not start location itself (the map shell does), so the store is asked to start
    // before mounting; otherwise the sheet correctly shows the permission prompt.
    const { wrapper, map } = await render((store) => store.startLocation());
    await vi.waitFor(() => expect(map.ownFix).not.toBe(null));
    await flushPromises();

    const text = wrapper.find('.info-card').text();
    // Four decimals is roughly ten metres; more would imply a precision GPS does not have. The
    // formatter renders Latin digits as Persian ones but keeps the decimal point as a dot.
    expect(text).toContain('۳۵.۷۲۱۹');
    expect(text).toContain('۵۱.۴۰۴۷');
    expect(text).not.toContain('در انتظار اجازه');
    wrapper.unmount();
  });

  it('counts the peers sharing their location', async () => {
    // `peers` is derived from `liveFixes`, which is what the realtime client fills in.
    const { wrapper } = await render((map) => {
      map.liveFixes = {
        usr_1: { userId: 'usr_1', latitude: 35.72, longitude: 51.4, accuracy: 10, heading: null, speed: null, recordedAt: 1 },
        usr_2: { userId: 'usr_2', latitude: 35.73, longitude: 51.41, accuracy: 10, heading: null, speed: null, recordedAt: 2 }
      } as never;
    });
    expect(wrapper.text()).toMatch(/۲ نفر/);
    wrapper.unmount();
  });

  it('says nobody is sharing rather than leaving the count blank', async () => {
    const { wrapper } = await render();
    expect(wrapper.text()).toMatch(/۰ نفر/);
    wrapper.unmount();
  });
});

describe('selected destination', () => {
  it('renders the panel with coordinates and the distance from my fix', async () => {
    const { wrapper } = await render((map) => {
      map.destinationPin = { latitude: 35.7219, longitude: 51.4047 };
      map.ownFix = null;
    });
    const panel = wrapper.find('[data-testid="destination-panel"]');
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain('مقصد انتخاب‌شده');
    expect(panel.text()).toContain('۵۱.۴۰۴۷');
    wrapper.unmount();
  });

  it('clears the selection from the panel', async () => {
    const { wrapper } = await render((map) => {
      map.destinationPin = { latitude: 35.7219, longitude: 51.4047 };
    });
    await wrapper.find('[data-testid="clear-destination"]').trigger('click');
    expect(useMapStore().destinationPin).toBeNull();
    expect(wrapper.find('[data-testid="destination-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('saves the destination as a saved place and shows it in the list', async () => {
    const calls: Array<{ method: string; path: string; body?: any }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const data = path === '/_user/places' && method === 'POST'
        ? { id: 'plc_new', name: 'خانه مادر', label: 'خانه', latitude: 35.7219, longitude: 51.4047, address: 'خیابان انبار ۱۲', icon: 'home-outline', rank: 1 }
        : { items: [] };
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
    const { wrapper } = await render((map) => {
      map.destinationPin = { latitude: 35.7219, longitude: 51.4047 };
    });
    await wrapper.find('[data-testid="open-save-place"]').trigger('click');
    await wrapper.find('.save-place-form input').setValue('خانه مادر');
    await wrapper.findAll('.save-place-form input')[1].setValue('خانه');
    await wrapper.findAll('.save-place-form input')[2].setValue('خیابان انبار ۱۲');
    await wrapper.find('.save-place-form').trigger('submit');
    await flushPromises();
    const created = calls.find((call) => call.path === '/_user/places' && call.method === 'POST');
    expect(created?.body).toMatchObject({ name: 'خانه مادر', label: 'خانه', address: 'خیابان انبار ۱۲', latitude: 35.7219, longitude: 51.4047 });
    expect(useMapStore().places.some((place) => place.id === 'plc_new')).toBe(true);
    vi.unstubAllGlobals();
    wrapper.unmount();
  });
});

describe('navigation', () => {
  it('starts a trip from the sheet footer', async () => {
    const { wrapper, router } = await render();
    const push = vi.spyOn(router, 'push');
    await wrapper.find('.sheet__footer button').trigger('click');
    await flushPromises();
    // The footer button is the sheet's primary action; a dead one strands the whole flow.
    expect(vi.mocked(push).mock.calls.at(-1)?.[0]).toEqual({ name: ROUTE_NAMES.mission });
    wrapper.unmount();
  });

  it('sends the share action to the Sharing Center', async () => {
    const { wrapper, router } = await render((map) => {
      map.places = places(1) as never;
    });
    const push = vi.spyOn(router, 'push');
    await wrapper.find('.place-row .text-link').trigger('click');
    await flushPromises();
    // Sharing a destination needs a recipient, which only that screen offers.
    expect(vi.mocked(push).mock.calls.at(-1)?.[0]).toEqual({ name: ROUTE_NAMES.sharing });
    wrapper.unmount();
  });
});
