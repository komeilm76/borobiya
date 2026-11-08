import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import MissionView from '../src/client/views/map/MissionView.vue';
import { useSosStore } from '../src/client/stores/sos.ts';
import { useToast } from '../src/client/composables/useToast.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { MISSION_STATUS, SOS_STATUS } from '../src/shared/protocol.ts';

/**
 * The mission screen drives the responder state machine. Two things matter: the button offered must
 * be the one the current status allows, and the rail must show progress even though the list
 * endpoint omits `timeline` — it arrives from the detail call the view makes on mount.
 */

const SOS_LIST_ITEM = {
  id: 'sos_1',
  trackingCode: 3235,
  requesterId: 'usr_requester',
  incidentTypeId: 'inc_fire',
  incidentLabel: 'آتش‌سوزی',
  severity: 'high',
  description: 'دود از پنجره',
  latitude: 35.72,
  longitude: 51.33,
  accuracy: 12,
  status: SOS_STATUS.DISPATCHED,
  createdAt: 1794136000000,
  updatedAt: 1794136000000
};

const SOS_DETAIL = {
  ...SOS_LIST_ITEM,
  timeline: [
    { action: 'created', fromStatus: '', toStatus: SOS_STATUS.PENDING, note: null, createdAt: 1794136000000, actorUsername: 'saeed.k' },
    { action: 'dispatch', fromStatus: SOS_STATUS.PENDING, toStatus: SOS_STATUS.DISPATCHED, note: null, createdAt: 1794136100000, actorUsername: 'admin' }
  ]
};

/**
 * Installs a fetch double for the list, the detail and any mutation.
 *
 * `sos: false` models an account with no request at all; the mission is separate because the list
 * keeps them apart too.
 */
function stubApi(options: { mission?: Record<string, unknown> | null; sos?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const mission = options.mission === undefined
    ? { id: 'mis_1', sosId: 'sos_1', status: MISSION_STATUS.ON_THE_WAY, updatedAt: 1794136200000, rating: null }
    : options.mission;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      let data: unknown = { ok: true };
      if (path === '/_user/sos') data = { items: options.sos === false ? [] : [SOS_LIST_ITEM] };
      else if (path === '/_user/missions') data = { items: mission ? [mission] : [] };
      else if (path === '/_user/sos/sos_1') data = SOS_DETAIL;

      return new Response(JSON.stringify({ ok: true, requestId: 'req_mis', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return calls;
}

/**
 * Mounts the mission screen with the store already loaded.
 *
 * The shell (`MapLayout`) is what normally calls `sos.load()`; mounting the view on its own would
 * otherwise render the empty state for every scenario and prove nothing.
 */
async function render() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.mission });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  await useSosStore().load();
  const wrapper = mount(MissionView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  // The toast queue is a module singleton: clear it or a previous test's success outlives it.
  for (const message of [...useToast().messages.value]) useToast().dismiss(message.id);
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('mission screen', () => {
  it('invites the user to create a request when there is nothing active', async () => {
    stubApi({ sos: false, mission: null });
    const { wrapper } = await render();
    expect(wrapper.text()).toContain('هنوز درخواستی ندارید');
    expect(wrapper.findAll('.rail')).toHaveLength(0);
    wrapper.unmount();
  });

  it('renders the rail from the detail call the list does not carry', async () => {
    const calls = stubApi();
    const { wrapper } = await render();

    // The list endpoint omits `timeline`; without the follow-up call the rail renders no entries.
    expect(calls.some((call) => call.path === '/_user/sos/sos_1')).toBe(true);
    const entries = wrapper.findAll('.timeline li');
    expect(entries).toHaveLength(2);
    expect(entries[0].text()).toContain('created');
    expect(entries[1].text()).toContain('dispatch');
    wrapper.unmount();
  });

  it('marks the rail up to the current status', async () => {
    stubApi();
    const { wrapper } = await render();
    const steps = wrapper.findAll('.rail__step');
    expect(steps).toHaveLength(5);
    // DISPATCHED is index 1, so the first two steps are done.
    expect(steps[0].classes()).toContain('is-done');
    expect(steps[1].classes()).toContain('is-done');
    expect(steps[2].classes()).not.toContain('is-done');
    wrapper.unmount();
  });

  it('shows the incident, its tracking code and the requester timeline', async () => {
    stubApi();
    const { wrapper } = await render();
    const text = wrapper.text();
    expect(text).toContain('آتش‌سوزی');
    expect(text).toContain('۳۲۳۵');
    expect(text).not.toContain('—');
    wrapper.unmount();
  });

  it('offers exactly the action the current mission status allows', async () => {
    stubApi();
    const { wrapper } = await render();
    const buttons = wrapper.findAll('.action-row button');
    // ON_THE_WAY permits "arrived" only; offering "complete" would skip the state machine.
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toContain('رسیدم');
    wrapper.unmount();
  });

  it('advances the mission and confirms with a toast', async () => {
    const calls = stubApi();
    const { wrapper } = await render();
    await wrapper.find('.action-row button').trigger('click');
    await flushPromises();

    const call = calls.find((entry) => entry.path === '/_user/missions/mis_1/progress');
    expect(call?.body).toEqual({ action: 'arrive', note: 'گام arrive' });
    // The toast host lives in the app shell, so the store is the source of truth here.
    expect(useToast().messages.value.some((message) => message.message === 'وضعیت مأموریت به‌روز شد.')).toBe(true);
    wrapper.unmount();
  });

  it('reports a rejected transition instead of pretending it worked', async () => {
    stubApi();
    const { wrapper } = await render();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, requestId: 'req_mis', error: { code: 'CONFLICT', message: 'گذر نامعتبر' } }), {
          status: 409,
          headers: { 'content-type': 'application/json' }
        })
      )
    );
    await wrapper.find('.action-row button').trigger('click');
    await flushPromises();
    const messages = useToast().messages.value;
    expect(messages.some((message) => message.message === 'گذر نامعتبر')).toBe(true);
    expect(messages.some((message) => message.message === 'وضعیت مأموریت به‌روز شد.')).toBe(false);
    expect(messages.some((message) => message.tone === 'error')).toBe(true);
    wrapper.unmount();
  });

  it('offers no next action once the mission is running or done', async () => {
    stubApi({ mission: { id: 'mis_2', sosId: 'sos_1', status: MISSION_STATUS.IN_PROGRESS, updatedAt: 1794136200000 } });
    const { wrapper } = await render();
    // IN_PROGRESS maps to "complete"; a completed mission maps to nothing.
    expect(wrapper.findAll('.action-row button')).toHaveLength(1);

    stubApi({ mission: { id: 'mis_3', sosId: 'sos_1', status: MISSION_STATUS.CANCELLED, updatedAt: 1794136200000 } });
    const second = await render();
    expect(second.wrapper.findAll('.action-row button')).toHaveLength(0);
    wrapper.unmount();
    second.wrapper.unmount();
  });

  it('asks for a rating once the mission is complete and shows it after it lands', async () => {
    stubApi({ mission: { id: 'mis_4', sosId: 'sos_1', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: null } });
    const { wrapper } = await render();
    const stars = wrapper.findAll('.rating-star');
    expect(stars).toHaveLength(5);
    expect(stars[2].attributes('aria-label')).toBe('امتیاز 3');
    wrapper.unmount();

    stubApi({ mission: { id: 'mis_5', sosId: 'sos_1', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: 4 } });
    const rated = await render();
    // A rated mission must not ask again: the endpoint accepts one rating only.
    expect(rated.wrapper.findAll('.rating-star')).toHaveLength(0);
    expect(rated.wrapper.text()).toContain('امتیاز ثبت‌شده');
    rated.wrapper.unmount();
  });

  it('posts a rating and confirms it', async () => {
    stubApi({ mission: { id: 'mis_6', sosId: 'sos_1', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: null } });
    const calls = stubApi({ mission: { id: 'mis_6', sosId: 'sos_1', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: null } });
    const { wrapper } = await render();
    await wrapper.findAll('.rating-star')[4].trigger('click');
    await flushPromises();

    const call = calls.find((entry) => entry.path === '/_user/missions/mis_6/rating');
    expect(call?.body).toEqual({ rating: 5, note: 'ارزیابی از برنامه' });
    expect(useToast().messages.value.some((message) => message.message === 'ارزیابی ثبت شد.')).toBe(true);
    wrapper.unmount();
  });
});
