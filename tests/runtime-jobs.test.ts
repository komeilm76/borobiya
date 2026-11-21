// @vitest-environment node
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  apiFetch, closeSocket, createTestServer, issueTicket, login, openSocketWithHello, websocketUrl,
  type TestServer
} from './helpers.ts';
import { WS_EVENTS } from '../src/shared/protocol.ts';

/**
 * The background runtime: the heartbeat that keeps a healthy peer alive, and the maintenance
 * jobs' behaviour when a sweep blows up — the process must log the failure and keep serving,
 * not die with the timer callback.
 */

let server: TestServer;

describe('heartbeat', () => {
  beforeAll(async () => {
    server = await createTestServer({ wsHeartbeatMs: 100 });
  });

  afterAll(async () => {
    if (server) await server.close();
  });

  it('pings and marks a responsive peer alive through several rounds', async () => {
    const markAlive = vi.spyOn(server.app.context.hub, 'markAlive');
    const cookie = await login(server, 'saeed.k', 'DemoPass!2026');
    const { socket, hello } = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, cookie)).ticket));
    expect(hello.type).toBe(WS_EVENTS.HELLO);

    // Give the hub at least two beats to ping and the client to answer each one.
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    expect(markAlive.mock.calls.length).toBeGreaterThan(0);
    expect(socket.readyState).toBe(WebSocket.OPEN);

    await closeSocket(socket);
    markAlive.mockRestore();
  }, 10_000);
});

describe('maintenance jobs', () => {
  let jobServer: TestServer;

  beforeAll(async () => {
    jobServer = await createTestServer({ startJobs: true });
  });

  afterAll(async () => {
    if (jobServer) await jobServer.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a failing sweep and keeps the server healthy', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.spyOn(jobServer.app.context.services.realtime, 'sweep').mockImplementation(() => {
      throw new Error('synthetic sweep failure');
    });

    // The fast interval fires once per second; allow two beats plus slack.
    await new Promise<void>((resolve) => setTimeout(resolve, 2_500));
    expect(console.error).toHaveBeenCalledWith('[jobs] realtime sweep failed', expect.any(Error));

    const health = await apiFetch(jobServer, '/_public/health');
    expect(health.status).toBe(200);
  }, 10_000);
});

describe('maintenance failure', () => {
  it('logs a failing maintenance pass and keeps the server healthy', async () => {
    // The slow interval is registered at listen() time, so the fake clock must be installed
    // before the server is created.
    vi.useFakeTimers();
    const jobServer = await createTestServer({ startJobs: true });
    try {
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      vi.spyOn(jobServer.app.context.services.location, 'purgePoints').mockImplementation(() => {
        throw new Error('synthetic maintenance failure');
      });

      vi.advanceTimersByTime(61_000);
      expect(console.error).toHaveBeenCalledWith('[jobs] maintenance failed', expect.any(Error));
    } finally {
      vi.useRealTimers();
      await jobServer.close();
    }
  }, 10_000);
});
