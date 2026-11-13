import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import SharingCenterView from '../src/client/views/map/SharingCenterView.vue';
import { useMapStore } from '../src/client/stores/map.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The Sharing Center is the only place a user can see who is sharing a position and how long
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
  await router.push({ name: ROUTE_NAMES.sharing });
  await router.isReady();
  const wrapper = mount(SharingCenterView, {
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

describe('live peers', () => {
  it('names each peer and reports their accuracy', async () => {
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

  it('counts the peers in the header', async () => {
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
    expect(wrapper.text()).toContain('کسی در حال اشتراک موقعیت با شما نیست');
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

describe('creating a share', () => {
  const SEARCH_RESULT = { id: 'usr_reza', username: 'reza.m', role: 'user', readyForMission: false, averageRating: 4.5, online: true };

  function stubShareFetch(captured: { body?: Record<string, unknown>; calls: Array<{ method: string; path: string }> }) {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      captured.calls.push({ method, path });
      let data: unknown = { items: [] };
      if (path === '/_public/map/config') data = { pois: [] };
      else if (path === '/_user/places') data = { items: [] };
      else if (path === '/_user/users/search') data = { items: [SEARCH_RESULT] };
      else if (path === '/_user/location/shares' && method === 'POST') {
        captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        data = { ok: true, share: { id: 'shr_new' } };
      }
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
  }

  it('searches for a recipient and posts a live share', async () => {
    const captured: { body?: Record<string, unknown>; calls: Array<{ method: string; path: string }> } = { calls: [] };
    stubShareFetch(captured);
    const { wrapper } = await render(() => {}, { withSelf: true });

    await wrapper.find('[data-testid="share-create-toggle"]').trigger('click');
    await wrapper.find('[data-testid="share-search"]').setValue('reza');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();

    expect(captured.calls.some((call) => call.path === '/_user/users/search')).toBe(true);
    const result = wrapper.find('[data-testid="share-recipient-reza.m"]');
    expect(result.exists()).toBe(true);
    expect(wrapper.find('[data-testid="share-submit"]').attributes('disabled')).toBeDefined();

    await result.trigger('click');
    expect(wrapper.find('[data-testid="share-submit"]').attributes('disabled')).toBeUndefined();

    await wrapper.find('[data-testid="share-submit"]').trigger('click');
    await flushPromises();
    expect(captured.body).toEqual({ recipientId: 'usr_reza', kind: 'live', durationSeconds: 3600 });
    // The list is re-fetched so the new share appears without a manual refresh.
    expect(captured.calls.filter((call) => call.method === 'GET' && call.path === '/_user/location/shares').length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('posts a history-window share with the chosen range', async () => {
    const captured: { body?: Record<string, unknown>; calls: Array<{ method: string; path: string }> } = { calls: [] };
    stubShareFetch(captured);
    const { wrapper } = await render(() => {}, { withSelf: true });

    await wrapper.find('[data-testid="share-create-toggle"]').trigger('click');
    await wrapper.find('[data-testid="share-search"]').setValue('reza');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();
    await wrapper.find('[data-testid="share-recipient-reza.m"]').trigger('click');

    await wrapper.find('[data-testid="share-kind-history"]').setValue('history');
    await wrapper.find('[data-testid="share-history-from"]').setValue('2026-11-01T00:00');
    await wrapper.find('[data-testid="share-history-to"]').setValue('2026-11-02T00:00');
    await wrapper.find('[data-testid="share-submit"]').trigger('click');
    await flushPromises();

    expect(captured.body?.kind).toBe('history');
    expect(captured.body?.historyFrom).toBe(Date.parse('2026-11-01T00:00'));
    expect(captured.body?.historyTo).toBe(Date.parse('2026-11-02T00:00'));
    wrapper.unmount();
  });

  it('refuses an inverted history range and keeps the submit disabled', async () => {
    const captured: { body?: Record<string, unknown>; calls: Array<{ method: string; path: string }> } = { calls: [] };
    stubShareFetch(captured);
    const { wrapper } = await render(() => {}, { withSelf: true });

    await wrapper.find('[data-testid="share-create-toggle"]').trigger('click');
    await wrapper.find('[data-testid="share-search"]').setValue('reza');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();
    await wrapper.find('[data-testid="share-recipient-reza.m"]').trigger('click');

    await wrapper.find('[data-testid="share-kind-history"]').setValue('history');
    await wrapper.find('[data-testid="share-history-from"]').setValue('2026-11-02T00:00');
    await wrapper.find('[data-testid="share-history-to"]').setValue('2026-11-01T00:00');

    expect(wrapper.find('[data-testid="share-history-error"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="share-submit"]').attributes('disabled')).toBeDefined();
    expect(captured.body).toBeUndefined();
    wrapper.unmount();
  });

  it('says when no user matches the search', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      let data: unknown = { items: [] };
      if (path === '/_public/map/config') data = { pois: [] };
      else if (path === '/_user/users/search') data = { items: [] };
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
    const { wrapper } = await render(() => {}, { withSelf: true });

    await wrapper.find('[data-testid="share-create-toggle"]').trigger('click');
    await wrapper.find('[data-testid="share-search"]').setValue('nobody');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();

    expect(wrapper.find('[data-testid="share-search-empty"]').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('Sharing Center — indefinite grant, scope selection and direction filter', () => {
  it('offers an indefinite live grant and posts durationSeconds 0', async () => {
    const captured: { body?: Record<string, unknown> } = {};
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      let data: unknown = { items: [] };
      if (path === '/_public/map/config') data = { pois: [] };
      else if (path === '/_user/places') data = { items: [] };
      else if (path === '/_user/users/search') data = { items: [{ id: 'usr_reza', username: 'reza.m', role: 'user', readyForMission: false, averageRating: 4.5, online: true }] };
      else if (path === '/_user/location/shares' && method === 'POST') {
        captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        data = { ok: true, share: { id: 'shr_new' } };
      }
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
    const { wrapper } = await render(() => {}, { withSelf: true });
    await wrapper.find('[data-testid="share-create-toggle"]').trigger('click');
    await wrapper.find('[data-testid="share-search"]').setValue('reza');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();
    await wrapper.find('[data-testid="share-recipient-reza.m"]').trigger('click');
    await wrapper.find('[data-testid="share-duration"]').setValue('0');
    await wrapper.find('[data-testid="share-submit"]').trigger('click');
    await flushPromises();
    expect(captured.body).toEqual({ recipientId: 'usr_reza', kind: 'live', durationSeconds: 0 });
    wrapper.unmount();
  });

  it('posts the explicitly selected history detail set', async () => {
    const captured: { body?: Record<string, unknown> } = {};
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      let data: unknown = { items: [] };
      if (path === '/_public/map/config') data = { pois: [] };
      else if (path === '/_user/places') data = { items: [] };
      else if (path === '/_user/users/search') data = { items: [{ id: 'usr_reza', username: 'reza.m', role: 'user', readyForMission: false, averageRating: 4.5, online: true }] };
      else if (path === '/_user/location/shares' && method === 'POST') {
        captured.body = JSON.parse(String(init?.body)) as Record<string, unknown>;
        data = { ok: true, share: { id: 'shr_new' } };
      }
      return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
        status: 200, headers: { 'content-type': 'application/json' }
      });
    }));
    const { wrapper } = await render(() => {}, { withSelf: true });
    await wrapper.find('[data-testid="share-create-toggle"]').trigger('click');
    await wrapper.find('[data-testid="share-search"]').setValue('reza');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();
    await wrapper.find('[data-testid="share-recipient-reza.m"]').trigger('click');
    await wrapper.find('[data-testid="share-kind-history"]').setValue('history');
    // Deselect accuracy; keep motion.
    await wrapper.find('[data-testid="share-scope-accuracy"]').setValue(false);
    await wrapper.find('[data-testid="share-submit"]').trigger('click');
    await flushPromises();
    expect(captured.body?.kind).toBe('history');
    expect(captured.body?.scope).toEqual(['route', 'motion']);
    wrapper.unmount();
  });

  it('filters the share list by direction', async () => {
    const OUT = { id: 'shr_o', ownerId: 'usr_self', recipientId: 'usr_other', recipientUsername: 'reza.m', kind: 'live', expiresAt: 1794136403220, createdAt: 1 };
    const IN = { id: 'shr_i', ownerId: 'usr_other', ownerUsername: 'maryam.a', recipientId: 'usr_self', kind: 'live', expiresAt: 1794136403220, createdAt: 2 };
    const { wrapper } = await render((map) => {
      map.shares = [OUT, IN] as never;
    }, { withSelf: true });
    expect(wrapper.findAll('.share-row')).toHaveLength(2);
    await wrapper.find('[data-testid="share-direction-outgoing"]').trigger('click');
    expect(wrapper.findAll('.share-row')).toHaveLength(1);
    expect(wrapper.text()).toContain('reza.m');
    await wrapper.find('[data-testid="share-direction-incoming"]').trigger('click');
    expect(wrapper.findAll('.share-row')).toHaveLength(1);
    expect(wrapper.text()).toContain('maryam.a');
    await wrapper.find('[data-testid="share-direction-all"]').trigger('click');
    expect(wrapper.findAll('.share-row')).toHaveLength(2);
    wrapper.unmount();
  });
});
