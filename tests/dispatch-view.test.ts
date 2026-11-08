import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import DispatchView from '../src/client/views/admin/DispatchView.vue';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';

/**
 * The dispatch board is the one screen that turns a pending SOS into a mission.
 *
 * The server rejects a dispatch outright when any named responder is not an active member of the
 * chosen group, so the board must name responders the group actually has. It used to send a
 * hardcoded seeded demo id to `groups[0]`; that only worked on a database that had the demo users
 * and only while the member group happened to sort first, which is why it looked fine in the demo
 * and always failed in production, where demo users are not seeded.
 */

const PENDING = {
  id: 'sos_1',
  status: 'pending',
  severity: 'critical',
  incidentLabel: 'آتش‌سوزی',
  requesterUsername: 'saeed.k',
  description: 'دود از طبقه سوم',
  createdAt: 1794136403220
};

/** A group with members, as `GET /_admin/groups` serializes it. */
const STAFFED_GROUP = {
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

/** A group with no members at all. */
const EMPTY_GROUP = {
  ...STAFFED_GROUP,
  id: 'grp_fire',
  name: 'گروه آتش‌نشانی',
  rank: 2,
  memberCount: 0,
  memberIds: []
};

/** A group that exists but is not active. */
const INACTIVE_GROUP = {
  ...STAFFED_GROUP,
  id: 'grp_retired',
  name: 'گروه بازنشسته',
  rank: 3,
  status: 'inactive'
};

/** Builds a success envelope. */
function json(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_dispatch', data }), {
    status: 200,
    headers: { 'content-type': 'application/json' }
  });
}

/** Installs a fetch double for the board and the dispatch call. */
function stubApi(options: { groups?: unknown[]; queue?: unknown[]; dispatchFails?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (path === '/_admin/dispatch' && method === 'GET') {
        return json({
          queue: { items: options.queue ?? [PENDING], total: (options.queue ?? [PENDING]).length },
          groups: { items: options.groups ?? [STAFFED_GROUP, EMPTY_GROUP, INACTIVE_GROUP], total: 3 },
          incidentTypes: { items: [], total: 0 }
        });
      }
      if (path.endsWith('/dispatch') && method === 'POST') {
        if (options.dispatchFails) {
          return new Response(
            JSON.stringify({ ok: false, requestId: 'r', error: { code: 'BAD_REQUEST', message: 'Every responder must be an active member of the selected group.' } }),
            { status: 400, headers: { 'content-type': 'application/json' } }
          );
        }
        return json({ ok: true });
      }
      return json({ items: [], total: 0 });
    })
  );
  return calls;
}

/** Mounts the dispatch board; it loads its own queue. */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.adminDispatch });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const wrapper = mount(DispatchView, {
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

describe('queue', () => {
  it('lists each pending request with what a dispatcher needs to judge it', async () => {
    stubApi();
    const { wrapper } = await render();
    const item = wrapper.find('.admin-list li');
    expect(item.text()).toContain('آتش‌سوزی');
    expect(item.text()).toContain('critical');
    // The description is the only free-form information the dispatcher gets.
    expect(item.text()).toContain('دود از طبقه سوم');
    wrapper.unmount();
  });

  it('shows the queue size', async () => {
    stubApi();
    const { wrapper } = await render();
    expect(wrapper.find('.panel__hint').text()).toMatch(/۱/);
    wrapper.unmount();
  });

  it('shows the empty state instead of an empty list', async () => {
    stubApi({ queue: [] });
    const { wrapper } = await render();
    expect(wrapper.find('.panel__empty').text()).toContain('صف اعزام خالی است');
    wrapper.unmount();
  });

  it('lists the groups with their colour and member count', async () => {
    stubApi();
    const { wrapper } = await render();
    const text = wrapper.text();
    expect(text).toContain('گروه امداد پزشکی');
    expect(text).toContain('گروه آتش‌نشانی');
    // A group with no responders cannot receive a dispatch; the count is how that is visible.
    expect(wrapper.findAll('.group-dot').length).toBe(3);
    wrapper.unmount();
  });
});

describe('dispatching', () => {
  it('names only responders the chosen group actually has', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('.admin-list button.admin-action').trigger('click');
    await flushPromises();

    const dispatched = calls.find((call) => call.method === 'POST' && call.path.endsWith('/dispatch'));
    expect(dispatched?.path).toBe('/_admin/sos/sos_1/dispatch');
    expect(dispatched?.body.groupId).toBe('grp_medical');
    // The server rejects the request if any id is not a member, so these must come from the group.
    expect(dispatched?.body.responderIds).toEqual(['usr_responder', 'usr_responder2']);
    wrapper.unmount();
  });

  it('skips a group that has no responders and picks one that does', async () => {
    // The memberless group sorts first here, which is what a real database looks like as soon as an
    // administrator reorders the groups. Dispatching to it would fail with a server-side rejection.
    const calls = stubApi({ groups: [EMPTY_GROUP, STAFFED_GROUP, INACTIVE_GROUP] });
    const { wrapper } = await render();
    await wrapper.find('.admin-list button.admin-action').trigger('click');
    await flushPromises();

    const dispatched = calls.find((call) => call.method === 'POST' && call.path.endsWith('/dispatch'));
    expect(dispatched?.body.groupId).toBe('grp_medical');
    wrapper.unmount();
  });

  it('skips an inactive group even when it has responders', async () => {
    const calls = stubApi({ groups: [INACTIVE_GROUP, STAFFED_GROUP] });
    const { wrapper } = await render();
    await wrapper.find('.admin-list button.admin-action').trigger('click');
    await flushPromises();

    const dispatched = calls.find((call) => call.method === 'POST' && call.path.endsWith('/dispatch'));
    // An inactive group is refused by the server as unknown.
    expect(dispatched?.body.groupId).toBe('grp_medical');
    wrapper.unmount();
  });

  it('explains that no staffed group exists instead of sending a doomed request', async () => {
    const calls = stubApi({ groups: [EMPTY_GROUP, INACTIVE_GROUP] });
    const { wrapper } = await render();
    await wrapper.find('.admin-list button.admin-action').trigger('click');
    await flushPromises();

    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    expect(useToast().messages.value.some((message) => message.message.includes('گروهی با امدادگر فعال'))).toBe(true);
    wrapper.unmount();
  });

  it('confirms a successful dispatch', async () => {
    stubApi();
    const { wrapper } = await render();
    await wrapper.find('.admin-list button.admin-action').trigger('click');
    await flushPromises();
    expect(useToast().messages.value.some((message) => message.message === 'درخواست اعزام شد.')).toBe(true);
    wrapper.unmount();
  });

  it('surfaces a server-side rejection rather than reporting success', async () => {
    stubApi({ dispatchFails: true });
    const { wrapper } = await render();
    await wrapper.find('.admin-list button.admin-action').trigger('click');
    await flushPromises();

    const messages = useToast().messages.value;
    expect(messages.some((message) => message.message.includes('active member'))).toBe(true);
    expect(messages.some((message) => message.message === 'درخواست اعزام شد.')).toBe(false);
    wrapper.unmount();
  });

  it('reloads the queue after a dispatch so the handled request disappears', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    const before = calls.filter((call) => call.method === 'GET' && call.path === '/_admin/dispatch').length;
    await wrapper.find('.admin-list button.admin-action').trigger('click');
    await flushPromises();

    const after = calls.filter((call) => call.method === 'GET' && call.path === '/_admin/dispatch').length;
    // Without the reload the board keeps showing a request that no longer exists, and the next
    // click is a conflict.
    expect(after).toBeGreaterThan(before);
    wrapper.unmount();
  });
});
