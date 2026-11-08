#!/usr/bin/env node
/** Dependency-free release benchmark for pure work, HTTP reads and realtime fan-out. */
import { performance } from 'node:perf_hooks';
import { parse, shape, text, number } from '../src/core/validate.ts';
import { renderMapTile } from '../src/domain/map.ts';
import {
  apiFetch, closeSocket, createTestServer, issueTicket, login, openSocketWithHello,
  sendJson, waitForMessage, websocketUrl
} from '../tests/helpers.ts';
import { WS_EVENTS } from '../public/js/protocol.js';

const schema = shape({ username: text({ min: 3, max: 32, lower: true }), count: number({ min: 1, max: 100, integer: true }) });
const validationStart = performance.now();
for (let index = 0; index < 1000; index++) parse(schema, { username: `user${index}`, count: String(index % 100 + 1) });
const validationMs = performance.now() - validationStart;

const tileStart = performance.now();
for (let index = 0; index < 100; index++) renderMapTile(14, 1000 + index, 1000);
const tileMs = performance.now() - tileStart;

const server = await createTestServer({ wsHeartbeatMs: 5000 });
let ownerSocket;
let companionSocket;
try {
  const healthStart = performance.now();
  const health = await Promise.all(Array.from({ length: 50 }, () => apiFetch(server, '/_public/health')));
  const healthMs = performance.now() - healthStart;
  if (health.some((response) => response.status !== 200)) throw new Error('public health benchmark failed');

  const ownerCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  const companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  const ownerTicket = await issueTicket(server, ownerCookie);
  const companionTicket = await issueTicket(server, companionCookie);
  const owner = await openSocketWithHello(websocketUrl(server, ownerTicket.ticket));
  const companion = await openSocketWithHello(websocketUrl(server, companionTicket.ticket));
  ownerSocket = owner.socket;
  companionSocket = companion.socket;
  await companion.hello;
  const peer = waitForMessage(companionSocket, (message) => message.type === WS_EVENTS.LOCATION_PEER && message.userId === 'usr_requester');
  const locationStart = performance.now();
  sendJson(ownerSocket, {
    type: WS_EVENTS.LOCATION_UPDATE, requestId: 'bench-1',
    latitude: 35.7223, longitude: 51.3352, accuracy: 8, recordedAt: Date.now()
  });
  await peer;
  const locationMs = performance.now() - locationStart;
  console.log(JSON.stringify({
    validation1000Ms: Number(validationMs.toFixed(2)),
    tiles100Ms: Number(tileMs.toFixed(2)),
    concurrentHealth50Ms: Number(healthMs.toFixed(2)),
    liveLocationFanoutMs: Number(locationMs.toFixed(2)),
    budgets: { validationMs: 250, tilesMs: 700, healthMs: 1000, locationMs: 500 }
  }, null, 2));
} finally {
  if (ownerSocket) await closeSocket(ownerSocket);
  if (companionSocket) await closeSocket(companionSocket);
  await server.close();
}
