import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  apiFetch, audioFrame, closeSocket, createTestServer, issueTicket, login, openSocket,
  openSocketWithHello, sendJson, waitForBinary, waitForMessage, websocketUrl, type TestServer
} from './helpers.ts';
import { AUDIO, WS_EVENTS } from '../public/js/protocol.js';

let server: TestServer;
let ownerCookie: string;
let companionCookie: string;
let adminCookie: string;
let ownerSocket: WebSocket;
let companionSocket: WebSocket;
let adminSocket: WebSocket;
let ownerHello: any;

before(async () => {
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
after(async () => {
  for (const socket of [ownerSocket, companionSocket, adminSocket]) if (socket) await closeSocket(socket);
  if (server) await server.close();
});

test('hello exposes a durable cursor, heartbeat and live snapshot', () => {
  assert.equal(ownerHello.type, WS_EVENTS.HELLO);
  assert.equal(ownerHello.protocol, 1);
  assert.equal(ownerHello.userId, 'usr_requester');
  assert.equal(ownerHello.role, 'user');
  assert.equal(typeof ownerHello.eventCursor, 'number');
  assert.equal(ownerHello.heartbeatMs, 5000);
  assert.ok(ownerHello.connectionId);
  assert.ok(Array.isArray(ownerHello.snapshot.items));
});

test('tickets are single-use, IP-bound and invalid tickets cannot upgrade', async () => {
  const ticket = await issueTicket(server, ownerCookie);
  const first = await openSocketWithHello(websocketUrl(server, ticket.ticket));
  await closeSocket(first.socket);
  await assert.rejects(() => openSocket(websocketUrl(server, ticket.ticket)));
  await assert.rejects(() => openSocket(websocketUrl(server, 'invalid-ticket-value')));
});

test('ping, sync, snapshot and room authorization use typed realtime messages', async () => {
  const pong = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.PONG && message.requestId === 'ping-1');
  sendJson(ownerSocket, { type: WS_EVENTS.PING, requestId: 'ping-1', at: Date.now() });
  assert.equal((await pong).requestId, 'ping-1');

  const synced = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.SNAPSHOT && message.kind === 'sync' && message.requestId === 'sync-1');
  sendJson(ownerSocket, { type: 'sync', requestId: 'sync-1', since: 0, limit: 100 });
  const sync = await synced;
  assert.ok(Array.isArray(sync.events));
  assert.ok(typeof sync.cursor === 'number');
  assert.ok(sync.events.every((event: any) => typeof event.id === 'number'));

  const acknowledged = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.SUBSCRIBE);
  sendJson(ownerSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'sub-1', room: 'user:usr_requester' });
  assert.equal((await acknowledged).accepted, true);

  const denied = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'FORBIDDEN');
  sendJson(ownerSocket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'sub-2', room: 'role:admin' });
  assert.equal((await denied).requestId, 'sub-2');
});

test('committed database mutations publish durable events to user and admin sockets', async () => {
  const forOwner = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.EVENT && message.event.type === 'sos.created');
  const forAdmin = waitForMessage(adminSocket, (message) => message.type === WS_EVENTS.EVENT && message.event.type === 'sos.created');
  const created = await apiFetch(server, '/_user/sos', {
    method: 'POST', cookie: ownerCookie,
    body: {
      incidentTypeId: 'inc_medical', severity: 'medium', description: 'Realtime coordination smoke test.',
      latitude: 35.7219, longitude: 51.3347, accuracy: 10, isManual: false
    }
  });
  assert.equal(created.status, 201);
  const [ownerEvent, adminEvent] = await Promise.all([forOwner, forAdmin]);
  assert.equal(ownerEvent.event.type, 'sos.created');
  assert.equal(adminEvent.event.type, 'sos.created');
  assert.ok(ownerEvent.event.id > 0);
  assert.ok(ownerEvent.event.audience.includes('user:usr_requester'));
  assert.ok(adminEvent.event.audience.includes('role:admin'));
});

test('live location updates fan out only to active authorized companions', async () => {
  const peer = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.LOCATION_PEER && message.userId === 'usr_requester');
  const ack = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.LOCATION_UPDATE && message.requestId === 'loc-1');
  sendJson(ownerSocket, {
    type: WS_EVENTS.LOCATION_UPDATE, requestId: 'loc-1',
    latitude: 35.7222, longitude: 51.3351, accuracy: 9, heading: 42, speed: 1.2, recordedAt: Date.now()
  });
  const [peerMessage, ackMessage] = await Promise.all([peer, ack]);
  assert.equal(peerMessage.fix.latitude, 35.7222);
  assert.equal(peerMessage.fix.accuracy, 9);
  assert.ok(ackMessage.recipients >= 1);

  const snapshot = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.SNAPSHOT && message.requestId === 'snap-1');
  sendJson(companionSocket, { type: WS_EVENTS.SNAPSHOT, requestId: 'snap-1' });
  const result = await snapshot;
  assert.ok(result.items.some((item: any) => item.userId === 'usr_requester'));
});

test('one-to-one PTT floor control accepts ordered binary frames and rejects malformed headers', async () => {
  const ownerState = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === true);
  const companionState = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === true);
  const acknowledged = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_START && message.requestId === 'talk-1');
  sendJson(ownerSocket, { type: WS_EVENTS.TALK_START, requestId: 'talk-1', peerUserId: 'usr_companion' });
  const [ack, ownerActive, companionActive] = await Promise.all([acknowledged, ownerState, companionState]);
  const talkId = Number(ack.talkId);
  assert.ok(talkId > 0);
  assert.equal(ownerActive.talkId, talkId);
  assert.equal(companionActive.talkId, talkId);
  assert.equal(companionActive.speakerUserId, 'usr_requester');

  const audio = waitForBinary(companionSocket, (frame) => frame.byteLength === AUDIO.HEADER_BYTES + 320);
  ownerSocket.send(audioFrame(talkId, 1, 320));
  const frame = await audio;
  const header = new DataView(frame);
  assert.equal(header.getUint8(0), AUDIO.VERSION);
  assert.equal(header.getUint32(2, false), talkId);
  assert.equal(header.getUint32(6, false), 1);

  const rejected = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ERROR && message.code === 'INVALID_INPUT');
  ownerSocket.send(new Uint8Array([9, 9, 0, 0, 0, 1, 0, 0, 0, 1, 1, 2]).buffer);
  assert.match((await rejected).message, /audio frame header/i);

  const ownerReleased = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === false && message.talkId === talkId);
  const companionReleased = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.TALK_STATE && message.active === false && message.talkId === talkId);
  const stopped = waitForMessage(ownerSocket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.TALK_STOP);
  sendJson(ownerSocket, { type: WS_EVENTS.TALK_STOP, requestId: 'talk-stop-1', talkId });
  const [stopAck, releasedOwner, releasedCompanion] = await Promise.all([stopped, ownerReleased, companionReleased]);
  assert.equal(stopAck.talkId, talkId);
  assert.equal(releasedOwner.reason, 'released');
  assert.equal(releasedCompanion.reason, 'released');
});

test('server health reports the coordinated HTTP, database, map and realtime subsystems', async () => {
  const response = await apiFetch(server, '/_admin/system/health', { cookie: adminCookie });
  assert.equal(response.status, 200);
  assert.equal(response.json.data.status, 'ok');
  assert.ok(response.json.data.realtime.connections >= 3);
  assert.ok(response.json.data.realtime.talk);
  assert.ok(response.json.data.map.tiles);
  assert.ok(response.json.data.database.users >= 1);
});
