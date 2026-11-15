import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useMissionTeamStore } from '../src/client/stores/missionTeam.ts';

/**
 * Store-level pins for the two mission-team slices the component tests never touch:
 * `refresh` (the combined re-pull used after realtime events) and `reset` (the full
 * state drop). Both must keep the admin-vs-user URL split honest — an admin refresh
 * must not leak the member-scoped support-request list into the admin projection.
 */

const TEAM = {
  missionId: 'mis_1', sosId: 'sos_1', status: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high',
  createdAt: 1794136000000, viewerRole: 'admin', leader: null, members: [], memberCount: 0,
  requirements: [], pendingSupportRequestCount: 0
};

const REQUEST = {
  id: 'srq_1', missionId: 'mis_1', requestedBy: 'usr_self', requestedByUsername: 'reza.m',
  reason: 'نیاز به یک امدادگر پزشکی برای رسیدگی به مصدومان حادثه رانندگی', note: null, status: 'pending',
  items: [], adminNote: null, reviewedAt: null, decisions: [],
  createdAt: 1794136100000, updatedAt: 1794136100000, cancelledAt: null,
  missionStatus: 'on_the_way', incidentLabel: 'آتش‌سوزی', severity: 'high'
};

type Handler = (url: string, init: RequestInit | undefined) => Response;

/** Installs a fetch double and returns the list of `METHOD path` calls it saw. */
function stubApi(handler?: Handler): string[] {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.pathname : input.url;
      const path = url.split('?')[0];
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      if (handler) return handler(path, init);
      return json(route(path));
    })
  );
  return calls;
}

/** Builds a success envelope. */
function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: status < 400, requestId: 'req_mts', data }), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}

/** Default payload for each endpoint the store touches. */
function route(path: string): unknown {
  if (path === '/_user/missions/mis_1/team') return TEAM;
  if (path === '/_admin/missions/mis_1/team') return { ...TEAM, viewerRole: 'admin' };
  if (path === '/_user/missions/mis_1/support-requests') return { items: [REQUEST] };
  return {};
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mission team store refresh and reset', () => {
  it('refresh re-pulls both user-scoped slices', async () => {
    const store = useMissionTeamStore();
    const calls = stubApi();

    await store.refresh('mis_1');

    expect(calls).toContain('GET /_user/missions/mis_1/team');
    expect(calls).toContain('GET /_user/missions/mis_1/support-requests');
    expect(store.team?.missionId).toBe('mis_1');
    expect(store.requests).toHaveLength(1);
  });

  it('refresh for an administrator skips the member-scoped support-request pull', async () => {
    const store = useMissionTeamStore();
    const calls = stubApi();

    await store.refresh('mis_1', true);

    expect(calls).toContain('GET /_admin/missions/mis_1/team');
    expect(calls).not.toContain('GET /_user/missions/mis_1/support-requests');
    expect(calls).not.toContain('GET /_user/missions/mis_1/team');
  });

  it('reset drops every loaded slice and clears loading/error state', async () => {
    const store = useMissionTeamStore();
    stubApi();
    await store.refresh('mis_1');
    expect(store.team).not.toBeNull();
    expect(store.requests).toHaveLength(1);

    store.reset();

    expect(store.team).toBeNull();
    expect(store.requests).toHaveLength(0);
    expect(store.adminRequests).toHaveLength(0);
    expect(store.loading).toBe(false);
    expect(store.busy).toBe(false);
    expect(store.error).toBeNull();
  });
});
