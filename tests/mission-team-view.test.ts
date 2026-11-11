import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import MissionView from '../src/client/views/map/MissionView.vue';
import { useSosStore } from '../src/client/stores/sos.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { MISSION_STATUS, SOS_STATUS } from '../src/shared/protocol.ts';

/**
 * Mission screen — staffing surfaces. The roster, the composition progress and the
 * support-request composer/list only render for the mission itself; the server decides
 * who may see what, and the view must not invent interactivity on top of a denial.
 */

const MISSION = {
  id: 'mis_1', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester',
  incidentLabel: 'آتش‌سوزی', status: MISSION_STATUS.ON_THE_WAY,
  updatedAt: 1794136200000, createdAt: 1794136000000, rating: null
};

const SOS = {
  id: 'sos_1', trackingCode: 3235, requesterId: 'usr_requester', incidentTypeId: 'inc_fire',
  incidentLabel: 'آتش‌سوزی', severity: 'high', description: 'دود از پنجره',
  latitude: 35.72, longitude: 51.33, accuracy: 12, isManual: true,
  requesterUsername: 'saeed.k', assignedResponderId: 'usr_self',
  status: SOS_STATUS.IN_PROGRESS, createdAt: 1794136000000, updatedAt: 1794136100000,
  timeline: []
};

const LEADER = {
  userId: 'usr_self', username: 'reza.m', role: 'leader', jobTypeId: 'job_fire',
  jobTypeLabel: 'آتش‌نشانی', readyForMission: true, assignmentSource: 'immediate_dispatch',
  assignmentStatus: 'active', supportRequestId: null, joinedAt: 1794136000000, removedAt: null
};
const MEDIC = {
  userId: 'usr_medic', username: 'medic.p', role: 'member', jobTypeId: 'job_medical',
  jobTypeLabel: 'پزشکی', readyForMission: false, assignmentSource: 'support_request',
  assignmentStatus: 'active', supportRequestId: 'srq_1', joinedAt: 1794136100000, removedAt: null
};

const TEAM = {
  missionId: 'mis_1', sosId: 'sos_1', status: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high',
  createdAt: 1794136000000, viewerRole: 'leader',
  leader: LEADER,
  members: [LEADER, MEDIC],
  memberCount: 2,
  requirements: [{ jobTypeId: 'job_medical', jobTypeLabel: 'پزشکی', quantity: 2, filled: 1 }],
  pendingSupportRequestCount: 1
};

const REQUEST = {
  id: 'srq_1', missionId: 'mis_1', requestedBy: 'usr_self', requestedByUsername: 'reza.m',
  reason: 'نیاز به نیروی کمکی برای رسیدگی میدانی', note: null, status: 'pending',
  items: [{ jobTypeId: 'job_medical', jobTypeLabel: 'پزشکی', quantity: 1, approvedQuantity: 0 }],
  adminNote: null, reviewedAt: null, decisions: [],
  createdAt: 1794136100000, updatedAt: 1794136100000, cancelledAt: null
};

const JOB_TYPES = [
  { id: 'job_fire', label: 'آتش‌نشانی' },
  { id: 'job_medical', label: 'پزشکی' }
];

function stubApi(options: { teamDenied?: boolean; createFails?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  // Mutable so the composer flow can observe a reloaded list after its own mutation.
  const requests: typeof REQUEST[] = options.teamDenied ? [] : [REQUEST];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (options.teamDenied && path === '/_user/missions/mis_1/team' && method === 'GET') {
        return new Response(
          JSON.stringify({ ok: false, requestId: 'r', error: { code: 'FORBIDDEN', message: 'Only mission members can open this team.' } }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        );
      }
      if (options.createFails && path === '/_user/missions/mis_1/support-requests' && method === 'POST') {
        return new Response(
          JSON.stringify({ ok: false, requestId: 'r', error: { code: 'FORBIDDEN', message: 'Only the mission leader can request support.' } }),
          { status: 403, headers: { 'content-type': 'application/json' } }
        );
      }

      let data: unknown = { ok: true };
      if (path === '/_user/sos') data = { items: [SOS] };
      else if (path === '/_user/mission-offers') data = { items: [] };
      else if (path === '/_user/missions') data = { items: [MISSION] };
      else if (path === '/_user/sos/sos_1') data = SOS;
      else if (path === '/_public/cancellation-reasons') data = { items: [] };
      else if (path === '/_public/incident-types') data = { items: [{ id: 'inc_fire', label: 'آتش‌سوزی', icon: 'fire', color: '#B35A18' }] };
      else if (path === '/_user/missions/mis_1/team') data = TEAM;
      else if (path === '/_user/missions/mis_1/support-requests' && method === 'GET') data = { items: requests, total: requests.length };
      else if (path === '/_user/missions/mis_1/support-requests' && method === 'POST') {
        const body = JSON.parse(String(init?.body));
        requests.push({ ...REQUEST, id: 'srq_2', reason: body.reason, note: body.note ?? null, items: body.items.map((line: any) => ({ ...line, jobTypeLabel: 'پزشکی', approvedQuantity: 0 })) });
        data = requests[requests.length - 1];
      } else if (path === '/_user/missions/mis_1/support-requests/srq_1/cancel' && method === 'POST') {
        const index = requests.findIndex((item) => item.id === 'srq_1');
        if (index >= 0) requests[index] = { ...requests[index], status: 'cancelled' };
        data = requests[index];
      } else if (path === '/_user/job-types') data = { items: JOB_TYPES };

      return new Response(JSON.stringify({ ok: true, requestId: 'req_team', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return calls;
}

async function render(options: { teamDenied?: boolean; createFails?: boolean } = {}) {
  stubApi(options);
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.mission });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  useAuthStore().$patch({
    user: {
      id: 'usr_self', username: 'reza.m', role: 'responder', isActive: true,
      securityReady: true, mustCompleteSecurityQuestions: false,
      readyForMission: true, averageRating: 4.5, createdAt: 1794000000000
    }
  });
  await useSosStore().load();
  const wrapper = mount(MissionView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper };
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

describe('mission team panel', () => {
  it('renders the roster with the leader highlighted and the composition progress', async () => {
    const { wrapper } = await render();
    const members = wrapper.find('[data-testid="team-members"]');
    expect(members.text()).toContain('reza.m');
    expect(members.text()).toContain('medic.p');
    expect(members.text()).toContain('سرپرست');
    expect(wrapper.text()).toContain('۱ از ۲');
    expect(wrapper.text()).toContain('درخواست نیرو در انتظار');
    wrapper.unmount();
  });

  it('renders no roster when the team endpoint refuses the caller', async () => {
    const { wrapper } = await render({ teamDenied: true });
    expect(wrapper.find('[data-testid="team-members"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('support requests (leader)', () => {
  it('creates a request from the composer and lists it', async () => {
    const { wrapper } = await render();
    expect(wrapper.find('[data-testid="open-support-composer"]').exists()).toBe(true);
    await wrapper.find('[data-testid="open-support-composer"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="support-reason"]').setValue('نیاز به نیروی کمکی برای رسیدگی میدانی');
    await wrapper.find('[data-testid="submit-support-request"]').trigger('click');
    await flushPromises();
    const submit = wrapper.find('[data-testid="submit-support-request"]');
    expect(submit.exists()).toBe(false); // composer closed after success
    expect(wrapper.find('[data-testid="support-request-list"]').text()).toContain('نیاز به نیروی کمکی');
    wrapper.unmount();
  });

  it('withdrawing a pending request needs two explicit clicks', async () => {
    const { wrapper } = await render();
    const cancel = wrapper.find('[data-testid="cancel-support-srq_1"]');
    await cancel.trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="cancel-support-srq_1"]').text()).toContain('تأیید');
    await wrapper.find('[data-testid="cancel-support-srq_1"]').trigger('click');
    await flushPromises();
    wrapper.unmount();
  });
});
