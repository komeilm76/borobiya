import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import CompanionsView from '../src/client/views/map/CompanionsView.vue';
import { useMapStore } from '../src/client/stores/map.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The companions screen is the only place a user can see who is sharing a position and how long
 * that sharing lasts, so both lists have to render what the store holds.
 *
 * Until this suite existed the view was only ever mounted by the generic "every view mounts" sweep,
 * which rendered it with an empty store. That left it dependent on timing for how much of the file
 * the sweep happened to execute, which made the branch's *global coverage percentage* move between
 * identical runs — enough to fail a threshold that had been set from a single measurement.
 */

/** One live peer fix, as the realtime layer stores it. */
const PEER = {
  userId: 'usr_companion',
  username: 'maryam.a',
  latitude: 35.7219,
  longitude: 51.4047,
  accuracy: 12,
  recordedAt: 1794136403220
};

/** One active share, live and expiry-bounded. */
const LIVE_SHARE = { id: 'shr_live', kind: 'live', expiresAt: 1794136403220 };
/** One history-window share, which has no expiry. */
const HISTORY_SHARE = { id: 'shr_history', kind: 'history', expiresAt: null };
/** Full shares, as the list endpoint returns them (with direction and counterpart). */
const OUTGOING_SHARE = { id: 'shr_out', ownerId: 'usr_self', recipientId: 'usr_other', recipientUsername: 'maryam.a', kind: 'live', expiresAt: 1794136403220, createdAt: 1794136000000 };
const INCOMING_SHARE = { id: 'shr_in', ownerId: 'usr_other', ownerUsername: 'reza.m', recipientId: 'usr_self', kind: 'history', expiresAt: null, createdAt: 1794136000000 };

const SELF = {
  id: 'usr_self', username: 'saeed.k', role: 'user' as const, isActive: true,
  securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false,
  averageRating: 0, createdAt: 1794000000000
};

/** Mounts the screen on its route with a seeded store. */
async function render(seed: (map: ReturnType<typeof useMapStore>) => void = () => {}, options: { withSelf?: boolean } = {}) {
  const pinia = createPinia();
  setActivePinia(pinia);
  if (options.withSelf) {
    useAuthStore().$patch({ user: { ...SELF } });
  }
  const map = useMapStore();
  seed(map);

  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.companions });
  await router.isReady();
  const wrapper = mount(CompanionsView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, map };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('live companions', () => {
  it('names each companion and reports their accuracy', async () => {
    const { wrapper } = await render((map) => {
      map.liveFixes = { [PEER.userId]: PEER } as never;
    });

    const row = wrapper.find('.peer-row');
    expect(row.text()).toContain('maryam.a');
    // Accuracy and freshness are the two facts a user needs to trust a shared position.
    expect(row.text()).toContain('۱۲');
    wrapper.unmount();
  });

  it('falls back to the user id when no name is known', async () => {
    const { wrapper } = await render((map) => {
      map.liveFixes = { usr_anon: { ...PEER, userId: 'usr_anon', username: undefined } } as never;
    });
    // A nameless peer must still be identifiable rather than rendering an empty row.
    expect(wrapper.find('.peer-row').text()).toContain('usr_anon');
    wrapper.unmount();
  });

  it('counts the companions in the header', async () => {
    const { wrapper } = await render((map) => {
      map.liveFixes = {
        [PEER.userId]: PEER,
        usr_second: { ...PEER, userId: 'usr_second', username: 'reza.m' }
      } as never;
    });
    expect(wrapper.find('.status-pill').text()).toMatch(/۲ آنلاین/);
    wrapper.unmount();
  });

  it('says nobody is sharing rather than showing an empty list', async () => {
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('همراهی در حال اشتراک موقعیت نیست');
    expect(wrapper.findAll('.peer-row')).toHaveLength(0);
    wrapper.unmount();
  });
});

describe('active shares', () => {
  it('distinguishes a live share from a history window', async () => {
    const { wrapper } = await render((map) => {
      map.shares = [LIVE_SHARE, HISTORY_SHARE] as never;
    });
    const rows = wrapper.findAll('.share-list li');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('اشتراک زنده');
    expect(rows[1].text()).toContain('بازه تاریخچه');
    wrapper.unmount();
  });

  it('shows an expiry for a bounded share', async () => {
    const { wrapper } = await render((map) => {
      map.shares = [LIVE_SHARE] as never;
    });
    // A share the user believes is still live after it expired is a privacy problem.
    expect(wrapper.find('.share-list li').text()).not.toContain('بدون انقضا');
    wrapper.unmount();
  });

  it('marks an unbounded share as having no expiry', async () => {
    const { wrapper } = await render((map) => {
      map.shares = [HISTORY_SHARE] as never;
    });
    expect(wrapper.find('.share-list li').text()).toContain('بدون انقضا');
    wrapper.unmount();
  });

  it('says there is no active share rather than showing an empty list', async () => {
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('اشتراک فعالی وجود ندارد');
    wrapper.unmount();
  });

  it('shows the counterpart and direction of each share', async () => {
    const { wrapper } = await render((map) => {
      map.shares = [OUTGOING_SHARE, INCOMING_SHARE] as never;
    }, { withSelf: true });
    const rows = wrapper.findAll('.share-list .share-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('maryam.a');
    expect(rows[0].text()).toContain('ارسال موقعیت شما');
    expect(rows[1].text()).toContain('reza.m');
    expect(rows[1].text()).toContain('دریافت موقعیت');
    wrapper.unmount();
  });

  it('offers revoke only for outgoing shares', async () => {
    const { wrapper } = await render((map) => {
      map.shares = [OUTGOING_SHARE, INCOMING_SHARE] as never;
    }, { withSelf: true });
    const buttons = wrapper.findAll('[data-testid="revoke-share"]');
    expect(buttons).toHaveLength(1);
    wrapper.unmount();
  });

  it('revokes an outgoing share and reloads the list', async () => {
    const calls: Array<{ method: string; path: string }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      calls.push({ method: init?.method ?? 'GET', path });
      const data = path === '/_public/map/config' ? { pois: [] }
        : path === '/_user/places' ? { items: [] }
        : { items: [] };
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
    const { wrapper } = await render((map) => {
      map.shares = [OUTGOING_SHARE] as never;
    }, { withSelf: true });
    await wrapper.find('[data-testid="revoke-share"]').trigger('click');
    await flushPromises();
    // The DELETE must target the share; the store is then re-fetched so the row disappears.
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/_user/location/shares/shr_out')).toBe(true);
    expect(calls.some((call) => call.method === 'GET' && call.path === '/_user/location/shares')).toBe(true);
    wrapper.unmount();
  });
});
