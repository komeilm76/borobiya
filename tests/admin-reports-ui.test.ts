import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import ReportsView from '../src/client/views/admin/ReportsView.vue';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The reports screen is where an administrator decides how the operation is actually doing.
 * These tests pin that every figure on screen is fed by the `/_admin/reports` payload for the
 * selected window — not by the overview widgets — and that switching the period re-queries.
 */

const REPORTS_30 = {
  days: 30,
  periodStart: Date.now() - 29 * 86_400_000,
  periodEnd: Date.now(),
  kpis: {
    totalRequests: 2418, requestsDeltaPct: 8, avgResponseSeconds: 252, avgResponseDeltaSeconds: 38,
    acceptanceRate: 92, acceptanceRateDeltaPct: 2, cancelledMissions: 12, cancelledDeltaPct: -12
  },
  trend: Array.from({ length: 30 }, (_, index) => ({
    day: `2026-10-${String(index + 1).padStart(2, '0')}`,
    requests: 40 + ((index * 37 + 13) % 17),
    missions: 25 + ((index * 13 + 7) % 11)
  })),
  incidentTypes: [
    { label: 'آتش‌سوزی', color: '#c2410c', icon: 'fire', count: 612 },
    { label: 'پزشکی', color: '#af3438', icon: 'medical-bag', count: 540 }
  ],
  groups: [
    { id: 'grp_fire', name: 'گروه آتشنشانی', color: '#B35A18', requests: 1018, avgResponseSeconds: 234, acceptanceRate: 96, ratingAvg: 4.8 },
    { id: 'grp_urban', name: 'گروه امداد شهری', color: '#316D86', requests: 289, avgResponseSeconds: 451, acceptanceRate: 74, ratingAvg: 3.6 }
  ],
  groupRequestTotal: 1307,
  serverTime: Date.now()
};

const REPORTS_7 = { ...REPORTS_30, days: 7, trend: REPORTS_30.trend.slice(-7) };

const EMPTY_REPORTS = {
  days: 30,
  periodStart: Date.now() - 29 * 86_400_000,
  periodEnd: Date.now(),
  kpis: {
    totalRequests: 0, requestsDeltaPct: null, avgResponseSeconds: null, avgResponseDeltaSeconds: null,
    acceptanceRate: null, acceptanceRateDeltaPct: null, cancelledMissions: 0, cancelledDeltaPct: null
  },
  trend: Array.from({ length: 30 }, (_, index) => ({ day: `2026-10-${String(index + 1).padStart(2, '0')}`, requests: 0, missions: 0 })),
  incidentTypes: [],
  groups: [],
  groupRequestTotal: 0,
  serverTime: Date.now()
};

function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_reports', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function stubApi(reports: Record<string, unknown> | Record<string, Record<string, unknown>> = REPORTS_30) {
  const calls: Array<{ method: string; path: string; query: URLSearchParams }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, 'http://test.local');
      const method = init?.method ?? 'GET';
      calls.push({ method, path: url.pathname, query: url.searchParams });
      if (url.pathname === '/_admin/reports') {
        const days = String(url.searchParams.get('days') ?? '30');
        const payload = 'days' in reports && typeof reports.kpis !== 'undefined'
          ? reports
          : (reports as Record<string, Record<string, unknown>>)[days] ?? REPORTS_30;
        return json(payload);
      }
      if (url.pathname === '/_admin/overview') return json({ kpis: {}, trend: [], statusCounts: {} });
      return json({ items: [], total: 0 });
    })
  );
  return calls;
}

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.adminReports });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(ReportsView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  for (const message of [...useToast().messages.value]) useToast().dismiss(message.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('reports KPIs', () => {
  it('renders the payload figures, not overview widgets', async () => {
    stubApi();
    const { wrapper } = await render();
    const kpis = wrapper.find('[data-testid="reports-kpis"]');
    expect(kpis.text()).toContain('۲۴۱۸');
    expect(kpis.text()).toContain('۹۲');
    // Delta lines compare against the previous window.
    expect(kpis.text()).toContain('+۸');
    expect(kpis.text()).toContain('در مقایسه با بازهٔ قبل');
    wrapper.unmount();
  });

  it('shows the empty-delta copy when the previous window has no data', async () => {
    stubApi({ ...REPORTS_30, kpis: { ...REPORTS_30.kpis, requestsDeltaPct: null, avgResponseDeltaSeconds: null } });
    const { wrapper } = await render();
    expect(wrapper.find('[data-testid="reports-kpis"]').text()).toContain('بازهٔ قبل داده‌ای ندارد');
    wrapper.unmount();
  });

  it('re-queries with the chosen window when a period chip is pressed', async () => {
    const calls = stubApi({ '7': REPORTS_7, '30': REPORTS_30 });
    const { wrapper } = await render();
    await wrapper.find('[data-testid="reports-period-7"]').trigger('click');
    await flushPromises();
    const reportCalls = calls.filter((call) => call.path === '/_admin/reports');
    expect(reportCalls.at(-1)?.query.get('days')).toBe('7');
    wrapper.unmount();
  });
});

describe('reports sections', () => {
  it('draws the incident-type bars and lists the group share', async () => {
    stubApi();
    const { wrapper } = await render();
    const incidents = wrapper.find('[data-testid="reports-incidents"]');
    expect(incidents.text()).toContain('آتش‌سوزی');
    expect(incidents.text()).toContain('۶۱۲');

    const donut = wrapper.find('[data-testid="reports-donut"]');
    expect(donut.text()).toContain('گروه آتشنشانی');
    expect(donut.text()).toContain('۱۳۰۷');
    wrapper.unmount();
  });

  it('grades groups by the documented thresholds', async () => {
    stubApi();
    const { wrapper } = await render();
    const table = wrapper.find('[data-testid="reports-groups"]');
    expect(table.text()).toContain('گروه آتشنشانی');
    expect(table.text()).toContain('عالی');   // rating 4.8, acceptance 96
    expect(table.text()).toContain('ضعیف');   // rating 3.6, acceptance 74
    wrapper.unmount();
  });

  it('states every empty case honestly instead of showing zeros as if measured', async () => {
    stubApi(EMPTY_REPORTS);
    const { wrapper } = await render();
    expect(wrapper.find('[data-testid="reports-donut"]').text()).toContain('در این بازه درخواستی به گروهی اعزام نشده است');
    expect(wrapper.find('[data-testid="reports-incidents"]').text()).toContain('در این بازه حادثه‌ای ثبت نشده است');
    expect(wrapper.find('[data-testid="reports-kpis"]').text()).not.toContain('+۸');
    wrapper.unmount();
  });
});
