// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { number, parse, shape, text } from '../src/server/core/validate.ts';
import { renderMapTile } from '../src/server/domain/map.ts';
import {
  apiFetch,
  closeSocket,
  createTestServer,
  issueTicket,
  login,
  openSocketWithHello,
  sendJson,
  waitForMessage,
  websocketUrl,
  type TestServer
} from './helpers.ts';
import { WS_EVENTS } from '../src/shared/protocol.ts';

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer({ wsHeartbeatMs: 5000 });
});

afterAll(async () => {
  if (server) await server.close();
});

describe('performance budgets', () => {
  it('pure validation and deterministic tile rendering stay inside generous latency budgets', () => {
    const schema = shape({
      username: text({ min: 3, max: 32, lower: true }),
      count: number({ min: 1, max: 100, integer: true })
    });
    const started = performance.now();
    for (let index = 0; index < 1000; index++) parse(schema, { username: `user${index}`, count: String((index % 100) + 1) });
    const validationMs = performance.now() - started;
    expect(validationMs, `1000 validations took ${validationMs.toFixed(1)}ms`).toBeLessThan(250);

    const tileStart = performance.now();
    for (let index = 0; index < 100; index++) expect(renderMapTile(14, 1000 + index, 1000)).toBeTruthy();
    const tileMs = performance.now() - tileStart;
    expect(tileMs, `100 tiles took ${tileMs.toFixed(1)}ms`).toBeLessThan(700);
  });

  it('concurrent public reads complete inside a one-second budget', async () => {
    const started = performance.now();
    const responses = await Promise.all(Array.from({ length: 50 }, () => apiFetch(server, '/_public/health')));
    const elapsed = performance.now() - started;
    expect(responses.every((response) => response.status === 200)).toBe(true);
    expect(elapsed, `50 concurrent reads took ${elapsed.toFixed(1)}ms`).toBeLessThan(1000);
  });

  it('live-location fan-out stays inside a 500ms coordination budget', async () => {
    const ownerCookie = await login(server, 'saeed.k', 'DemoPass!2026');
    const companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
    const ownerTicket = await issueTicket(server, ownerCookie);
    const companionTicket = await issueTicket(server, companionCookie);
    const owner = await openSocketWithHello(websocketUrl(server, ownerTicket.ticket));
    const companion = await openSocketWithHello(websocketUrl(server, companionTicket.ticket));
    await companion.hello;
    try {
      const peer = waitForMessage(
        companion.socket,
        (message) => message.type === WS_EVENTS.LOCATION_PEER && message.userId === 'usr_requester'
      );
      const started = performance.now();
      sendJson(owner.socket, {
        type: WS_EVENTS.LOCATION_UPDATE,
        requestId: 'perf-1',
        latitude: 35.7223,
        longitude: 51.3352,
        accuracy: 8,
        recordedAt: Date.now()
      });
      const message = await peer;
      const elapsed = performance.now() - started;
      expect(message.fix.latitude).toBe(35.7223);
      expect(elapsed, `live location fan-out took ${elapsed.toFixed(1)}ms`).toBeLessThan(500);
    } finally {
      await closeSocket(owner.socket);
      await closeSocket(companion.socket);
    }
  });

  it('the generated bundle stays inside the transfer budget', async () => {
    const { ROOT } = await import('../src/server/core/config.ts');
    const chunks = new Map<string, number>();
    for await (const relative of new Bun.Glob('js/*.js').scan({ cwd: `${ROOT}/public`, onlyFiles: true })) {
      chunks.set(relative, Bun.file(`${ROOT}/public/${relative}`).size);
    }
    const total = [...chunks.values()].reduce((sum, size) => sum + size, 0);
    const entry = chunks.get('js/index.js') ?? 0;
    expect(entry, 'entry chunk').toBeLessThan(600 * 1024);
    expect(total, `total JavaScript ${(total / 1024).toFixed(0)}kB`).toBeLessThan(3 * 1024 * 1024);
    const css = Bun.file(`${ROOT}/public/app.css`).size;
    expect(css, `stylesheet ${(css / 1024).toFixed(0)}kB`).toBeLessThan(400 * 1024);
  });
});
