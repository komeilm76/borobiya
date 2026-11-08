import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import GroupsView from '../src/client/views/admin/GroupsView.vue';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * Service groups decide who can be dispatched. Two things on this screen are worth pinning:
 * a group must carry at least one incident type (the payload requires it, and the coverage is
 * taken from a catalog loaded in parallel), and the form has to name the rule it broke rather than
 * forwarding a draft the server rejects with a bare "Invalid request.".
 */

/** A group as `GET /_admin/groups` serializes it. */
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

const EMPTY_GROUP = {
  ...MEDICAL_GROUP,
  id: 'grp_fire',
  name: 'گروه آتش‌نشانی',
  rank: 2,
  memberCount: 0,
  memberIds: []
};

const INCIDENT_TYPES = [
  { id: 'inc_fire', label: 'آتش‌سوزی', icon: 'mdi-fire', color: '#AF3438' },
  { id: 'inc_medical', label: 'امداد پزشکی', icon: 'mdi-medical-bag', color: '#0E6666' }
];

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_groups', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Installs a fetch double for the group list, the incident catalog and creation. */
function stubApi(options: { groups?: unknown[]; incidentTypes?: unknown[]; createFails?: boolean; catalogFails?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (path === '/_admin/groups' && method === 'GET') {
        const items = options.groups ?? [MEDICAL_GROUP, EMPTY_GROUP];
        return json({ items, total: items.length });
      }
      if (path === '/_admin/groups' && method === 'POST') {
        if (options.createFails) {
          return new Response(
            JSON.stringify({ ok: false, requestId: 'r', error: { code: 'CONFLICT', message: 'گروهی با این نام هست.' } }),
            { status: 409, headers: { 'content-type': 'application/json' } }
          );
        }
        return json({ groupId: 'grp_new' });
      }
      if (path === '/_admin/incident-types') {
        if (options.catalogFails) {
          return new Response(
            JSON.stringify({ ok: false, requestId: 'r', error: { code: 'INTERNAL', message: 'خطای سرور' } }),
            { status: 500, headers: { 'content-type': 'application/json' } }
          );
        }
        const items = options.incidentTypes ?? INCIDENT_TYPES;
        return json({ items, total: items.length });
      }
      return json({ items: [], total: 0 });
    })
  );
  return calls;
}

/** Mounts the groups screen; it loads both the list and the catalog itself. */
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

/** Fills the three fields of the creation form. */
async function fillForm(wrapper: Awaited<ReturnType<typeof render>>['wrapper'], name: string, color: string, capacity: string | number) {
  const fields = wrapper.findAll('.stack-form input');
  await fields[0].setValue(name);
  await fields[1].setValue(color);
  await fields[2].setValue(String(capacity));
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

describe('group list', () => {
  it('shows each group with its capacity and member count', async () => {
    stubApi();
    const { wrapper } = await render();
    const first = wrapper.find('.admin-list li');
    expect(first.text()).toContain('گروه امداد پزشکی');
    expect(first.text()).toMatch(/۲ عضو/);
    expect(first.text()).toContain('active');
    wrapper.unmount();
  });

  it('shows a memberless group as having no responders', async () => {
    stubApi();
    const { wrapper } = await render();
    const rows = wrapper.findAll('.admin-list li');
    // The count is the only signal that a group cannot receive a dispatch.
    expect(rows[1].text()).toMatch(/۰ عضو/);
    wrapper.unmount();
  });

  it('renders the group colour as the row marker', async () => {
    stubApi();
    const { wrapper } = await render();
    const dot = wrapper.find('.group-dot');
    expect(dot.attributes('style')).toContain('#AF3438');
    wrapper.unmount();
  });

  it('shows the empty state when no group is defined', async () => {
    stubApi({ groups: [] });
    const { wrapper } = await render();
    expect(wrapper.find('.panel__empty').text()).toContain('گروهی تعریف نشده است');
    wrapper.unmount();
  });
});

describe('creating a group', () => {
  it('sends a trimmed name with one incident type for coverage', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillForm(wrapper, '  گروه تازه  ', '#0E6666', 12);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    const created = calls.find((call) => call.method === 'POST' && call.path === '/_admin/groups');
    expect(created?.body).toEqual({
      name: 'گروه تازه',
      color: '#0E6666',
      capacity: 12,
      incidentIds: ['inc_fire'],
      status: 'active'
    });
    wrapper.unmount();
  });

  it('reports success and clears the form', async () => {
    stubApi();
    const { wrapper } = await render();
    await fillForm(wrapper, 'گروه تازه', '#0E6666', 12);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    expect(useToast().messages.value.some((message) => message.message === 'گروه ساخته شد.')).toBe(true);
    expect((wrapper.findAll('.stack-form input')[0].element as HTMLInputElement).value).toBe('');
    wrapper.unmount();
  });

  it('refuses a name the server would reject', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillForm(wrapper, 'x', '#0E6666', 12);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    expect(wrapper.find('.stack-form .v-alert').text()).toMatch(/۲ نویسه/);
    wrapper.unmount();
  });

  it('refuses a colour that is not six hex digits', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillForm(wrapper, 'گروه تازه', 'teal', 12);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    expect(wrapper.find('.stack-form .v-alert').text()).toContain('#RRGGBB');
    wrapper.unmount();
  });

  it('refuses a capacity outside the accepted range', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillForm(wrapper, 'گروه تازه', '#0E6666', 0);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    expect(wrapper.find('.stack-form .v-alert').text()).toMatch(/۱ و ۵۰۰/);
    wrapper.unmount();
  });

  it('refuses a fractional capacity', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillForm(wrapper, 'گروه تازه', '#0E6666', 12.5);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    wrapper.unmount();
  });

  it('explains that no incident catalog means the group cannot be created', async () => {
    const calls = stubApi({ catalogFails: true });
    const { wrapper } = await render();
    await fillForm(wrapper, 'گروه تازه', '#0E6666', 12);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    // Without coverage the payload fails validation server-side with a message that says nothing
    // about the catalog, which is the actual cause.
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    expect(wrapper.find('.stack-form .v-alert').text()).toContain('نوع حادثه');
    wrapper.unmount();
  });

  it('shows a duplicate-name conflict on the form', async () => {
    stubApi({ createFails: true });
    const { wrapper } = await render();
    await fillForm(wrapper, 'گروه امداد پزشکی', '#0E6666', 12);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    expect(wrapper.find('.stack-form .v-alert').text()).toContain('گروهی با این نام هست');
    // The draft survives so the administrator can rename instead of retyping.
    expect((wrapper.findAll('.stack-form input')[0].element as HTMLInputElement).value).toBe('گروه امداد پزشکی');
    wrapper.unmount();
  });

  it('clears the previous error when a corrected draft is submitted', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await fillForm(wrapper, 'x', '#0E6666', 12);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();
    expect(wrapper.find('.stack-form .v-alert').exists()).toBe(true);

    await fillForm(wrapper, 'گروه تازه', '#0E6666', 12);
    await wrapper.find('.stack-form').trigger('submit');
    await flushPromises();

    // A stale error left on screen after a successful correction reads as a second failure.
    expect(wrapper.find('.stack-form .v-alert').exists()).toBe(false);
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_admin/groups')).toBe(true);
    wrapper.unmount();
  });
});
