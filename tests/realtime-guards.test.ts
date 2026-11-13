// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  apiFetch, audioFrame, closeSocket, createTestServer, issueTicket, login, openSocketWithHello,
  sendJson, waitForMessage, websocketUrl, type TestServer
} from './helpers.ts';
import { WS_EVENTS } from '../src/shared/protocol.ts';

/**
 * The realtime layer's refusal paths. The happy path — open a socket, say hello, exchange audio —
 * is covered by the main realtime suite; what was not covered is everything the server does to a
 * peer that misbehaves: malformed tickets, expired handshakes, room names that fail validation,
 * rate-limit buckets that actually run dry, floors that cannot be taken, and rooms the caller has
 * no relation to.
 *
 * Ordering matters here: the seeded live share between `saeed.k` and `maryam.a` backs every talk
 * test, and the suite sweeps expired shares at the very end — do not reorder the final describe
 * above the talk tests.
 */

let server: TestServer;
let ownerCookie: string;
let companionCookie: string;
let responderCookie: string;
let adminCookie: string;
/** Second saeed.k session for tests that would otherwise exhaust the shared session's buckets. */
let ownerAltSocket: WebSocket;
let ownerSocket: WebSocket;
let companionSocket: WebSocket;
let responderSocket: WebSocket;
let adminSocket: WebSocket;

beforeAll(async () => {
  server = await createTestServer();
  ownerCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
  const ownerAltCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  const owner = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, ownerCookie)).ticket));
  const ownerAlt = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, ownerAltCookie)).ticket));
  const companion = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, companionCookie)).ticket));
  const responder = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, responderCookie)).ticket));
  const admin = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, adminCookie)).ticket));
  ownerSocket = owner.socket;
  ownerAltSocket = ownerAlt.socket;
  companionSocket = companion.socket;
  responderSocket = responder.socket;
  adminSocket = admin.socket;
}, 30_000);

afterAll(async () => {
  for (const socket of [ownerSocket, ownerAltSocket, companionSocket, responderSocket, adminSocket]) {
    if (socket) await closeSocket(socket);
  }
  if (server) await server.close();
});

describe('ticket redemption', () => {
  it('rejects malformed and unknown tickets before touching the store', () => {
    const realtime = server.app.context.services.realtime;
    const request = new Request('http://127.0.0.1/ws');
    // These never reach the ticket map at all.
    expect(realtime.consumeTicket(null, request)).toBe(null);
    expect(realtime.consumeTicket('short', request)).toBe(null);
    expect(realtime.consumeTicket('has spaces in it and is long enough to look valid', request)).toBe(null);
    // Well-formed but never issued.
    expect(realtime.consumeTicket('A'.repeat(24), request)).toBe(null);
    expect(realtime.consumeTicket('a'.repeat(128), request)).toBe(null);
  });

  it('rejects a ticket redeemed from a different address than the one that issued it', async () => {
    const proxy = await createTestServer({ trustProxy: true });
    try {
      const loginRequest = await apiFetch(proxy, '/_auth/login', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.0.0.1' },
        body: { username: 'admin', password: 'AdminPass!2026', deviceId: 'test-device', deviceName: 'Bun test' }
      });
      const cookie = String(loginRequest.headers.get('set-cookie')).split(';')[0];
      const issued = await apiFetch(proxy, '/_user/realtime/ticket', {
        method: 'POST',
        cookie,
        headers: { 'x-forwarded-for': '10.0.0.1' }
      });
      expect(issued.status, issued.text).toBe(200);
      const realtime = proxy.app.context.services.realtime;
      // Same ticket, different address: refused (the ticket is also burned by design, single-use).
      const mismatch = new Request('http://127.0.0.1/ws', { headers: { 'x-forwarded-for': '10.0.0.2' } });
      expect(realtime.consumeTicket(issued.json.data.ticket, mismatch)).toBe(null);
    } finally {
      await proxy.close();
    }
  });

  it('rejects an expired ticket', async () => {
    const proxy = await createTestServer({ trustProxy: true, ticketTtlSeconds: 5 });
    try {
      const loginRequest = await apiFetch(proxy, '/_auth/login', {
        method: 'POST',
        headers: { 'x-forwarded-for': '10.0.0.9' },
        body: { username: 'admin', password: 'AdminPass!2026', deviceId: 'test-device', deviceName: 'Bun test' }
      });
      const cookie = String(loginRequest.headers.get('set-cookie')).split(';')[0];
      const issued = await apiFetch(proxy, '/_user/realtime/ticket', {
        method: 'POST',
        cookie,
        headers: { 'x-forwarded-for': '10.0.0.9' }
      });
      const realtime = proxy.app.context.services.realtime;
      const matching = new Request('http://127.0.0.1/ws', { headers: { 'x-forwarded-for': '10.0.0.9' } });
      // Same address, but the wall clock has moved beyond the ticket lifetime.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 6_000);
      try {
        expect(realtime.consumeTicket(issued.json.data.ticket, matching)).toBe(null);
      } finally {
        vi.useRealTimers();
      }
    } finally {
      await proxy.close();
    }
  });
});

describe('message validation', () => {
  it('answers an unknown message type with INVALID_INPUT', async () => {
    const error = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.requestId === 'mystery-1');
    sendJson(ownerSocket, { type: 'mystery.type', requestId: 'mystery-1' });
    const message = await error;
    expect(message.code).toBe('INVALID_INPUT');
    expect(message.message).toMatch(/unknown realtime message type/i);
  });

  it('rejects a room name that fails the schema, even for an administrator', async () => {
    // The schema is the first gate: only [a-z0-9:_-] names ever reach the hub.
    const error = waitForMessage(adminSocket, (message) => message.type === WS_EVENTS.ERROR && message.requestId === 'admin-join-bad');
    sendJson(adminSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'admin-join-bad', room: 'mission:bad.name' });
    const message = await error;
    expect(message.code).toBe('INVALID_INPUT');
    expect(String(message.details?.field)).toContain('room');
  });
});

describe('presence and KPIs', () => {
  it('counts a connected responder in the administrator overview', async () => {
    const response = await apiFetch(server, '/_admin/overview', { cookie: adminCookie });
    expect(response.status).toBe(200);
    // The responder socket opened in beforeAll, so at least one responder is online right now.
    expect(response.json.data.kpis.onlineResponders).toBeGreaterThanOrEqual(1);
  });
});

describe('live location validation', () => {
  it('rejects coordinates outside the valid range at the socket boundary', async () => {
    const error = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.requestId === 'loc-bad-1');
    sendJson(ownerSocket, {
      type: WS_EVENTS.LOCATION_UPDATE, requestId: 'loc-bad-1',
      latitude: 123.0, longitude: 51.33, accuracy: 10, recordedAt: Date.now()
    });
    const message = await error;
    expect(message.code).toBe('INVALID_INPUT');
    expect(String(message.details?.field)).toContain('latitude');
  });

  it('rejects an accuracy outside the valid range at the socket boundary', async () => {
    const error = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.requestId === 'loc-bad-2');
    sendJson(ownerSocket, {
      type: WS_EVENTS.LOCATION_UPDATE, requestId: 'loc-bad-2',
      latitude: 35.72, longitude: 51.33, accuracy: 100001, recordedAt: Date.now()
    });
    const message = await error;
    expect(message.code).toBe('INVALID_INPUT');
    expect(String(message.details?.field)).toContain('accuracy');
  });

  it('enforces the internal coordinate and accuracy guards below the schema', () => {
    // The shared schema already constrains both fields, so these guards are defense in depth for
    // any future caller that reaches publishLive directly. They must still refuse.
    const location = server.app.context.services.location;
    const identity = {
      userId: 'usr_requester', sessionId: 'sess_guard', username: 'saeed.k',
      role: 'user' as const, deviceId: 'guard', ip: '127.0.0.1'
    };
    const peer = { id: 'peer_guard', sendJson: () => undefined } as never;
    expect(() => location.publishLive(identity, { latitude: 123, longitude: 51.33, accuracy: 10, recordedAt: Date.now() }, peer, undefined))
      .toThrow('Coordinates are outside the valid range.');
    expect(() => location.publishLive(identity, { latitude: 35.72, longitude: 51.33, accuracy: 100001, recordedAt: Date.now() }, peer, undefined))
      .toThrow('Accuracy is outside the valid range.');
  });

  it('serves a second publish from the recipient cache without another query', async () => {
    // Two quick publishes: the first fills the recipient cache, the second is served from it.
    for (const requestId of ['loc-cache-1', 'loc-cache-2']) {
      const ack = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.requestId === requestId);
      sendJson(ownerSocket, {
        type: WS_EVENTS.LOCATION_UPDATE, requestId,
        latitude: 35.7221, longitude: 51.3352, accuracy: 10, recordedAt: Date.now()
      });
      const message = await ack;
      expect(message.accepted).toBe(true);
      expect(message.recipients).toBeGreaterThanOrEqual(1);
    }
  });

  it('stops a peer that publishes faster than the bucket refills', async () => {
    // The alternate session has a pristine location bucket (the limiter keys per session).
    const error = waitForMessage(ownerAltSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'RATE_LIMITED');
    for (let index = 0; index < 61; index += 1) {
      sendJson(ownerAltSocket, {
        type: WS_EVENTS.LOCATION_UPDATE, requestId: `flood-${index}`,
        latitude: 35.72 + index * 0.00001, longitude: 51.33, accuracy: 10, recordedAt: Date.now()
      });
    }
    const message = await error;
    expect(message.message).toMatch(/rate/i);
  }, 15_000);
});

describe('push-to-talk floor control', () => {
  it('refuses to start a talk with an unrelated peer', async () => {
    const error = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.requestId === 'talk-ghost-1');
    sendJson(ownerSocket, { type: WS_EVENTS.TALK_START, requestId: 'talk-ghost-1', peerUserId: 'usr_admin' });
    const message = await error;
    expect(message.code).toBe('FORBIDDEN');
  });

  it('refuses a second floor while one is already active, then stops cleanly', async () => {
    const started = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_START && message.requestId === 'talk-floor-1');
    sendJson(ownerSocket, { type: WS_EVENTS.TALK_START, requestId: 'talk-floor-1', peerUserId: 'usr_companion' });
    const startAck = await started;
    const talkId = Number(startAck.talkId);
    expect(talkId).toBeGreaterThan(0);

    const conflict = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.requestId === 'talk-floor-2');
    sendJson(ownerSocket, { type: WS_EVENTS.TALK_START, requestId: 'talk-floor-2', peerUserId: 'usr_companion' });
    expect((await conflict).code).toBe('CONFLICT');

    const stopped = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_STOP && message.requestId === 'talk-floor-stop');
    sendJson(ownerSocket, { type: WS_EVENTS.TALK_STOP, requestId: 'talk-floor-stop', talkId });
    expect(Number((await stopped).talkId)).toBe(talkId);
  });

  it('refuses to stop a floor that does not exist', async () => {
    const error = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.ERROR && message.requestId === 'talk-stop-ghost');
    sendJson(companionSocket, { type: WS_EVENTS.TALK_STOP, requestId: 'talk-stop-ghost', talkId: 424242 });
    const message = await error;
    expect(message.code).toBe('CONFLICT');
  });

  it('stops a speaker that starts too many talks', async () => {
    // Fresh session so the 5-attempt bucket is pristine.
    const floodCookie = await login(server, 'maryam.a', 'DemoPass!2026');
    const connection = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, floodCookie)).ticket));
    try {
      const error = waitForMessage(connection.socket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'RATE_LIMITED');
      for (let index = 0; index < 6; index += 1) {
        // Unrelated target: every attempt fails authorization, but each still spends a token —
        // and the sixth must trip the limiter rather than the authorizer.
        sendJson(connection.socket, { type: WS_EVENTS.TALK_START, requestId: `talk-flood-${index}`, peerUserId: 'usr_admin' });
      }
      const message = await error;
      expect(message.message).toMatch(/talk/i);
    } finally {
      await closeSocket(connection.socket);
    }
  }, 15_000);

  it('rejects an audio frame for a talk that does not exist', async () => {
    const error = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'FORBIDDEN');
    ownerSocket.send(audioFrame(987654, 1, 320));
    const message = await error;
    expect(message.message).toMatch(/audio frame rejected/i);
  });

  it('stops a peer that sends audio faster than the bucket refills', async () => {
    const started = waitForMessage(ownerAltSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_START && message.requestId === 'talk-audio-1');
    sendJson(ownerAltSocket, { type: WS_EVENTS.TALK_START, requestId: 'talk-audio-1', peerUserId: 'usr_companion' });
    const startAck = await started;
    const talkId = Number(startAck.talkId);

    const error = waitForMessage(ownerAltSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'RATE_LIMITED');
    for (let sequence = 1; sequence <= 101; sequence += 1) {
      ownerAltSocket.send(audioFrame(talkId, sequence, 320));
    }
    await error;

    const stopped = waitForMessage(ownerAltSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_STOP && message.requestId === 'talk-audio-stop');
    sendJson(ownerAltSocket, { type: WS_EVENTS.TALK_STOP, requestId: 'talk-audio-stop', talkId });
    await stopped;
  }, 15_000);

  it('releases an expired floor when the sweeper runs with a future clock', async () => {
    const started = waitForMessage(ownerAltSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_START && message.requestId === 'talk-sweep-1');
    sendJson(ownerAltSocket, { type: WS_EVENTS.TALK_START, requestId: 'talk-sweep-1', peerUserId: 'usr_companion' });
    const startAck = await started;
    const talkId = Number(startAck.talkId);

    const released = waitForMessage(ownerAltSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === false && message.talkId === talkId);
    const releasedCount = server.app.context.services.realtime.sweep(Date.now() + 10_000_000);
    expect(releasedCount).toBeGreaterThanOrEqual(1);
    expect((await released).talkId).toBe(talkId);
  });
});

describe('room authorization', () => {
  let sosId: string;
  let missionId: string;

  it('creates, dispatches and accepts a request (fixture for the room checks)', async () => {
    const created = await apiFetch(server, '/_user/sos', {
      method: 'POST', cookie: ownerCookie,
      body: {
        incidentTypeId: 'inc_medical', severity: 'high',
        description: 'Room authorization fixture incident.',
        latitude: 35.7219, longitude: 51.3347, accuracy: 10, isManual: false
      }
    });
    expect(created.status, created.text).toBe(201);
    sosId = created.json.data.sos.id;
    const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
    });
    expect(dispatched.status, dispatched.text).toBe(200);
    const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: responderCookie });
    expect(accepted.status, accepted.text).toBe(200);
    missionId = accepted.json.data.missionId;
    expect(missionId).toBeTruthy();
  });

  it('lets the requester and the assigned responder join the sos room, but not a bystander', async () => {
    const ownerAck = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE && message.requestId === 'sos-sub-owner');
    sendJson(ownerSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'sos-sub-owner', room: `sos:${sosId}` });
    expect((await ownerAck).accepted).toBe(true);

    const responderAck = waitForMessage(responderSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE && message.requestId === 'sos-sub-responder');
    sendJson(responderSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'sos-sub-responder', room: `sos:${sosId}` });
    expect((await responderAck).accepted).toBe(true);

    const denied = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'FORBIDDEN' && message.requestId === 'sos-sub-bystander');
    sendJson(companionSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'sos-sub-bystander', room: `sos:${sosId}` });
    await denied;
  });

  it('lets the mission parties join the mission room, but not a bystander', async () => {
    const responderAck = waitForMessage(responderSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE && message.requestId === 'mis-sub-responder');
    sendJson(responderSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'mis-sub-responder', room: `mission:${missionId}` });
    expect((await responderAck).accepted).toBe(true);

    const ownerAck = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE && message.requestId === 'mis-sub-owner');
    sendJson(ownerSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'mis-sub-owner', room: `mission:${missionId}` });
    expect((await ownerAck).accepted).toBe(true);

    const denied = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'FORBIDDEN' && message.requestId === 'mis-sub-bystander');
    sendJson(companionSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'mis-sub-bystander', room: `mission:${missionId}` });
    await denied;
  });

  it('lets an administrator join any alarm or mission room by role', async () => {
    const ack = waitForMessage(adminSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE && message.requestId === 'admin-sub-anywhere');
    sendJson(adminSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'admin-sub-anywhere', room: 'mission:unrelated-mission-id' });
    expect((await ack).accepted).toBe(true);
  });

  it('lets the talk parties join the talk room, but not an outsider', async () => {
    const started = waitForMessage(ownerAltSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_START && message.requestId === 'talk-room-1');
    sendJson(ownerAltSocket, { type: WS_EVENTS.TALK_START, requestId: 'talk-room-1', peerUserId: 'usr_companion' });
    const startAck = await started;
    const talkId = Number(startAck.talkId);

    const ownerAck = waitForMessage(ownerAltSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE && message.requestId === 'talk-sub-owner');
    sendJson(ownerAltSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'talk-sub-owner', room: `talk:${talkId}` });
    expect((await ownerAck).accepted).toBe(true);

    const companionAck = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE && message.requestId === 'talk-sub-companion');
    sendJson(companionSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'talk-sub-companion', room: `talk:${talkId}` });
    expect((await companionAck).accepted).toBe(true);

    const denied = waitForMessage(responderSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'FORBIDDEN' && message.requestId === 'talk-sub-outsider');
    sendJson(responderSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'talk-sub-outsider', room: `talk:${talkId}` });
    await denied;

    const stopped = waitForMessage(ownerAltSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_STOP && message.requestId === 'talk-room-stop');
    sendJson(ownerAltSocket, { type: WS_EVENTS.TALK_STOP, requestId: 'talk-room-stop', talkId });
    await stopped;
  });
});

describe('room capacity', () => {
  it('fills the per-peer room budget and refuses the next join', async () => {
    // The schema accepts any [a-z0-9:_-] name and administrators bypass per-kind authorization,
    // so only the hub's 32-room ceiling can refuse a subscribe at this stage. This test runs
    // last: every earlier test on this socket spent room budget, and whatever remains is filled here.
    let filled = 0;
    for (let index = 0; index < 64; index += 1) {
      const requestId = `room-limit-${index}`;
      const outcome = waitForMessage(adminSocket, (message) => message.requestId === requestId);
      sendJson(adminSocket, { type: WS_EVENTS.SUBSCRIBE, requestId, room: `limit:room-${index}` });
      const message = await outcome;
      if (message.type === WS_EVENTS.ERROR) {
        expect(message.message).toMatch(/room limit reached or room name is invalid/i);
        return;
      }
      filled += 1;
    }
    throw new Error(`hub accepted at least ${filled + 1} rooms — the room ceiling did not hold`);
  }, 20_000);
});
