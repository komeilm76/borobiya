import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import type { LocationShareStore } from "../db/location-share-store";
import type { LocationHistoryStore } from "../db/location-history-store";
import type {
  SecurityQuestionsUserRecord,
  UserSecurityQuestionsStore
} from "../db/security-questions-store";
import { createLiveLocationService, type LiveLocationService } from "../location/live";
import {
  createAuthMiddleware,
  disconnectSessionSockets,
  disconnectUserSockets,
  emitShareEnded,
  handleLocationUpdate,
  LOCATION_UPDATES_PER_MINUTE,
  PEER_UPDATE_EVENT,
  sessionRoom,
  SHARE_ENDED_EVENT,
  userRoom
} from "./socket";

const jwtSecret = "a".repeat(48);
const userId = randomUUID();
const sessionId = randomUUID();
const deviceId = randomUUID();
const createdAt = new Date("2026-10-21T09:00:00.000Z");

type SocketData = { userId?: string; role?: string; deviceId?: string; sessionId?: string; username?: string };

interface FakeSocket {
  data: SocketData;
  handshake: { auth: Record<string, unknown> };
  joins: string[];
  emitted: { room?: string; event: string; payload: unknown }[];
  disconnects: number;
  join(room: string): void;
  emit(event: string, payload: unknown): void;
  to(room: string): { emit(event: string, payload: unknown): void };
  disconnect(close?: boolean): void;
}

function makeSocket(options: { auth?: Record<string, unknown>; data?: SocketData } = {}): FakeSocket {
  const socket = {
    data: options.data ?? {},
    handshake: { auth: options.auth ?? {} },
    joins: [],
    emitted: [],
    disconnects: 0,
    join(room: string) {
      socket.joins.push(room);
    },
    emit(event: string, payload: unknown) {
      socket.emitted.push({ event, payload });
    },
    disconnect() {
      socket.disconnects += 1;
    }
  } as unknown as FakeSocket;
  // `to()` is Socket.IO's room-scoped broadcast; the fake records each target room.
  socket.to = (room: string) => ({
    emit: (event: string, payload: unknown) => {
      socket.emitted.push({ room, event, payload });
    }
  });
  return socket;
}

function userRecord(overrides: Partial<SecurityQuestionsUserRecord> = {}): SecurityQuestionsUserRecord {
  return {
    id: userId,
    username: "field_responder",
    role: "user",
    isActive: true,
    isSuspended: false,
    mustCompleteSecurityQuestions: false,
    avgRating: null,
    createdAt,
    ...overrides
  };
}

function makeStore(user: SecurityQuestionsUserRecord | null, sessionActive = true): UserSecurityQuestionsStore {
  return {
    async findUserById() { return user; },
    async hasActiveSession() { return sessionActive; },
    async securityQuestionsExist() { return true; },
    async completeSecurityQuestions() { return true; }
  };
}

async function token(overrides: Record<string, unknown> = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({ role: "user", deviceId, sessionId, tokenUse: "access", ...overrides })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 900)
    .sign(new TextEncoder().encode(jwtSecret));
}

/** Resolves with whatever the middleware reports through `next` — the only channel Socket.IO reads. */
function authenticate(socket: FakeSocket, users = makeStore(userRecord())): Promise<unknown> {
  const middleware = createAuthMiddleware({ jwtSecret, users, live: {} as LiveLocationService });
  return new Promise((resolve) => {
    void middleware(socket as never, (error?: Error) => resolve(error));
  });
}

describe("realtime handshake authentication", () => {
  it("rejects a missing or invalid access token", async () => {
    const missing = makeSocket();
    const missingError = await authenticate(missing);
    expect(missing.data.userId).toBeUndefined();
    expect(missingError).toMatchObject({ message: expect.any(String), data: { code: "UNAUTHORIZED" } });

    const forged = makeSocket({ auth: { token: "not-a-jwt" } });
    const forgedError = await authenticate(forged);
    expect(forgedError).toMatchObject({ data: { code: "INVALID_ACCESS_TOKEN" } });
    expect(forged.data.userId).toBeUndefined();
  });

  it("applies the same account-state rules as the REST user guard", async () => {
    const cases: [string, SecurityQuestionsUserRecord | null, boolean, string][] = [
      ["unknown account", null, true, "INVALID_ACCESS_TOKEN"],
      ["inactive account", userRecord({ isActive: false }), true, "ACCOUNT_INACTIVE"],
      ["suspended account", userRecord({ isSuspended: true }), true, "ACCOUNT_SUSPENDED"],
      ["unfinished onboarding", userRecord({ mustCompleteSecurityQuestions: true }), true, "SECURITY_QUESTIONS_REQUIRED"],
      ["revoked session", userRecord(), false, "INVALID_ACCESS_TOKEN"]
    ];

    for (const [, user, sessionActive, code] of cases) {
      const socket = makeSocket({ auth: { token: await token() } });
      const error = await authenticate(socket, makeStore(user, sessionActive));
      expect(error).toMatchObject({ message: expect.any(String), data: { code } });
      expect(socket.data.userId).toBeUndefined();
    }
  });

  it("fails the handshake instead of rejecting when the account lookup throws", async () => {
    // A store that cannot answer must not surface as an unobserved rejection: Node ends the process
    // on an unhandled rejection, and socket.io never looks at a middleware's returned promise.
    const warn = vi.fn();
    const store = {
      findUserById: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      },
      hasActiveSession: async () => true
    } as unknown as UserSecurityQuestionsStore;
    const socket = makeSocket({ auth: { token: await token() } });
    const middleware = createAuthMiddleware({ jwtSecret, users: store, live: {} as LiveLocationService, logger: { warn } });
    const error = await new Promise<unknown>((resolve) => {
      void middleware(socket as never, (reported?: Error) => resolve(reported));
    });

    expect(error).toMatchObject({ message: expect.any(String), data: { code: "SERVICE_UNAVAILABLE" } });
    expect(socket.data.userId).toBeUndefined();
    expect(warn).toHaveBeenCalledWith({ err: expect.any(Error) }, "realtime handshake failed");
  });

  it("accepts a verified session and exposes only safe identity on socket data", async () => {
    const socket = makeSocket({ auth: { token: await token() } });
    const error = await authenticate(socket);

    expect(error).toBeUndefined();
    expect(socket.data).toEqual({ userId, role: "user", deviceId, sessionId, username: "field_responder" });
  });
});

function makeLive(
  shares: Awaited<ReturnType<LocationShareStore["listActiveOutgoingShares"]>>,
  overrides: Partial<Pick<Parameters<typeof createLiveLocationService>[0], "now">> = {}
): LiveLocationService {
  const shareStore = { listActiveOutgoingShares: async () => shares };
  const historyStore = { recordFix: async () => undefined };
  return createLiveLocationService({
    shareStore: shareStore as unknown as LocationShareStore,
    historyStore: historyStore as unknown as LocationHistoryStore,
    // The payloads below carry a fixed observation time, so the clock has to be fixed too: against
    // wall time every case here becomes a stale update the day after the fixture date.
    now: () => new Date("2026-10-21T09:00:30.000Z"),
    ...overrides
  });
}

function updatePayload() {
  return { lat: 35.7, lon: 51.4, accuracy: 5, timestamp: "2026-10-21T09:00:00.000Z", priorityDeviceId: deviceId };
}

describe("location:update handling", () => {
  it("namespaces private rooms by user id", () => {
    expect(userRoom(userId)).toBe(`user:${userId}`);
  });

  it("fans one accepted fix out to each peer room and echoes it to the sender's own room", async () => {
    const peerA = randomUUID();
    const peerB = randomUUID();
    const socket = makeSocket({ data: { userId, role: "user", deviceId, sessionId } });
    const live = makeLive([
      { targetUserId: peerA, priorityDeviceId: null },
      { targetUserId: peerB, priorityDeviceId: deviceId }
    ]);

    const ack = await handleLocationUpdate(socket as never, updatePayload(), { live });

    expect(ack).toEqual({ ok: true, status: "accepted", peers: [peerA, peerB] });
    expect(socket.emitted).toEqual([
      { room: userRoom(peerA), event: PEER_UPDATE_EVENT, payload: { userId, lat: 35.7, lon: 51.4, accuracy: 5, timestamp: "2026-10-21T09:00:00.000Z" } },
      { room: userRoom(peerB), event: PEER_UPDATE_EVENT, payload: expect.any(Object) },
      { room: userRoom(userId), event: PEER_UPDATE_EVENT, payload: expect.any(Object) }
    ]);
  });

  it("rejects updates from a socket without an authenticated identity", async () => {
    const socket = makeSocket({ data: {} });
    const ack = await handleLocationUpdate(socket as never, updatePayload(), { live: makeLive([]) });

    expect(ack).toMatchObject({ ok: false, code: "UNAUTHORIZED" });
    expect(socket.emitted).toEqual([]);
  });

  it("refuses a second device once the account pinned a priority device", async () => {
    const socket = makeSocket({ data: { userId, role: "user", deviceId, sessionId } });
    const live = makeLive([{ targetUserId: randomUUID(), priorityDeviceId: randomUUID() }]);

    const ack = await handleLocationUpdate(socket as never, updatePayload(), { live });

    expect(ack).toMatchObject({ ok: false, code: "WRONG_DEVICE" });
    expect(socket.emitted).toEqual([]);
  });

  it("answers an unavailable ack instead of rejecting when persistence throws", async () => {
    // The listener has no reply object to fail, and Node ends the process on an unawaited rejection.
    const warn = vi.fn();
    const socket = makeSocket({ data: { userId, role: "user", deviceId, sessionId } });
    const live = {
      applyUpdate: async () => {
        throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
      }
    } as unknown as LiveLocationService;

    const ack = await handleLocationUpdate(socket as never, updatePayload(), { live, logger: { warn } });

    expect(ack).toMatchObject({ ok: false, status: "rejected", code: "SERVICE_UNAVAILABLE", message: expect.any(String) });
    expect(socket.emitted).toEqual([]);
    expect(warn).toHaveBeenCalledWith({ err: expect.any(Error) }, "location update handler failed");
  });

  it("throttles sustained broadcasts per connection", async () => {
    const socket = makeSocket({ data: { userId, role: "user", deviceId, sessionId } });
    const live = makeLive([]);

    const results = await Promise.all(
      Array.from({ length: LOCATION_UPDATES_PER_MINUTE + 2 }, () =>
        handleLocationUpdate(socket as never, updatePayload(), { live })
      )
    );
    const accepted = results.filter((result) => result.ok).length;
    const throttled = results.filter((result) => result.code === "RATE_LIMITED");

    expect(accepted).toBe(LOCATION_UPDATES_PER_MINUTE);
    expect(throttled).toHaveLength(2);
    expect(throttled[0]!.retryAfterMs).toBeGreaterThan(0);
  });

  it("emits location:share-ended only to the recipient's private room for both revoke and expiry", () => {
    const shareId = randomUUID();
    const recipientId = randomUUID();
    const emitted: { room: string; event: string; payload: unknown }[] = [];
    const io = {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emitted.push({ room, event, payload });
        }
      })
    };

    emitShareEnded(io, { id: shareId, ownerId: userId, targetUserId: recipientId }, "revoked");
    emitShareEnded(io, { id: shareId, ownerId: userId, targetUserId: recipientId }, "expired");
    emitShareEnded(undefined, { id: shareId, ownerId: userId, targetUserId: recipientId }, "revoked");

    expect(emitted).toEqual([
      {
        room: userRoom(recipientId),
        event: SHARE_ENDED_EVENT,
        payload: { shareId, userId, reason: "revoked" }
      },
      {
        room: userRoom(recipientId),
        event: SHARE_ENDED_EVENT,
        payload: { shareId, userId, reason: "expired" }
      }
    ]);
  });

  it("cuts off already-connected sockets whose session was logged out or whose account became inactive or suspended", async () => {
    const live = makeLive([{ targetUserId: randomUUID(), priorityDeviceId: deviceId }]);

    const loggedOut = makeSocket({ data: { userId, role: "user", deviceId, sessionId } });
    const loggedOutAck = await handleLocationUpdate(loggedOut as never, updatePayload(), {
      live,
      users: makeStore(userRecord(), false)
    });
    expect(loggedOutAck).toMatchObject({ ok: false, status: "rejected", code: "UNAUTHORIZED" });
    expect(loggedOut.disconnects).toBe(1);
    expect(loggedOut.emitted).toEqual([]);

    const deactivated = makeSocket({ data: { userId, role: "user", deviceId, sessionId } });
    const deactivatedAck = await handleLocationUpdate(deactivated as never, updatePayload(), {
      live,
      users: makeStore(userRecord({ isActive: false }), true)
    });
    expect(deactivatedAck).toMatchObject({ ok: false, status: "rejected", code: "ACCOUNT_INACTIVE" });
    expect(deactivated.disconnects).toBe(1);

    const suspended = makeSocket({ data: { userId, role: "user", deviceId, sessionId } });
    const suspendedAck = await handleLocationUpdate(suspended as never, updatePayload(), {
      live,
      users: makeStore(userRecord({ isSuspended: true }), true)
    });
    expect(suspendedAck).toMatchObject({ ok: false, status: "rejected", code: "ACCOUNT_SUSPENDED" });
    expect(suspended.disconnects).toBe(1);
  });

  it("disconnects session-scoped sockets on logout and user-scoped sockets on global revocation", () => {
    const disconnectedRooms: { room: string; close?: boolean }[] = [];
    const io = {
      in: (room: string) => ({
        disconnectSockets: (close?: boolean) => {
          disconnectedRooms.push({ room, close });
        }
      })
    };

    disconnectSessionSockets(io, sessionId);
    disconnectUserSockets(io, userId);
    disconnectSessionSockets(undefined, sessionId);
    disconnectUserSockets(io, "");

    expect(disconnectedRooms).toEqual([
      { room: sessionRoom(sessionId), close: true },
      { room: userRoom(userId), close: true }
    ]);
  });
});
