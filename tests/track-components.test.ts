import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import { vuetify } from '../src/client/plugins/vuetify.ts';
import TrackConsentPrompt from '../src/client/components/TrackConsentPrompt.vue';
import TrackRecordingIndicator from '../src/client/components/TrackRecordingIndicator.vue';
import TrackReplayPanel from '../src/client/components/TrackReplayPanel.vue';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { useTripsStore } from '../src/client/stores/trips.ts';
import { useSosStore } from '../src/client/stores/sos.ts';
import { MISSION_STATUS } from '../src/shared/protocol.ts';

/**
 * Component coverage for the three Stage D surfaces: the per-context consent prompt (two
 * simultaneous contexts must resolve in mission-first order), the honest recording indicator
 * with its one-tap stop, and the replay panel's explicit availability states — including the
 * no-invented-route rule.
 */

const TRIP = {
  id: 'trp_comp0000000000000000000000000001',
  name: 'مسیر بیمارستان',
  status: 'active' as const,
  saved: false, role: 'member' as const, ownerId: 'usr_requester', ownerUsername: 'saeed.k',
  stopCount: 2, memberCount: 2,
  createdAt: 1_000, updatedAt: 9_000, startedAt: 1_000, completedAt: null,
  trackStatus: 'available' as const, trackConsent: null as null | 'accepted' | 'declined'
};
const MISSION = {
  id: 'msn_comp0000000000000000000000000001',
  sosId: 'sos_comp00000000000000000000000001',
  trackingCode: 654_321, responderId: 'usr_requester', requesterId: 'usr_parsa',
  incidentLabel: 'آتش‌سوزی', status: MISSION_STATUS.IN_PROGRESS,
  createdAt: 2_000, updatedAt: 8_000,
  trackStatus: 'available' as const, trackConsent: null as null | 'accepted' | 'declined'
};

const REPLAY = {
  contextType: 'trip', contextId: TRIP.id, availability: 'available', access: 'member', scope: null,
  authorizedUntil: null, retentionDays: 180,
  window: { from: 1_000, to: 9_000 },
  points: [
    { userId: 'usr_requester', latitude: 35.70, longitude: 51.40, accuracy: 8, heading: 10, speed: 5, recordedAt: 1_500 },
    { userId: 'usr_requester', latitude: 35.71, longitude: 51.41, accuracy: 8, heading: 10, speed: 5, recordedAt: 3_500 },
    { userId: 'usr_requester', latitude: 35.72, longitude: 51.42, accuracy: 9, heading: null, speed: null, recordedAt: 7_500 }
  ],
  summaries: [
    {
      userId: 'usr_requester', username: 'saeed.k', distanceM: 3200, durationMs: 420_000,
      pointCount: 3, firstPointAt: 1_500, lastPointAt: 7_500, quality: 'ok'
    }
  ],
  truncated: false
};

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_c', data }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}
function failure(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, requestId: 'req_c', error: { code, message } }), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}

function seed({ recordTrack = true, tripConsent = null as null | 'accepted' | 'declined', missionConsent = null as null | 'accepted' | 'declined' } = {}) {
  const auth = useAuthStore();
  auth.user = {
    id: 'usr_requester', username: 'saeed.k', role: 'user',
    isActive: true, securityReady: true, mustCompleteSecurityQuestions: false,
    readyForMission: false, recordTrack, averageRating: 0, createdAt: 1
  } as never;
  useTripsStore().trips = [{ ...TRIP, trackConsent: tripConsent }] as never;
  useSosStore().missions = [{ ...MISSION, trackConsent: missionConsent }] as never;
}

const mountWithPlugins = (component: unknown, props: Record<string, unknown> = {}) =>
  mount(component as never, {
    props,
    global: { plugins: [vuetify] },
    attachTo: document.body
  });

beforeEach(() => {
  localStorage.clear();
  document.body.innerHTML = '';
  setActivePinia(createPinia());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('TrackConsentPrompt', () => {
  it('renders nothing while the opt-in is off, even with a pending trip', () => {
    seed({ recordTrack: false });
    const wrapper = mountWithPlugins(TrackConsentPrompt);
    expect(wrapper.find('[data-testid="track-consent-prompt"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it('asks for the mission first and records the accepted decision', async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'POST') return envelope({ ok: true });
      if (path === '/_user/trips' || path === '/_user/trips/invitations' || path === '/_user/missions'
        || path === '/_user/sos' || path === '/_user/mission-offers'
        || path === '/_public/incident-types' || path === '/_public/cancellation-reasons') {
        return envelope({ items: [] });
      }
      return envelope({});
    }));
    seed();
    const wrapper = mountWithPlugins(TrackConsentPrompt);
    const dialog = wrapper.find('[data-testid="track-consent-prompt"]');
    expect(dialog.exists()).toBe(true);
    expect(wrapper.text()).toContain('آتش‌سوزی');
    await wrapper.find('[data-testid="track-consent-accept"]').trigger('click');
    await flushPromises();
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.path).toBe(`/_user/missions/${encodeURIComponent(MISSION.id)}/track-consent`);
    expect(post?.body).toEqual({ decision: 'accepted' });
    wrapper.unmount();
  });

  it('declining posts a declined decision', async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'POST') return envelope({ ok: true });
      if (path === '/_user/trips' || path === '/_user/trips/invitations' || path === '/_user/missions'
        || path === '/_user/sos' || path === '/_user/mission-offers'
        || path === '/_public/incident-types' || path === '/_public/cancellation-reasons') {
        return envelope({ items: [] });
      }
      return envelope({});
    }));
    seed({ missionConsent: 'declined', tripConsent: null });
    // mission already decided → the prompt must fall through to the trip
    const wrapper = mountWithPlugins(TrackConsentPrompt);
    expect(wrapper.text()).toContain('مسیر بیمارستان');
    await wrapper.find('[data-testid="track-consent-decline"]').trigger('click');
    await flushPromises();
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.path).toBe(`/_user/trips/${encodeURIComponent(TRIP.id)}/track-consent`);
    expect(post?.body).toEqual({ decision: 'declined' });
    wrapper.unmount();
  });
});

describe('TrackRecordingIndicator', () => {
  it('is hidden without a recording context and visible with one', async () => {
    seed({ missionConsent: null, tripConsent: null });
    const wrapper = mountWithPlugins(TrackRecordingIndicator);
    expect(wrapper.find('[data-testid="track-recording-indicator"]').exists()).toBe(false);
    wrapper.unmount();

    setActivePinia(createPinia());
    seed({ missionConsent: 'accepted' });
    const second = mountWithPlugins(TrackRecordingIndicator);
    await second.vm.$nextTick();
    expect(second.find('[data-testid="track-recording-indicator"]').exists()).toBe(true);
    expect(second.text()).toContain('آتش‌سوزی');
    second.unmount();
  });

  it('stop records an account-level opt-out (PATCH /_user/me)', async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return envelope({ ok: true });
    }));
    seed({ missionConsent: 'accepted' });
    const wrapper = mountWithPlugins(TrackRecordingIndicator);
    await wrapper.find('[data-testid="track-recording-stop"]').trigger('click');
    await flushPromises();
    expect(calls).toEqual([{ method: 'PATCH', path: '/_user/me', body: { recordTrack: false } }]);
    expect(wrapper.find('[data-testid="track-recording-indicator"]').exists()).toBe(false);
    wrapper.unmount();
  });
});

describe('TrackReplayPanel', () => {
  it('states the honest empty case without fetching when nothing was recorded', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountWithPlugins(TrackReplayPanel, {
      contextType: 'trip', contextId: TRIP.id, availability: 'none', from: 1_000, to: 9_000
    });
    expect(wrapper.find('[data-testid="track-replay-none"]').exists()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('states the honest expired case without fetching', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const wrapper = mountWithPlugins(TrackReplayPanel, {
      contextType: 'trip', contextId: TRIP.id, availability: 'expired', from: 1_000, to: 9_000
    });
    expect(wrapper.find('[data-testid="track-replay-expired"]').exists()).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it('renders the persisted summary and a schematic path for recorded tracks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => envelope(REPLAY)));
    const wrapper = mountWithPlugins(TrackReplayPanel, {
      contextType: 'trip', contextId: TRIP.id, availability: 'available', from: 1_000, to: 9_000
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="track-replay-summaries"]').exists()).toBe(true);
    expect(wrapper.text()).toContain('saeed.k');
    expect(wrapper.text()).toContain('۳.۲ کیلومتر');
    expect(wrapper.find('[data-testid="track-replay-path"]').exists()).toBe(true);
    wrapper.unmount();
  });

  it('surfaces a failure with a retry, and retrying recovers', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls === 1 ? failure(500, 'INTERNAL', 'خطای سرور') : envelope(REPLAY);
    }));
    const wrapper = mountWithPlugins(TrackReplayPanel, {
      contextType: 'trip', contextId: TRIP.id, availability: 'available', from: 1_000, to: 9_000
    });
    await flushPromises();
    expect(wrapper.find('[data-testid="track-replay-retry"]').exists()).toBe(true);
    await wrapper.find('[data-testid="track-replay-retry"]').trigger('click');
    await flushPromises();
    expect(wrapper.text()).toContain('saeed.k');
    wrapper.unmount();
  });
});
