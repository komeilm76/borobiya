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
 * chosen group, so the board must name responders the group actually has — explicitly, chosen by
 * the dispatcher, never auto-picked. The old board dispatched to the first staffed group with its
 * whole membership; that sent whoever came first in the list, with no chance to match the
 * responder to the incident, and it is why this suite now drives the panel instead of one button.
 */

const PENDING = {
  id: 'sos_1',
  status: 'pending',
  severity: 'critical',
  incidentLabel: 'آتش‌سوزی',
  requesterUsername: 'saeed.k',
  description: 'دود از طبقه سوم',
  latitude: 35.7219,
  longitude: 51.3347,
  incidentTypeId: 'inc_fire',
  createdAt: 1794136403220
};

/** What the nearest-responders endpoint returns for the pending request above. */
const NEAREST = [
  { id: 'usr_responder', username: 'reza.m', averageRating: 4.8, readyForMission: true, latitude: 35.72, longitude: 51.33, distanceMeters: 320, recordedAt: 1794136200000 },
  { id: 'usr_responder2', username: 'farid.n', averageRating: 4.1, readyForMission: false, latitude: 35.73, longitude: 51.34, distanceMeters: 1500, recordedAt: 1794136200000 }
];

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

/** Installs a fetch double for the board, the nearest-responders call and the dispatch call. */
function stubApi(options: { groups?: unknown[]; queue?: unknown[]; dispatchFails?: boolean; nearestFails?: boolean; nearestItems?: unknown[] } = {}) {
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
      if (path === '/_admin/sos/sos_1/nearest' && method === 'GET') {
        if (options.nearestFails) {
          return new Response(
            JSON.stringify({ ok: false, requestId: 'r', error: { code: 'INTERNAL', message: 'nearest unavailable' } }),
            { status: 500, headers: { 'content-type': 'application/json' } }
          );
        }
        return json({ items: options.nearestItems ?? NEAREST, total: (options.nearestItems ?? NEAREST).length });
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

/** Opens the dispatch panel for the first queue item and waits for the nearest responders to load. */
async function openPanel(wrapper: Awaited<ReturnType<typeof render>>['wrapper']) {
  await wrapper.find('[data-testid="open-dispatch"]').trigger('click');
  await flushPromises();
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
  it('opens an explicit panel instead of dispatching on one click', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await openPanel(wrapper);

    expect(wrapper.find('[data-testid="dispatch-panel"]').exists()).toBe(true);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    wrapper.unmount();
  });

  it('asks for a group before anyone can be picked or sent', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await openPanel(wrapper);

    // Nearest responders are shown read-only; no selection is possible before a group is chosen.
    expect(wrapper.find('[data-testid="nearest-readonly"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="confirm-dispatch"]').attributes('disabled')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    wrapper.unmount();
  });

  it('refuses to offer inactive groups or memberless groups in the picker', async () => {
    stubApi();
    const { wrapper } = await render();
    await openPanel(wrapper);

    const options = wrapper.findAll('[data-testid="dispatch-group"] option').map((option) => (option.element as HTMLOptionElement).value);
    expect(options).toContain('grp_medical');
    expect(options).not.toContain('grp_fire'); // memberless
    expect(options).not.toContain('grp_retired'); // inactive
    wrapper.unmount();
  });

  it('names only responders the chosen group actually has, after an explicit tick', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await openPanel(wrapper);
    await wrapper.find('[data-testid="dispatch-group"]').setValue('grp_medical');

    // Confirm stays disabled until at least one responder is ticked — explicit, always.
    expect(wrapper.find('[data-testid="confirm-dispatch"]').attributes('disabled')).toBeDefined();
    await wrapper.find('[data-testid="responder-usr_responder"]').setValue(true);
    expect(wrapper.find('[data-testid="confirm-dispatch"]').attributes('disabled')).toBeUndefined();

    await wrapper.find('[data-testid="confirm-dispatch"]').trigger('click');
    await flushPromises();

    const dispatched = calls.find((call) => call.method === 'POST' && call.path.endsWith('/dispatch'));
    expect(dispatched?.path).toBe('/_admin/sos/sos_1/dispatch');
    expect(dispatched?.body).toEqual({ groupId: 'grp_medical', responderIds: ['usr_responder'] });
    wrapper.unmount();
  });

  it('shows distance, rating and readiness for the nearest responders', async () => {
    stubApi();
    const { wrapper } = await render();
    await openPanel(wrapper);

    const text = wrapper.find('[data-testid="nearest-readonly"]').text();
    expect(text).toContain('reza.m');
    expect(text).toContain('farid.n');
    expect(text).toContain('آماده');
    expect(text).toContain('مشغول');
    wrapper.unmount();
  });

  it('explains when no staffed group exists instead of sending a doomed request', async () => {
    const calls = stubApi({ groups: [EMPTY_GROUP, INACTIVE_GROUP] });
    const { wrapper } = await render();
    await openPanel(wrapper);

    expect(wrapper.find('[data-testid="dispatch-group"]').text()).toContain('گروهی با امدادگر فعال');
    expect(wrapper.find('.dispatch-panel__warn').text()).toContain('گروهی با امدادگر فعال');
    expect(wrapper.find('[data-testid="confirm-dispatch"]').attributes('disabled')).toBeDefined();
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
    wrapper.unmount();
  });

  it('offers a retry when the nearest-responders call fails, and recovers with one', async () => {
    let nearestCalls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
        const path = url.split('?')[0];
        const method = init?.method ?? 'GET';
        if (path === '/_admin/sos/sos_1/nearest') {
          nearestCalls += 1;
          if (nearestCalls === 1) {
            return new Response(
              JSON.stringify({ ok: false, requestId: 'r', error: { code: 'INTERNAL', message: 'nearest unavailable' } }),
              { status: 500, headers: { 'content-type': 'application/json' } }
            );
          }
          return json({ items: NEAREST, total: NEAREST.length });
        }
        // Fall back to the standard double for everything else.
        return stubApiFallback(path, method, init);
      })
    );
    function stubApiFallback(path: string, method: string, init?: RequestInit): Response {
      if (path === '/_admin/dispatch' && method === 'GET') {
        return json({
          queue: { items: [PENDING], total: 1 },
          groups: { items: [STAFFED_GROUP], total: 1 },
          incidentTypes: { items: [], total: 0 }
        });
      }
      return json({ items: [], total: 0 });
    }
    const { wrapper } = await render();
    await openPanel(wrapper);

    expect(wrapper.find('[data-testid="nearest-retry"]').exists()).toBe(true);
    await wrapper.find('[data-testid="nearest-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('reza.m');
    wrapper.unmount();
  });

  it('says when the nearest list is empty instead of spinning forever', async () => {
    stubApi({ nearestItems: [] });
    const { wrapper } = await render();
    await openPanel(wrapper);

    expect(wrapper.text()).toContain('هیچ امدادگری یافت نشد');
    wrapper.unmount();
  });

  it('confirms a successful dispatch', async () => {
    stubApi();
    const { wrapper } = await render();
    await openPanel(wrapper);
    await wrapper.find('[data-testid="dispatch-group"]').setValue('grp_medical');
    await wrapper.find('[data-testid="responder-usr_responder"]').setValue(true);
    await wrapper.find('[data-testid="confirm-dispatch"]').trigger('click');
    await flushPromises();

    expect(useToast().messages.value.some((message) => message.message === 'درخواست اعزام شد.')).toBe(true);
    wrapper.unmount();
  });

  it('surfaces a server-side rejection and keeps the panel open for a fix', async () => {
    stubApi({ dispatchFails: true });
    const { wrapper } = await render();
    await openPanel(wrapper);
    await wrapper.find('[data-testid="dispatch-group"]').setValue('grp_medical');
    await wrapper.find('[data-testid="responder-usr_responder"]').setValue(true);
    await wrapper.find('[data-testid="confirm-dispatch"]').trigger('click');
    await flushPromises();

    const messages = useToast().messages.value;
    expect(messages.some((message) => message.message.includes('active member'))).toBe(true);
    expect(messages.some((message) => message.message === 'درخواست اعزام شد.')).toBe(false);
    // The panel must survive the refusal: the dispatcher corrects the selection, not the browser tab.
    expect(wrapper.find('[data-testid="dispatch-panel"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('reloads the queue after a dispatch so the handled request disappears', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    const before = calls.filter((call) => call.method === 'GET' && call.path === '/_admin/dispatch').length;
    await openPanel(wrapper);
    await wrapper.find('[data-testid="dispatch-group"]').setValue('grp_medical');
    await wrapper.find('[data-testid="responder-usr_responder"]').setValue(true);
    await wrapper.find('[data-testid="confirm-dispatch"]').trigger('click');
    await flushPromises();

    const after = calls.filter((call) => call.method === 'GET' && call.path === '/_admin/dispatch').length;
    // Without the reload the board keeps showing a request that no longer exists, and the next
    // click is a conflict.
    expect(after).toBeGreaterThan(before);
    wrapper.unmount();
  });
});
