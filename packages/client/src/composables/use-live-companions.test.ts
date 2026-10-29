import { readFileSync } from "node:fs";
import { effectScope, nextTick, ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationSharesResponse } from "@shared/index";
import type { RealtimeClient } from "@/services/socket";
import { DISCARD_AFTER_MS, STALE_AFTER_MS } from "@/live/companion-locations";
import { PEER_TICK_MS, SHARE_VERIFY_MS, useLiveCompanions } from "./use-live-companions";

/**
 * The receiver's wiring: what a share read does to the map, what a socket event does, and what a
 * disconnect, a revoke or a sign-out takes away. No rendering is involved — `UserMapView` passes these
 * refs straight to the map and the status line, and the pure model already owns the geometry rules.
 */

const ALICE = "3f2a6b1c-8d4e-4f70-9a11-5c2b7d0e64f1";
const BOB = "7c1d9f43-2ab6-4c58-8f0e-1d3a5b7c9e02";
const ME = "b58e0c71-4d93-4a06-b1f7-2e8c40a6d139";

type Handler = (payload?: unknown) => void;

interface FakeSocket {
  connected: boolean;
  on(event: string, handler: Handler): void;
  off(event: string, handler: Handler): void;
  listeners(event: string): Handler[];
  dispatch(event: string, payload?: unknown): void;
}

function fakeSocket(): FakeSocket {
  const handlers = new Map<string, Handler[]>();
  return {
    connected: false,
    on(event, handler) {
      handlers.set(event, [...(handlers.get(event) ?? []), handler]);
    },
    off(event, handler) {
      handlers.set(event, (handlers.get(event) ?? []).filter((candidate) => candidate !== handler));
    },
    listeners: (event) => handlers.get(event) ?? [],
    dispatch(event, payload) {
      for (const handler of [...(handlers.get(event) ?? [])]) handler(payload);
    }
  };
}

interface Harness {
  readonly peers: () => ReturnType<typeof useLiveCompanions>["peers"]["value"];
  readonly socket: FakeSocket;
  readonly api: ReturnType<typeof useLiveCompanions>;
  readonly reads: () => number;
  readonly token: Ref<string | null>;
  readonly setOwnUserId: (value: string | null) => void;
  readonly closeCalls: () => number;
  readonly updateTokenCalls: () => number;
  readonly connectCalls: () => number;
  readonly resolveRead: () => void;
  readonly failRead: () => void;
  // `close`/`updateToken` are counted through the *Calls accessors above: the composable must be able to
  // re-open a client, so a harness that exposed the mock itself would invite assertions on the wrong object.
  readonly setShares: (owners: readonly { id: string; username: string; lastLocation: { lat: number; lon: number } | null }[]) => void;
  readonly scope: ReturnType<typeof effectScope>;
}

function mount(
  options: {
    token?: string | null;
    ownUserId?: string | null;
    blockReads?: boolean;
    captureReadSnapshot?: boolean;
    ensureSession?: () => Promise<void>;
  } = {}
): Harness {
  const socket = fakeSocket();
  const close = vi.fn();
  const updateToken = vi.fn();
  const connect = vi.fn();

  let owners: { id: string; username: string; lastLocation: { lat: number; lon: number } | null }[] = [
    { id: ALICE, username: "مریم", lastLocation: { lat: 35.7, lon: 51.4 } }
  ];
  let reads = 0;
  let pending: (() => void)[] = [];
  let failNext = false;

  const readShares = vi.fn(async () => {
    reads += 1;
    // Model an HTTP response computed before a later revoke, but delivered after its socket event.
    const snapshot = options.captureReadSnapshot ? [...owners] : null;
    if (options.blockReads) {
      await new Promise<void>((resolve) => {
        pending.push(resolve);
      });
    }
    await nextTick();
    if (failNext) {
      failNext = false;
      throw new Error("boom");
    }
    return {
      sharedWithMe: (snapshot ?? owners).map((owner, index) => ({ id: `share-${index + 1}`, owner }))
    } as unknown as LocationSharesResponse;
  });

  const token = ref<string | null>(options.token === undefined ? "token" : options.token);
  const ownUserId = ref<string | null>(options.ownUserId === undefined ? ME : options.ownUserId);
  const scope = effectScope();
  let api!: ReturnType<typeof useLiveCompanions>;
  scope.run(() => {
    api = useLiveCompanions({
      accessToken: token as Ref<string | null>,
      ownUserId: ownUserId as Ref<string | null>,
      ensureSession: options.ensureSession,
      now: () => Date.now(),
      openSocket: () => ({
        socket,
        connect,
        close,
        updateToken: (next: string) => {
          updateToken(next);
        }
      } as unknown as RealtimeClient),
      readShares
    });
  });

  return {
    peers: () => api.peers.value,
    socket,
    api,
    token,
    setOwnUserId: (value: string | null) => {
      ownUserId.value = value;
    },
    closeCalls: () => close.mock.calls.length,
    updateTokenCalls: () => updateToken.mock.calls.length,
    connectCalls: () => connect.mock.calls.length,
    reads: () => reads,
    resolveRead: () => {
      const waiting = pending;
      pending = [];
      for (const resolve of waiting) resolve();
    },
    failRead: () => {
      failNext = true;
    },
    setShares: (next) => {
      owners = [...next];
    },
    scope
  };
}

async function settle(): Promise<void> {
  for (let index = 0; index < 8; index += 1) await Promise.resolve();
}

const SHARE_OWNER = { id: ALICE, username: "مریم", lastLocation: { lat: 35.7, lon: 51.4 } };
const bearerFor = (owner: string, nonce = "initial", sessionId?: string) =>
  `e30.${Buffer.from(JSON.stringify({ sub: owner, nonce, ...(sessionId ? { sessionId } : {}) })).toString("base64url")}.sig`;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(Date.parse("2026-04-10T12:00:00.000Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("the composable's own imports", () => {
  const source = readFileSync(new URL("./use-live-companions.ts", import.meta.url), "utf8");

  it("reaches socket.io-client through a dynamic import only", () => {
    // A static `from "@/services/socket"` would put ~50 kB of transport code into the map view's chunk,
    // which is the mistake this pin exists to catch: the rule is invisible from behaviour alone.
    expect(source).toContain('await import("@/services/socket")');
    expect(source).not.toMatch(/^import \{[^}]*\} from "@\/services\/socket";$/m);
    expect(source).toContain('from "@/services/socket-events"');
  });

  it("binds the map receiver to the authenticated account", () => {
    const mapView = readFileSync(new URL("../views/_user/UserMapView.vue", import.meta.url), "utf8");
    expect(mapView).toContain('ownUserId: computed(() => auth.user?.id ?? null)');
  });
});

describe("useLiveCompanions", () => {
  it("opens nothing and reads nothing while signed out", async () => {
    const harness = mount({ token: null });
    await settle();
    expect(harness.peers()).toEqual([]);
    expect(harness.reads()).toBe(0);
    expect(harness.api.status.value.line).toContain("هنوز کسی موقعیتش را با شما زنده به اشتراک نگذاشته است");
    harness.scope.stop();
  });

  it("seeds a peer from the share list, marked as not-live", async () => {
    const harness = mount();
    await settle();
    expect(harness.peers()).toEqual([
      { userId: ALICE, name: "مریم", position: [51.4, 35.7], accuracy: null, ageMs: null, stale: true }
    ]);
    expect(harness.api.status.value.line).toContain("1 نفر آخرین موقعیت شناخته‌شده");
    expect(harness.api.status.value.line).not.toContain("خوانده نشد");
    harness.scope.stop();
  });

  it("ignores the rows about people who follow me", async () => {
    const harness = mount();
    harness.setShares([]);
    await settle();
    expect(harness.peers()).toEqual([]);
    expect(harness.api.status.value.line).toContain("هنوز کسی");
    harness.scope.stop();
  });

  it("paints a fix that arrives for a listed peer", async () => {
    const harness = mount();
    await settle();
    harness.socket.dispatch("location:peer-update", { userId: ALICE, lat: 35.75, lon: 51.42, accuracy: 9, timestamp: new Date(Date.now()).toISOString() });
    const [peer] = harness.peers();
    expect(peer).toMatchObject({ position: [51.42, 35.75], accuracy: 9, stale: false });
    expect(harness.api.status.value).toMatchObject({ peerCount: 1, staleCount: 0 });
    expect(harness.api.status.value.line).toContain("1 همراه روی نقشه");
    harness.scope.stop();
  });

  it("drops its own echoed fix, which the server sends to the sender's room too", async () => {
    const harness = mount({ ownUserId: ME });
    await settle();
    harness.socket.dispatch("location:peer-update", { userId: ME, lat: 35.9, lon: 51.9, timestamp: Date.now() });
    expect(harness.peers().map((peer) => peer.userId)).toEqual([ALICE]);
    harness.scope.stop();
  });

  it("re-reads the share list once for an unknown peer, and paints nothing meanwhile", async () => {
    const harness = mount({ blockReads: true });
    harness.resolveRead();
    await settle();
    const before = harness.reads();
    harness.socket.dispatch("location:peer-update", { userId: BOB, lat: 36, lon: 50, timestamp: Date.now() });
    harness.resolveRead();
    await settle();
    expect(harness.reads()).toBe(before + 1);
    expect(harness.peers().map((peer) => peer.userId)).toEqual([ALICE]);
    harness.scope.stop();
  });

  it("does not stampede when a burst of unknown peers arrives while a read is in flight", async () => {
    const harness = mount({ blockReads: true });
    for (let index = 0; index < 3; index += 1) {
      harness.socket.dispatch("location:peer-update", { userId: BOB, lat: 36, lon: 50, timestamp: Date.now() });
    }
    expect(harness.reads()).toBe(1);
    harness.resolveRead();
    await settle();
    expect(harness.reads()).toBe(1);
    harness.scope.stop();
  });

  it("draws a peer once the re-read knows them", async () => {
    const harness = mount();
    await settle();
    harness.setShares([SHARE_OWNER, { id: BOB, username: "علی", lastLocation: null }]);
    await harness.api.refresh();
    await settle();
    // علی had no `lastLocation` at all, so the map holds them as "waiting" until their first fix arrives.
    expect(harness.api.status.value.line).toContain("1 نفر هنوز موقعیتی نفرستاده");
    harness.socket.dispatch("location:peer-update", { userId: BOB, lat: 36.1, lon: 50.3, accuracy: null, timestamp: Date.now() });
    // The path a brand-new share takes: the list read makes them known, and the next fix puts them on the map.
    expect(harness.api.status.value.awaitingCount).toBe(0);
    expect(harness.peers().find((peer) => peer.userId === BOB)).toMatchObject({ name: "علی", stale: false, position: [50.3, 36.1] });
    harness.scope.stop();
  });

  it("keeps a live fix when a later read carries an older position", async () => {
    const harness = mount();
    await settle();
    harness.socket.dispatch("location:peer-update", { userId: ALICE, lat: 36.9, lon: 50.2, timestamp: Date.now() });
    await harness.api.refresh();
    await settle();
    expect(harness.peers()[0]).toMatchObject({ position: [50.2, 36.9], stale: false });
    harness.scope.stop();
  });

  it("takes a peer off the map when their share goes", async () => {
    const harness = mount();
    await settle();
    harness.socket.dispatch("location:peer-update", { userId: ALICE, lat: 36.9, lon: 50.2, timestamp: Date.now() });
    harness.setShares([]);
    await harness.api.refresh();
    await settle();
    expect(harness.peers()).toEqual([]);
    harness.scope.stop();
  });

  it("rechecks grants if an expiry notification is lost while the socket stays connected", async () => {
    const harness = mount();
    await settle();
    harness.socket.dispatch("connect");
    await settle();
    harness.socket.dispatch("location:peer-update", { userId: ALICE, lat: 35.75, lon: 51.42, timestamp: Date.now() });
    const readsBefore = harness.reads();
    harness.setShares([]); // Expired in the database, but the Socket.IO adapter lost share-ended.
    await vi.advanceTimersByTimeAsync(SHARE_VERIFY_MS + PEER_TICK_MS);

    expect(harness.reads()).toBeGreaterThan(readsBefore);
    expect(harness.peers()).toEqual([]);
    expect(harness.api.shareCount.value).toBe(0);
    harness.scope.stop();
  });

  it("bounds grant verification to a minute and stops it after logout", async () => {
    const harness = mount();
    await settle();
    const initialReads = harness.reads();
    await vi.advanceTimersByTimeAsync(SHARE_VERIFY_MS - PEER_TICK_MS);
    expect(harness.reads()).toBe(initialReads);
    await vi.advanceTimersByTimeAsync(PEER_TICK_MS);
    expect(harness.reads()).toBe(initialReads + 1);
    await vi.advanceTimersByTimeAsync(SHARE_VERIFY_MS - PEER_TICK_MS);
    expect(harness.reads()).toBe(initialReads + 1);
    harness.token.value = null;
    await vi.advanceTimersByTimeAsync(2 * SHARE_VERIFY_MS);
    expect(harness.reads()).toBe(initialReads + 1);
    expect(harness.peers()).toEqual([]);
    harness.scope.stop();
  });

  it("greys a silent peer and drops them only after half an hour", async () => {
    const harness = mount();
    await settle();
    harness.socket.dispatch("location:peer-update", { userId: ALICE, lat: 35.75, lon: 51.42, timestamp: Date.now() });
    // One extra tick: staleness is noticed when the clock moves, and the clock moves every `PEER_TICK_MS`,
    // so the threshold is crossed up to a tick late by design rather than to the millisecond.
    await vi.advanceTimersByTimeAsync(STALE_AFTER_MS + PEER_TICK_MS);
    expect(harness.peers()[0]).toMatchObject({ stale: true });
    expect(harness.api.status.value).toMatchObject({ peerCount: 1, staleCount: 1 });
    await vi.advanceTimersByTimeAsync(DISCARD_AFTER_MS + PEER_TICK_MS);
    expect(harness.peers()).toEqual([]);
    // Once the dot is discarded the line explains the empty map by the shares still open, and by the
    // missing connection — the two things that are actually true here.
    expect(harness.api.status.value.line).toContain("1 اشتراک زنده باز است");
    expect(harness.api.status.value.line).toContain("اتصال زنده برقرار نیست");
    expect(harness.api.status.value.line).not.toContain("خوانده نشد");
    harness.scope.stop();
  });

  it("counts the silence in the status line while the socket is down", async () => {
    const harness = mount();
    await settle();
    harness.socket.dispatch("connect");
    await settle();
    expect(harness.api.connected.value).toBe(true);
    expect(harness.api.status.value.line).toContain("اتصال زنده");
    harness.socket.dispatch("disconnect");
    expect(harness.api.connected.value).toBe(false);
    expect(harness.api.status.value.line).toContain("بدون اتصال زنده");
    // A reconnect re-reads the list: the one thing a socket cannot replay is a share revoked while we
    // were disconnected, and keeping that dot on the map would show a position we are no longer granted.
    const before = harness.reads();
    harness.socket.dispatch("connect");
    await settle();
    expect(harness.reads()).toBe(before + 1);
    harness.scope.stop();
  });

  it("says the list failed instead of blaming a companion, and stops saying it after a good read", async () => {
    const harness = mount();
    await settle();
    harness.failRead();
    await harness.api.refresh();
    await settle();
    expect(harness.api.readFailed.value).toBe(true);
    expect(harness.api.status.value.line).toContain("فهرست اشتراک‌ها خوانده نشد");
    expect(harness.api.status.value.peerCount).toBe(1); // whatever was already drawn stays drawn
    await harness.api.refresh();
    await settle();
    expect(harness.api.readFailed.value).toBe(false);
    expect(harness.api.status.value.line).not.toContain("خوانده نشد");
    harness.scope.stop();
  });

  it("clears private peer positions and closes the old socket synchronously when the account changes", async () => {
    const harness = mount({ ownUserId: ME, blockReads: true, captureReadSnapshot: true });
    harness.resolveRead();
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([ALICE]);
    harness.setShares([{ id: BOB, username: "new account peer", lastLocation: { lat: 36, lon: 50 } }]);
    harness.setOwnUserId("other-account");
    harness.token.value = "other-account-token";
    expect(harness.peers()).toEqual([]); // no render tick may expose account A's coordinates
    expect(harness.api.shareCount.value).toBe(0);
    expect(harness.closeCalls()).toBe(1);
    harness.socket.dispatch("location:peer-update", {
      userId: ALICE, lat: 35.8, lon: 51.5, timestamp: Date.now()
    });
    expect(harness.peers()).toEqual([]);
    await settle();
    harness.resolveRead();
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([BOB]);
    expect(harness.connectCalls()).toBe(2);
    harness.scope.stop();
  });

  it("invalidates an old pending read and refuses a new owner's map under the old bearer", async () => {
    const harness = mount({ token: bearerFor(ME), ownUserId: ME, blockReads: true, captureReadSnapshot: true });
    await settle();
    const oldReadCount = harness.reads();
    harness.setShares([{ id: BOB, username: "new account peer", lastLocation: { lat: 36, lon: 50 } }]);
    harness.setOwnUserId(BOB);
    expect(harness.closeCalls()).toBe(1);
    expect(harness.peers()).toEqual([]);
    await settle();
    expect(harness.reads()).toBe(oldReadCount); // A's JWT is not usable for B's map
    harness.resolveRead();
    await settle();
    expect(harness.peers()).toEqual([]); // old A response cannot reappear
    harness.token.value = bearerFor(BOB);
    await settle();
    harness.resolveRead();
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([BOB]);
    expect(harness.api.shareCount.value).toBe(1);
    harness.scope.stop();
  });

  it("hides old peers while a new bearer arrives before the matching account profile", async () => {
    const harness = mount({ token: bearerFor(ME), ownUserId: ME });
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([ALICE]);
    const oldReads = harness.reads();
    harness.setShares([{ id: BOB, username: "new account peer", lastLocation: { lat: 36, lon: 50 } }]);
    harness.token.value = bearerFor(BOB); // refresh cookie switched tabs, profile is still A
    expect(harness.peers()).toEqual([]);
    expect(harness.closeCalls()).toBe(1);
    await settle();
    expect(harness.reads()).toBe(oldReads);
    harness.setOwnUserId(BOB); // profile finally catches up to the bearer
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([BOB]);
    expect(harness.connectCalls()).toBe(2);
    harness.scope.stop();
  });

  it("empties the map and closes the socket on sign-out", async () => {
    const harness = mount();
    await settle();
    expect(harness.connectCalls()).toBe(1);
    harness.token.value = null;
    expect(harness.peers()).toEqual([]);
    expect(harness.api.shareCount.value).toBe(0);
    expect(harness.closeCalls()).toBe(1);
    await settle();
    expect(harness.api.connected.value).toBe(false);
    harness.token.value = "rotated";
    await settle();
    expect(harness.connectCalls()).toBe(2);
    expect(harness.updateTokenCalls()).toBe(0); // a new client, not a re-authenticated closed one
    harness.scope.stop();
  });

  it("clears old coordinates and reopens the receiver socket on a new JWT login for the same account", async () => {
    const harness = mount({ token: bearerFor(ME, "initial", "session-a"), ownUserId: ME });
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([ALICE]);
    harness.setShares([{ id: BOB, username: "new session peer", lastLocation: { lat: 36, lon: 50 } }]);
    harness.token.value = bearerFor(ME, "new-login", "session-b");
    expect(harness.peers()).toEqual([]);
    expect(harness.api.shareCount.value).toBe(0);
    expect(harness.closeCalls()).toBe(1);
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([BOB]);
    expect(harness.connectCalls()).toBe(2);
    expect(harness.updateTokenCalls()).toBe(0); // New handshake, not the former session's room.
    harness.scope.stop();
  });

  it("rejects an old same-account JWT session's delayed share list after the new login reads", async () => {
    const harness = mount({ token: bearerFor(ME, "initial", "session-a"), ownUserId: ME,
      blockReads: true, captureReadSnapshot: true });
    harness.resolveRead();
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([ALICE]);
    const oldRead = harness.api.refresh();
    await settle();
    harness.setShares([{ id: BOB, username: "new session peer", lastLocation: { lat: 36, lon: 50 } }]);
    harness.token.value = bearerFor(ME, "new-login", "session-b");
    expect(harness.peers()).toEqual([]);
    await settle();
    harness.resolveRead();
    await oldRead;
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([BOB]);
    harness.scope.stop();
  });

  it("does not restore old coordinates on a same-tick A to B to A session change", async () => {
    const first = bearerFor(ME, "initial", "session-a");
    const harness = mount({ token: first, ownUserId: ME });
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([ALICE]);
    harness.token.value = bearerFor(ME, "new-login", "session-b");
    harness.token.value = first;
    expect(harness.peers()).toEqual([]);
    expect(harness.closeCalls()).toBe(1);
    await settle();
    expect(harness.connectCalls()).toBe(2);
    harness.scope.stop();
  });

  it("re-authenticates the open socket when the token rotates for the same owner", async () => {
    const harness = mount({ token: bearerFor(ME, "initial", "session-a"), ownUserId: ME });
    await settle();
    harness.token.value = bearerFor(ME, "renewed", "session-a");
    await settle();
    expect(harness.updateTokenCalls()).toBe(1);
    expect(harness.connectCalls()).toBe(1);
    expect(harness.closeCalls()).toBe(0);
    harness.scope.stop();
  });

  it("refreshes the session and reconnects when a socket reconnect hits connect_error after 15m JWT expiry", async () => {
    let harness!: ReturnType<typeof mount>;
    const ensureSession = vi.fn(async () => {
      harness.token.value = "fresh-access-jwt";
    });
    harness = mount({ ensureSession });
    await settle();

    harness.socket.dispatch("connect_error", new Error("INVALID_ACCESS_TOKEN"));
    await settle();
    await settle();

    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(harness.connectCalls()).toBe(2);
    harness.scope.stop();
  });

  it("refreshes the session and retries automatically when share reading returns 401 after JWT expiry", async () => {
    const token = ref<string | null>("expired-map-token");
    const ensureSession = vi.fn(async () => {
      token.value = "fresh-map-token";
    });
    const readShares = vi.fn(async (supplied: string) => {
      if (supplied === "expired-map-token") {
        throw Object.assign(new Error("Unauthorized"), { status: 401 });
      }
      return { sharedWithMe: [] };
    });
    const scope = effectScope();
    const api = scope.run(() =>
      useLiveCompanions({
        accessToken: token,
        ownUserId: ref(ME),
        ensureSession,
        readShares,
        openSocket: () => ({
          socket: fakeSocket() as unknown as RealtimeClient["socket"],
          close: vi.fn(),
          connect: vi.fn(),
          updateToken: vi.fn()
        })
      })
    )!;
    await settle();
    await settle();

    expect(ensureSession).toHaveBeenCalledTimes(1);
    expect(readShares).toHaveBeenCalledWith("fresh-map-token");
    expect(api.status.value.line).not.toContain("خوانده نشد");
    scope.stop();
  });

  it("reports a failed share-list retry after refreshing an expired token", async () => {
    const token = ref<string | null>("expired-map-token");
    const ensureSession = vi.fn(async () => { token.value = "fresh-map-token"; });
    const readShares = vi.fn(async (supplied: string) => {
      if (supplied === "expired-map-token") {
        throw Object.assign(new Error("Unauthorized"), { status: 401 });
      }
      throw new Error("Share list unavailable after renewal");
    });
    const scope = effectScope();
    const api = scope.run(() => useLiveCompanions({
      accessToken: token, ownUserId: ref(ME), ensureSession, readShares,
      openSocket: () => ({ socket: fakeSocket() as unknown as RealtimeClient["socket"],
        close: vi.fn(), connect: vi.fn(), updateToken: vi.fn() })
    }))!;
    await settle();

    expect(ensureSession).toHaveBeenCalledOnce();
    expect(readShares.mock.calls.map(([supplied]) => supplied)).toEqual(["expired-map-token", "fresh-map-token"]);
    expect(api.readFailed.value).toBe(true);
    expect(api.status.value.line).toContain("فهرست اشتراک‌ها خوانده نشد");
    scope.stop();
  });

  it("does not report an old failed token retry after a newer share read succeeds", async () => {
    const token = ref<string | null>("expired-map-token");
    let rejectRetry!: (error: Error) => void;
    const pendingRetry = new Promise<{ sharedWithMe: [] }>((_resolve, reject) => { rejectRetry = reject; });
    let freshReads = 0;
    const readShares = vi.fn(async (supplied: string) => {
      if (supplied === "expired-map-token") {
        throw Object.assign(new Error("Unauthorized"), { status: 401 });
      }
      return ++freshReads === 1 ? pendingRetry : { sharedWithMe: [] };
    });
    const scope = effectScope();
    const api = scope.run(() => useLiveCompanions({
      accessToken: token, ownUserId: ref(ME),
      ensureSession: async () => { token.value = "fresh-map-token"; }, readShares,
      openSocket: () => ({ socket: fakeSocket() as unknown as RealtimeClient["socket"],
        close: vi.fn(), connect: vi.fn(), updateToken: vi.fn() })
    }))!;
    await settle();
    expect(freshReads).toBe(1);
    await api.refresh();
    rejectRetry(new Error("Older read timed out"));
    await settle();
    expect(api.readFailed.value).toBe(false);
    scope.stop();
  });

  it("does not restore a signed-out account's companions when an older share read finishes late", async () => {
    const harness = mount({ blockReads: true, captureReadSnapshot: true });
    await settle();
    expect(harness.reads()).toBe(1);
    harness.token.value = null;
    await nextTick();
    harness.resolveRead();
    await settle();
    expect(harness.peers()).toEqual([]);
    expect(harness.api.shareCount.value).toBe(0);
    harness.scope.stop();
  });

  it("cannot seed a share revoked while its first list read was still loading", async () => {
    const harness = mount({ blockReads: true, captureReadSnapshot: true });
    await settle();
    harness.setShares([]);
    harness.socket.dispatch("location:share-ended", { shareId: "share-1", userId: ALICE, reason: "revoked" });
    harness.resolveRead();
    await settle();
    expect(harness.peers()).toEqual([]);
    expect(harness.api.shareCount.value).toBe(0);
    harness.scope.stop();
  });

  it("cannot restore a revoked share from an HTTP reply started before the share-ended event", async () => {
    const harness = mount({ blockReads: true, captureReadSnapshot: true });
    harness.resolveRead();
    await settle();
    expect(harness.peers().map((peer) => peer.userId)).toEqual([ALICE]);

    const staleRead = harness.api.refresh();
    await settle();
    harness.setShares([]);
    harness.socket.dispatch("location:share-ended", { shareId: "share-1", userId: ALICE, reason: "revoked" });
    expect(harness.peers()).toEqual([]);
    harness.resolveRead();
    await staleRead;
    await settle();
    expect(harness.peers()).toEqual([]);
    expect(harness.api.shareCount.value).toBe(0);
    harness.scope.stop();
  });

  it("takes a peer off the map immediately on location:share-ended without polling, identically for revoke and expiry", async () => {
    for (const reason of ["revoked", "expired"] as const) {
      const harness = mount();
      await settle();
      harness.socket.dispatch("location:peer-update", { userId: ALICE, lat: 36.9, lon: 50.2, timestamp: Date.now() });
      const readsBefore = harness.reads();

      harness.socket.dispatch("location:share-ended", {
        shareId: "share-1",
        userId: ALICE,
        reason
      });

      expect(harness.reads()).toBe(readsBefore);
      expect(harness.peers()).toEqual([]);
      expect(harness.api.overlay.value.features).toEqual([]);
      expect(harness.api.shareCount.value).toBe(0);
      expect(harness.api.status.value.line).toBe("هنوز کسی موقعیتش را با شما زنده به اشتراک نگذاشته است.");
      harness.scope.stop();
    }
  });

  it("clears the remaining open-share count if a silent peer's timed share expires after dot discard", async () => {
    const harness = mount();
    await settle();
    harness.socket.dispatch("location:peer-update", { userId: ALICE, lat: 35.75, lon: 51.42, timestamp: Date.now() });
    await vi.advanceTimersByTimeAsync(DISCARD_AFTER_MS + PEER_TICK_MS);
    expect(harness.peers()).toEqual([]);
    expect(harness.api.status.value.line).toContain("1 اشتراک زنده باز است");

    harness.socket.dispatch("location:share-ended", {
      shareId: "share-1",
      userId: ALICE,
      reason: "expired"
    });
    expect(harness.api.shareCount.value).toBe(0);
    expect(harness.api.status.value.line).toBe("هنوز کسی موقعیتش را با شما زنده به اشتراک نگذاشته است.");
    harness.scope.stop();
  });

  it("rejects a socket opened for an old account after a newer account is active", async () => {
    const owner = ref<string | null>(ME);
    const token = ref<string | null>("old-token");
    const oldSocket = fakeSocket();
    const newSocket = fakeSocket();
    const oldClose = vi.fn();
    const newClose = vi.fn();
    const newConnect = vi.fn();
    let releaseOld!: (client: RealtimeClient) => void;
    const oldOpening = new Promise<RealtimeClient>((resolve) => { releaseOld = resolve; });
    const scope = effectScope();
    scope.run(() => useLiveCompanions({
      accessToken: token, ownUserId: owner,
      openSocket: (bearer) => bearer === "old-token" ? oldOpening : {
        socket: newSocket as unknown as RealtimeClient["socket"],
        close: newClose, connect: newConnect, updateToken: vi.fn()
      },
      readShares: async () => ({ sharedWithMe: [] })
    }));
    owner.value = "next-account";
    token.value = "new-token";
    await settle();
    expect(newConnect).toHaveBeenCalledOnce();
    releaseOld({ socket: oldSocket as unknown as RealtimeClient["socket"],
      close: oldClose, connect: vi.fn(), updateToken: vi.fn() });
    await settle();
    expect(oldClose).toHaveBeenCalledOnce();
    expect(oldSocket.listeners("location:peer-update")).toEqual([]);
    expect(newClose).not.toHaveBeenCalled();
    scope.stop();
  });

  it("does not restart the socket from a queued token update after scope disposal", async () => {
    const harness = mount();
    await settle();
    harness.token.value = "rotated";
    harness.scope.stop();
    await settle();
    expect(harness.connectCalls()).toBe(1);
    expect(harness.closeCalls()).toBe(1);
  });

  it("detaches its listeners and stops its clock when the scope ends", async () => {
    const harness = mount();
    await settle();
    expect(harness.socket.listeners("location:peer-update")).toHaveLength(1);
    expect(harness.socket.listeners("location:share-ended")).toHaveLength(1);
    harness.scope.stop();
    await settle();
    expect(harness.socket.listeners("location:peer-update")).toEqual([]);
    expect(harness.socket.listeners("location:share-ended")).toEqual([]);
    expect(harness.socket.listeners("connect")).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
    expect(harness.closeCalls()).toBe(1);
  });
});
