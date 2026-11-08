import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { parse, shape, text, number } from '../src/core/validate.ts';
import { renderMapTile } from '../src/domain/map.ts';
import {
  apiFetch, closeSocket, createTestServer, issueTicket, login, openSocketWithHello,
  sendJson, waitForMessage, websocketUrl, type TestServer
} from './helpers.ts';
import { WS_EVENTS } from '../public/js/protocol.js';

let server: TestServer;

before(async () => { server = await createTestServer({ wsHeartbeatMs: 5000 }); });
after(async () => { if (server) await server.close(); });

test('pure validation and deterministic tiles stay inside generous latency budgets', () => {
  const schema = shape({ username: text({ min: 3, max: 32, lower: true }), count: number({ min: 1, max: 100, integer: true }) });
  const started = performance.now();
  for (let index = 0; index < 1000; index++) parse(schema, { username: `user${index}`, count: String(index % 100 + 1) });
  const validationMs = performance.now() - started;
  assert.ok(validationMs < 250, `1000 validations took ${validationMs.toFixed(1)}ms`);

  const tileStart = performance.now();
  for (let index = 0; index < 100; index++) assert.ok(renderMapTile(14, 1000 + index, 1000));
  const tileMs = performance.now() - tileStart;
  assert.ok(tileMs < 700, `100 tiles took ${tileMs.toFixed(1)}ms`);
  console.log(`# validation=${validationMs.toFixed(1)}ms tiles=${tileMs.toFixed(1)}ms`);
});

test('concurrent public reads complete inside a one-second budget', async () => {
  const started = performance.now();
  const responses = await Promise.all(Array.from({ length: 50 }, () => apiFetch(server, '/_public/health')));
  const elapsed = performance.now() - started;
  assert.ok(responses.every((response) => response.status === 200));
  assert.ok(elapsed < 1000, `50 concurrent reads took ${elapsed.toFixed(1)}ms`);
  console.log(`# concurrentHealth=${elapsed.toFixed(1)}ms`);
});

test('live-location fan-out stays inside a 500ms coordination budget', async () => {
  const ownerCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  const companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  const ownerTicket = await issueTicket(server, ownerCookie);
  const companionTicket = await issueTicket(server, companionCookie);
  const owner = await openSocketWithHello(websocketUrl(server, ownerTicket.ticket));
  const companion = await openSocketWithHello(websocketUrl(server, companionTicket.ticket));
  await companion.hello;
  try {
    const peer = waitForMessage(companion.socket, (message) => message.type === WS_EVENTS.LOCATION_PEER && message.userId === 'usr_requester');
    const started = performance.now();
    sendJson(owner.socket, {
      type: WS_EVENTS.LOCATION_UPDATE, requestId: 'perf-1',
      latitude: 35.7223, longitude: 51.3352, accuracy: 8, recordedAt: Date.now()
    });
    const message = await peer;
    const elapsed = performance.now() - started;
    assert.equal(message.fix.latitude, 35.7223);
    assert.ok(elapsed < 500, `live location fan-out took ${elapsed.toFixed(1)}ms`);
    console.log(`# liveLocationFanout=${elapsed.toFixed(1)}ms`);
  } finally {
    await closeSocket(owner.socket);
    await closeSocket(companion.socket);
  }
});
