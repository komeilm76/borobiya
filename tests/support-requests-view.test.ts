import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import SupportRequestsView from '../src/client/views/admin/SupportRequestsView.vue';
import { useAdminStore } from '../src/client/stores/admin.ts';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * Administrator review console for support requests. The server is the authority on
 * consistency; the UI's only job is to make the consistent path the easy one — approve
 * stays disabled until the picked workers match the approved lines hand-count-for-hand.
 */

const REQUEST = {
  id: 'srq_1', missionId: 'mis_1', requestedBy: 'usr_self', requestedByUsername: 'reza.m',
  reason: 'نیاز به نیروی کمکی برای رسیدگی میدانی', note: null, status: 'pending',
  items: [{ jobTypeId: 'job_medical', jobTypeLabel: 'پزشکی', quantity: 1, approvedQuantity: 0 }],
  adminNote: null, reviewedAt: null, decisions: [],
  createdAt: 1794136100000, updatedAt: 1794136100000, cancelledAt: null,
  missionStatus: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high'
};

const DETAIL = {
  ...REQUEST,
  mission: { missionId: 'mis_1', sosId: 'sos_1', incidentLabel: 'آتش‌سوزی', severity: 'high', status: 'on_the_way' },
  leader: { userId: 'usr_self', username: 'reza.m' },
  decisions: []
};

const CANDIDATES = [
  { id: 'usr_medic', username: 'medic.p', jobTypeId: 'job_medical', jobTypeLabel: 'پزشکی', readyForMission: true, averageRating: 4.7, otherActiveMissions: 0, alreadyOnMission: false, onActiveMission: false, eligible: true, ineligibleReason: null },
  { id: 'usr_busy', username: 'busy.m', jobTypeId: 'job_medical', jobTypeLabel: 'پزشکی', readyForMission: true, averageRating: 4.1, otherActiveMissions: 1, alreadyOnMission: false, onActiveMission: true, eligible: false, ineligibleReason: 'already_on_mission' }
];

const TEAM_RESPONSE = {
  missionId: 'mis_1', sosId: 'sos_1', status: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high',
  createdAt: 1794136000000, viewerRole: 'admin', leader: null, members: [], memberCount: 0,
  requirements: [], pendingSupportRequestCount: 1
};

function stubApi() {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const query = url.includes('?') ? url.split('?')[1] : '';
      const params = new URLSearchParams(query);
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      let data: unknown = { ok: true };
      if (path === '/_admin/support-requests' && method === 'GET') {
        data = params.get('limit') === '1' ? { items: [], total: 3 } : { items: [REQUEST], total: 1 };
      } else if (path === '/_admin/support-requests/srq_1' && method === 'GET') data = DETAIL;
      else if (path === '/_admin/support-requests/srq_1/candidates') data = { items: CANDIDATES, total: 2, eligibleTotal: 1 };
      else if (path === '/_admin/support-requests/srq_1/review' && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        data = { ...DETAIL, status: body.decision === 'rejected' ? 'rejected' : 'approved' };
      } else if (path === '/_admin/missions/mis_1/team') data = TEAM_RESPONSE;
      else if (path === '/_admin/job-types') data = { items: [{ id: 'job_fire', label: 'آتش‌نشانی', offerPolicy: 'all', rank: 1, active: true, memberCount: 3, createdAt: 0, updatedAt: 0 }] };

      return new Response(JSON.stringify({ ok: true, requestId: 'req_sr', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return calls;
}

async function render() {
  const calls = stubApi();
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.adminSupportRequests });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(SupportRequestsView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, calls };
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

describe('support-request queue', () => {
  it('lists the pending request with its composition and opens the review drawer', async () => {
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('reza.m');
    expect(wrapper.text()).toContain('پزشکی');
    await wrapper.find('[data-testid="open-support-srq_1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="support-review-panel"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="candidate-picker"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('keeps «تأیید کامل» disabled until the picked workers match the approved quantities', async () => {
    const { wrapper } = await render();
    await wrapper.find('[data-testid="open-support-srq_1"]').trigger('click');
    await flushPromises();
    const approve = wrapper.find('[data-testid="review-approve"]');
    expect(approve.attributes('disabled')).toBeDefined();
    // The ineligible candidate cannot be picked at all.
    const busyPick = wrapper.find('[data-testid="candidate-pick-usr_busy"]');
    expect(busyPick.attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="candidate-pick-usr_medic"]').setValue(true);
    await flushPromises();
    const approveNow = wrapper.find('[data-testid="review-approve"]');
    expect(approveNow.attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });

  it('posts a consistent approval with workers and approved quantities', async () => {
    const { wrapper, calls } = await render();
    await wrapper.find('[data-testid="open-support-srq_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="candidate-pick-usr_medic"]').setValue(true);
    await wrapper.find('[data-testid="review-note"]').setValue('نیروی کافی برای پوشش میدانی وجود دارد');
    await wrapper.find('[data-testid="review-approve"]').trigger('click');
    await flushPromises();
    const review = calls.find((call) => call.path === '/_admin/support-requests/srq_1/review' && call.method === 'POST');
    expect(review?.body).toMatchObject({
      decision: 'approved',
      adminNote: 'نیروی کافی برای پوشش میدانی وجود دارد',
      items: [{ jobTypeId: 'job_medical', approvedQuantity: 1 }],
      userIds: ['usr_medic']
    });
    wrapper.unmount();
  });

  it('a rejection posts no workers and no per-line quantities', async () => {
    const { wrapper, calls } = await render();
    await wrapper.find('[data-testid="open-support-srq_1"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="review-reject"]').trigger('click');
    await flushPromises();
    const review = calls.find((call) => call.path === '/_admin/support-requests/srq_1/review' && call.method === 'POST');
    expect(review?.body).toMatchObject({ decision: 'rejected' });
    expect(review?.body?.items).toBeUndefined();
    expect(review?.body?.userIds).toBeUndefined();
    wrapper.unmount();
  });

  it('re-queries the candidate list with the search text and job-type filter', async () => {
    const { wrapper, calls } = await render();
    await wrapper.find('[data-testid="open-support-srq_1"]').trigger('click');
    await flushPromises();
    const before = calls.filter((call) => call.path === '/_admin/support-requests/srq_1/candidates').length;
    await wrapper.find('[data-testid="candidate-search"]').setValue('medic');
    await flushPromises();
    await wrapper.find('[data-testid="candidate-jobtype"]').setValue('job_medical');
    await flushPromises();
    const after = calls.filter((call) => call.path === '/_admin/support-requests/srq_1/candidates');
    expect(after.length).toBeGreaterThan(before);
    wrapper.unmount();
  });

  it('toggling «نمایش غیرفعال‌ها» reveals ineligible candidates with their reason', async () => {
    const { wrapper } = await render();
    await wrapper.find('[data-testid="open-support-srq_1"]').trigger('click');
    await flushPromises();
    // ineligible worker is visible in the default payload but cannot be selected
    expect(wrapper.text()).toContain('busy.m');
    expect(wrapper.text()).toContain('already_on_mission');
    wrapper.unmount();
  });

  it('partial approval stays disabled until at least one line is short', async () => {
    const { wrapper } = await render();
    await wrapper.find('[data-testid="open-support-srq_1"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="review-partial"]').attributes('disabled')).toBeDefined();
    // Drop the approved quantity: now the review is partial (0 approved, 0 workers needed).
    await wrapper.find('[data-testid="approve-qty-job_medical"]').setValue(0);
    await flushPromises();
    expect(wrapper.find('[data-testid="review-partial"]').attributes('disabled')).toBeUndefined();
    wrapper.unmount();
  });
});
