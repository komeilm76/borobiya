import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import HistoryView from '../src/client/views/map/HistoryView.vue';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The history screen now also reports every share the viewer was part of — active, expired and
 * revoked — which is the only place a user can audit who they ever shared their location with.
 */

const SELF = {
  id: 'usr_self', username: 'saeed.k', role: 'user' as const, isActive: true,
  securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false,
  averageRating: 0, createdAt: 1794000000000
};

const ACTIVE_SHARE = {
  id: 'shr_active', ownerId: 'usr_self', recipientId: 'usr_other', recipientUsername: 'maryam.a',
  kind: 'live', durationSeconds: 3600, expiresAt: 1794136403220, createdAt: 1794136000000,
  revokedAt: null, state: 'active'
};
const REVOKED_SHARE = {
  id: 'shr_revoked', ownerId: 'usr_other', recipientId: 'usr_self', ownerUsername: 'reza.m',
  kind: 'history', historyFrom: 1794050000000, historyTo: 1794130000000, expiresAt: 1794130000000,
  createdAt: 1794040000000, revokedAt: 1794140000000, state: 'revoked'
};

function stubShares(data: unknown, ok = true) {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const path = url.split('?')[0];
    let body: unknown;
    if (path === '/_user/location/shares') {
      body = ok
        ? { ok: true, requestId: 'r', data }
        : { ok: false, requestId: 'r', error: { code: 'INTERNAL', message: 'خطای سرور.' } };
    } else {
      body = { ok: true, requestId: 'r', data: { items: [] } };
    }
    return new Response(JSON.stringify(body), {
      status: ok || path !== '/_user/location/shares' ? 200 : 500,
      headers: { 'content-type': 'application/json' }
    });
  }));
}

async function render() {
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().$patch({ user: { ...SELF } });
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.history });
  await router.isReady();
  const wrapper = mount(HistoryView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return wrapper;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('share history section', () => {
  it('lists active and revoked shares with Persian state labels and direction', async () => {
    stubShares({ items: [ACTIVE_SHARE, REVOKED_SHARE], outgoing: 1, incoming: 1, total: 2 });
    const wrapper = await render();
    const rows = wrapper.findAll('[data-testid="history-share-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('maryam.a');
    expect(rows[0].text()).toContain('ارسال موقعیت شما');
    expect(rows[0].text()).toContain('فعال');
    expect(rows[1].text()).toContain('reza.m');
    expect(rows[1].text()).toContain('دریافت موقعیت');
    expect(rows[1].text()).toContain('قطع‌شده');
    wrapper.unmount();
  });

  it('hides the section entirely when the server refuses, leaving the rest of the screen usable', async () => {
    stubShares({}, false);
    const wrapper = await render();
    expect(wrapper.findAll('[data-testid="history-share-row"]')).toHaveLength(0);
    // The rest of the history screen still renders.
    expect(wrapper.text()).toContain('درخواست‌های امدادی');
    wrapper.unmount();
  });
});
