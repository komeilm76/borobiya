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
  handleLocationUpdate,
  LOCATION_UPDATES_PER_MINUTE,
  PEER_UPDATE_EVENT,
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

function authenticate(socket: FakeSocket, users = makeStore(userRecord())): Promise<unknown> {
  const middleware = createAuthMiddleware({ jwtSecret, users, live: {} as LiveLocationService });
  return Promise.resolve(middleware(socket as never, (error?: Error) => error));
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

  it("accepts a verified session and exposes only safe identity on socket data", async () => {
    const socket = makeSocket({ auth: { token: await token() } });
    const error = await authenticate(socket);

    expect(error).toBeUndefined();
    expect(socket.data).toEqual({ userId, role: "user", deviceId, sessionId, username: "field_responder" });
  });
});

function makeLive(shares: Awaited<ReturnType<LocationShareStore["listActiveOutgoingShares"]>>): LiveLocationService {
  const shareStore = { listActiveOutgoingShares: async () => shares };
  const historyStore = { recordFix: async () => undefined };
  return createLiveLocationService({
    shareStore: shareStore as unknown as LocationShareStore,
    historyStore: historyStore as unknown as LocationHistoryStore
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
});
