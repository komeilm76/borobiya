import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import SupportRequestPanel from '../src/client/components/mission/SupportRequestPanel.vue';
import { useRealtimeStore } from '../src/client/stores/realtime.ts';
import { ROUTE_NAMES, routes as ROUTES } from '../src/client/router/index.ts';
import { HTTP_EVENTS } from '../src/shared/protocol.ts';

/**
 * The support-request panel notifies the requesting leader when an administrator reviews the
 * request (design 13-support-accepted-notification): an in-sheet, dismissible banner whose copy
 * is derived from the realtime `decision` payload — nothing else is fabricated.
 */

const TEAM_LEADER = {
  missionId: 'mis_1', sosId: 'sos_1', status: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high',
  createdAt: 1794136000000, viewerRole: 'leader',
  leader: null,
  members: [],
  memberCount: 2,
  requirements: [],
  pendingSupportRequestCount: 1
};

const TEAM_MEMBER = { ...TEAM_LEADER, viewerRole: 'member' };

function stubApi(team: Record<string, unknown>) {
  const calls: Array<{ method: string; path: string; body?: unknown }> = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      let data: unknown = { ok: true };
      if (path === `/_user/missions/mis_1/team`) data = team;
      else if (path === `/_user/missions/mis_1/support-requests`) data = { items: [] };
      return new Response(JSON.stringify({ ok: true, requestId: 'req_srn', data }), {
        status: 200,
        headers: { 'content-type': 'application/json' }
      });
    })
  );
  return calls;
}

/**
 * Mounts the panel with listener capture in place. One shared pinia — the panel and the spied
 * store must come from the same instance, the same resolution path the map-shell tests use.
 */
async function renderPanel() {
  const router = createRouter({ history: createMemoryHistory(), routes: ROUTES });
  await router.push({ name: ROUTE_NAMES.mission });
  await router.isReady();
  const pinia = createPinia();
  setActivePinia(pinia);
  const realtime = useRealtimeStore(pinia);
  const handlers = new Map<string, Set<(payload: unknown) => void>>();
  vi.spyOn(realtime, 'on').mockImplementation(((type: string, listener: (payload: unknown) => void) => {
    const set = handlers.get(type) ?? new Set();
    set.add(listener);
    handlers.set(type, set);
    return () => set.delete(listener);
  }) as never);
  const wrapper = mount(SupportRequestPanel, {
    attachTo: document.body,
    props: { missionId: 'mis_1' },
    global: { plugins: [pinia, vuetify, router] }
  });
  await flushPromises();
  const emit = async (type: string, payload: Record<string, unknown>) => {
    for (const listener of handlers.get(type) ?? []) listener(payload);
    await flushPromises();
  };
  return { wrapper, emit };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  document.body.innerHTML = '';
  vi.unstubAllGlobals();
});

describe('support review notice', () => {
  it('shows the leader an approval notice derived from the realtime decision', async () => {
    const calls = stubApi(TEAM_LEADER);
    const { wrapper, emit } = await renderPanel();
    const teamCallsBefore = calls.filter((call) => call.path === '/_user/missions/mis_1/team').length;

    await emit(HTTP_EVENTS.SUPPORT_REQUEST_REVIEWED, { missionId: 'mis_1', decision: 'approved', requestId: 'spr_1', createdAt: 1794137000000 });

    const notice = wrapper.find('[data-testid="support-review-notice"]');
    expect(notice.exists()).toBe(true);
    expect(notice.text()).toContain('تأیید شد');
    // The list must have re-pulled so the approved quantities are visible.
    expect(calls.filter((call) => call.path === '/_user/missions/mis_1/team').length).toBeGreaterThan(teamCallsBefore);
    wrapper.unmount();
  });

  it('distinguishes a partial approval and a rejection', async () => {
    stubApi(TEAM_LEADER);
    const { wrapper, emit } = await renderPanel();

    await emit(HTTP_EVENTS.SUPPORT_REQUEST_REVIEWED, { missionId: 'mis_1', decision: 'partially_approved', requestId: 'spr_1' });
    expect(wrapper.find('[data-testid="support-review-notice"]').text()).toContain('جزئی');

    await emit(HTTP_EVENTS.SUPPORT_REQUEST_REVIEWED, { missionId: 'mis_1', decision: 'rejected', requestId: 'spr_1' });
    const notice = wrapper.find('[data-testid="support-review-notice"]');
    expect(notice.text()).toContain('رد شد');

    await wrapper.find('[data-testid="support-review-notice-close"]').trigger('click');
    expect(wrapper.find('[data-testid="support-review-notice"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('does not notify plain members or other missions', async () => {
    stubApi(TEAM_MEMBER);
    const { wrapper, emit } = await renderPanel();

    await emit(HTTP_EVENTS.SUPPORT_REQUEST_REVIEWED, { missionId: 'mis_1', decision: 'approved', requestId: 'spr_1' });
    expect(wrapper.find('[data-testid="support-review-notice"]').exists()).toBe(false);

    await emit(HTTP_EVENTS.SUPPORT_REQUEST_REVIEWED, { missionId: 'mis_other', decision: 'approved', requestId: 'spr_2' });
    expect(wrapper.find('[data-testid="support-review-notice"]').exists()).toBe(false);
    wrapper.unmount();
  });
});
