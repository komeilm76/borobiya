import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { missionLocationEventSchema } from "@borobiya/shared";
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
  emitSosProposalAccepted,
  SOS_PROPOSAL_ACCEPTED_EVENT,
  joinMissionRoom,
  publishMissionLocation,
  MISSION_LOCATION_EVENT,
  missionRoom,
  handleLocationUpdate,
  LOCATION_UPDATES_PER_MINUTE,
  PEER_UPDATE_EVENT,
  sessionRoom,
  SHARE_ENDED_EVENT,
  userRoom
} from "./socket";

it("notifies only the requester and admin room about an accepted proposal", () => {
  const io = makeSocket();
  const requesterId = randomUUID();
  const proposal = { id: randomUUID(), rescuerId: randomUUID(), sosRequestId: randomUUID(), status: "accepted" as const, createdAt: new Date().toISOString() };
  const payload = { proposal, missionId: randomUUID() };
  emitSosProposalAccepted(io, requesterId, payload);
  expect(io.emitted).toEqual([
    { room: userRoom(requesterId), event: SOS_PROPOSAL_ACCEPTED_EVENT, payload },
    { room: "admin", event: SOS_PROPOSAL_ACCEPTED_EVENT, payload }
  ]);
});

it("authorizes private mission subscriptions against both the live session and mission membership", async () => {
  const missionId = randomUUID();
  const base = { userId, role: "user", sessionId, deviceId };
  const socket = makeSocket({ data: base });
  const canJoinMissionRoom = vi.fn(async () => true);
  const dependencies = { jwtSecret, live: {} as LiveLocationService,
    users: makeStore(userRecord()), missions: { canJoinMissionRoom } };
  expect(await joinMissionRoom(socket as never, { missionId: "forged" }, dependencies)).toEqual({ ok: false, code: "INVALID_MISSION" });
  expect(socket.joins).toEqual([]);
  expect(await joinMissionRoom(socket as never, { missionId }, dependencies)).toEqual({ ok: true });
  expect(canJoinMissionRoom).toHaveBeenCalledWith(missionId, userId, "user");
  expect(socket.joins).toEqual([missionRoom(missionId)]);
  const foreign = makeSocket({ data: base });
  expect(await joinMissionRoom(foreign as never, { missionId }, {
    ...dependencies, missions: { canJoinMissionRoom: async () => false }
  })).toEqual({ ok: false, code: "MISSION_UNAVAILABLE" });
  expect(foreign.joins).toEqual([]);
  expect(await joinMissionRoom(foreign as never, { missionId }, {
    ...dependencies, users: makeStore(userRecord(), false)
  })).toEqual({ ok: false, code: "UNAUTHORIZED" });
  expect(foreign.joins).toEqual([]);
  foreign.connected = false;
  expect(await joinMissionRoom(foreign as never, { missionId }, dependencies)).toEqual({ ok: false, code: "UNAUTHORIZED" });
});

it("publishes only fresh, explicit, authorized mission fixes to the private room", async () => {
  const missionId = randomUUID();
  const sender = makeSocket({ data: { userId, role: "user", sessionId, deviceId } });
  const applyUpdate = vi.fn(async () => ({ status: "accepted" as const, peers: [],
    fix: { lat: 35.7, lon: 51.4, accuracy: null, timestamp: new Date().toISOString() } }));
  const missionLocationRole = vi.fn(async () => "rescuer" as const);
  const dependencies = { jwtSecret, users: makeStore(userRecord()),
    live: { applyUpdate }, missions: { missionLocationRole, canJoinMissionRoom: async () => true } };
  const payload = { missionId, location: { lat: 35.7, lon: 51.4, timestamp: new Date().toISOString(), priorityDeviceId: deviceId } };
  expect(await publishMissionLocation(sender as never, payload, dependencies)).toMatchObject({ ok: true });
  expect(missionLocationRole).toHaveBeenCalledTimes(2);
  expect(applyUpdate).toHaveBeenCalledOnce();
  const emitted = sender.emitted.filter((entry) => entry.event === MISSION_LOCATION_EVENT);
  expect(emitted).toHaveLength(2);
  expect(emitted[0]?.room).toBe(missionRoom(missionId));
  expect(missionLocationEventSchema.parse(emitted[0]?.payload)).toMatchObject({
    userId, missionId, role: "rescuer", lat: 35.7, lon: 51.4
  });

  const outsider = makeSocket({ data: { userId, role: "user", sessionId, deviceId } });
  expect(await publishMissionLocation(outsider as never, payload, {
    ...dependencies, missions: { ...dependencies.missions, missionLocationRole: async () => null }
  })).toMatchObject({ ok: false, code: "MISSION_UNAVAILABLE" });
  expect(outsider.emitted).toEqual([]);
  expect(applyUpdate).toHaveBeenCalledOnce();

  const admin = makeSocket({ data: { userId, role: "admin", sessionId, deviceId } });
  expect(await publishMissionLocation(admin as never, payload, {
    ...dependencies, users: makeStore(userRecord({ role: "admin" })),
    missions: { ...dependencies.missions, missionLocationRole: async (_missionId, _userId, role) =>
      role === "admin" ? "admin" as const : null }
  })).toMatchObject({ ok: true });
  expect(admin.emitted.filter((event) => event.event === MISSION_LOCATION_EVENT)[0]?.payload)
    .toMatchObject({ role: "admin", userId });
  expect(await publishMissionLocation(outsider as never, { ...payload,
    location: { ...payload.location, timestamp: new Date(Date.now() - 61_000).toISOString() }
  }, dependencies)).toMatchObject({ ok: false, code: "INVALID_TIMESTAMP" });
});

it("never broadcasts across cancellation committed during a location write", async () => {
  const sender = makeSocket({ data: { userId, role: "user", sessionId, deviceId } });
  const missionId = randomUUID();
  const missionLocationRole = vi.fn().mockResolvedValueOnce("requester").mockResolvedValueOnce(null);
  const dependencies = { jwtSecret, users: makeStore(userRecord()),
    live: { applyUpdate: async () => ({ status: "accepted" as const, peers: [],
      fix: { lat: 35.7, lon: 51.4, accuracy: null, timestamp: new Date().toISOString() } }) },
    missions: { missionLocationRole, canJoinMissionRoom: async () => true } };
  const ack = await publishMissionLocation(sender as never, { missionId,
    location: { lat: 35.7, lon: 51.4, timestamp: new Date().toISOString(), priorityDeviceId: deviceId }
  }, dependencies);
  expect(ack).toMatchObject({ ok: false, code: "MISSION_UNAVAILABLE" });
  expect(sender.emitted.filter((item) => item.event === MISSION_LOCATION_EVENT)).toEqual([]);
});

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
  connected: boolean;
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
    connected: true,
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

  it("acknowledges a persisted fix when the optional presence heartbeat fails", async () => {
    const peer = randomUUID();
    const socket = makeSocket({ data: { userId, role: "user", deviceId, sessionId } });
    const warn = vi.fn();
    const persisted = vi.fn().mockResolvedValue({ status: "accepted", peers: [peer],
      fix: { lat: 35.7, lon: 51.4, accuracy: 5, timestamp: "2026-10-21T09:00:00.000Z" } });
    const users = {
      ...makeStore(userRecord()),
      touchSessionPresence: vi.fn(async () => { throw new Error("Presence write unavailable"); })
    };
    const ack = await handleLocationUpdate(socket as never, updatePayload(), {
      live: { applyUpdate: persisted } as unknown as LiveLocationService, users, logger: { warn }
    });

    expect(persisted).toHaveBeenCalledOnce();
    expect(users.touchSessionPresence).toHaveBeenCalledWith({ userId, sessionId, deviceId, isOnline: true });
    expect(ack).toEqual({ ok: true, status: "accepted", peers: [peer] });
    expect(socket.emitted.map(({ room }) => room)).toEqual([userRoom(peer), userRoom(userId)]);
    expect(warn).toHaveBeenCalledWith({ err: expect.any(Error) }, "location presence update failed after persistence");
  });

  it("acknowledges a persisted fix and continues other room notifications when one emit fails", async () => {
    const failedPeer = randomUUID();
    const otherPeer = randomUUID();
    const socket = makeSocket({ data: { userId, role: "user", deviceId, sessionId } });
    const emitRoom = socket.to.bind(socket);
    socket.to = (room: string) => room === userRoom(failedPeer)
      ? { emit: () => { throw new Error("Adapter publish unavailable"); } }
      : emitRoom(room);
    const warn = vi.fn();
    const persisted = vi.fn().mockResolvedValue({ status: "accepted", peers: [failedPeer, otherPeer],
      fix: { lat: 35.7, lon: 51.4, accuracy: 5, timestamp: "2026-10-21T09:00:00.000Z" } });
    const ack = await handleLocationUpdate(socket as never, updatePayload(), {
      live: { applyUpdate: persisted } as unknown as LiveLocationService, logger: { warn }
    });

    expect(persisted).toHaveBeenCalledOnce();
    expect(ack).toEqual({ ok: true, status: "accepted", peers: [failedPeer, otherPeer] });
    expect(socket.emitted.map(({ room }) => room)).toEqual([userRoom(otherPeer), userRoom(userId)]);
    expect(warn).toHaveBeenCalledWith({ err: expect.any(Error) }, "location peer fan-out failed after persistence");
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
