import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { useTripsStore } from '../src/client/stores/trips.ts';

/**
 * The trips store is the client half of the trips contract: the server stays authoritative and the
 * store re-reads after each mutation. These tests drive every action against a mocked envelope so
 * a wrong method, path or body fails here instead of silently stranding the screen.
 */

function envelope<T>(data: T, status = 200): Response {
  return new Response(JSON.stringify({ ok: status < 400, requestId: 'req_test', data }), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });
}

const TRIP = {
  id: 'trp_1', name: 'مسیر بیمارستان', status: 'planned', saved: false, role: 'leader',
  ownerId: 'usr_self', ownerUsername: 'saeed.k', stopCount: 1, memberCount: 1,
  createdAt: 1794100000000, updatedAt: 1794100000000, startedAt: null, completedAt: null
} as const;

const DETAIL = {
  ...TRIP,
  stops: [{ id: 'tstp_1', rank: 1, label: 'خانه', latitude: 35.7192, longitude: 51.3314, placeId: null }],
  members: [{ userId: 'usr_self', username: 'saeed.k', role: 'leader', joinedAt: 1794100000000 }],
  invitations: []
};

/** Stubs fetch with a route table; records every {method, path, body} for assertions. */
function stub(routes: Record<string, Record<string, unknown> | ((body?: any) => Record<string, unknown>)>) {
  const calls: Array<{ method: string; path: string; url: string; body?: any }> = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as URL).href;
    const path = url.split('?')[0];
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, path, url, body });
    const key = `${method} ${path}`;
    const handler = routes[key] ?? routes[path];
    const data = handler ? (typeof handler === 'function' ? handler(body) : handler) : { items: [], total: 0 };
    return envelope(data, 200);
  }));
  return calls;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

describe('trips store', () => {
  it('loads the list and the invitation inbox, honouring the saved-only filter', async () => {
    const calls = stub({
      '/_user/trips': { items: [TRIP], total: 1 },
      '/_user/trips/invitations': { items: [{ id: 'tinv_1', tripId: 'trp_9', tripName: 'مسیر صبح', tripStatus: 'planned', inviterUsername: 'reza.m', createdAt: 1 }], total: 1 }
    });
    const store = useTripsStore();
    await store.load();
    expect(store.trips).toHaveLength(1);
    expect(store.invitations).toHaveLength(1);
    expect(store.loading).toBe(false);
    expect(store.error).toBeNull();

    store.savedOnly = true;
    await store.load();
    expect(calls.at(-2)!.url).toContain('saved=true');
  });

  it('passes saved=true when the saved-only filter is on', async () => {
    const seen: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : (input as URL).href;
      seen.push(url);
      const path = url.split('?')[0];
      if (path === '/_user/trips/invitations') return envelope({ items: [], total: 0 });
      return envelope({ items: [], total: 0 });
    }));
    const store = useTripsStore();
    store.savedOnly = true;
    await store.load();
    expect(seen.some((url) => url.includes('/_user/trips?') && url.includes('saved=true'))).toBe(true);
  });

  it('reports a transport failure instead of hanging in loading state', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const store = useTripsStore();
    await store.load();
    expect(store.loading).toBe(false);
    expect(store.error).toBeTruthy();
    expect(store.trips).toEqual([]);
  });

  it('opens the detail and keeps it in the store', async () => {
    stub({ '/_user/trips/trp_1': DETAIL });
    const store = useTripsStore();
    const detail = await store.open('trp_1');
    expect(detail?.id).toBe('trp_1');
    expect(store.detail?.members).toHaveLength(1);
  });

  it('create posts the stops, stores the detail and reloads the list', async () => {
    const calls = stub({
      'POST /_user/trips': (body) => ({ ...DETAIL, id: 'trp_new', name: body.name }),
      '/_user/trips': { items: [], total: 0 },
      '/_user/trips/invitations': { items: [], total: 0 }
    });
    const store = useTripsStore();
    const created = await store.create('مسیر صبح', [{ label: 'خانه', latitude: 35.72, longitude: 51.33, placeId: null }]);
    expect(created?.id).toBe('trp_new');
    const post = calls.find((call) => call.method === 'POST' && call.path === '/_user/trips')!;
    expect(post.body.stops[0].label).toBe('خانه');
    expect(store.detail?.id).toBe('trp_new');
  });

  it('update patches and refreshes the detail', async () => {
    const calls = stub({
      'PATCH /_user/trips/trp_1': (body) => ({ ...DETAIL, name: body.name ?? DETAIL.name }),
      '/_user/trips': { items: [], total: 0 },
      '/_user/trips/invitations': { items: [], total: 0 }
    });
    const store = useTripsStore();
    await store.update('trp_1', { name: 'نام تازه' });
    expect(store.detail?.name).toBe('نام تازه');
    expect(calls.some((call) => call.method === 'PATCH' && call.path === '/_user/trips/trp_1')).toBe(true);
  });

  it('toggleSave flips the row without refetching the whole list', async () => {
    const calls = stub({ 'POST /_user/trips/trp_1/save': () => DETAIL });
    const store = useTripsStore();
    store.trips = [{ ...TRIP }] as never;
    await store.toggleSave('trp_1', true);
    expect(store.trips[0].saved).toBe(true);
    expect(calls.some((call) => call.path === '/_user/trips/trp_1/save' && call.method === 'POST' && call.body.saved === true)).toBe(true);
  });

  it('unsaving inside the saved-only filter re-reads the list', async () => {
    const calls = stub({
      'POST /_user/trips/trp_1/save': () => DETAIL,
      '/_user/trips': { items: [], total: 0 },
      '/_user/trips/invitations': { items: [], total: 0 }
    });
    const store = useTripsStore();
    store.savedOnly = true;
    store.trips = [{ ...TRIP, saved: true }] as never;
    await store.toggleSave('trp_1', false);
    // A full reload happened so the unsaved row disappears from the filtered list.
    expect(calls.filter((call) => call.method === 'GET' && call.path === '/_user/trips')).toHaveLength(1);
  });

  it('start, complete and cancel post the transition and reload', async () => {
    const calls = stub({
      'POST /_user/trips/trp_1/start': () => ({ ...DETAIL, status: 'active' }),
      'POST /_user/trips/trp_1/complete': () => ({ ...DETAIL, status: 'completed' }),
      'POST /_user/trips/trp_1/cancel': () => ({ ...DETAIL, status: 'cancelled' }),
      '/_user/trips': { items: [], total: 0 },
      '/_user/trips/invitations': { items: [], total: 0 }
    });
    const store = useTripsStore();
    await store.start('trp_1');
    expect(store.detail?.status).toBe('active');
    await store.complete('trp_1');
    expect(store.detail?.status).toBe('completed');
    await store.cancel('trp_1');
    expect(store.detail?.status).toBe('cancelled');
    expect(calls.map((call) => call.path)).toEqual(expect.arrayContaining([
      '/_user/trips/trp_1/start', '/_user/trips/trp_1/complete', '/_user/trips/trp_1/cancel'
    ]));
  });

  it('invite posts the invitee id and stores the leader projection', async () => {
    const calls = stub({
      'POST /_user/trips/trp_1/invitations': () => ({
        ...DETAIL,
        invitations: [{ id: 'tinv_1', inviteeId: 'usr_reza', inviteeUsername: 'reza.m', invitedByUsername: 'saeed.k', status: 'pending', createdAt: 1794100000000, respondedAt: null }]
      })
    });
    const store = useTripsStore();
    await store.invite('trp_1', 'usr_reza');
    expect(store.detail?.invitations?.[0]?.inviteeUsername).toBe('reza.m');
    expect(calls.some((call) => call.method === 'POST' && call.body.inviteeId === 'usr_reza')).toBe(true);
  });

  it('answerInvitation accepts and declines then reloads the inbox', async () => {
    const calls = stub({
      'POST /_user/trips/invitations/tinv_1/accept': () => ({}),
      'POST /_user/trips/invitations/tinv_1/decline': () => ({}),
      '/_user/trips': { items: [], total: 0 },
      '/_user/trips/invitations': { items: [], total: 0 }
    });
    const store = useTripsStore();
    await store.answerInvitation('tinv_1', true);
    await store.answerInvitation('tinv_1', false);
    expect(calls.some((call) => call.path.endsWith('/accept'))).toBe(true);
    expect(calls.some((call) => call.path.endsWith('/decline'))).toBe(true);
    expect(calls.filter((call) => call.method === 'GET' && call.path === '/_user/trips/invitations')).toHaveLength(2);
  });

  it('cancelInvitation deletes and refreshes the open detail', async () => {
    const calls = stub({
      'DELETE /_user/trips/invitations/tinv_1': () => ({}),
      '/_user/trips/trp_1': DETAIL
    });
    const store = useTripsStore();
    store.detail = { ...DETAIL } as never;
    await store.cancelInvitation('tinv_1');
    expect(calls.some((call) => call.method === 'DELETE' && call.path === '/_user/trips/invitations/tinv_1')).toBe(true);
    expect(calls.some((call) => call.method === 'GET' && call.path === '/_user/trips/trp_1')).toBe(true);
  });

  it('leave posts, drops the detail and reloads the list', async () => {
    const calls = stub({
      'POST /_user/trips/trp_1/leave': () => ({}),
      '/_user/trips': { items: [], total: 0 },
      '/_user/trips/invitations': { items: [], total: 0 }
    });
    const store = useTripsStore();
    store.detail = { ...DETAIL } as never;
    await store.leave('trp_1');
    expect(store.detail).toBeNull();
    expect(calls.some((call) => call.method === 'POST' && call.path === '/_user/trips/trp_1/leave')).toBe(true);
  });

  it('activeCount counts only active trips', async () => {
    stub({});
    const store = useTripsStore();
    store.trips = [
      { ...TRIP, id: 'trp_a', status: 'active' },
      { ...TRIP, id: 'trp_b', status: 'planned' },
      { ...TRIP, id: 'trp_c', status: 'active' }
    ] as never;
    expect(store.activeCount).toBe(2);
  });
});
