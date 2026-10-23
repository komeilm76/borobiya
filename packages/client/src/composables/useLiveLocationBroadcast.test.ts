import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RealtimeClient } from "@/services/socket";
import { useLiveLocationBroadcast } from "./useLiveLocationBroadcast";

function makeJwt(deviceId: string, expSeconds = 9999999999): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: "user-1", deviceId, role: "user", exp: expSeconds })
  ).toString("base64url");
  return `${header}.${payload}.sig`;
}

function makeFakeSocket() {
  const listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  const emitted: { event: string; payload: unknown; ack: (error: Error | null, reply: unknown) => void }[] = [];
  const socket = {
    connected: false,
    auth: {} as Record<string, unknown>,
    on(event: string, fn: (...args: unknown[]) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
    },
    off(event: string, fn: (...args: unknown[]) => void) {
      listeners.get(event)?.delete(fn);
    },
    timeout() {
      return {
        emit(event: string, payload: unknown, ack: (error: Error | null, reply: unknown) => void) {
          emitted.push({ event, payload, ack });
        }
      };
    }
  };
  let connectCalls = 0;
  let closeCalls = 0;
  const client = {
    socket: socket as unknown as RealtimeClient["socket"],
    updateToken(next: string) {
      socket.auth = { token: next };
    },
    connect() {
      connectCalls += 1;
      socket.connected = true;
      for (const fn of listeners.get("connect") ?? []) fn();
    },
    close() {
      closeCalls += 1;
      socket.connected = false;
    }
  };
  return {
    client,
    emitted,
    fire(event: string, ...args: unknown[]) {
      for (const fn of listeners.get(event) ?? []) fn(...args);
    },
    get connectCalls() {
      return connectCalls;
    },
    get closeCalls() {
      return closeCalls;
    }
  };
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
  await nextTick();
}

describe("useLiveLocationBroadcast", () => {
  it("starts GPS only on start(), keeps stationary users alive past 60s, and pauses GPS on stop()", async () => {
    vi.useFakeTimers();
    let now = 1_700_000_000_000;
    const coords = ref<{ latitude: number | null; longitude: number | null; accuracy: number | null } | null>(null);
    const error = ref<{ code?: number; message?: string } | null>(null);
    const resume = vi.fn();
    const pause = vi.fn();
    const token = ref<string | null>(makeJwt("device-alpha"));
    const transport = makeFakeSocket();

    const scope = effectScope();
    const api = scope.run(() =>
      useLiveLocationBroadcast({
        accessToken: token,
        geolocation: { coords, error, isSupported: ref(true), resume, pause },
        openSocket: () => transport.client,
        now: () => now,
        intervalMs: 4_000
      })
    )!;

    // Hardware GPS stays dormant until explicit start.
    expect(resume).not.toHaveBeenCalled();

    await api.start();
    await flush();
    expect(resume).toHaveBeenCalledTimes(1);
    expect(api.status.value).toBe("broadcasting");

    // Initial GPS fix arrives at t = 0.
    coords.value = { latitude: 35.6892, longitude: 51.389, accuracy: 6 };
    await flush();
    expect(transport.emitted).toHaveLength(1);
    transport.emitted[0]!.ack(null, { ok: true, peers: ["bob", "carol"] });
    await flush();
    expect(api.peerCount.value).toBe(2);

    // Stand completely still for 120 seconds (coords never fires again) — heartbeats still flow!
    for (let step = 0; step < 30; step += 1) {
      now += 4_000;
      vi.advanceTimersByTime(4_000);
      const latest = transport.emitted[transport.emitted.length - 1]!;
      latest.ack(null, { ok: true, peers: ["bob", "carol"] });
      await flush();
    }
    expect(transport.emitted.length).toBeGreaterThanOrEqual(30);
    expect(api.status.value).toBe("broadcasting");

    // Stopping pauses hardware GPS immediately.
    api.stop();
    expect(pause).toHaveBeenCalledTimes(1);
    expect(api.status.value).toBe("stopped");

    scope.stop();
    vi.useRealTimers();
  });

  it("refreshes an expired 15m access token via ensureSession and reconnects instead of sticking rejected", async () => {
    const coords = ref({ latitude: 35.7, longitude: 51.4, accuracy: 5 });
    const token = ref<string | null>(makeJwt("device-alpha", 1));
    const transport = makeFakeSocket();
    // Simulate first connect failing with expired JWT, then succeeding after refresh.
    let failFirstConnect = true;
    transport.client.connect = () => {
      if (failFirstConnect) {
        failFirstConnect = false;
        transport.client.socket.connected = false;
        transport.fire("connect_error", { data: { code: "INVALID_ACCESS_TOKEN" } });
        return;
      }
      transport.client.socket.connected = true;
      transport.fire("connect");
    };

    const ensureSession = vi.fn(async () => {
      token.value = makeJwt("device-alpha", 9999999999);
    });

    const scope = effectScope();
    const api = scope.run(() =>
      useLiveLocationBroadcast({
        accessToken: token,
        ensureSession,
        geolocation: { coords, isSupported: ref(true) },
        openSocket: () => transport.client
      })
    )!;

    await api.start();
    await flush();
    await flush();

    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(api.status.value).toBe("broadcasting");
    scope.stop();
  });

  it("surfaces geolocation permission denial and tears down cleanly on logout", async () => {
    const coords = ref<{ latitude: number | null; longitude: number | null; accuracy: number | null } | null>(null);
    const error = ref<{ code?: number; message?: string } | null>(null);
    const pause = vi.fn();
    const token = ref<string | null>(makeJwt("device-alpha"));
    const transport = makeFakeSocket();

    const scope = effectScope();
    const api = scope.run(() =>
      useLiveLocationBroadcast({
        accessToken: token,
        geolocation: { coords, error, isSupported: ref(true), pause },
        openSocket: () => transport.client
      })
    )!;

    await api.start();
    await flush();
    error.value = { code: 1, message: "User denied Geolocation" };
    await flush();

    expect(api.status.value).toBe("rejected");
    expect(api.lastErrorCode.value).toBe("GEOLOCATION_DENIED");
    expect(pause).toHaveBeenCalled();

    // Signing out resets status and closes the socket.
    token.value = null;
    await flush();
    expect(api.status.value).toBe("idle");
    expect(transport.closeCalls).toBe(1);
    scope.stop();
  });
});
