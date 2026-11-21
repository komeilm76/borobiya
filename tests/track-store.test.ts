import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTrackStore } from '../src/client/stores/track.ts';
import { useTripsStore } from '../src/client/stores/trips.ts';
import { useSosStore } from '../src/client/stores/sos.ts';
import { useRealtimeStore } from '../src/client/stores/realtime.ts';
import { useAuthStore } from '../src/client/stores/auth.ts';
import { MISSION_STATUS } from '../src/shared/protocol.ts';

/**
 * The track store is the client half of the consented-recording contract: two gates (account
 * opt-in mirrored server-side, per-context consent) must both be open before a fix leaves the
 * device, the prompt must ask only when a context is actually waiting, and publishing must be
 * best-effort and throttled so the live path never depends on the gate.
 */

const TRIP = {
  id: 'trp_test000000000000000000000000001',
  name: 'مسیر بیمارستان',
  status: 'active' as const,
  saved: false, role: 'leader' as const, ownerId: 'usr_requester', ownerUsername: 'saeed.k',
  stopCount: 1, memberCount: 1,
  createdAt: 1_000, updatedAt: 2_000, startedAt: 1_500, completedAt: null,
  trackStatus: 'available' as const, trackConsent: null as null | 'accepted' | 'declined'
};
const MISSION = {
  id: 'msn_test000000000000000000000000001',
  sosId: 'sos_test000000000000000000000000001',
  trackingCode: 123_456, responderId: 'usr_requester', requesterId: 'usr_parsa',
  incidentLabel: 'تصادف', status: MISSION_STATUS.ON_THE_WAY,
  createdAt: 1_000, updatedAt: 2_000,
  trackStatus: 'available' as const, trackConsent: null as null | 'accepted' | 'declined'
};

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ ok: true, requestId: 'req_test', data }), {
    status: 200, headers: { 'Content-Type': 'application/json' }
  });
}
function failure(status: number, code: string, message: string): Response {
  return new Response(JSON.stringify({ ok: false, requestId: 'req_test', error: { code, message } }), {
    status, headers: { 'Content-Type': 'application/json' }
  });
}

beforeEach(() => {
  localStorage.clear();
  setActivePinia(createPinia());
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Seeds the authed user and both domain stores with one opt-in context each. */
function seed() {
  const auth = useAuthStore();
  auth.user = {
    id: 'usr_requester', username: 'saeed.k', role: 'user',
    isActive: true, securityReady: true, mustCompleteSecurityQuestions: false,
    readyForMission: false, recordTrack: true, averageRating: 0, createdAt: 1
  } as never;
  const trips = useTripsStore();
  trips.trips = [{ ...TRIP }] as never;
  const sos = useSosStore();
  sos.missions = [{ ...MISSION }] as never;
  return { auth, trips, sos };
}

describe('track store consent gate', () => {
  it('asks nothing while the account opt-in is off', () => {
    const { auth, trips, sos } = seed();
    auth.user = { ...auth.user!, recordTrack: false } as never;
    const track = useTrackStore();
    expect(track.optIn).toBe(false);
    expect(track.pendingPrompt).toBeNull();
    expect(track.recordingContext).toBeNull();
    expect(track.publishFix({ userId: 'self', latitude: 35.7, longitude: 51.4, accuracy: 10, recordedAt: Date.now() })).toBe(false);
    expect(trips.trips[0].trackConsent).toBeNull();
    expect(sos.missions[0].trackConsent).toBeNull();
  });

  it('asks for a mission first, then a trip; accepted contexts record on that context', () => {
    const { trips, sos } = seed();
    const track = useTrackStore();
    expect(track.pendingPrompt?.type).toBe('mission');
    sos.missions = [{ ...MISSION, trackConsent: 'accepted' }] as never;
    expect(track.pendingPrompt?.type).toBe('trip');
    trips.trips = [{ ...TRIP, trackConsent: 'accepted' }] as never;
    expect(track.pendingPrompt).toBeNull();
    expect(track.recordingContext?.type).toBe('mission');
    expect(track.isRecording).toBe(true);
  });

  it('declined consent records nothing and asks no more', () => {
    const { trips } = seed();
    const sos = useSosStore();
    sos.missions = [{ ...MISSION, trackConsent: 'declined' }] as never;
    const track = useTrackStore();
    expect(track.pendingPrompt?.type).toBe('trip');
    trips.trips = [{ ...TRIP, trackConsent: 'declined' }] as never;
    expect(track.pendingPrompt).toBeNull();
    expect(track.recordingContext).toBeNull();
    expect(track.isRecording).toBe(false);
  });
});

describe('track store opt-in mirror', () => {
  it('PATCHes the server, updates the session user and mirrors to local storage', async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('?')[0];
      calls.push({ method: init?.method ?? 'GET', path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      return envelope({ ok: true });
    }));
    const { auth } = seed();
    const track = useTrackStore();
    await track.setOptIn(false);
    expect(track.optIn).toBe(false);
    expect(auth.user?.recordTrack).toBe(false);
    expect(localStorage.getItem('bb-record-track')).toBe('0');
    expect(calls).toEqual([{ method: 'PATCH', path: '/_user/me', body: { recordTrack: false } }]);
  });

  it('reverts the mirror and surfaces the error when the server refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => failure(403, 'FORBIDDEN', 'اجازه نیست.')));
    seed();
    const track = useTrackStore();
    await expect(track.setOptIn(false)).rejects.toThrow();
    expect(track.optIn).toBe(true);
    expect(localStorage.getItem('bb-record-track')).toBe('1');
    expect(track.optInError).toBe('اجازه نیست.');
  });
});

describe('track store publishing gate and throttle', () => {
  it('publishes only when the gate is open, attaches the context and throttles repeats', () => {
    const { trips, sos } = seed();
    sos.missions = [{ ...MISSION, trackConsent: 'accepted' }] as never;
    trips.trips = [{ ...TRIP, trackConsent: 'accepted' }] as never;
    const track = useTrackStore();
    const realtime = useRealtimeStore();
    const send = vi.spyOn(realtime, 'send').mockReturnValue(true);

    const fix = { userId: 'self', latitude: 35.7, longitude: 51.4, accuracy: 12, heading: 90, speed: 8, recordedAt: 1_234 };
    expect(track.publishFix(fix)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    const payload = send.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).toMatchObject({ type: 'location.update', contextType: 'mission', contextId: MISSION.id, latitude: 35.7, accuracy: 12, heading: 90, speed: 8, recordedAt: 1_234 });
    // Throttled: an immediate second fix does not go out again.
    expect(track.publishFix({ ...fix, recordedAt: 1_235 })).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('omits null heading and speed instead of sending NaN', () => {
    const { sos } = seed();
    sos.missions = [{ ...MISSION, trackConsent: 'accepted' }] as never;
    const track = useTrackStore();
    const realtime = useRealtimeStore();
    const send = vi.spyOn(realtime, 'send').mockReturnValue(true);
    const fix = { userId: 'self', latitude: 35.7, longitude: 51.4, accuracy: 40, heading: null, speed: null, recordedAt: 5_000 } as never;
    track.publishFix(fix);
    const payload = send.mock.calls[0][0] as Record<string, unknown>;
    expect(payload).not.toHaveProperty('heading');
    expect(payload).not.toHaveProperty('speed');
  });
});

describe('track store decision flow', () => {
  it('posts the consent decision for the pending context and re-reads both lists', async () => {
    const calls: Array<{ method: string; path: string; body: unknown }> = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = String(input).split('?')[0];
      const method = init?.method ?? 'GET';
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (method === 'POST') return envelope({ ok: true });
      if (path === '/_user/trips') return envelope({ items: [] });
      if (path === '/_user/trips/invitations') return envelope({ items: [] });
      if (path === '/_user/missions') return envelope({ items: [] });
      if (path === '/_user/sos') return envelope({ items: [] });
      if (path === '/_user/mission-offers') return envelope({ items: [] });
      if (path === '/_public/incident-types' || path === '/_public/cancellation-reasons') return envelope({ items: [] });
      return envelope({});
    }));
    seed();
    const track = useTrackStore();
    await track.decide('accepted');
    const post = calls.find((call) => call.method === 'POST');
    expect(post?.path).toBe(`/_user/missions/${encodeURIComponent(MISSION.id)}/track-consent`);
    expect(post?.body).toEqual({ decision: 'accepted' });
  });
});

describe('track store replay loading and cache', () => {
  const payload = {
    contextType: 'trip', contextId: TRIP.id, availability: 'available', access: 'member', scope: null,
    authorizedUntil: null, retentionDays: 180, window: { from: 1, to: 2 }, points: [],
    summaries: [], truncated: false
  };

  it('fetches the replay payload once and serves it from cache afterwards', async () => {
    let fetches = 0;
    vi.stubGlobal('fetch', vi.fn(async () => { fetches += 1; return envelope(payload); }));
    const track = useTrackStore();
    const first = await track.loadReplay('trip', TRIP.id, 1, 2);
    const second = await track.loadReplay('trip', TRIP.id, 1, 2);
    expect(first).toMatchObject({ availability: 'available' });
    expect(second).toMatchObject({ availability: 'available' });
    expect(fetches).toBe(1);
  });

  it('records an error and allows a retry after a failure', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => {
      calls += 1;
      return calls === 1 ? failure(500, 'INTERNAL', 'خطا') : envelope(payload);
    }));
    const track = useTrackStore();
    expect(await track.loadReplay('trip', TRIP.id, 1, 2)).toBeNull();
    expect(track.replayError[`${'trip'}:${TRIP.id}:1:2`]).toBe('خطا');
    expect(await track.loadReplay('trip', TRIP.id, 1, 2)).toMatchObject({ availability: 'available' });
  });
});

describe('track store mission recording party', () => {
  it('a pure requester is never asked and never records', () => {
    const { sos } = seed();
    sos.missions = [{ ...MISSION, responderId: 'usr_reza', requesterId: 'usr_requester', trackConsent: null }] as never;
    const trips = useTripsStore();
    trips.trips = [{ ...TRIP, trackConsent: null }] as never;
    const track = useTrackStore();
    // The pending context must fall through to the trip; the requester's mission is invisible to recording.
    expect(track.pendingPrompt?.type).toBe('trip');
    // Even if the requester's mission row claims consent accepted (server would refuse the write), the client never picks it.
    sos.missions = [{ ...MISSION, responderId: 'usr_reza', requesterId: 'usr_requester', trackConsent: 'accepted' }] as never;
    trips.trips = [{ ...TRIP, trackConsent: 'accepted' }] as never;
    expect(track.recordingContext?.type).toBe('trip');
  });
});
