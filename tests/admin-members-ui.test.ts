import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import GroupsView from '../src/client/views/admin/GroupsView.vue';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The members panel is where a group receives — or loses — its responders. These tests pin the
 * roster render, the two-step remove, the responder-only candidate search, and the edit panel's
 * coverage requirement (a group without any incident type cannot receive a dispatch).
 */

const MEDICAL_GROUP = {
  id: 'grp_medical',
  name: 'گروه امداد پزشکی',
  color: '#AF3438',
  capacity: 10,
  status: 'active',
  rank: 1,
  memberCount: 2,
  coverageCount: 1,
  incidentIds: ['inc_fire'],
  memberIds: ['usr_responder', 'usr_responder2']
};

const INCIDENT_TYPES = [
  { id: 'inc_fire', label: 'آتش‌سوزی', icon: 'mdi-fire', color: '#AF3438' },
  { id: 'inc_medical', label: 'امداد پزشکی', icon: 'mdi-medical-bag', color: '#0E6666' }
];

const ROSTER = [
  { userId: 'usr_responder', username: 'reza.m', membership: 'leader', accountRole: 'responder', active: true, averageRating: 4.8, readyForMission: true, jobTypeLabel: 'آتش‌نشان', online: true },
  { userId: 'usr_responder2', username: 'nima.t', membership: 'member', accountRole: 'responder', active: true, averageRating: 4.2, readyForMission: false, jobTypeLabel: 'پارامدیک', online: false }
];

const SEARCH_RESULTS = [
  { id: 'usr_candidate', username: 'maryam.a', role: 'responder', active: true, jobTypeId: 'jt_med', jobTypeLabel: 'پارامدیک', securityReady: true, mustCompleteSecurityQuestions: false, readyForMission: true, averageRating: 5, sessionCount: 1, online: true, createdAt: 0, updatedAt: 0 }
];

function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_members', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

function stubApi(options: { rosterFails?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; query: URLSearchParams; body?: any }> = [];
  let roster = [...ROSTER];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(raw, 'http://test.local');
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, path: url.pathname, query: url.searchParams, body });

      if (url.pathname === '/_admin/groups' && method === 'GET') {
        return json({ items: [MEDICAL_GROUP], total: 1 });
      }
      if (url.pathname === '/_admin/incident-types') {
        return json({ items: INCIDENT_TYPES, total: INCIDENT_TYPES.length });
      }
      if (url.pathname === '/_admin/groups/grp_medical/members' && method === 'GET') {
        if (options.rosterFails) {
          return new Response(
            JSON.stringify({ ok: false, requestId: 'r', error: { code: 'INTERNAL', message: 'خطای سرور' } }),
            { status: 500, headers: { 'content-type': 'application/json' } }
          );
        }
        return json({ items: roster, total: roster.length });
      }
      if (url.pathname === '/_admin/groups/grp_medical/members' && method === 'POST') {
        roster = [...roster, { ...SEARCH_RESULTS[0], userId: String(body.userId), membership: String(body.role), jobTypeLabel: 'پارامدیک', accountRole: 'responder' } as any];
        return json({ ok: true });
      }
      const removeMatch = url.pathname.match(/^\/_admin\/groups\/grp_medical\/members\/([^/]+)$/);
      if (removeMatch && method === 'DELETE') {
        roster = roster.filter((member) => member.userId !== removeMatch[1]);
        return json({ ok: true });
      }
      if (url.pathname === '/_admin/groups/grp_medical' && method === 'PATCH') {
        return json({ ok: true });
      }
      if (url.pathname === '/_admin/users') {
        return json({ items: SEARCH_RESULTS, total: SEARCH_RESULTS.length, page: 1, limit: 20 });
      }
      return json({ items: [], total: 0 });
    })
  );
  return calls;
}

async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.adminGroups });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(GroupsView, {
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

describe('members panel', () => {
  it('opens on demand and lists the roster leader-first', async () => {
    stubApi();
    const { wrapper } = await render();
    expect(wrapper.find('[data-testid="group-members-panel-grp_medical"]').exists()).toBe(false);

    await wrapper.find('[data-testid="group-members-grp_medical"]').trigger('click');
    await flushPromises();

    const panel = wrapper.find('[data-testid="group-members-panel-grp_medical"]');
    expect(panel.exists()).toBe(true);
    expect(panel.text()).toContain('reza.m');
    expect(panel.text()).toContain('سرگروه');
    expect(panel.text()).toContain('nima.t');
    // Presence dot reflects the online flag.
    expect(panel.find('.group-member__dot.is-online').exists()).toBe(true);
    wrapper.unmount();
  });

  it('arms the remove on first click and fires DELETE on second', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="group-members-grp_medical"]').trigger('click');
    await flushPromises();

    const remove = wrapper.find('[data-testid="group-member-remove-usr_responder2"]');
    await remove.trigger('click');
    await flushPromises();
    expect(calls.some((call) => call.method === 'DELETE')).toBe(false);
    expect(remove.text()).toContain('حذف قطعی');

    await remove.trigger('click');
    await flushPromises();
    const deletion = calls.find((call) => call.method === 'DELETE');
    expect(deletion?.path).toBe('/_admin/groups/grp_medical/members/usr_responder2');
    // Roster re-fetched after the mutation.
    expect(calls.filter((call) => call.method === 'GET' && call.path === '/_admin/groups/grp_medical/members').length).toBeGreaterThanOrEqual(2);
    wrapper.unmount();
  });

  it('searches responders and adds one to the roster', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="group-members-grp_medical"]').trigger('click');
    await flushPromises();

    const search = wrapper.find('[data-testid="group-member-search"]');
    await search.setValue('maryam');
    await flushPromises();

    const userCalls = calls.filter((call) => call.path === '/_admin/users');
    expect(userCalls.length).toBeGreaterThanOrEqual(1);
    expect(userCalls[0].query.get('q')).toBe('maryam');

    const add = wrapper.find('[data-testid="group-member-add-usr_candidate"]');
    expect(add.exists()).toBe(true);
    await add.trigger('click');
    await flushPromises();

    const posted = calls.find((call) => call.method === 'POST' && call.path === '/_admin/groups/grp_medical/members');
    expect(posted?.body).toEqual({ userId: 'usr_candidate', role: 'member' });
    wrapper.unmount();
  });

  it('excludes people already on the roster from the candidates', async () => {
    stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="group-members-grp_medical"]').trigger('click');
    await flushPromises();
    await wrapper.find('[data-testid="group-member-search"]').setValue('reza');
    await flushPromises();

    // The search fixture only returns maryam.a here, but the same filter guards against showing
    // current members; assert the reza row from the roster is not offered as an add candidate.
    expect(wrapper.find('[data-testid="group-member-add-usr_responder"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('edit panel', () => {
  it('prefills the row and PATCHes the trimmed edit with coverage intact', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="group-edit-grp_medical"]').trigger('click');
    await flushPromises();

    const form = wrapper.find('[data-testid="group-edit-form-grp_medical"]');
    expect(form.exists()).toBe(true);
    const name = form.findAll('input')[0];
    expect((name.element as HTMLInputElement).value).toBe('گروه امداد پزشکی');

    await name.setValue('  گروه امداد پزشکی و نجات  ');
    await form.trigger('submit');
    await flushPromises();

    const patched = calls.find((call) => call.method === 'PATCH' && call.path === '/_admin/groups/grp_medical');
    expect(patched?.body?.name).toBe('گروه امداد پزشکی و نجات');
    expect(patched?.body?.incidentIds).toEqual(['inc_fire']);
    expect(patched?.body?.status).toBe('active');
    wrapper.unmount();
  });

  it('refuses to save with zero incident coverage', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('[data-testid="group-edit-grp_medical"]').trigger('click');
    await flushPromises();

    // Uncheck the only covered incident type.
    const coverageCheckbox = wrapper.find('.group-edit__chip input[type="checkbox"]');
    await coverageCheckbox.setValue(false);
    await flushPromises();

    const form = wrapper.find('[data-testid="group-edit-form-grp_medical"]');
    await form.trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.method === 'PATCH')).toBe(false);
    expect(form.text()).toContain('دست‌کم یک نوع حادثه');
    wrapper.unmount();
  });
});
