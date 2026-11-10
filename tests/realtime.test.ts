// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import {
  apiFetch, audioFrame, closeSocket, createTestServer, issueTicket, login, openSocket,
  openSocketWithHello, sendJson, waitForBinary, waitForMessage, websocketUrl, type TestServer
} from './helpers.ts';
import { AUDIO, WS_EVENTS } from '../src/shared/protocol.ts';

let server: TestServer;
let ownerCookie: string;
let companionCookie: string;
let adminCookie: string;
let ownerSocket: WebSocket;
let companionSocket: WebSocket;
let adminSocket: WebSocket;
let ownerHello: any;

beforeAll(async () => {
  server = await createTestServer({ wsHeartbeatMs: 5000 });
  ownerCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
  const ownerTicket = await issueTicket(server, ownerCookie);
  const companionTicket = await issueTicket(server, companionCookie);
  const adminTicket = await issueTicket(server, adminCookie);
  const ownerConnection = await openSocketWithHello(websocketUrl(server, ownerTicket.ticket));
  const companionConnection = await openSocketWithHello(websocketUrl(server, companionTicket.ticket));
  const adminConnection = await openSocketWithHello(websocketUrl(server, adminTicket.ticket));
  ownerSocket = ownerConnection.socket;
  companionSocket = companionConnection.socket;
  adminSocket = adminConnection.socket;
  ownerHello = ownerConnection.hello;
  await companionConnection.hello;
  await adminConnection.hello;
});
afterAll(async () => {
  for (const socket of [ownerSocket, companionSocket, adminSocket]) if (socket) await closeSocket(socket);
  if (server) await server.close();
});

it('hello exposes a durable cursor, heartbeat and live snapshot', () => {
  expect(ownerHello.type).toBe(WS_EVENTS.HELLO);;
  expect(ownerHello.protocol).toBe(1);;
  expect(ownerHello.userId).toBe('usr_requester');;
  expect(ownerHello.role).toBe('user');;
  expect(typeof ownerHello.eventCursor).toBe('number');;
  expect(ownerHello.heartbeatMs).toBe(5000);;
  expect(ownerHello.connectionId).toBeTruthy();;
  expect(Array.isArray(ownerHello.snapshot.items)).toBeTruthy();;
});

it('tickets are single-use, IP-bound and invalid tickets cannot upgrade', async () => {
  const ticket = await issueTicket(server, ownerCookie);
  const first = await openSocketWithHello(websocketUrl(server, ticket.ticket));
  await closeSocket(first.socket);
  await await expect(() => openSocket(websocketUrl(server, ticket.ticket))).rejects.toThrow();;
  await await expect(() => openSocket(websocketUrl(server, 'invalid-ticket-value'))).rejects.toThrow();;
});

it('ping, sync, snapshot and room authorization use typed realtime messages', async () => {
  const pong = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.PONG && message.requestId === 'ping-1');
  sendJson(ownerSocket, { type: WS_EVENTS.PING, requestId: 'ping-1', at: Date.now() });
  expect((await pong).requestId).toBe('ping-1');;

  const synced = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.SNAPSHOT && message.kind === 'sync' && message.requestId === 'sync-1');
  sendJson(ownerSocket, { type: 'sync', requestId: 'sync-1', since: 0, limit: 100 });
  const sync = await synced;
  expect(Array.isArray(sync.events)).toBeTruthy();;
  expect(typeof sync.cursor === 'number').toBeTruthy();;
  expect(sync.events.every((event: any) => typeof event.id === 'number')).toBeTruthy();;

  const acknowledged = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE);
  sendJson(ownerSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'sub-1', room: 'user:usr_requester' });
  expect((await acknowledged).accepted).toBe(true);;

  const denied = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'FORBIDDEN');
  sendJson(ownerSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'sub-2', room: 'role:admin' });
  expect((await denied).requestId).toBe('sub-2');;
});

it('committed database mutations publish durable events to user and admin sockets', async () => {
  const forOwner = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.EVENT && message.event.type === 'sos.created');
  const forAdmin = waitForMessage(adminSocket, (message) => message.type === WS_EVENTS.EVENT && message.event.type === 'sos.created');
  const created = await apiFetch(server, '/_user/sos', {
    method: 'POST', cookie: ownerCookie,
    body: {
      incidentTypeId: 'inc_medical', severity: 'medium', description: 'Realtime coordination smoke test.',
      latitude: 35.7219, longitude: 51.3347, accuracy: 10, isManual: false
    }
  });
  expect(created.status).toBe(201);;
  const [ownerEvent, adminEvent] = await Promise.all([forOwner, forAdmin]);
  expect(ownerEvent.event.type).toBe('sos.created');;
  expect(adminEvent.event.type).toBe('sos.created');;
  expect(ownerEvent.event.id > 0).toBeTruthy();;
  expect(ownerEvent.event.audience.includes('user:usr_requester')).toBeTruthy();;
  expect(adminEvent.event.audience.includes('role:admin')).toBeTruthy();;
});

it('live location updates fan out only to active authorized companions', async () => {
  const peer = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.LOCATION_PEER && message.userId === 'usr_requester');
  const ack = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.LOCATION_UPDATE && message.requestId === 'loc-1');
  sendJson(ownerSocket, {
    type: WS_EVENTS.LOCATION_UPDATE, requestId: 'loc-1',
    latitude: 35.7222, longitude: 51.3351, accuracy: 9, heading: 42, speed: 1.2, recordedAt: Date.now()
  });
  const [peerMessage, ackMessage] = await Promise.all([peer, ack]);
  expect(peerMessage.fix.latitude).toBe(35.7222);;
  expect(peerMessage.fix.accuracy).toBe(9);;
  // The companions screen renders the sender's name; the payload must carry it.
  expect(typeof peerMessage.username).toBe('string');;
  expect(peerMessage.username.length).toBeGreaterThan(0);;
  expect(ackMessage.recipients >= 1).toBeTruthy();;

  const snapshot = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.SNAPSHOT && message.requestId === 'snap-1');
  sendJson(companionSocket, { type: WS_EVENTS.SNAPSHOT, requestId: 'snap-1' });
  const result = await snapshot;
  expect(result.items.some((item: any) => item.userId === 'usr_requester')).toBeTruthy();;
});

it('one-to-one PTT floor control accepts ordered binary frames and rejects malformed headers', async () => {
  const ownerState = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === true);
  const companionState = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === true);
  const acknowledged = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_START && message.requestId === 'talk-1');
  sendJson(ownerSocket, { type: WS_EVENTS.TALK_START, requestId: 'talk-1', peerUserId: 'usr_companion' });
  const [ack, ownerActive, companionActive] = await Promise.all([acknowledged, ownerState, companionState]);
  const talkId = Number(ack.talkId);
  expect(talkId > 0).toBeTruthy();;
  expect(ownerActive.talkId).toBe(talkId);;
  expect(companionActive.talkId).toBe(talkId);;
  expect(companionActive.speakerUserId).toBe('usr_requester');;

  const audio = waitForBinary(companionSocket, (frame) => frame.byteLength === AUDIO.HEADER_BYTES + 320);
  ownerSocket.send(audioFrame(talkId, 1, 320));
  const frame = await audio;
  const header = new DataView(frame);
  expect(header.getUint8(0)).toBe(AUDIO.VERSION);;
  expect(header.getUint32(2, false)).toBe(talkId);;
  expect(header.getUint32(6, false)).toBe(1);;

  const rejected = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'INVALID_INPUT');
  ownerSocket.send(new Uint8Array([9, 9, 0, 0, 0, 1, 0, 0, 0, 1, 1, 2]).buffer);
  expect((await rejected).message).toMatch(/audio frame header/i);;

  const ownerReleased = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === false && message.talkId === talkId);
  const companionReleased = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === false && message.talkId === talkId);
  const stopped = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_STOP);
  sendJson(ownerSocket, { type: WS_EVENTS.TALK_STOP, requestId: 'talk-stop-1', talkId });
  const [stopAck, releasedOwner, releasedCompanion] = await Promise.all([stopped, ownerReleased, companionReleased]);
  expect(stopAck.talkId).toBe(talkId);;
  expect(releasedOwner.reason).toBe('released');;
  expect(releasedCompanion.reason).toBe('released');;
});

it('server health reports the coordinated HTTP, database, map and realtime subsystems', async () => {
  const response = await apiFetch(server, '/_admin/system/health', { cookie: adminCookie });
  expect(response.status).toBe(200);;
  expect(response.json.data.status).toBe('ok');;
  expect(response.json.data.realtime.connections >= 3).toBeTruthy();;
  expect(response.json.data.realtime.talk).toBeTruthy();;
  expect(response.json.data.map.tiles).toBeTruthy();;
  expect(response.json.data.database.users >= 1).toBeTruthy();;
});
