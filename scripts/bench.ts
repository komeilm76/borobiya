#!/usr/bin/env bun
/**
 * Bun release benchmark: pure validation work, deterministic tile rendering, concurrent HTTP
 * reads and realtime location fan-out. Budgets mirror the assertions in
 * `tests/performance.test.ts`, so a regression fails both the suite and this script.
 */
import { number, parse, shape, text } from '../src/server/core/validate.ts';
import { renderMapTile } from '../src/server/domain/map.ts';
import { WS_EVENTS } from '../src/shared/protocol.ts';
import {
  apiFetch,
  closeSocket,
  createTestServer,
  issueTicket,
  login,
  openSocketWithHello,
  sendJson,
  waitForMessage,
  websocketUrl
} from '../tests/helpers.ts';

/** Upper bounds for every measured value, in milliseconds. */
const BUDGETS = Object.freeze({
  validationMs: 250,
  tilesMs: 700,
  healthMs: 1000,
  locationMs: 500
});

/** Result payload printed by the benchmark. */
interface BenchResult {
  validation1000Ms: number;
  tiles100Ms: number;
  concurrentHealth50Ms: number;
  liveLocationFanoutMs: number;
  budgets: typeof BUDGETS;
}

/**
 * Runs every benchmark against a throwaway in-process server.
 *
 * @returns Measurements rounded to two decimals.
 */
async function bench(): Promise<BenchResult> {
  const schema = shape({
    username: text({ min: 3, max: 32, lower: true }),
    count: number({ min: 1, max: 100, integer: true })
  });
  const validationStart = performance.now();
  for (let index = 0; index < 1000; index++) {
    parse(schema, { username: `user${index}`, count: String((index % 100) + 1) });
  }
  const validationMs = performance.now() - validationStart;

  const tileStart = performance.now();
  for (let index = 0; index < 100; index++) renderMapTile(14, 1000 + index, 1000);
  const tilesMs = performance.now() - tileStart;

  const server = await createTestServer({ wsHeartbeatMs: 5000 });
  let ownerSocket: WebSocket | null = null;
  let companionSocket: WebSocket | null = null;
  try {
    const healthStart = performance.now();
    const responses = await Promise.all(Array.from({ length: 50 }, () => apiFetch(server, '/_public/health')));
    const healthMs = performance.now() - healthStart;
    if (responses.some((response) => response.status !== 200)) throw new Error('public health benchmark failed');

    const ownerCookie = await login(server, 'saeed.k', 'DemoPass!2026');
    const companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
    const ownerTicket = await issueTicket(server, ownerCookie);
    const companionTicket = await issueTicket(server, companionCookie);
    const owner = await openSocketWithHello(websocketUrl(server, ownerTicket.ticket));
    const companion = await openSocketWithHello(websocketUrl(server, companionTicket.ticket));
    ownerSocket = owner.socket;
    companionSocket = companion.socket;
    await companion.hello;
    const peer = waitForMessage(
      companionSocket,
      (message) => message.type === WS_EVENTS.LOCATION_PEER && message.userId === 'usr_requester'
    );
    const locationStart = performance.now();
    sendJson(ownerSocket, {
      type: WS_EVENTS.LOCATION_UPDATE,
      requestId: 'bench-1',
      latitude: 35.7223,
      longitude: 51.3352,
      accuracy: 8,
      recordedAt: Date.now()
    });
    await peer;
    const locationMs = performance.now() - locationStart;

    return {
      validation1000Ms: Number(validationMs.toFixed(2)),
      tiles100Ms: Number(tilesMs.toFixed(2)),
      concurrentHealth50Ms: Number(healthMs.toFixed(2)),
      liveLocationFanoutMs: Number(locationMs.toFixed(2)),
      budgets: BUDGETS
    };
  } finally {
    if (ownerSocket) await closeSocket(ownerSocket);
    if (companionSocket) await closeSocket(companionSocket);
    await server.close();
  }
}

/** Maps each budget to the measurement it bounds. */
const BUDGET_MEASUREMENTS: Record<keyof typeof BUDGETS, keyof BenchResult> = {
  validationMs: 'validation1000Ms',
  tilesMs: 'tiles100Ms',
  healthMs: 'concurrentHealth50Ms',
  locationMs: 'liveLocationFanoutMs'
};

if (import.meta.main) {
  const result = await bench();
  console.log(JSON.stringify(result, null, 2));
  const exceeded = (Object.keys(BUDGETS) as Array<keyof typeof BUDGETS>).filter(
    (budget) => Number(result[BUDGET_MEASUREMENTS[budget]]) > BUDGETS[budget]
  );
  if (exceeded.length) {
    console.error(`bench: ${exceeded.length} budget(s) exceeded: ${exceeded.join(', ')}`);
    process.exit(1);
  }
}
