import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from 'vitest';
import { effectScope } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useRealtimeStore } from '../src/client/stores/realtime.ts';
import type { RealtimeEvent } from '../src/shared/protocol.ts';

/**
 * The realtime store is the single mirror of connection state and the durable cursor.
 *
 * Three things here are load-bearing and were previously unasserted. The cursor must never move
 * backwards — every reconnect resumes from it, so a stale value silently replays or skips events.
 * `recentEvents` must stay bounded, because it is rendered and grows one entry per server event.
 * And `reset()` must drop the previous client's handlers, or a reconnect delivers every event twice
 * to the same listener, which looks to the user like duplicate requests appearing.
 */

/** A status payload the transport emits on the `status` channel. */
const CONNECTED = 'connected' as const;

/**
 * Returns the handler set the client registered for a channel.
 *
 * `RealtimeClient.emit` is private, so the store's own listeners are driven the same way the
 * socket drives them: by invoking the registered callbacks directly.
 */
function listenersFor(client: unknown, type: string): Array<(payload: any) => void> {
  const handlers = (client as { handlers: Map<string, Set<(payload: any) => void>> }).handlers;
  return [...(handlers.get(type) ?? [])];
}

/** Delivers a payload on a channel of the store's current client. */
function deliver(store: ReturnType<typeof useRealtimeStore>, type: string, payload: unknown): void {
  for (const listener of listenersFor(store.client, type)) listener(payload);
}

/**
 * Connects, which is what registers the store's status/cursor/event mirror listeners.
 *
 * Without `connect()` the store holds a fresh client with no listeners at all, so delivering a
 * payload would silently do nothing.
 */
async function connectedStore() {
  const { store, stop } = scopedStore();
  await store.connect();
  return { store, stop };
}

/** Builds a durable event. */
function event(id: number, type = 'sos.created'): RealtimeEvent {
  return { id, type, payload: { id }, createdAt: 1794136403220 } as RealtimeEvent;
}

/**
 * Installs a socket that never opens, so `connect()` settles without touching the network.
 *
 * `connect()` first calls `POST /_user/realtime/ticket`, so `fetch` is stubbed as well.
 */
function stubTransport(): void {
  vi.stubGlobal('fetch', vi.fn(async () =>
    new Response(JSON.stringify({
      ok: true,
      requestId: 'req_ticket',
      data: { ticket: 'ticket_1', expiresAt: Date.now() + 20_000, path: '/ws', heartbeatMs: 25_000, protocol: 1 }
    }), { status: 200, headers: { 'content-type': 'application/json' } })
  ));
  vi.stubGlobal('WebSocket', class {
    static OPEN = 1;
    static CLOSED = 3;
    readyState = 0;
    onopen: (() => void) | null = null;
    onclose: (() => void) | null = null;
    onerror: (() => void) | null = null;
    onmessage: ((event: unknown) => void) | null = null;
    constructor(public url: string) {}
    send(): void {}
    close(): void {}
  });
}

/**
 * Creates the store inside its own effect scope.
 *
 * The store registers `onScopeDispose`; without a scope the handler list would leak into every
 * later store instance in the file, which is exactly the duplication these tests are about.
 */
function scopedStore() {
  const scope = effectScope();
  const store = scope.run(() => useRealtimeStore())!;
  return { store, stop: () => scope.stop() };
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
  stubTransport();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('connection state', () => {
  it('starts idle with an empty mirror', () => {
    const { store, stop } = scopedStore();
    expect(store.status).toBe('idle');
    expect(store.cursor).toBe(0);
    expect(store.lastEvent).toBe(null);
    expect(store.recentEvents).toEqual([]);
    stop();
  });

  it('mirrors the status the transport reports', async () => {
    const { store, stop } = await connectedStore();
    deliver(store, 'status', CONNECTED);
    expect(store.status).toBe(CONNECTED);

    deliver(store, 'status', 'error');
    // A failed socket must not keep reading as connected; the console and shell show this pill.
    expect(store.status).toBe('error');
    stop();
  });

  it('reports disconnected rather than idle after an explicit disconnect', () => {
    const { store, stop } = scopedStore();
    store.disconnect();
    expect(store.status).toBe('disconnected');
    stop();
  });
});

describe('event cursor', () => {
  it('never rewinds when an event arrives without an id', async () => {
    const { store, stop } = scopedStore();
    onTestFinished(stop);
    await store.connect();
    deliver(store, 'event', { type: 'sos.created' });
    expect(store.cursor).toBe(0);
  });
});

describe('store teardown', () => {
  it('runs the registered unsubscribe functions when the owning pinia is disposed', () => {
    // The store's disposer lives on pinia's store scope, so disposal goes through $dispose.
    const pinia = createPinia();
    setActivePinia(pinia);
    const store = useRealtimeStore();
    const offs: string[] = [];
    const client = store.client as unknown as {
      on: (type: string, listener: (payload: unknown) => void) => () => void;
    };
    const original = client.on.bind(client);
    vi.spyOn(client, 'on').mockImplementation((type: string, listener: (payload: unknown) => void) => {
      const off = original(type, listener);
      return () => { offs.push(type); off(); };
    });

    store.on('sos.created', () => undefined);
    expect(offs).toEqual([]);
    store.$dispose();
    expect(offs).toEqual(['sos.created']);
  });
});

describe('durable cursor', () => {
  it('adopts the cursor the server sends in its hello', async () => {
    const { store, stop } = await connectedStore();
    deliver(store, 'hello', { eventCursor: 42 });
    expect(store.cursor).toBe(42);
    stop();
  });

  it('treats a hello without a cursor as zero', async () => {
    const { store, stop } = await connectedStore();
    deliver(store, 'hello', {});
    expect(store.cursor).toBe(0);
    stop();
  });

  it('never moves the cursor backwards when an older event is replayed', async () => {
    const { store, stop } = await connectedStore();
    deliver(store, 'event', event(10));
    expect(store.cursor).toBe(10);

    // A replay after a reconnect can deliver an id already seen. Regressing the cursor here would
    // make the next reconnect resume from the old position and replay history indefinitely.
    deliver(store, 'event', event(7));
    expect(store.cursor).toBe(10);
    stop();
  });

  it('keeps the newest event as lastEvent even when it is older than the cursor', async () => {
    const { store, stop } = await connectedStore();
    deliver(store, 'event', event(10));
    deliver(store, 'event', event(7));
    // The mirror is "what arrived", not "the highest id": the UI shows the latest delivery.
    expect(store.lastEvent?.id).toBe(7);
    stop();
  });
});

describe('recent events', () => {
  it('puts the newest event first', async () => {
    const { store, stop } = await connectedStore();
    deliver(store, 'event', event(1));
    deliver(store, 'event', event(2));
    expect(store.recentEvents.map((item) => item.id)).toEqual([2, 1]);
    stop();
  });

  it('stays bounded so a long session cannot grow it without limit', async () => {
    const { store, stop } = await connectedStore();
    for (let id = 1; id <= 60; id += 1) deliver(store, 'event', event(id));

    expect(store.recentEvents).toHaveLength(40);
    // The list is rendered in full, so the tail must be dropped rather than the head.
    expect(store.recentEvents[0].id).toBe(60);
    expect(store.recentEvents[39].id).toBe(21);
    stop();
  });
});

describe('handler lifecycle', () => {
  it('mirrors each event exactly once after a reconnect', async () => {
    const { store, stop } = await connectedStore();

    // A reconnect builds a fresh client. The shell then re-registers its domain listeners, which is
    // why `reset` dropping them is correct rather than a leak: they belong to the session, not the
    // socket. What must not happen is the mirror listening twice.
    store.reset();
    await store.connect();
    let seen = 0;
    store.on('sos.created', () => {
      seen += 1;
    });

    // The wire sends one server message: the mirror listens on `event`, a domain subscriber on the
    // domain channel, and both must fire once for that single delivery.
    const domain = event(5);
    deliver(store, 'event', domain);
    for (const listener of listenersFor(store.client, 'sos.created')) listener(domain.payload);

    expect(seen).toBe(1);
    expect(store.recentEvents).toHaveLength(1);
    expect(store.cursor).toBe(5);
    stop();
  });

  it('starts a reconnect from a clean mirror', async () => {
    const { store, stop } = await connectedStore();
    deliver(store, 'event', event(5));
    const retired = store.client;

    store.reset();
    expect(store.lastEvent).toBe(null);
    expect(store.recentEvents).toEqual([]);
    expect(store.cursor).toBe(0);
    // A fresh client is the mechanism: the old one keeps its own handler map but is unreachable.
    expect(store.client).not.toBe(retired);
    expect(listenersFor(store.client, 'event')).toHaveLength(0);
    stop();
  });

  it('unsubscribes domain listeners when reset runs', () => {
    const { store, stop } = scopedStore();
    const received: unknown[] = [];
    store.on('talk.start', (payload) => received.push(payload));

    deliver(store, 'talk.start', { talkId: 1 });
    expect(received).toHaveLength(1);

    store.reset();
    // The new client has no handlers, so the same channel is silent until the domain re-subscribes.
    deliver(store, 'talk.start', { talkId: 2 });
    expect(received).toHaveLength(1);
    stop();
  });

  it('returns a working unsubscribe function from on()', () => {
    const { store, stop } = scopedStore();
    const received: unknown[] = [];
    const off = store.on('mission.progress', (payload) => received.push(payload));

    deliver(store, 'mission.progress', { step: 1 });
    off();
    deliver(store, 'mission.progress', { step: 2 });
    expect(received).toHaveLength(1);
    stop();
  });

  it('reports the transport result for sends and subscriptions', () => {
    const { store, stop } = scopedStore();
    // Nothing is connected, so these must answer false rather than throw; the callers branch on it.
    expect(store.send({ type: 'ping' })).toBe(false);
    expect(store.subscribe('room:1')).toBe(false);
    expect(store.sendBinary(new ArrayBuffer(8))).toBe(false);
    stop();
  });
});
