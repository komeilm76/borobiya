import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import OverviewView from '../src/client/views/admin/OverviewView.vue';
import ReportsView from '../src/client/views/admin/ReportsView.vue';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * Both administrator screens used to render their main panels empty against a real server: the
 * payload sends `statusCounts` keyed by name, a `{ day, count }` trend and `recentRequests`, while
 * the views read `statuses`, `{ label, value }` and `recent`. Nothing failed — the panels simply
 * showed a calm "no data" state, on the screens an operator uses to see whether the system is busy.
 */

/** The overview payload exactly as `AdminService.overview()` serializes it. */
const OVERVIEW = {
  kpis: { onlineResponders: 3, requestsToday: 7, activeMissions: 2, averageResponseSeconds: 0 },
  statusCounts: { pending: 2, dispatched: 3, completed: 1 },
  trend: [
    { day: '2026-11-06', count: 1 },
    { day: '2026-11-07', count: 4 },
    { day: '2026-11-08', count: 2 }
  ],
  groups: [{ id: 'grp_1', name: 'گروه پزشکی', color: '#AF3438', capacity: 10, status: 'active', incidentIds: [], memberCount: 2, coverageCount: 1 }],
  alerts: [
    { id: 'alt_1', kind: 'sos', severity: 'danger', message: 'درخواست بی‌پاسخ', createdAt: 1794136000000, resolvedAt: null, resolvedBy: null },
    { id: 'alt_2', kind: 'sos', severity: 'warning', message: 'درخواست بی‌پاسخ', createdAt: 1794136000000, resolvedAt: null, resolvedBy: null }
  ],
  recentRequests: [
    {
      id: 'sos_1',
      status: 'pending',
      severity: 'high',
      incidentLabel: 'آتش‌سوزی',
      requesterUsername: 'saeed.k',
      createdAt: 1794136000000
    }
  ],
  serverTime: 1794136000000
};

/** Installs a fetch double that answers the overview endpoint with the real shape. */
function stubOverview(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const data = path === '/_admin/overview' ? OVERVIEW : { items: [], total: 0 };
      return new Response(JSON.stringify({ ok: true, requestId: 'req_ov', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
}

/** Mounts an administrator view on its route. */
async function render(component: unknown, name: string) {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(component as never, {
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

describe('administrator reports', () => {
  it('lists one row per status with its count, not an empty state', async () => {
    stubOverview();
    const wrapper = await render(ReportsView, ROUTE_NAMES.adminReports);
    const rows = wrapper.findAll('.admin-list li');
    expect(rows).toHaveLength(3);

    const text = wrapper.text();
    // Raw enums must never reach the UI; the rows render the Persian status labels.
    expect(text).toContain('در انتظار');
    expect(text).toContain('اعزام‌شده');
    expect(text).toContain('تکمیل‌شده');
    // Counts are Persian-set digits; the numbers themselves must appear.
    expect(text).toContain('۲');
    expect(text).toContain('۳');
    // The empty state must not appear while there is data to report.
    expect(wrapper.find('.panel__empty').exists()).toBe(false);
    wrapper.unmount();
  });

  it('still shows the empty state when the server reports no requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: true, requestId: 'req_ov', data: { ...OVERVIEW, statusCounts: {} } }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        })
      )
    );
    const wrapper = await render(ReportsView, ROUTE_NAMES.adminReports);
    expect(wrapper.find('.panel__empty').exists()).toBe(true);
    wrapper.unmount();
  });
});

describe('administrator overview', () => {
  it('shows the real KPI values including the open-alert count', async () => {
    stubOverview();
    const wrapper = await render(OverviewView, ROUTE_NAMES.adminOverview);
    const cards = wrapper.findAll('.metric-card');
    expect(cards).toHaveLength(4);

    // Every card is checked by its own label, so a single wrong key cannot hide behind a total.
    const value = (label: string): string => cards.find((card) => card.text().includes(label))!.text();
    expect(value('درخواست امروز')).toContain('۷'); // requestsToday
    expect(value('مأموریت جاری')).toContain('۲'); // activeMissions
    expect(value('امدادگر آنلاین')).toContain('۳'); // onlineResponders
    // Two unresolved alerts in the payload. There is no `openAlerts` key, so this proves the card
    // is fed from the alert list rather than a phantom field that always read zero.
    expect(value('هشدار باز')).toContain('۲');
    wrapper.unmount();
  });

  it('lists recent requests and a trend of one entry per day', async () => {
    stubOverview();
    const wrapper = await render(OverviewView, ROUTE_NAMES.adminOverview);
    expect(wrapper.text()).toContain('آتش‌سوزی');
    const legend = wrapper.findAll('.legend li');
    expect(legend).toHaveLength(3);
    // The chart plots `count`, not the day string: a flat zero line would mean the mapping is wrong.
    const polyline = wrapper.find('polyline').attributes('points');
    expect(polyline).toBeTruthy();
    expect(polyline).not.toMatch(/^0,0 /);
    expect(wrapper.find('.panel__empty').exists()).toBe(false);
    wrapper.unmount();
  });
});
