// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocketHub, type Peer, type PeerData, type UpgradeServer, type WsIdentity } from '../src/server/core/websocket.ts';
import { WS_CLOSE, WS_EVENTS, type RealtimeEvent } from '../src/shared/protocol.ts';

/**
 * The realtime suite drives the hub through a real server, which proves the happy path and nothing
 * about its guards. This suite drives the hub directly with a fake socket, because the interesting
 * behaviour is all in the refusals: a close code outside the legal range, a frame over the limit, an
 * unrelated JSON body, a handler that throws. Those are the paths where a bug becomes a leaked
 * connection or an unhandled rejection rather than a visible failure.
 *
 * Bun's native socket handles fragmentation, masking and ping/pong, so the hub owns only what is
 * asserted here.
 */

const IDENTITY: WsIdentity = { userId: 'usr_a', sessionId: 'ses_a', role: 'user', username: 'الف' } as WsIdentity;
const OTHER: WsIdentity = { userId: 'usr_b', sessionId: 'ses_b', role: 'responder', username: 'ب' } as WsIdentity;

/** A `Bun.serve` socket stand-in that records what the hub does to it. */
function fakeSocket(identity: WsIdentity | null) {
  const sent: string[] = [];
  const sentBinary: Uint8Array[] = [];
  const closes: Array<{ code?: number; reason?: string }> = [];
  let pings = 0;
  const data: PeerData = { peer: null, identity, ip: '203.0.113.9' };
  const socket = {
    data,
    send(body: string) {
      sent.push(body);
    },
    sendBinary(payload: Uint8Array) {
      sentBinary.push(payload);
    },
    close(code?: number, reason?: string) {
      closes.push({ code, reason });
    },
    ping() {
      pings++;
    }
  };
  return {
    socket: socket as never,
    data,
    sent,
    sentBinary,
    closes,
    pings: () => pings,
    messages: () => sent.map((body) => JSON.parse(body))
  };
}

interface Hooks {
  onConnect?: (peer: Peer) => void | Promise<void>;
  onDisconnect?: (peer: Peer) => void | Promise<void>;
  onText?: (peer: Peer, message: Record<string, unknown>) => void | Promise<void>;
  onBinary?: (peer: Peer, frame: Uint8Array) => void | Promise<void>;
  originAllowed?: () => boolean;
  authenticate?: () => WsIdentity | null;
  upgradeResult?: boolean;
  maxFrameBytes?: number;
}

/** A hub over fake socket plumbing, remembering the hooks it was given. */
function makeHub(hooks: Hooks = {}) {
  const seen = {
    connected: [] as Peer[],
    disconnected: [] as Peer[],
    text: [] as Record<string, unknown>[],
    binary: [] as Uint8Array[]
  };
  const upgrades: Array<{ request: Request; data: PeerData }> = [];
  const server: UpgradeServer = {
    upgrade(request, options) {
      upgrades.push({ request, data: options.data });
      return hooks.upgradeResult ?? true;
    }
  };
  const hub = new WebSocketHub({
    path: '/_ws',
    maxFrameBytes: hooks.maxFrameBytes ?? 1024,
    heartbeatMs: 60_000,
    clientIp: () => '203.0.113.9',
    authenticate: () => (hooks.authenticate ? hooks.authenticate() : IDENTITY),
    originAllowed: () => (hooks.originAllowed ? hooks.originAllowed() : true),
    onConnect: (peer) => {
      seen.connected.push(peer);
      return hooks.onConnect?.(peer);
    },
    onDisconnect: (peer) => {
      seen.disconnected.push(peer);
      return hooks.onDisconnect?.(peer);
    },
    onText: (peer, message) => {
      seen.text.push(message);
      return hooks.onText?.(peer, message);
    },
    onBinary: (peer, frame) => {
      seen.binary.push(frame);
      return hooks.onBinary?.(peer, frame);
    }
  });
  return { hub, seen, server, upgrades };
}

/** Opens a peer through the hub so its bookkeeping is real. */
function open(hub: WebSocketHub, identity: WsIdentity | null = IDENTITY) {
  const fake = fakeSocket(identity);
  hub.handleOpen(fake.socket);
  return fake;
}

let hubs: WebSocketHub[] = [];

/** A hub that `afterEach` closes, so its heartbeat timer cannot outlive the test. */
function hubWith(hooks: Hooks = {}) {
  const made = makeHub(hooks);
  hubs.push(made.hub);
  return made;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  for (const hub of hubs) hub.close();
  hubs = [];
});

describe('upgrading a request', () => {
  it('refuses a path other than the hub\'s own', () => {
    const { hub, server } = hubWith();
    const response = hub.upgrade(new Request('http://x/_other'), server);
    // Serving an upgrade on the wrong path would let the API's own routes be hijacked by a socket.
    expect(response?.status).toBe(404);
  });

  it('refuses a disallowed origin', () => {
    const { hub, server } = hubWith({ originAllowed: () => false });
    expect(hub.upgrade(new Request('http://x/_ws'), server)?.status).toBe(403);
  });

  it('refuses a request with no valid ticket', () => {
    const { hub, server } = hubWith({ authenticate: () => null });
    expect(hub.upgrade(new Request('http://x/_ws'), server)?.status).toBe(401);
  });

  it('reports a failed upgrade rather than pretending it opened', () => {
    const { hub, server } = hubWith({ upgradeResult: false });
    // Bun returning false means the socket was never taken over; answering 400 lets the client
    // fall back to the polling transport instead of waiting on a connection that will not open.
    expect(hub.upgrade(new Request('http://x/_ws'), server)?.status).toBe(400);
  });

  it('hands a valid request to Bun with the identity and address attached', () => {
    const { hub, server, upgrades } = hubWith();
    expect(hub.upgrade(new Request('http://x/_ws?ticket=t'), server)).toBe(undefined);
    expect(upgrades).toHaveLength(1);
    expect(upgrades[0].data.identity?.userId).toBe('usr_a');
    expect(upgrades[0].data.ip).toBe('203.0.113.9');
    // The peer is created in `handleOpen`, not here, so this must still be null.
    expect(upgrades[0].data.peer).toBe(null);
  });

  it('closes a socket that arrives without an identity', () => {
    const { hub } = hubWith();
    const fake = fakeSocket(null);
    hub.handleOpen(fake.socket);
    expect(fake.closes).toEqual([{ code: WS_CLOSE.AUTH_FAILED, reason: 'unauthenticated' }]);
  });
});

describe('peer bookkeeping', () => {
  it('puts a new peer in its user, session and role rooms', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    const peer = seen.connected[0];
    expect([...peer.rooms].sort()).toEqual(['role:user', 'session:ses_a', 'user:usr_a']);
    // The identity's own rooms are what make a targeted send reach this peer.
    expect(fake.data.peer).toBe(peer);
  });

  it('indexes rooms case-insensitively', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    const peer = seen.connected[0];
    // A caller that builds `User:usr_a` must reach the same audience as `user:usr_a`, or an event
    // silently misses its target.
    expect(hub.join(peer, 'Mission:ABC')).toBe(true);
    const received: string[] = [];
    hub.sendToRoom('mission:abc', { type: 'ping' });
    expect(fake.messages()).toEqual([{ type: 'ping' }]);
    expect(received).toHaveLength(0);
  });

  it('unregisters a peer exactly once', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    const peer = seen.connected[0];
    hub.unregister(peer);
    hub.unregister(peer);
    // A double close must not fire the disconnect handler twice — it is where presence is removed
    // and a session's last-seen written.
    expect(seen.disconnected).toHaveLength(1);
    expect(hub.stats().connections).toBe(0);
    expect(fake.closes).toHaveLength(0);
  });

  it('closes a peer and unregisters it through the socket', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    seen.connected[0].close();
    expect(fake.closes).toEqual([{ code: WS_CLOSE.NORMAL, reason: '' }]);
    expect(hub.stats().connections).toBe(0);
    expect(seen.disconnected).toHaveLength(1);
  });

  it('substitutes a legal close code for an illegal one', () => {
    const { hub, seen } = hubWith();
    // Codes outside 1000-4999 are a protocol violation and browsers reject them; the hub must not
    // pass one through. A peer closes once, so each illegal code needs its own peer.
    const illegals = [999, 5000, 1000.5];
    const sockets = illegals.map(() => open(hub));
    sockets.forEach((socket, index) => seen.connected[index].close(illegals[index]));
    expect(sockets.map((socket) => socket.closes[0].code)).toEqual([WS_CLOSE.INTERNAL, WS_CLOSE.INTERNAL, WS_CLOSE.INTERNAL]);
  });

  it('truncates a long close reason', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    seen.connected[0].close(WS_CLOSE.NORMAL, 'x'.repeat(500));
    // The close frame's reason is limited to 123 bytes; sending more makes the frame itself invalid.
    expect(fake.closes[0].reason!.length).toBe(100);
  });

  it('keeps the first close and ignores the rest', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    const peer = seen.connected[0];
    peer.close(WS_CLOSE.NORMAL, 'first');
    peer.close(WS_CLOSE.POLICY, 'second');
    expect(fake.closes).toEqual([{ code: WS_CLOSE.NORMAL, reason: 'first' }]);
    expect(seen.disconnected).toHaveLength(1);
  });
});

describe('outbound frames', () => {
  it('refuses to send after the peer closed', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    seen.connected[0].close();
    const before = fake.sent.length;
    seen.connected[0].sendJson({ type: 'late' });
    seen.connected[0].sendBinary(new Uint8Array([1]));
    // Writing to a closed socket throws in Bun; sending nothing is the correct behaviour.
    expect(fake.sent).toHaveLength(before);
    expect(fake.sentBinary).toHaveLength(0);
  });

  it('closes a peer that is sent a frame over the limit', () => {
    const { hub, seen } = hubWith({ maxFrameBytes: 32 });
    const fake = open(hub);
    seen.connected[0].sendJson({ type: 'x', pad: 'y'.repeat(100) });
    expect(fake.closes).toEqual([{ code: WS_CLOSE.TOO_BIG, reason: 'message too large' }]);
    expect(fake.sent).toHaveLength(0);
  });

  it('counts a frame at exactly the limit as sendable', () => {
    const payload = { type: 'x' };
    const size = Buffer.byteLength(JSON.stringify(payload), 'utf8');
    const { hub, seen } = hubWith({ maxFrameBytes: size });
    const fake = open(hub);
    seen.connected[0].sendJson(payload);
    // The boundary is inclusive; refusing it would make the limit off by one for every caller.
    expect(fake.sent).toHaveLength(1);
    expect(hub.stats().framesOut).toBe(1);
  });

  it('drops a payload that cannot be serialised', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    const circular: Record<string, unknown> = { type: 'x' };
    circular.self = circular;
    // `JSON.stringify` throws on a cycle. Sending must not take the caller down with it.
    expect(() => seen.connected[0].sendJson(circular)).not.toThrow();
    expect(fake.sent).toHaveLength(0);
  });

  it('closes a peer whose socket fails while sending', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    (fake.socket as unknown as { send: () => void }).send = () => {
      throw new Error('socket gone');
    };
    seen.connected[0].sendJson({ type: 'x' });
    expect(fake.closes).toEqual([{ code: WS_CLOSE.INTERNAL, reason: 'send failed' }]);
  });

  it('closes a peer whose socket fails while sending binary', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    (fake.socket as unknown as { sendBinary: () => void }).sendBinary = () => {
      throw new Error('socket gone');
    };
    seen.connected[0].sendBinary(new Uint8Array([1, 2]));
    expect(fake.closes).toEqual([{ code: WS_CLOSE.INTERNAL, reason: 'send failed' }]);
  });

  it('closes a peer that tries to send an oversized binary frame', () => {
    const { hub, seen } = hubWith({ maxFrameBytes: 8 });
    const fake = open(hub);
    seen.connected[0].sendBinary(new Uint8Array(9));
    expect(fake.closes).toEqual([{ code: WS_CLOSE.TOO_BIG, reason: 'message too large' }]);
    expect(fake.sentBinary).toHaveLength(0);
  });

  it('records outbound counters for the health endpoint', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    seen.connected[0].sendJson({ type: 'x' });
    seen.connected[0].sendBinary(new Uint8Array([1, 2, 3]));
    const stats = hub.stats();
    expect(stats.framesOut).toBe(2);
    expect(stats.bytesOut).toBe(Buffer.byteLength(fake.sent[0], 'utf8') + 3);
  });

  it('survives a socket that throws on close', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    (fake.socket as unknown as { close: () => void }).close = () => {
      throw new Error('already gone');
    };
    // Room cleanup must still run even when the transport is already dead.
    expect(() => seen.connected[0].close()).not.toThrow();
    expect(hub.stats().connections).toBe(0);
    expect(seen.disconnected).toHaveLength(1);
  });
});

describe('inbound frames', () => {
  it('ignores a frame from a socket that never opened a peer', () => {
    const { hub } = hubWith();
    const fake = fakeSocket(IDENTITY);
    expect(() => hub.handleMessage(fake.socket, '{"type":"x"}')).not.toThrow();
  });

  it('routes a text frame to the text handler', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    hub.handleMessage(fake.socket, '{"type":"ping"}');
    expect(seen.text).toEqual([{ type: 'ping' }]);
  });

  it('answers malformed JSON with an error instead of dropping it', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    hub.handleMessage(fake.socket, '{nope');
    expect(seen.text).toHaveLength(0);
    expect(fake.messages()[0]).toMatchObject({ type: WS_EVENTS.ERROR, code: 'INVALID_INPUT' });
  });

  it('refuses a JSON body that is not an object with a type', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    // Arrays, primitives and objects without a `type` all reach the same branch; the client is told
    // rather than silently ignored, because a dropped frame looks like a stalled app.
    for (const body of ['[]', '"text"', '42', 'null', '{"no":"type"}']) hub.handleMessage(fake.socket, body);
    expect(seen.text).toHaveLength(0);
    const error = fake.messages()[0];
    expect(error).toMatchObject({ type: WS_EVENTS.ERROR, code: 'INVALID_INPUT' });
    expect(String(error.message)).toContain('Message.type');
  });

  it('routes a binary frame to the audio handler, never the text one', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    hub.handleMessage(fake.socket, Buffer.from([0, 1, 2, 3]));
    expect(seen.binary).toHaveLength(1);
    expect(seen.text).toHaveLength(0);
    // A voice frame parsed as JSON would throw on every packet during a call.
    expect([...seen.binary[0]]).toEqual([0, 1, 2, 3]);
  });

  it('counts inbound bytes for diagnostics', () => {
    const { hub } = hubWith();
    const fake = open(hub);
    hub.handleMessage(fake.socket, '{"type":"ping"}');
    hub.handleBinary(fake.socket, new Uint8Array(5));
    const stats = hub.stats();
    expect(stats.framesIn).toBe(2);
    expect(stats.bytesIn).toBe(Buffer.byteLength('{"type":"ping"}') + 5);
  });

  it('marks a peer alive when anything arrives', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    const peer = seen.connected[0];
    peer.alive = false;
    hub.handleMessage(fake.socket, '{"type":"ping"}');
    // Any frame is proof of life; the heartbeat would otherwise close a peer that is clearly
    // still sending.
    expect(peer.alive).toBe(true);
  });

  it('marks a peer alive on a pong', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    const peer = seen.connected[0];
    peer.alive = false;
    hub.markAlive(fake.socket);
    expect(peer.alive).toBe(true);
  });

  it('does not ping a peer that already closed', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    seen.connected[0].close();
    const before = fake.pings();
    // The heartbeat walks the peer set; pinging a dead socket throws inside Bun, so closed peers
    // are skipped before it gets there.
    seen.connected[0].ping();
    expect(fake.pings()).toBe(before);
  });

  it('ignores a binary frame from a socket with no peer', () => {
    const { hub } = hubWith();
    const fake = fakeSocket(IDENTITY);
    expect(() => hub.handleBinary(fake.socket, new Uint8Array([1]))).not.toThrow();
  });

  it('marks a peer alive on a binary frame', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    const peer = seen.connected[0];
    peer.alive = false;
    hub.handleBinary(fake.socket, new Uint8Array([1]));
    expect(peer.alive).toBe(true);
  });

  it('ignores a pong from an unknown socket', () => {
    const { hub } = hubWith();
    expect(() => hub.markAlive(fakeSocket(IDENTITY).socket)).not.toThrow();
  });
});

describe('handler failures', () => {
  it('reports a throwing text handler to the peer and keeps the connection', async () => {
    const { hub } = hubWith({
      onText: () => {
        throw new Error('boom');
      }
    });
    const fake = open(hub);
    hub.handleMessage(fake.socket, '{"type":"x"}');
    // One bad handler must not kill the socket: the client keeps its rooms, its cursor and its call.
    expect(fake.messages()[0]).toMatchObject({ type: WS_EVENTS.ERROR, code: 'INTERNAL' });
    expect(fake.closes).toHaveLength(0);
    expect(hub.stats().connections).toBe(1);
  });

  it('reports a rejecting async handler the same way', async () => {
    const { hub } = hubWith({ onBinary: async () => { throw new Error('async boom'); } });
    const fake = open(hub);
    hub.handleBinary(fake.socket, new Uint8Array([1]));
    // Give the rejection a turn to be caught.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.messages()[0]).toMatchObject({ type: WS_EVENTS.ERROR, code: 'INTERNAL' });
    expect(fake.closes).toHaveLength(0);
  });

  it('closes the peer when the connect handler throws', () => {
    const { hub } = hubWith({
      onConnect: () => {
        throw new Error('no');
      }
    });
    const fake = open(hub);
    // A peer whose hello never built is useless and would leak a room membership.
    expect(fake.closes).toEqual([{ code: WS_CLOSE.INTERNAL, reason: 'connect failed' }]);
    expect(hub.stats().connections).toBe(0);
  });

  it('closes the peer when the connect handler rejects', async () => {
    const { hub } = hubWith({ onConnect: async () => { throw new Error('no'); } });
    const fake = open(hub);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fake.closes).toEqual([{ code: WS_CLOSE.INTERNAL, reason: 'connect failed' }]);
  });

  it('survives a throwing disconnect handler', () => {
    const { hub, seen } = hubWith({
      onDisconnect: () => {
        throw new Error('no');
      }
    });
    const fake = open(hub);
    expect(() => seen.connected[0].close()).not.toThrow();
    expect(hub.stats().connections).toBe(0);
  });

  it('survives a rejecting async disconnect handler', async () => {
    const { hub, seen } = hubWith({ onDisconnect: async () => { throw new Error('no'); } });
    const fake = open(hub);
    seen.connected[0].close();
    await new Promise((resolve) => setTimeout(resolve, 0));
    // The peer is gone either way; an unhandled rejection here would crash the process.
    expect(hub.stats().connections).toBe(0);
  });
});

describe('rooms', () => {
  it('refuses a malformed room name', () => {
    const { hub, seen } = hubWith();
    open(hub);
    const peer = seen.connected[0];
    // Room names reach a Map key and an audience lookup, so they are restricted rather than
    // sanitised.
    for (const room of ['', 'has space', 'semi;colon', 'x'.repeat(81), 'дом']) {
      expect(hub.join(peer, room), room).toBe(false);
    }
  });

  it('refuses a thirty-third room', () => {
    const { hub, seen } = hubWith();
    open(hub);
    const peer = seen.connected[0];
    // The peer already holds three rooms; the cap is what stops a client subscribing to everything.
    for (let index = 0; index < 29; index++) expect(hub.join(peer, `mission:${index}`)).toBe(true);
    expect(peer.rooms.size).toBe(32);
    expect(hub.join(peer, 'mission:overflow')).toBe(false);
  });

  it('treats joining a room it is already in as success', () => {
    const { hub, seen } = hubWith();
    open(hub);
    const peer = seen.connected[0];
    // Re-joining is a no-op, not a failure — a client re-subscribing after a reconnect should not
    // see an error.
    expect(hub.join(peer, 'user:usr_a')).toBe(true);
    expect(hub.join(peer, 'user:usr_a')).toBe(true);
    expect(hub.stats().rooms).toBe(3);
  });

  it('leaves a room and stops receiving its events', () => {
    const { hub, seen } = hubWith();
    const fake = open(hub);
    const peer = seen.connected[0];
    hub.join(peer, 'mission:abc');
    hub.sendToRoom('mission:abc', { type: 'one' });
    hub.leave(peer, 'mission:abc');
    hub.sendToRoom('mission:abc', { type: 'two' });
    expect(fake.messages()).toEqual([{ type: 'one' }]);
  });

  it('leaves a room nobody is in without error', () => {
    const { hub, seen } = hubWith();
    open(hub);
    expect(() => hub.leave(seen.connected[0], 'mission:absent')).not.toThrow();
  });
});

describe('addressing', () => {
  it('delivers a durable event to each audience room once', () => {
    const { hub, seen } = hubWith();
    const a = open(hub);
    const b = open(hub, OTHER);
    const event = { type: 'sos.created', eventId: 'e1', audience: ['user:usr_a', 'role:user'], payload: {} } as unknown as RealtimeEvent;
    hub.publish(event);
    // `usr_a` is in both rooms; it must still receive exactly one copy.
    expect(a.messages()).toHaveLength(1);
    expect(a.messages()[0]).toMatchObject({ type: WS_EVENTS.EVENT, event: { eventId: 'e1' } });
    expect(b.messages()).toHaveLength(0);
    expect(seen.connected).toHaveLength(2);
  });

  it('delivers to every connected peer for the `all` audience', () => {
    const { hub } = hubWith();
    const a = open(hub);
    const b = open(hub, OTHER);
    hub.publish({ type: 'broadcast', eventId: 'e2', audience: ['all'], payload: {} } as unknown as RealtimeEvent);
    expect(a.messages()).toHaveLength(1);
    expect(b.messages()).toHaveLength(1);
  });

  it('ignores an audience room with no members', () => {
    const { hub } = hubWith();
    const a = open(hub);
    hub.publish({ type: 'x', eventId: 'e3', audience: ['user:nobody'], payload: {} } as unknown as RealtimeEvent);
    expect(a.messages()).toHaveLength(0);
  });

  it('sends to users while excluding the originator', () => {
    const { hub, seen } = hubWith();
    const a = open(hub);
    const b = open(hub, OTHER);
    hub.sendToUsers(['usr_a', 'usr_b'], { type: 'peers' }, seen.connected[0]);
    // The sender does not need to be told what it just did.
    expect(a.messages()).toHaveLength(0);
    expect(b.messages()).toHaveLength(1);
  });

  it('sends binary audio to the other party only', () => {
    const { hub, seen } = hubWith();
    const a = open(hub);
    const b = open(hub, OTHER);
    hub.sendBinaryToUsers(['usr_a', 'usr_b'], new Uint8Array([7]), seen.connected[0]);
    // Echoing the speaker's own frames back would feed their voice into their own ear.
    expect(a.sentBinary).toHaveLength(0);
    expect([...b.sentBinary[0]]).toEqual([7]);
  });

  it('closes every connection of a revoked user, leaving others alone', () => {
    const { hub } = hubWith();
    const a = open(hub);
    const b = open(hub, OTHER);
    hub.disconnectUser('USR_A');
    // Case-insensitive: the identity's id reaches here through several layers that may differ.
    expect(a.closes).toEqual([{ code: WS_CLOSE.POLICY, reason: 'session revoked' }]);
    expect(b.closes).toHaveLength(0);
    expect(hub.stats().connections).toBe(1);
  });

  it('closes every connection of a revoked session, leaving the user\'s other session alone', () => {
    const { hub } = hubWith();
    const first = open(hub);
    const second = open(hub, { ...IDENTITY, sessionId: 'ses_other' } as WsIdentity);
    hub.disconnectSession('ses_a');
    // Revoking one device must not sign the user out everywhere.
    expect(first.closes).toHaveLength(1);
    expect(second.closes).toHaveLength(0);
  });

  it('tolerates a user or session that is not connected', () => {
    const { hub } = hubWith();
    expect(() => hub.disconnectUser('usr_nobody')).not.toThrow();
    expect(() => hub.disconnectSession('ses_nobody')).not.toThrow();
  });
});

describe('heartbeat and shutdown', () => {
  it('pings a live peer and closes a silent one', () => {
    vi.useFakeTimers();
    try {
      const { hub, seen } = hubWith();
      const fake = open(hub);
      const peer = seen.connected[0];
      // First tick: the peer has not answered anything yet, so it is pinged and marked suspect.
      vi.advanceTimersByTime(60_000);
      expect(fake.pings()).toBe(1);
      expect(peer.alive).toBe(false);
      // No pong and no frame before the next tick means the socket is gone.
      vi.advanceTimersByTime(60_000);
      expect(fake.closes).toEqual([{ code: WS_CLOSE.POLICY, reason: 'heartbeat timeout' }]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a peer that answers the ping', () => {
    vi.useFakeTimers();
    try {
      const { hub, seen } = hubWith();
      const fake = open(hub);
      const peer = seen.connected[0];
      vi.advanceTimersByTime(60_000);
      hub.markAlive(fake.socket);
      vi.advanceTimersByTime(60_000);
      // A peer that pongs every round lives forever.
      expect(fake.closes).toHaveLength(0);
      expect(peer.alive).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('survives a socket that throws while being pinged', () => {
    vi.useFakeTimers();
    try {
      const { hub, seen } = hubWith();
      const fake = open(hub);
      (fake.socket as unknown as { ping: () => void }).ping = () => {
        throw new Error('gone');
      };
      const peer = seen.connected[0];
      expect(() => vi.advanceTimersByTime(60_000)).not.toThrow();
      // A failed ping marks the peer closed so the next tick reaps it.
      expect(peer.alive).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes every peer and empties the indexes on shutdown', () => {
    const { hub } = hubWith();
    const a = open(hub);
    const b = open(hub, OTHER);
    hub.close();
    expect(a.closes).toEqual([{ code: WS_CLOSE.GOING_AWAY, reason: 'server shutting down' }]);
    expect(b.closes).toHaveLength(1);
    expect(hub.stats()).toMatchObject({ connections: 0, users: 0, sessions: 0, rooms: 0 });
  });

  it('stops the heartbeat on shutdown', () => {
    vi.useFakeTimers();
    try {
      const { hub } = hubWith();
      const fake = open(hub);
      hub.close();
      vi.advanceTimersByTime(120_000);
      // A live interval after `close()` would keep the process awake and ping dead sockets.
      expect(fake.pings()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('is safe to close twice', () => {
    const { hub } = hubWith();
    open(hub);
    hub.close();
    expect(() => hub.close()).not.toThrow();
  });
});
