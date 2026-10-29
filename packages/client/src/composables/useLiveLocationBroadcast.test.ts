import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { RealtimeClient } from "@/services/socket";
import { useLiveLocationBroadcast } from "./useLiveLocationBroadcast";

function makeJwt(deviceId: string, expSeconds = 9999999999, owner = "user-1", sessionId?: string): string {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(
    JSON.stringify({ sub: owner, deviceId, role: "user", exp: expSeconds, ...(sessionId ? { sessionId } : {}) })
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
  it("does not start GPS after Stop cancels a pending session recovery", async () => {
    const token = ref<string | null>(null);
    const ownerId = ref<string | null>("user-1");
    let finishSession!: () => void;
    const gate = new Promise<void>((resolve) => { finishSession = resolve; });
    const resume = vi.fn();
    const transport = makeFakeSocket();
    const openSocket = vi.fn(() => transport.client);
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId, ensureSession: () => gate,
      geolocation: { coords: ref(null), isSupported: ref(true), resume, pause: vi.fn() }, openSocket
    }))!;
    try {
      const starting = api.start();
      api.stop();
      token.value = makeJwt("device-alpha");
      finishSession();
      await starting;
      await flush();
      expect(api.status.value).toBe("stopped");
      expect(resume).not.toHaveBeenCalled();
      expect(openSocket).not.toHaveBeenCalled();
    } finally { finishSession(); scope.stop(); }
  });

  it("locks double Start while waiting for session recovery", async () => {
    const token = ref<string | null>(null);
    const ownerId = ref<string | null>("user-1");
    let finishSession!: () => void;
    const gate = new Promise<void>((resolve) => { finishSession = resolve; });
    const ensureSession = vi.fn(() => gate);
    const resume = vi.fn();
    const transport = makeFakeSocket();
    const openSocket = vi.fn(() => transport.client);
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId, ensureSession,
      geolocation: { coords: ref(null), isSupported: ref(true), resume, pause: vi.fn() }, openSocket
    }))!;
    try {
      const first = api.start();
      const second = api.start();
      token.value = makeJwt("device-alpha");
      finishSession();
      await Promise.all([first, second]);
      await flush();
      expect(ensureSession).toHaveBeenCalledOnce();
      expect(resume).toHaveBeenCalledOnce();
      expect(openSocket).toHaveBeenCalledOnce();
    } finally { finishSession(); scope.stop(); }
  });

  it("stops GPS and offers retry when opening the realtime transport fails", async () => {
    vi.useFakeTimers();
    const pause = vi.fn();
    const resume = vi.fn();
    const recovered = makeFakeSocket();
    const openSocket = vi.fn().mockRejectedValueOnce(new Error("socket module unavailable"))
      .mockReturnValueOnce(recovered.client);
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: ref(makeJwt("device-alpha")), ownerId: ref("user-1"),
      geolocation: { coords: ref(null), isSupported: ref(true), resume, pause }, openSocket
    }))!;
    try {
      await expect(api.start()).resolves.toBeUndefined();
      expect(resume).toHaveBeenCalledOnce();
      expect(pause).toHaveBeenCalledOnce();
      expect(vi.getTimerCount()).toBe(0);
      expect(api.status.value).toBe("rejected");
      expect(api.lastErrorCode.value).toBe("SOCKET_UNAVAILABLE");
      await api.start();
      expect(openSocket).toHaveBeenCalledTimes(2);
      expect(recovered.connectCalls).toBe(1);
      expect(vi.getTimerCount()).toBe(1);
      expect(api.status.value).toBe("broadcasting");
      expect(api.lastErrorCode.value).toBeNull();
    } finally { scope.stop(); vi.useRealTimers(); }
  });

  it("does not let a late failed open stop a newer broadcast attempt", async () => {
    const transport = makeFakeSocket();
    const pause = vi.fn();
    let failOld!: (reason: unknown) => void;
    const oldSocket = new Promise<RealtimeClient>((_resolve, reject) => { failOld = reject; });
    const openSocket = vi.fn().mockReturnValueOnce(oldSocket).mockReturnValueOnce(transport.client);
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: ref(makeJwt("device-alpha")), ownerId: ref("user-1"),
      geolocation: { coords: ref(null), isSupported: ref(true), pause }, openSocket
    }))!;
    try {
      const first = api.start();
      api.stop();
      await api.start();
      expect(api.status.value).toBe("broadcasting");
      const pausesBeforeOldResult = pause.mock.calls.length;
      failOld(new Error("old module failed"));
      await expect(first).resolves.toBeUndefined();
      expect(api.status.value).toBe("broadcasting");
      expect(pause).toHaveBeenCalledTimes(pausesBeforeOldResult);
      expect(transport.closeCalls).toBe(0);
    } finally { failOld(new Error("cleanup")); scope.stop(); }
  });

  it("closes a transport whose connect throws, leaving GPS stopped and retry possible", async () => {
    const broken = makeFakeSocket();
    const connect = broken.client.connect.bind(broken.client);
    broken.client.connect = () => { connect(); throw new Error("connect failed"); };
    const recovered = makeFakeSocket();
    const openSocket = vi.fn().mockReturnValueOnce(broken.client).mockReturnValueOnce(recovered.client);
    const pause = vi.fn();
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: ref(makeJwt("device-alpha")), ownerId: ref("user-1"),
      geolocation: { coords: ref(null), isSupported: ref(true), pause }, openSocket
    }))!;
    try {
      await expect(api.start()).resolves.toBeUndefined();
      expect(api.status.value).toBe("rejected");
      expect(api.lastErrorCode.value).toBe("SOCKET_UNAVAILABLE");
      expect(pause).toHaveBeenCalledOnce();
      expect(broken.closeCalls).toBe(1);
      await api.start();
      expect(openSocket).toHaveBeenCalledTimes(2);
      expect(recovered.connectCalls).toBe(1);
      expect(api.status.value).toBe("broadcasting");
    } finally { scope.stop(); }
  });

  it("closes a socket opened after Stop while a connection was pending", async () => {
    const token = ref<string | null>(makeJwt("device-alpha"));
    const ownerId = ref<string | null>("user-1");
    const pause = vi.fn();
    const transport = makeFakeSocket();
    let finishOpen!: (client: RealtimeClient) => void;
    const pendingOpen = new Promise<RealtimeClient>((resolve) => { finishOpen = resolve; });
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId,
      geolocation: { coords: ref(null), isSupported: ref(true), pause }, openSocket: () => pendingOpen
    }))!;
    try {
      const starting = api.start();
      expect(api.status.value).toBe("connecting");
      api.stop();
      finishOpen(transport.client);
      await starting;
      expect(transport.closeCalls).toBe(1);
      expect(transport.connectCalls).toBe(0);
      expect(api.status.value).toBe("stopped");
      expect(pause).toHaveBeenCalled();
    } finally { finishOpen(transport.client); scope.stop(); }
  });

  it("stops GPS and closes the old room synchronously on owner change, without auto-resuming", async () => {
    const ownerId = ref<string | null>("user-1");
    const token = ref<string | null>(makeJwt("device-alpha"));
    const coords = ref({ latitude: 35.7, longitude: 51.4, accuracy: 5 });
    const pause = vi.fn();
    const transport = makeFakeSocket();
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId,
      geolocation: { coords, isSupported: ref(true), pause }, openSocket: () => transport.client
    }))!;
    try {
      await api.start();
      expect(api.status.value).toBe("broadcasting");
      ownerId.value = "user-2";
      expect(api.status.value).not.toBe("broadcasting");
      expect(pause).toHaveBeenCalled();
      expect(transport.closeCalls).toBe(1);
      token.value = makeJwt("device-beta", 9999999999, "user-2");
      await flush();
      expect(api.status.value).not.toBe("broadcasting");
      expect(transport.emitted).toHaveLength(1);
    } finally { scope.stop(); }
  });

  it("does not broadcast account A's GPS fix when B's bearer arrives before B's profile", async () => {
    const ownerId = ref<string | null>("user-1");
    const token = ref<string | null>(makeJwt("device-alpha"));
    const coords = ref({ latitude: 35.7, longitude: 51.4, accuracy: 5 });
    const pause = vi.fn();
    const transport = makeFakeSocket();
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId,
      geolocation: { coords, isSupported: ref(true), pause }, openSocket: () => transport.client
    }))!;
    try {
      await api.start();
      token.value = makeJwt("device-beta", 9999999999, "user-2");
      expect(api.status.value).not.toBe("broadcasting");
      expect(pause).toHaveBeenCalled();
      expect(transport.closeCalls).toBe(1);
      ownerId.value = "user-2";
      await flush();
      expect(api.status.value).not.toBe("broadcasting"); // new consent required
    } finally { scope.stop(); }
  });

  it("stops GPS and closes the old room when the same account switches JWT sessions", async () => {
    const ownerId = ref<string | null>("user-1");
    const token = ref<string | null>(makeJwt("device-alpha", 9999999999, "user-1", "session-a"));
    const coords = ref({ latitude: 35.7, longitude: 51.4, accuracy: 5 });
    const pause = vi.fn();
    const transport = makeFakeSocket();
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId,
      geolocation: { coords, isSupported: ref(true), pause }, openSocket: () => transport.client
    }))!;
    try {
      await api.start();
      expect(api.status.value).toBe("broadcasting");
      const sentBefore = transport.emitted.length;
      // Re-login on the same physical device still needs a fresh Start tap.
      token.value = makeJwt("device-alpha", 9999999999, "user-1", "session-b");
      expect(api.status.value).not.toBe("broadcasting");
      expect(pause).toHaveBeenCalled();
      expect(transport.closeCalls).toBe(1);
      coords.value = { latitude: 35.8, longitude: 51.5, accuracy: 5 };
      await flush();
      expect(transport.emitted).toHaveLength(sentBefore);
    } finally { scope.stop(); }
  });

  it("closes a stopped session's retained socket when the same account logs in again", async () => {
    const token = ref<string | null>(makeJwt("device-alpha", 9999999999, "user-1", "session-a"));
    const transport = makeFakeSocket();
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId: ref("user-1"),
      geolocation: { coords: ref(null), isSupported: ref(true), pause: vi.fn() }, openSocket: () => transport.client
    }))!;
    try {
      await api.start();
      api.stop();
      expect(transport.closeCalls).toBe(0); // Manual stop retains the reusable transport.
      token.value = makeJwt("device-beta", 9999999999, "user-1", "session-b");
      expect(transport.closeCalls).toBe(1);
      expect(api.status.value).toBe("idle");
    } finally { scope.stop(); }
  });

  it("closes an old session's socket if it finishes opening after the session changes", async () => {
    const token = ref<string | null>(makeJwt("device-alpha", 9999999999, "user-1", "session-a"));
    const pause = vi.fn();
    const transport = makeFakeSocket();
    let finishOpen!: (value: RealtimeClient) => void;
    const opening = new Promise<RealtimeClient>((resolve) => { finishOpen = resolve; });
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId: ref("user-1"),
      geolocation: { coords: ref(null), isSupported: ref(true), pause }, openSocket: () => opening
    }))!;
    try {
      const starting = api.start();
      await flush();
      token.value = makeJwt("device-beta", 9999999999, "user-1", "session-b");
      finishOpen(transport.client);
      await starting;
      expect(pause).toHaveBeenCalled();
      expect(transport.closeCalls).toBe(1);
      expect(api.status.value).toBe("idle");
    } finally { finishOpen(transport.client); scope.stop(); }
  });

  it("does not revive old GPS consent after an A to B to A session change in one tick", async () => {
    const ownerId = ref<string | null>("user-1");
    const first = makeJwt("device-alpha", 9999999999, "user-1", "session-a");
    const token = ref<string | null>(first);
    const pause = vi.fn();
    const transport = makeFakeSocket();
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId,
      geolocation: { coords: ref(null), isSupported: ref(true), pause }, openSocket: () => transport.client
    }))!;
    try {
      await api.start();
      token.value = makeJwt("device-beta", 9999999999, "user-1", "session-b");
      token.value = first;
      expect(api.status.value).not.toBe("broadcasting");
      expect(pause).toHaveBeenCalled();
      expect(transport.closeCalls).toBe(1);
    } finally { scope.stop(); }
  });

  it("keeps explicit GPS consent through a same-owner access-token renewal", async () => {
    const ownerId = ref<string | null>("user-1");
    const token = ref<string | null>(makeJwt("device-alpha", 9999999999, "user-1", "session-a"));
    const pause = vi.fn();
    const transport = makeFakeSocket();
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token, ownerId,
      geolocation: { coords: ref(null), isSupported: ref(true), pause }, openSocket: () => transport.client
    }))!;
    try {
      await api.start();
      token.value = makeJwt("device-alpha", 9999999998, "user-1", "session-a");
      expect(api.status.value).toBe("broadcasting");
      expect(transport.closeCalls).toBe(0);
      expect(pause).not.toHaveBeenCalled();
    } finally { scope.stop(); }
  });

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
        ownerId: ref("user-1"),
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

  it("ignores late location acknowledgements after stop, restart, and sign-out", async () => {
    let now = Date.now();
    const token = ref<string | null>(makeJwt("device-alpha"));
    const coords = ref<{ latitude: number | null; longitude: number | null; accuracy: number | null } | null>(null);
    const pause = vi.fn();
    const transport = makeFakeSocket();
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token,
        ownerId: ref("user-1"),
      geolocation: { coords, isSupported: ref(true), pause },
      openSocket: () => transport.client,
      now: () => now,
      intervalMs: 4_000
    }))!;
    try {
      await api.start();
      coords.value = { latitude: 35.7, longitude: 51.4, accuracy: 5 };
      await flush();
      expect(transport.emitted).toHaveLength(1);
      const oldAck = transport.emitted[0]!.ack;

      api.stop();
      oldAck(new Error("timeout"), undefined);
      await flush();
      expect(api.status.value).toBe("stopped");
      expect(api.lastErrorCode.value).toBeNull();

      await api.start();
      await flush();
      expect(transport.emitted).toHaveLength(2);
      oldAck(null, { ok: true, peers: ["stale-peer"] });
      await flush();
      expect(api.peerCount.value).toBe(0);
      transport.emitted[1]!.ack(null, { ok: true, peers: ["current-peer"] });
      await flush();
      expect(api.status.value).toBe("broadcasting");
      expect(api.peerCount.value).toBe(1);

      now += 4_000;
      coords.value = { latitude: 35.71, longitude: 51.4, accuracy: 5 };
      await flush();
      expect(transport.emitted).toHaveLength(3);
      token.value = null;
      await flush();
      transport.emitted[2]!.ack(null, { ok: true, peers: ["signed-out-peer"] });
      await flush();
      expect(api.status.value).toBe("idle");
      expect(api.peerCount.value).toBe(0);
      expect(transport.closeCalls).toBe(1);
    } finally {
      scope.stop();
    }
  });

  it("does not let an obsolete auth refresh reconnect a newly restarted broadcaster", async () => {
    const token = ref<string | null>(makeJwt("device-alpha"));
    const coords = ref<{ latitude: number | null; longitude: number | null; accuracy: number | null } | null>(null);
    const transport = makeFakeSocket();
    let releaseRefresh!: () => void;
    const gate = new Promise<void>((resolve) => { releaseRefresh = resolve; });
    const ensureSession = vi.fn(async () => {
      await gate;
      token.value = makeJwt("device-alpha", 9999999998);
    });
    const scope = effectScope();
    const api = scope.run(() => useLiveLocationBroadcast({
      accessToken: token,
        ownerId: ref("user-1"),
      ensureSession,
      geolocation: { coords, isSupported: ref(true) },
      openSocket: () => transport.client
    }))!;
    try {
      await api.start();
      coords.value = { latitude: 35.7, longitude: 51.4, accuracy: 5 };
      await flush();
      expect(transport.emitted).toHaveLength(1);
      transport.emitted[0]!.ack(null, { ok: false, code: "INVALID_ACCESS_TOKEN" });
      await flush();
      expect(ensureSession).toHaveBeenCalledTimes(1);

      api.stop();
      await api.start();
      await flush();
      expect(transport.connectCalls).toBe(1);
      releaseRefresh();
      await flush();
      expect(transport.connectCalls).toBe(1);
      expect(api.status.value).toBe("broadcasting");
      expect(api.lastErrorCode.value).toBeNull();
    } finally {
      releaseRefresh();
      scope.stop();
    }
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
        ownerId: ref("user-1"),
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
        ownerId: ref("user-1"),
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
