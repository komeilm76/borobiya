import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import HistoryView from '../src/client/views/map/HistoryView.vue';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * Stage 6: the history screen separates trips, missions and location shares into categories, and
 * every record expands to its detail and can spawn a scoped history-window share. These tests pin
 * the tab split, the day grouping, the trip repeat action and the share-panel payload.
 */

const SELF = {
  id: 'usr_self', username: 'saeed.k', role: 'user' as const, isActive: true,
  securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: false,
  averageRating: 0, createdAt: 1794000000000
};

const NOW = Math.floor(Date.now() / 60_000) * 60_000;
const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;

const REQUEST = {
  id: 'sos_1', trackingCode: 128, requesterId: 'usr_self', incidentTypeId: 'inc_medical',
  incidentLabel: 'تصادف دوچرخه', severity: 'medium', description: 'برخورد دوچرخه با خودروی عبوری در تقاطع',
  latitude: 35.72, longitude: 51.33, accuracy: 12, isManual: true, status: 'completed',
  createdAt: NOW - 2 * HOUR, updatedAt: NOW - HOUR
};
const REQUEST_DETAIL = {
  ...REQUEST,
  timeline: [
    { action: 'assign', fromStatus: '', toStatus: 'assigned', note: 'Immediate dispatch', createdAt: NOW - 90 * 60_000, actorUsername: 'admin' },
    { action: 'complete', fromStatus: 'on_the_way', toStatus: 'completed', note: null, createdAt: NOW - HOUR, actorUsername: 'reza.m' }
  ]
};
const MISSION = {
  id: 'msn_1', sosId: 'sos_9', trackingCode: 99, responderId: 'usr_self', requesterId: 'usr_other',
  incidentLabel: 'آتش‌سوزی آشپزخانه', status: 'completed', rating: 5, ratingNote: 'خیلی سریع رسیدید',
  createdAt: NOW - 26 * HOUR, updatedAt: NOW - 25 * HOUR
};
const FINISHED_TRIP = {
  id: 'trp_1', name: 'مسیر بیمارستان', status: 'completed', saved: false, role: 'leader',
  ownerId: 'usr_self', ownerUsername: 'saeed.k', stopCount: 2, memberCount: 2,
  createdAt: NOW - 3 * DAY, updatedAt: NOW - 3 * DAY, startedAt: NOW - 3 * DAY + HOUR, completedAt: NOW - 3 * DAY + 2 * HOUR
};
const PLANNED_TRIP = {
  id: 'trp_2', name: 'سفر برنامه‌ریزی‌شده', status: 'planned', saved: false, role: 'member',
  ownerId: 'usr_other', ownerUsername: 'reza.m', stopCount: 1, memberCount: 1,
  createdAt: NOW - DAY, updatedAt: NOW - DAY, startedAt: null, completedAt: null
};
const TRIP_DETAIL = {
  ...FINISHED_TRIP,
  stops: [
    { id: 'tstp_1', rank: 1, label: 'خانه', latitude: 35.72, longitude: 51.33, placeId: null },
    { id: 'tstp_2', rank: 2, label: 'بیمارستان امید', latitude: 35.73, longitude: 51.41, placeId: null }
  ],
  members: [
    { userId: 'usr_self', username: 'saeed.k', role: 'leader', joinedAt: NOW - 3 * DAY },
    { userId: 'usr_maryam', username: 'maryam.a', role: 'member', joinedAt: NOW - 3 * DAY + 1000 }
  ],
  invitations: []
};
const ACTIVE_SHARE = {
  id: 'shr_active', ownerId: 'usr_self', recipientId: 'usr_other', recipientUsername: 'maryam.a',
  kind: 'live', durationSeconds: 3600, expiresAt: NOW + HOUR, createdAt: NOW - HOUR,
  revokedAt: null, state: 'active'
};
const REVOKED_SHARE = {
  id: 'shr_revoked', ownerId: 'usr_other', recipientId: 'usr_self', ownerUsername: 'reza.m',
  kind: 'history', historyFrom: NOW - 2 * DAY, historyTo: NOW - DAY, expiresAt: NOW - DAY,
  createdAt: NOW - DAY - HOUR, revokedAt: NOW - DAY, state: 'revoked'
};
const SEARCH_RESULT = { id: 'usr_reza', username: 'reza.m', role: 'user', readyForMission: true, averageRating: 4.5, online: true };

type Handler = (path: string, method: string, body: any, url: string) => unknown;

/** Stubs fetch; `handler` decides the `data` payload per request. */
function stubFetch(handler: Handler): { calls: Array<{ method: string; path: string; url: string; body: any }> } {
  const calls: Array<{ method: string; path: string; url: string; body: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
    const path = url.split('?')[0];
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, url, body });
    const data = handler(path, method, body, url);
    return new Response(JSON.stringify({ ok: true, requestId: 'r', data }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  }));
  return { calls };
}

/** The default happy-path table; tests override per case. */
function defaultHandler(overrides: Partial<Record<string, unknown>> = {}): Handler {
  const table: Record<string, unknown> = {
    '/_public/incident-types': { items: [{ id: 'inc_medical', label: 'پزشکی', icon: 'medical-bag', color: '#af3438', severity: ['low', 'medium', 'high'] }] },
    '/_public/cancellation-reasons': { items: [{ id: 'cr_1', label: 'لغو شد', requiresText: false }] },
    '/_user/sos': { items: [REQUEST] },
    '/_user/sos/sos_1': REQUEST_DETAIL,
    '/_user/missions': { items: [MISSION] },
    '/_user/mission-offers': { items: [] },
    '/_user/trips': { items: [FINISHED_TRIP, PLANNED_TRIP] },
    '/_user/trips/invitations': { items: [] },
    '/_user/trips/trp_1': TRIP_DETAIL,
    '/_user/location/shares': { items: [ACTIVE_SHARE, REVOKED_SHARE], outgoing: 1, incoming: 1, total: 2 },
    '/_user/users/search': { items: [SEARCH_RESULT] },
    ...overrides
  };
  return (path, method) => {
    if (method === 'POST' && path === '/_user/location/shares') return { id: 'shr_new' };
    if (method === 'POST' && path === '/_user/trips') return { ...TRIP_DETAIL, id: 'trp_new' };
    if (method === 'POST' && path === '/_user/trips/trp_1/save') return { ...TRIP_DETAIL, saved: true };
    if (method === 'POST' && path === '/_user/trip-create') return { ...TRIP_DETAIL, id: 'trp_new' };
    return table[path] ?? { items: [] };
  };
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

describe('tabs and categories', () => {
  it('defaults to the missions tab and separates trips and shares', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    expect(wrapper.find('[data-testid="history-tab-missions"]').attributes('aria-selected')).toBe('true');
    // The tab strip reports per-category counts; only finished trips count.
    expect(wrapper.find('[data-testid="history-tab-trips"]').text()).toContain('۱');
    expect(wrapper.find('[data-testid="history-tab-missions"]').text()).toContain('۲');
    expect(wrapper.find('[data-testid="history-tab-shares"]').text()).toContain('۲');
    wrapper.unmount();
  });

  it('trips tab lists finished trips only, under a day bucket', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-trips"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-trip-trp_1"]').exists()).toBe(true);
    // A planned trip is not history.
    expect(wrapper.find('[data-testid="history-trip-trp_2"]').exists()).toBe(false);
    // Day-bucket headers render (date labels are locale-dependent, so just require one).
    expect(wrapper.findAll('.sheet__subtitle').length).toBeGreaterThan(0);
    wrapper.unmount();
  });

  it('shares tab lists active and revoked shares with Persian state labels', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-shares"]').trigger('click');
    await flushPromises();
    const rows = wrapper.findAll('[data-testid="history-share-row"]');
    expect(rows).toHaveLength(2);
    expect(rows[0].text()).toContain('maryam.a');
    expect(rows[0].text()).toContain('فعال');
    expect(rows[1].text()).toContain('قطع‌شده');
    wrapper.unmount();
  });

  it('shows a retry on the shares tab and recovers when the server answers', async () => {
    let calls = 0;
    stubFetch((path, method) => {
      if (path === '/_user/location/shares' && ++calls === 1) {
        // First load fails: the tab shows an error and a working retry.
        throw new Error('boom');
      }
      return defaultHandler()(path, method, undefined, '');
    });
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-shares"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-shares-error"]').exists()).toBe(true);
    await wrapper.find('[data-testid="history-shares-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="history-share-row"]')).toHaveLength(2);
    wrapper.unmount();
  });
});

describe('trip detail', () => {
  it('expands to the ranked stops and members', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-trips"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-trip-trp_1"]').trigger('click');
    await flushPromises();
    const detail = wrapper.find('[data-testid="history-trip-detail"]');
    expect(detail.text()).toContain('خانه');
    expect(detail.text()).toContain('بیمارستان امید');
    expect(detail.text()).toContain('maryam.a');
    wrapper.unmount();
  });

  it('repeats a finished trip as a fresh planned trip built from its stops', async () => {
    const { calls } = stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-trips"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-trip-trp_1"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="history-trip-repeat"]').trigger('click');
    await flushPromises();
    const post = calls.find((call) => call.method === 'POST' && call.path === '/_user/trips');
    expect(post).toBeTruthy();
    expect(post!.body.name).toBe('مسیر بیمارستان');
    expect(post!.body.stops).toEqual([
      { label: 'خانه', latitude: 35.72, longitude: 51.33, placeId: null },
      { label: 'بیمارستان امید', latitude: 35.73, longitude: 51.41, placeId: null }
    ]);
    wrapper.unmount();
  });

  it('saves a finished trip from the detail panel', async () => {
    const { calls } = stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-trips"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-trip-trp_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-trip-toggle-save"]').trigger('click');
    await flushPromises();
    const save = calls.find((call) => call.path === '/_user/trips/trp_1/save');
    expect(save?.body).toEqual({ saved: true });
    wrapper.unmount();
  });
});

describe('grouping, validation and panel lifecycle', () => {
  it('buckets same-day records under «امروز» and yesterday under «دیروز»', async () => {
    const today = { ...REQUEST, id: 'sos_today', createdAt: NOW, updatedAt: NOW };
    const yesterday = { ...REQUEST, id: 'sos_yday', createdAt: NOW - DAY, updatedAt: NOW - DAY };
    stubFetch((path, method, body, url) => {
      if (path === '/_user/sos') return { items: [today, yesterday] };
      return defaultHandler()(path, method, body, url);
    });
    const wrapper = await render();
    const subtitles = wrapper.findAll('.sheet__subtitle').map((node) => node.text());
    expect(subtitles).toContain('امروز');
    expect(subtitles).toContain('دیروز');
    wrapper.unmount();
  });

  it('missions spawn a history share bound to the mission window and the panel closes on success', async () => {
    const { calls } = stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-subtab-missions"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-mission-msn_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-share-toggle-mis-msn_1"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="history-share-search"]').setValue('reza');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();
    await wrapper.find('[data-testid="history-share-recipient-reza.m"]').trigger('click');
    await wrapper.find('[data-testid="history-share-submit"]').trigger('click');
    await flushPromises();

    const post = calls.find((call) => call.method === 'POST' && call.path === '/_user/location/shares');
    expect(post!.body.historyFrom).toBe(MISSION.createdAt);
    expect(post!.body.historyTo).toBe(MISSION.updatedAt);
    // Success closes the panel and refreshes the shares audit.
    expect(wrapper.find('[data-testid="history-share-panel"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('trips spawn a history share bound to the trip window', async () => {
    const { calls } = stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-trips"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-trip-trp_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-share-toggle-trip-trp_1"]').trigger('click');
    await flushPromises();

    await wrapper.find('[data-testid="history-share-search"]').setValue('reza');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();
    await wrapper.find('[data-testid="history-share-recipient-reza.m"]').trigger('click');
    await wrapper.find('[data-testid="history-share-submit"]').trigger('click');
    await flushPromises();

    const post = calls.find((call) => call.method === 'POST' && call.path === '/_user/location/shares');
    expect(post!.body.historyFrom).toBe(TRIP_DETAIL.startedAt);
    expect(post!.body.historyTo).toBe(TRIP_DETAIL.completedAt);
    wrapper.unmount();
  });

  it('an inverted range fails fast with Persian copy and blocks submit', async () => {
    const { calls } = stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-request-sos_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-share-toggle-req-sos_1"]').trigger('click');
    await flushPromises();

    const from = wrapper.find('[data-testid="history-share-from"]');
    const to = wrapper.find('[data-testid="history-share-to"]');
    // Drag the end before the start: the form must refuse and explain.
    const fromValue = (from.element as HTMLInputElement).value;
    await to.setValue(fromValue); // equal is still not chronological
    await flushPromises();
    expect(wrapper.find('[data-testid="history-share-error"]').text()).toContain('ابتدای بازه باید پیش از انتهای آن باشد.');
    await wrapper.find('[data-testid="history-share-submit"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/location/shares')).toBe(false);
    wrapper.unmount();
  });

  it('the panel close button dismisses it without a server call', async () => {
    const { calls } = stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-request-sos_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-share-toggle-req-sos_1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-share-panel"]').exists()).toBe(true);
    await wrapper.find('[data-testid="history-share-close"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-share-panel"]').exists()).toBe(false);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    wrapper.unmount();
  });

  it('a failed trip repeat surfaces the server message as a toast instead of crashing', async () => {
    stubFetch((path, method, body, url) => {
      if (method === 'POST' && path === '/_user/trips') throw new Error('boom');
      return defaultHandler()(path, method, body, url);
    });
    const { useToast } = await import('../src/client/composables/useToast.ts');
    const toast = useToast();
    toast.messages.value = [];
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-trips"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-trip-trp_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-trip-repeat"]').trigger('click');
    await flushPromises();
    expect(toast.messages.value.some((message) => message.tone === 'error')).toBe(true);
    wrapper.unmount();
  });
});

describe('mission details and scoped shares', () => {
  it('requests expand to the timeline the server holds', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-request-sos_1"]').trigger('click');
    await flushPromises();
    const timeline = wrapper.find('[data-testid="history-request-timeline"]');
    expect(timeline.exists()).toBe(true);
    expect(timeline.text()).toContain('اعزام');
    expect(timeline.text()).toContain('Immediate dispatch');
    // Manual fixes are flagged (DF-05).
    expect(wrapper.find('[data-testid="history-request-detail"]').text()).toContain('موقعیت دستی');
    wrapper.unmount();
  });

  it('responder missions show the given rating and note', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-subtab-missions"]').trigger('click');
    await flushPromises();
    const row = wrapper.find('[data-testid="history-mission-msn_1"]');
    expect(row.text()).toContain('۵');
    await row.trigger('click');
    await flushPromises();
    const detail = wrapper.find('[data-testid="history-mission-detail"]');
    expect(detail.text()).toContain('خیلی سریع رسیدید');
    wrapper.unmount();
  });

  it('spawns a scoped history share from a request with the record window', async () => {
    const { calls } = stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-request-sos_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-share-toggle-req-sos_1"]').trigger('click');
    await flushPromises();

    const panel = wrapper.find('[data-testid="history-share-panel"]');
    expect(panel.exists()).toBe(true);
    // The window is the record's own lifetime; the scope defaults to route + motion + accuracy.
    expect((wrapper.find('[data-testid="history-share-from"]').element as HTMLInputElement).value).not.toBe('');

    await wrapper.find('[data-testid="history-share-search"]').setValue('reza');
    await wrapper.find('form.share-search').trigger('submit');
    await flushPromises();
    await wrapper.find('[data-testid="history-share-recipient-reza.m"]').trigger('click');
    await wrapper.find('[data-testid="history-scope-accuracy"]').setValue(false);
    await wrapper.find('[data-testid="history-share-submit"]').trigger('click');
    await flushPromises();

    const post = calls.find((call) => call.method === 'POST' && call.path === '/_user/location/shares');
    expect(post).toBeTruthy();
    expect(post!.body).toEqual({
      recipientId: 'usr_reza',
      kind: 'history',
      historyFrom: NOW - 2 * HOUR,
      historyTo: NOW - HOUR,
      scope: ['route', 'motion']
    });
    wrapper.unmount();
  });
});

describe('filters (Stage E)', () => {
  it('date range filter empties the trips list and the reset button restores it', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-trips"]').trigger('click');
    await flushPromises();
    // The finished fixture trip is 3 days old: not "today", but inside 7 days.
    await wrapper.find('[data-testid="history-range-today"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-trip-trp_1"]').exists()).toBe(false);
    const empty = wrapper.find('[data-testid="history-trips-empty"]');
    expect(empty.exists()).toBe(true);
    expect(empty.text()).toContain('هیچ رکوردی با این فیلترها نیست.');

    await wrapper.find('[data-testid="history-filter-reset-trips"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-trip-trp_1"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('week range keeps a 3-day-old trip visible; status filter narrows trips', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-trips"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="history-range-week"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-trip-trp_1"]').exists()).toBe(true);

    // The only finished fixture trip is completed, so filtering by cancelled empties the list.
    await wrapper.find('[data-testid="history-status-cancelled"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-trip-trp_1"]').exists()).toBe(false);
    await wrapper.find('[data-testid="history-status-completed"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-trip-trp_1"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('missions subtab filters by date and summarises the rated average', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    // Default tab is missions, but the default subtab is "requests" — switch to missions.
    await wrapper.find('[data-testid="history-subtab-missions"]').trigger('click');
    await flushPromises();
    // The fixture mission completed 25h ago, so "today" hides it.
    expect(wrapper.find('[data-testid="history-summary"]').text()).toContain('میانگین امتیاز');
    await wrapper.find('[data-testid="history-range-today"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-missions-empty"]').exists()).toBe(true);
    await wrapper.find('[data-testid="history-range-week"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-summary"]').text()).toContain('میانگین امتیاز');
    expect(wrapper.find('[data-testid="history-mission-msn_1"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('requests subtab empties under a mismatched status filter and resets cleanly', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-subtab-requests"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-request-sos_1"]').exists()).toBe(true);
    // REQUEST fixture is completed: filtering cancelled hides it.
    await wrapper.find('[data-testid="history-status-cancelled"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-request-sos_1"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="history-requests-empty"]').text()).toContain('هیچ رکوردی با این فیلترها نیست.');
    await wrapper.find('[data-testid="history-filter-reset-requests"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-request-sos_1"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('shares tab filters by lifecycle state with honest empty states', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-tab-shares"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="history-summary"]').text()).toContain('فعال از');

    await wrapper.find('[data-testid="history-share-state-revoked"]').trigger('click');
    await flushPromises();
    const rows = wrapper.findAll('[data-testid="history-share-row"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].text()).toContain('قطع‌شده');

    // No revoked fixture exists once filtered to expired → honest empty state.
    await wrapper.find('[data-testid="history-share-state-expired"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="history-share-row"]')).toHaveLength(0);
    expect(wrapper.find('[data-testid="history-shares-empty"]').text()).toContain('هیچ اشتراکی با این فیلترها نیست.');
    await wrapper.find('[data-testid="history-filter-reset-shares"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="history-share-row"]')).toHaveLength(2);
    wrapper.unmount();
  });

  it('keeps tab totals unfiltered while lists are filtered', async () => {
    stubFetch(defaultHandler());
    const wrapper = await render();
    await wrapper.find('[data-testid="history-range-today"]').trigger('click');
    await flushPromises();
    // The missions tab badge still counts the underlying records.
    expect(wrapper.find('[data-testid="history-tab-missions"]').text()).toContain('۲');
    wrapper.unmount();
  });
});
