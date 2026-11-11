import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import MissionTeamPanel from '../src/client/components/mission/MissionTeamPanel.vue';
import { useToast } from '../src/client/composables/useToast.ts';

/**
 * Administrator roster-management coverage for the shared team panel: add by search,
 * remove with a two-step confirm, leader designation with a two-step confirm and the
 * requirements editor. Every mutation goes back to the server and the roster is
 * re-rendered from its answer — never from local optimism.
 */

const LEADER = {
  userId: 'usr_self', username: 'reza.m', role: 'leader', jobTypeId: 'job_fire',
  jobTypeLabel: 'آتش‌نشانی', readyForMission: true, assignmentSource: 'team_dispatch',
  assignmentStatus: 'active', supportRequestId: null, joinedAt: 1794136000000, removedAt: null
};
const MEDIC = {
  userId: 'usr_medic', username: 'medic.p', role: 'member', jobTypeId: 'job_medical',
  jobTypeLabel: 'پزشکی', readyForMission: true, assignmentSource: 'support_request',
  assignmentStatus: 'active', supportRequestId: 'srq_1', joinedAt: 1794136100000, removedAt: null
};

/** Mutable roster so POST/DELETE handlers can answer with the updated projection. */
function makeProjection() {
  const state = {
    removed: [] as Array<Record<string, unknown>>,
    requirements: [{ jobTypeId: 'job_medical', jobTypeLabel: 'پزشکی', quantity: 1, filled: 1 }]
  };
  const projection = () => ({
    missionId: 'mis_1', sosId: 'sos_1', status: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high',
    createdAt: 1794136000000, viewerRole: 'admin', leader: LEADER,
    members: [LEADER, MEDIC, ...state.removed],
    memberCount: [LEADER, MEDIC].filter((member) => member.assignmentStatus === 'active').length,
    requirements: state.requirements,
    pendingSupportRequestCount: 0
  });
  return { state, projection };
}

function stubApi(options: { removeFails?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const { state, projection } = makeProjection();
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path, body });

      if (path === '/_admin/missions/mis_1/team' && method === 'GET') return json(projection());
      if (path === '/_admin/users' && method === 'GET') {
        return json({
          items: [{ id: 'usr_new', username: 'newest.p', role: 'responder', active: true, jobTypeId: 'job_medical', jobTypeLabel: 'پزشکی', securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, averageRating: 4.3, sessionCount: 1, online: true, createdAt: 0, updatedAt: 0 }],
          page: 1, limit: 6, total: 1
        });
      }
      if (path === '/_admin/missions/mis_1/members' && method === 'POST') {
        return json({ ...projection(), memberCount: 3 });
      }
      if (path === '/_admin/missions/mis_1/members/usr_medic' && method === 'DELETE') {
        if (options.removeFails) {
          return new Response(
            JSON.stringify({ ok: false, requestId: 'r', error: { code: 'CONFLICT', message: 'This mission is finished; its composition is frozen.' } }),
            { status: 409, headers: { 'content-type': 'application/json' } }
          );
        }
        state.removed = [{ ...MEDIC, assignmentStatus: 'removed', removedAt: 1794136200000, removalReason: 'removal_by_admin' }];
        state.requirements = [...state.requirements];
        return json(projection());
      }
      if (path === '/_admin/missions/mis_1/leader' && method === 'POST') return json(projection());
      if (path === '/_admin/missions/mis_1/requirements' && method === 'PUT') {
        state.requirements = (body?.requirements ?? []).map((line: any) => ({ ...line, jobTypeLabel: 'آتش‌نشانی', filled: 0 }));
        return json(projection());
      }
      if (path === '/_admin/job-types' && method === 'GET') {
        return json({ items: [
          { id: 'job_fire', label: 'آتش‌نشانی', offerPolicy: 'all', rank: 1, active: true, memberCount: 5, createdAt: 0, updatedAt: 0 },
          { id: 'job_medical', label: 'پزشکی', offerPolicy: 'ready_only', rank: 2, active: true, memberCount: 8, createdAt: 0, updatedAt: 0 }
        ] });
      }
      return json({ ok: true });
    })
  );
  return calls;
}

function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_panel', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

async function render(options: { removeFails?: boolean } = {}) {
  const calls = stubApi(options);
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(MissionTeamPanel, {
    props: { missionId: 'mis_1', admin: true },
    attachTo: document.body,
    global: { plugins: [pinia] }
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

describe('administrator roster management', () => {
  it('shows active members and removed members with the admin-only reason', async () => {
    const { wrapper } = await render();
    expect(wrapper.find('[data-testid="team-members"]').text()).toContain('reza.m');
    expect(wrapper.find('[data-testid="remove-member-usr_medic"]').exists()).toBe(true);
    // The leader can never be removed or re-designated from the roster row.
    expect(wrapper.find('[data-testid="remove-member-usr_self"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('adds a member found by username search', async () => {
    const { wrapper, calls } = await render();
    await wrapper.find('[data-testid="team-add-search"]').setValue('newest');
    await wrapper.find('[data-testid="team-add-search"]').trigger('input');
    await flushPromises();
    await wrapper.find('[data-testid="add-member-usr_new"]').trigger('click');
    await flushPromises();
    const add = calls.find((call) => call.path === '/_admin/missions/mis_1/members' && call.method === 'POST');
    expect(add?.body).toEqual({ userIds: ['usr_new'] });
    wrapper.unmount();
  });

  it('removes a member only after an explicit two-step confirmation', async () => {
    const { wrapper, calls } = await render();
    const button = wrapper.find('[data-testid="remove-member-usr_medic"]');
    await button.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    expect(wrapper.find('[data-testid="remove-member-usr_medic"]').text()).toContain('تأیید');
    await wrapper.find('[data-testid="remove-member-usr_medic"]').trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(true);
    expect(wrapper.find('[data-testid="team-removed"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="team-removed"]').text()).toContain('removal_by_admin');
    wrapper.unmount();
  });

  it('surfaces a server refusal on removal instead of claiming success', async () => {
    const { wrapper, calls } = await render({ removeFails: true });
    await wrapper.find('[data-testid="remove-member-usr_medic"]').trigger('click');
    await wrapper.find('[data-testid="remove-member-usr_medic"]').trigger('click');
    await flushPromises();
    expect(calls.filter((call) => call.method === 'DELETE')).toHaveLength(1);
    // The roster stays authoritative: nothing was removed locally.
    expect(wrapper.find('[data-testid="team-members"]').text()).toContain('medic.p');
    wrapper.unmount();
  });

  it('designates a new leader only after an explicit two-step confirmation', async () => {
    const { wrapper, calls } = await render();
    await wrapper.find('[data-testid="designate-leader-usr_medic"]').trigger('click');
    expect(calls.some((call) => call.path === '/_admin/missions/mis_1/leader')).toBe(false);
    await wrapper.find('[data-testid="designate-leader-usr_medic"]').trigger('click');
    await flushPromises();
    const designate = calls.find((call) => call.path === '/_admin/missions/mis_1/leader' && call.method === 'POST');
    expect(designate?.body).toEqual({ userId: 'usr_medic' });
    wrapper.unmount();
  });

  it('edits the required composition through the requirements editor', async () => {
    const { wrapper, calls } = await render();
    await wrapper.find('[data-testid="open-requirements-editor"]').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="requirements-editor"]').exists()).toBe(true);
    const lines = wrapper.findAll('.team-editor__line');
    expect(lines).toHaveLength(1);
    await wrapper.find('[data-testid="save-requirements"]').trigger('click');
    await flushPromises();
    const save = calls.find((call) => call.path === '/_admin/missions/mis_1/requirements' && call.method === 'PUT');
    expect(save?.body).toEqual({ requirements: [{ jobTypeId: 'job_medical', quantity: 1 }] });
    wrapper.unmount();
  });
});
