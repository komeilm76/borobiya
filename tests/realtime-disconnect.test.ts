// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  closeSocket, createTestServer, issueTicket, login, openSocketWithHello, sendJson,
  waitForMessage, websocketUrl, type TestServer
} from './helpers.ts';
import { WS_EVENTS } from '../src/shared/protocol.ts';

/**
 * Disconnect semantics and requestId-less traffic. A peer that never picked a request id must
 * still get well-formed replies (`requestId` normalises to null), and a peer whose last session
 * vanishes while it holds a talk floor — or stands on the far end of one — has that floor torn
 * down with everyone listening.
 */

let server: TestServer;
let ownerCookie: string;
let companionCookie: string;
let ownerSocket: WebSocket;
let companionSocket: WebSocket;

beforeAll(async () => {
  server = await createTestServer();
  ownerCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  const owner = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, ownerCookie)).ticket));
  const companion = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, companionCookie)).ticket));
  ownerSocket = owner.socket;
  companionSocket = companion.socket;
}, 30_000);

afterAll(async () => {
  for (const socket of [ownerSocket, companionSocket]) if (socket) await closeSocket(socket);
  if (server) await server.close();
});

describe('requestId-less messages', () => {
  it('pongs a ping with no request id or clock hint', async () => {
    const pong = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.PONG);
    sendJson(ownerSocket, { type: WS_EVENTS.PING });
    const message = await pong;
    expect(message.requestId).toBeNull();
    expect(message.at).toBeNull();
    expect(typeof message.serverTime).toBe('number');
  });

  it('answers a snapshot with no request id', async () => {
    const snapshot = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.SNAPSHOT && message.kind !== 'sync');
    sendJson(ownerSocket, { type: WS_EVENTS.SNAPSHOT });
    const message = await snapshot;
    expect(message.requestId).toBeNull();
    expect(Array.isArray(message.items)).toBe(true);
    expect(typeof message.serverTime).toBe('number');
  });

  it('syncs with no cursor, limit or request id and defaults each', async () => {
    const snapshot = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.SNAPSHOT && message.kind === 'sync');
    sendJson(ownerSocket, { type: 'sync' });
    const message = await snapshot;
    expect(message.requestId).toBeNull();
    expect(Array.isArray(message.events)).toBe(true);
    expect(typeof message.cursor).toBe('number');
  });

  it('acknowledges a subscribe with no request id', async () => {
    const ack = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE);
    sendJson(ownerSocket, { type: WS_EVENTS.SUBSCRIBE, room: 'user:usr_requester' });
    const message = await ack;
    expect(message.requestId).toBeNull();
    expect(message.room).toBe('user:usr_requester');
  });

  it('echoes a location update with no request id as null', async () => {
    const ack = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.LOCATION_UPDATE);
    sendJson(ownerSocket, {
      type: WS_EVENTS.LOCATION_UPDATE,
      latitude: 35.7219, longitude: 51.3347, accuracy: 12
    });
    const message = await ack;
    expect(message.requestId).toBeNull();
  });
});

describe('unexpected handler failures', () => {
  it('answers with an internal error frame and keeps the socket usable', async () => {
    const users = server.app.context.services.users;
    const original = users.sync;
    users.sync = () => { throw new TypeError('synthetic handler failure'); };
    try {
      const error = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'INTERNAL');
      sendJson(ownerSocket, { type: 'sync' });
      const message = await error;
      expect(message.message).toBe('Realtime handler failed.');
    } finally {
      users.sync = original;
    }
    // The connection survives the failure.
    const pong = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.PONG);
    sendJson(ownerSocket, { type: WS_EVENTS.PING });
    expect((await pong).type).toBe(WS_EVENTS.PONG);
  });
});

describe('final session disconnect', () => {
  it('tears down the talk floor when the far end vanishes for good', async () => {
    const started = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_START);
    sendJson(ownerSocket, { type: WS_EVENTS.TALK_START, requestId: 'disconnect-floor-1', peerUserId: 'usr_companion' });
    const startAck = await started;
    expect(startAck.accepted).toBe(true);

    // The owner hears the floor die; the reason says why.
    const torn = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === false);
    await closeSocket(companionSocket);
    const state = await torn;
    expect(state.reason).toBe('disconnected');
    expect(state.speakerUserId).toBe('usr_requester');
    expect(state.targetUserId).toBe('usr_companion');
    expect(state.talkId).toBe(startAck.talkId);
  }, 10_000);
});
