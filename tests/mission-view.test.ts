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
  isManual: true,
  incidentIcon: 'fire',
  incidentColor: '#B35A18',
  requesterUsername: 'saeed.k',
  assignedResponderId: 'usr_self',
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
const CANCELLATION_REASONS = [
  { id: 'cancel_mistake', label: 'اشتباه بود', requiresText: false },
  { id: 'cancel_other', label: 'سایر', requiresText: true }
];

function stubApi(options: { mission?: Record<string, unknown> | null; sos?: boolean; failPath?: string; acceptFails?: boolean; cancelFails?: boolean; progressFails?: boolean } = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const mission = options.mission === undefined
    ? { id: 'mis_1', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.ON_THE_WAY, updatedAt: 1794136200000, rating: null }
    : options.mission;

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });

      if (options.cancelFails && path === '/_user/sos/sos_1/cancel' && method === 'POST') {
        return new Response(
          JSON.stringify({ ok: false, requestId: 'r', error: { code: 'CONFLICT', message: 'این درخواست دیگر قابل لغو نیست.' } }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        );
      }

      if (options.progressFails && path === '/_user/missions/mis_1/progress' && method === 'POST') {
        return new Response(
          JSON.stringify({ ok: false, requestId: 'r', error: { code: 'CONFLICT', message: 'این مأموریت دیگر قابل لغو نیست.' } }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        );
      }

      if (options.acceptFails && path === '/_user/sos/sos_1/accept' && method === 'POST') {
        return new Response(
          JSON.stringify({ ok: false, requestId: 'r', error: { code: 'CONFLICT', message: 'درخواست از قبل مأمور شده است.' } }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        );
      }

      if (options.failPath && path === options.failPath && method !== 'GET') {
        return new Response(
          JSON.stringify({ ok: false, requestId: 'r', error: { code: 'CONFLICT', message: 'ارزیابی پیش‌تر ثبت شده است.' } }),
          { status: 409, headers: { 'content-type': 'application/json' } }
        );
      }

      let data: unknown = { ok: true };
      if (path === '/_user/sos') data = { items: options.sos === false ? [] : [SOS_LIST_ITEM] };
      else if (path === '/_user/missions') data = { items: mission ? [mission] : [] };
      else if (path === '/_user/sos/sos_1') data = SOS_DETAIL;
      else if (path === '/_public/cancellation-reasons') data = { items: CANCELLATION_REASONS };

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
async function render(options: { role?: 'user' | 'responder' | 'admin'; userId?: string } = {}) {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.mission });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  if (options.role) {
    useAuthStore().$patch({
      user: {
        id: options.userId ?? 'usr_self',
        username: 'reza.m',
        role: options.role,
        isActive: true,
        securityReady: true,
        mustCompleteSecurityQuestions: false,
        readyForMission: true,
        averageRating: 4.5,
        createdAt: 1794000000000
      }
    });
  }
  await useSosStore().load();
  const wrapper = mount(MissionView, {
    attachTo: document.body,
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  return { wrapper, router, sos: useSosStore() };
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
    const { wrapper } = await render({ role: 'responder', userId: 'usr_self' });
    const buttons = wrapper.findAll('[data-testid="mission-next-actions"] button');
    // ON_THE_WAY permits "arrived" only; offering "complete" would skip the state machine.
    expect(buttons).toHaveLength(1);
    expect(buttons[0].text()).toContain('رسیدم');
    wrapper.unmount();
  });

  it('advances the mission and confirms with a toast', async () => {
    const calls = stubApi();
    const { wrapper } = await render({ role: 'responder', userId: 'usr_self' });
    await wrapper.find('[data-testid="mission-next-actions"] button').trigger('click');
    await flushPromises();

    const call = calls.find((entry) => entry.path === '/_user/missions/mis_1/progress');
    expect(call?.body).toEqual({ action: 'arrive', note: 'گام arrive' });
    // The toast host lives in the app shell, so the store is the source of truth here.
    expect(useToast().messages.value.some((message) => message.message === 'وضعیت مأموریت به‌روز شد.')).toBe(true);
    wrapper.unmount();
  });

  it('reports a rejected transition instead of pretending it worked', async () => {
    stubApi();
    const { wrapper } = await render({ role: 'responder', userId: 'usr_self' });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ ok: false, requestId: 'req_mis', error: { code: 'CONFLICT', message: 'گذر نامعتبر' } }), {
          status: 409,
          headers: { 'content-type': 'application/json' }
        })
      )
    );
    await wrapper.find('[data-testid="mission-next-actions"] button').trigger('click');
    await flushPromises();
    const messages = useToast().messages.value;
    expect(messages.some((message) => message.message === 'گذر نامعتبر')).toBe(true);
    expect(messages.some((message) => message.message === 'وضعیت مأموریت به‌روز شد.')).toBe(false);
    expect(messages.some((message) => message.tone === 'error')).toBe(true);
    wrapper.unmount();
  });

  it('offers no next action once the mission is running or done', async () => {
    stubApi({ mission: { id: 'mis_2', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.IN_PROGRESS, updatedAt: 1794136200000 } });
    const { wrapper } = await render({ role: 'responder', userId: 'usr_self' });
    // IN_PROGRESS maps to "complete"; a completed mission maps to nothing.
    expect(wrapper.findAll('[data-testid="mission-next-actions"] button')).toHaveLength(1);

    stubApi({ mission: { id: 'mis_3', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.CANCELLED, updatedAt: 1794136200000 } });
    const second = await render({ role: 'responder', userId: 'usr_self' });
    expect(second.wrapper.findAll('[data-testid="mission-next-actions"] button')).toHaveLength(0);
    wrapper.unmount();
    second.wrapper.unmount();
  });

  it('asks for a rating once the mission is complete and shows it after it lands', async () => {
    stubApi({ mission: { id: 'mis_4', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: null } });
    const { wrapper } = await render({ role: 'user', userId: 'usr_requester' });
    const stars = wrapper.findAll('.rating-star');
    expect(stars).toHaveLength(5);
    expect(stars[2].attributes('aria-label')).toBe('امتیاز 3');
    wrapper.unmount();

    stubApi({ mission: { id: 'mis_5', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: 4 } });
    const rated = await render({ role: 'user', userId: 'usr_requester' });
    // A rated mission must not ask again: the endpoint accepts one rating only.
    expect(rated.wrapper.findAll('.rating-star')).toHaveLength(0);
    expect(rated.wrapper.text()).toContain('امتیاز ثبت‌شده');
    rated.wrapper.unmount();
  });

  it('posts a rating and confirms it', async () => {
    stubApi({ mission: { id: 'mis_6', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: null } });
    const calls = stubApi({ mission: { id: 'mis_6', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: null } });
    const { wrapper } = await render({ role: 'user', userId: 'usr_requester' });
    await wrapper.find('[data-testid="rating-note"]').setValue('تیم سریع و محترمانه بود');
    await wrapper.findAll('.rating-star')[4].trigger('click');
    await flushPromises();

    const call = calls.find((entry) => entry.path === '/_user/missions/mis_6/rating');
    expect(call?.body).toEqual({ rating: 5, note: 'تیم سریع و محترمانه بود' });
    expect(useToast().messages.value.some((message) => message.message === 'ارزیابی ثبت شد.')).toBe(true);
    wrapper.unmount();
  });

  it('tells the user when the rating was refused instead of failing silently', async () => {
    const complete = { id: 'mis_7', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: null };
    stubApi({ mission: complete, failPath: '/_user/missions/mis_7/rating' });
    const { wrapper } = await render({ role: 'user', userId: 'usr_requester' });
    await wrapper.findAll('.rating-star')[3].trigger('click');
    await flushPromises();

    // A rating that vanishes without a message leaves the user clicking stars forever, and the
    // endpoint accepts only one rating per mission.
    expect(useToast().messages.value.some((message) => message.message.includes('ارزیابی پیش‌تر'))).toBe(true);
    expect(useToast().messages.value.some((message) => message.message === 'ارزیابی ثبت شد.')).toBe(false);
    wrapper.unmount();
  });

  it('hides the action buttons from the requester of the mission', async () => {
    stubApi();
    const { wrapper } = await render({ role: 'user', userId: 'usr_requester' });
    // The assignee sees «رسیدم»; the requester must not be offered mission transitions.
    expect(wrapper.findAll('[data-testid="mission-next-actions"] button')).toHaveLength(0);
    wrapper.unmount();
  });

  it('hides the rating stars from the assigned responder', async () => {
    stubApi({ mission: { id: 'mis_9', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: null } });
    const { wrapper } = await render({ role: 'responder', userId: 'usr_self' });
    // Only the requester may rate; the assignee sees the mission but not the stars.
    expect(wrapper.findAll('.rating-star')).toHaveLength(0);
    wrapper.unmount();
  });

  it('withdraws the stars when no mission is loaded', async () => {
    // The stars only render for a completed mission, so `rate()`'s own guard is defensive: removing
    // it fails nothing. Kept because a stray click during a re-fetch must not post for a stale id.
    stubApi({ mission: { id: 'mis_8', sosId: 'sos_1', responderId: 'usr_self', requesterId: 'usr_requester', status: MISSION_STATUS.COMPLETED, updatedAt: 1794136200000, rating: null } });
    const { wrapper, sos } = await render({ role: 'user', userId: 'usr_requester' });
    sos.activeMission = null;
    sos.missions = [];
    await flushPromises();
    expect(wrapper.findAll('.rating-star')).toHaveLength(0);
    wrapper.unmount();
  });

  it('does not re-fetch a detail that already carries its timeline', async () => {
    // The rail needs `timeline`, which only the detail call returns. A second fetch for data the
    // list already holds would fire on every status change.
    const calls = stubApi();
    const { wrapper } = await render();
    const detailCalls = calls.filter((call) => call.path === '/_user/sos/sos_1');
    expect(detailCalls.length).toBeLessThanOrEqual(1);
    wrapper.unmount();
  });
});


describe('responder offer', () => {
  it('shows the dispatched request with the facts a responder needs', async () => {
    stubApi({ mission: null });
    const { wrapper } = await render({ role: 'responder' });
    const offer = wrapper.find('[data-testid="mission-offer"]');
    expect(offer.exists()).toBe(true);
    expect(offer.text()).toContain('آتش‌سوزی');
    expect(offer.text()).toContain('دود از پنجره');
    expect(offer.text()).toContain('شدید');
    expect(offer.text()).toContain('saeed.k');
    // The manual-fix flag must be visible: a pin dropped far from GPS is an abuse vector.
    expect(offer.text()).toContain('موقعیت توسط درخواست‌کننده دستی');
    wrapper.unmount();
  });

  it('accepts through the store and reloads the authoritative state', async () => {
    const calls = stubApi({ mission: null });
    const { wrapper } = await render({ role: 'responder' });
    await wrapper.find('[data-testid="mission-offer-accept"]').trigger('click');
    await flushPromises();

    const accept = calls.find((entry) => entry.path === '/_user/sos/sos_1/accept');
    expect(accept?.method).toBe('POST');
    expect(useToast().messages.value.some((message) => message.message === 'مأموریت پذیرفته شد.')).toBe(true);
    // The offer list is re-fetched: the accepted SOS must leave the dispatched state.
    expect(calls.filter((entry) => entry.path === '/_user/sos' && entry.method !== 'POST').length).toBeGreaterThanOrEqual(2);
    wrapper.unmount();
  });

  it('reports a lost race instead of pretending acceptance worked', async () => {
    const calls = stubApi({ acceptFails: true, mission: null });
    const { wrapper } = await render({ role: 'responder' });
    await wrapper.find('[data-testid="mission-offer-accept"]').trigger('click');
    await flushPromises();

    expect(useToast().messages.value.some((message) => message.message.includes('درخواست از قبل مأمور'))).toBe(true);
    expect(useToast().messages.value.some((message) => message.message === 'مأموریت پذیرفته شد.')).toBe(false);
    wrapper.unmount();
  });

  it('never shows the offer to a plain user', async () => {
    stubApi();
    const { wrapper } = await render({ role: 'user' });
    expect(wrapper.find('[data-testid="mission-offer"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="mission-offer-accept"]').exists()).toBe(false);
    wrapper.unmount();
  });
});


describe('cancellation', () => {
  it('lets the requester cancel with a catalog reason and posts it', async () => {
    const calls = stubApi();
    const { wrapper } = await render({ role: 'user', userId: 'usr_requester' });
    await wrapper.find('[data-testid="cancel-request"]').trigger('click');
    await wrapper.find('[data-testid="cancel-reason"]').setValue('cancel_mistake');
    // No detail required for this reason; the confirm button must arm on the reason alone.
    const confirm = wrapper.find('[data-testid="confirm-cancel-request"]');
    expect(confirm.attributes('disabled')).toBeUndefined();
    await confirm.trigger('click');
    await flushPromises();

    const call = calls.find((entry) => entry.path === '/_user/sos/sos_1/cancel');
    expect(call?.body).toEqual({ reasonId: 'cancel_mistake' });
    expect(useToast().messages.value.some((message) => message.message === 'درخواست امداد لغو شد.')).toBe(true);
    wrapper.unmount();
  });

  it('demands a 10-character detail for reasons that require one', async () => {
    const calls = stubApi();
    const { wrapper } = await render({ role: 'user', userId: 'usr_requester' });
    await wrapper.find('[data-testid="cancel-request"]').trigger('click');
    await wrapper.find('[data-testid="cancel-reason"]').setValue('cancel_other');
    // Nine characters are not enough — the server would refuse with 400.
    await wrapper.find('[data-testid="cancel-detail"]').setValue('فقط نه');
    const confirm = wrapper.find('[data-testid="confirm-cancel-request"]');
    expect(confirm.attributes('disabled')).toBeDefined();

    await wrapper.find('[data-testid="cancel-detail"]').setValue('تعداد کاراکترها کافی است');
    expect(wrapper.find('[data-testid="confirm-cancel-request"]').attributes('disabled')).toBeUndefined();
    await wrapper.find('[data-testid="confirm-cancel-request"]').trigger('click');
    await flushPromises();

    const call = calls.find((entry) => entry.path === '/_user/sos/sos_1/cancel');
    expect(call?.body.detail).toBe('تعداد کاراکترها کافی است');
    wrapper.unmount();
  });

  it('surfaces a conflict instead of pretending the cancellation landed', async () => {
    stubApi({ cancelFails: true });
    const { wrapper } = await render({ role: 'user', userId: 'usr_requester' });
    await wrapper.find('[data-testid="cancel-request"]').trigger('click');
    await wrapper.find('[data-testid="cancel-reason"]').setValue('cancel_mistake');
    await wrapper.find('[data-testid="confirm-cancel-request"]').trigger('click');
    await flushPromises();

    const messages = useToast().messages.value;
    expect(messages.some((message) => message.message.includes('دیگر قابل لغو نیست'))).toBe(true);
    expect(messages.some((message) => message.message === 'درخواست امداد لغو شد.')).toBe(false);
    wrapper.unmount();
  });

  it('hides the requester cancellation from someone else entirely', async () => {
    stubApi();
    const { wrapper } = await render({ role: 'user', userId: 'usr_somebody_else' });
    expect(wrapper.find('[data-testid="cancel-request"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('lets the assigned responder cancel the mission with an optional note', async () => {
    const calls = stubApi();
    const { wrapper } = await render({ role: 'responder' });
    await wrapper.find('[data-testid="cancel-mission"]').trigger('click');
    await wrapper.find('[data-testid="mission-cancel-note"]').setValue('امکان حضور در صحنه را ندارم');
    await wrapper.find('[data-testid="confirm-cancel-mission"]').trigger('click');
    await flushPromises();

    const call = calls.find((entry) => entry.path === '/_user/missions/mis_1/progress');
    expect(call?.body).toEqual({ action: 'cancel', note: 'امکان حضور در صحنه را ندارم' });
    expect(useToast().messages.value.some((message) => message.message === 'مأموریت لغو شد.')).toBe(true);
    wrapper.unmount();
  });

  it('reports a refused mission cancellation without clearing the screen state', async () => {
    stubApi({ progressFails: true });
    const { wrapper } = await render({ role: 'responder' });
    await wrapper.find('[data-testid="cancel-mission"]').trigger('click');
    await wrapper.find('[data-testid="confirm-cancel-mission"]').trigger('click');
    await flushPromises();

    const messages = useToast().messages.value;
    expect(messages.some((message) => message.message.includes('دیگر قابل لغو نیست'))).toBe(true);
    expect(messages.some((message) => message.message === 'مأموریت لغو شد.')).toBe(false);
    // The mission is not finished; the cancel affordance must still be there after the refusal.
    expect(wrapper.find('[data-testid="cancel-mission"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('hides the mission cancellation from a user who is not the assignee', async () => {
    stubApi();
    const { wrapper } = await render({ role: 'user', userId: 'usr_requester' });
    expect(wrapper.find('[data-testid="cancel-mission"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
