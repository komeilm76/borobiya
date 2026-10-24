import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
import { idSchema, missionLocationPublishSchema, type LocationUpdateAck, type MissionJoinAck, type MissionLocationAck, type MissionLocationEvent, type MissionStatusUpdatedEvent, type RequesterCancellationEvent, type RescuerCancellationEvent, type ShareEndedEvent, type SosProposalAcceptedEvent, type SosProposalReceivedEvent, type SosRequest } from "@borobiya/shared";
import type { ClientToServerEvents, ServerToClientEvents } from "@borobiya/shared";
export type { LocationUpdateAck, MissionJoinAck, MissionLocationAck } from "@borobiya/shared";
import type { MissionProgressStore } from "../db/mission-progress-store";
import type { RetiredLocationShare } from "../db/location-share-store";
import type { LiveLocationService, PeerLocationUpdate } from "../location/live";
import type { UserSecurityQuestionsStore } from "../db/security-questions-store";
import { verifyAccessToken, type SessionTokenIdentity } from "../security/tokens";

/** Socket.IO heartbeats follow spec §12.3: a client ping every 25s must be answered within 10s. */
export const PING_INTERVAL_MS = 25_000;
export const PING_TIMEOUT_MS = 10_000;
/** Spec §10.1: 60 location updates per minute per device. */
export const LOCATION_UPDATES_PER_MINUTE = 60;
export const LOCATION_UPDATE_WINDOW_MS = 60_000;

/** Ack/handshake code for a dependency failure, so a client retries instead of losing the socket. */
export const SERVICE_UNAVAILABLE_CODE = "SERVICE_UNAVAILABLE";
export const LOCATION_UPDATE_EVENT = "location:update" satisfies keyof ClientToServerEvents;
export const PEER_UPDATE_EVENT = "location:peer-update" satisfies keyof ServerToClientEvents;
export const SHARE_ENDED_EVENT = "location:share-ended" satisfies keyof ServerToClientEvents;
export const SOS_NEW_REQUEST_EVENT = "sos:new-request" satisfies keyof ServerToClientEvents;
export const SOS_PROPOSAL_RECEIVED_EVENT = "sos:proposal-received" satisfies keyof ServerToClientEvents;
export const SOS_PROPOSAL_ACCEPTED_EVENT = "sos:proposal-accepted" satisfies keyof ServerToClientEvents;
export const MISSION_STATUS_UPDATED_EVENT = "mission:status-updated" satisfies keyof ServerToClientEvents;
export const MISSION_SUBSCRIBE_EVENT = "mission:subscribe" satisfies keyof ClientToServerEvents;
export const MISSION_LOCATION_PUBLISH_EVENT = "mission:location-publish" satisfies keyof ClientToServerEvents;
export const MISSION_LOCATION_EVENT = "mission:location" satisfies keyof ServerToClientEvents;
export const MISSION_CANCELLED_BY_RESCUER_EVENT = "mission:cancelled-by-rescuer" satisfies keyof ServerToClientEvents;
export const MISSION_CANCELLED_BY_REQUESTER_EVENT = "mission:cancelled-by-requester" satisfies keyof ServerToClientEvents;
export const ADMIN_ROOM = "admin";

export type ShareEndedReason = ShareEndedPayload["reason"];

export type ShareEndedPayload = ShareEndedEvent;

/** Structurally satisfied by Socket.IO's `Server` and test doubles. */
export interface RoomEmitter {
  to(room: string): { emit(event: string, payload: unknown): unknown };
}

/** Structurally satisfied by Socket.IO's `Server` (`io.in(room).disconnectSockets(true)`). */
export interface SocketDisconnector {
  in(room: string): { disconnectSockets(close?: boolean): void };
}

export type SocketError = { message: string; code: string };

/** Structurally satisfied by the Fastify (pino) logger. */
export interface RealtimeLogger {
  warn(payload: Record<string, unknown>, message: string): void;
}

export interface RealtimeSocketData extends SessionTokenIdentity {
  username: string;
}

export interface RealtimeDependencies {
  jwtSecret: string;
  users: UserSecurityQuestionsStore;
  live: LiveLocationService;
  missions?: Pick<MissionProgressStore, "canJoinMissionRoom" | "missionLocationRole">;
  /** Allowed browser origins for the WebSocket handshake; omitted means same-origin only. */
  corsOrigins?: string[];
  /** Where a swallowed dependency failure is reported; socket handlers have no HTTP reply to fail. */
  logger?: RealtimeLogger;
  path?: string;
}

export interface RealtimeServer {
  io: Server<ClientToServerEvents, ServerToClientEvents>;
  close(): Promise<void>;
}

function socketError(code: string, message: string): Error & { data: { code: string } } {
  return Object.assign(new Error(message), { data: { code } });
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
}

export function missionRoom(missionId: string): string {
  return `mission:${missionId}`;
}

export function sessionRoom(sessionId: string): string {
  return `session:${sessionId}`;
}

/**
 * Drops every open socket belonging to a single revoked session (logout) while leaving any
 * other signed-in devices of the same account untouched.
 */
export function disconnectSessionSockets(
  io: SocketDisconnector | undefined,
  sessionId: string
): void {
  if (!io || !sessionId) return;
  io.in(sessionRoom(sessionId)).disconnectSockets(true);
}

/**
 * Drops every open socket of an account whose access has just been revoked globally (admin
 * deactivation or password reset), stopping both outgoing updates and passive `user:<id>` reads.
 */
export function disconnectUserSockets(
  io: SocketDisconnector | undefined,
  userId: string
): void {
  if (!io || !userId) return;
  io.in(userRoom(userId)).disconnectSockets(true);
}

/**
 * Notifies a share's recipient room immediately when an active arrangement ends, whether the
 * owner clicked Revoke or the minute sweep retired an overdue timed share.
 */
export function emitShareEnded(
  io: RoomEmitter | undefined,
  share: RetiredLocationShare,
  reason: ShareEndedReason
): void {
  if (!io) return;
  const payload: ShareEndedPayload = {
    shareId: share.id,
    userId: share.ownerId,
    reason
  };
  io.to(userRoom(share.targetUserId)).emit(SHARE_ENDED_EVENT, payload);
}

/**
 * Broadcasts an emergency SOS request (`{ sosRequest }`) exclusively to connected administrators
 * in the `admin` room (`T3.2.5`). Non-admin sockets never join `admin` and never receive this payload.
 */
export function emitSosNewRequest(
  io: RoomEmitter | undefined,
  sosRequest: SosRequest
): void {
  if (!io) return;
  io.to(ADMIN_ROOM).emit(SOS_NEW_REQUEST_EVENT, { sosRequest });
}

/**
 * After a committed mission step, notify both participant rooms and admins. The mission
 * room is joined only after the subscription rechecks the live session and membership;
 * participant and admin rooms still receive updates without an explicit subscription.
 * Socket.IO unions the rooms into one broadcast, so a socket in two rooms gets one event.
 * A failed broadcast is logged but never turns a committed PATCH into a retryable 500.
 */
export function emitMissionStatusUpdated(
  io: RoomEmitter | undefined,
  payload: MissionStatusUpdatedEvent,
  requesterId: string,
  rescuerId: string,
  onError: (error: unknown) => void
): void {
  if (!io) return;
  const rooms = [missionRoom(payload.missionId), userRoom(requesterId), userRoom(rescuerId), ADMIN_ROOM];
  try {
    // Socket.IO accepts an array of rooms (union with deduplication). RoomEmitter's
    // single-room shape serves other events and test doubles, so widen just this call.
    (io.to as unknown as (targets: string[]) => { emit(event: string, value: unknown): unknown })(rooms)
      .emit(MISSION_STATUS_UPDATED_EVENT, payload);
  } catch (error) {
    onError(error);
  }
}

const emitToRooms = (io: RoomEmitter, rooms: string[], event: string, payload: unknown) =>
  (io.to as unknown as (targets: string[]) => { emit(name: string, value: unknown): unknown })(rooms).emit(event, payload);

/** A requester cancellation is delivered once even to a socket in both its user and mission rooms. */
export function emitRequesterCancellation(io: RoomEmitter | undefined, payload: RequesterCancellationEvent,
  onError: (error: unknown) => void): void {
  if (!io) return;
  try {
    emitToRooms(io, [missionRoom(payload.missionId), userRoom(payload.requesterId),
      userRoom(payload.rescuerId), ADMIN_ROOM], MISSION_CANCELLED_BY_REQUESTER_EVENT, payload);
  } catch (error) { onError(error); }
}

/** Keep the responder's last known coordinates and review flag in the admin event only. */
export function emitRescuerCancellation(
  io: RoomEmitter | undefined,
  payload: RescuerCancellationEvent & { rescuerLocation: { lat: number; lon: number } | null; reviewRequired: boolean },
  requesterId: string,
  onError: (error: unknown) => void
): void {
  if (!io) return;
  const { rescuerLocation: _location, reviewRequired: _review, ...publicPayload } = payload;
  try {
    emitToRooms(io, [userRoom(requesterId), userRoom(payload.rescuerId)], MISSION_CANCELLED_BY_RESCUER_EVENT, publicPayload);
  } catch (error) { onError(error); }
  try {
    io.to(ADMIN_ROOM).emit(MISSION_CANCELLED_BY_RESCUER_EVENT, payload);
  } catch (error) { onError(error); }
}

/**
 * Emits a newly created or reopened mission proposal (`{ proposal, sosRequest }`) exclusively
 * to the dispatched responder's `user:<rescuerId>` room (`T3.3.2`).
 */
export function emitSosProposalReceived(
  io: RoomEmitter | undefined,
  rescuerId: string,
  payload: SosProposalReceivedEvent
): void {
  if (!io || !rescuerId) return;
  io.to(userRoom(rescuerId)).emit(SOS_PROPOSAL_RECEIVED_EVENT, payload);
}

/** Notify the requester and admins only after the accept transaction commits. */
export function emitSosProposalAccepted(
  io: RoomEmitter | undefined,
  requesterId: string,
  payload: SosProposalAcceptedEvent
): void {
  if (!io) return;
  io.to(userRoom(requesterId)).emit(SOS_PROPOSAL_ACCEPTED_EVENT, payload);
  io.to(ADMIN_ROOM).emit(SOS_PROPOSAL_ACCEPTED_EVENT, payload);
}

/**
 * Authenticates a handshake with the same checks as the REST `/_user` hook: verified access JWT,
 * existing account, matching role, active and unsuspended state, and a live persisted session.
 */
export function createAuthMiddleware(dependencies: RealtimeDependencies) {
  return async function authenticate(
    socket: Socket & { data: Partial<RealtimeSocketData> },
    next: (error?: Error) => void
  ): Promise<void> {
    try {
      await authenticateSocket(socket, next, dependencies);
    } catch (error) {
      // Socket.IO middleware is callback-based: it never observes the promise this function returns,
      // so a database that cannot answer would surface as an unhandled rejection — and Node ends the
      // process on those. Fail this one handshake instead and keep serving everyone else.
      dependencies.logger?.warn({ err: error }, "realtime handshake failed");
      next(socketError(SERVICE_UNAVAILABLE_CODE, "Realtime authentication is unavailable. Try again shortly."));
    }
  };
}

async function authenticateSocket(
  socket: Socket & { data: Partial<RealtimeSocketData> },
  next: (error?: Error) => void,
  dependencies: RealtimeDependencies
): Promise<void> {
  const supplied = socket.handshake.auth as { token?: unknown } | undefined;
  const token = typeof supplied?.token === "string" ? supplied.token : "";
  if (!token) {
    return next(socketError("UNAUTHORIZED", "A valid access token is required."));
  }

  const identity = await verifyAccessToken(token, dependencies.jwtSecret);
  if (!identity) {
    return next(socketError("INVALID_ACCESS_TOKEN", "A valid access token is required."));
  }

  const user = await dependencies.users.findUserById(identity.userId);
  if (!user || user.role !== identity.role) {
    return next(socketError("INVALID_ACCESS_TOKEN", "A valid access token is required."));
  }
  if (!user.isActive) {
    return next(socketError("ACCOUNT_INACTIVE", "This account is inactive. Contact an administrator."));
  }
  if (user.isSuspended) {
    return next(socketError("ACCOUNT_SUSPENDED", "This account is suspended. Contact an administrator."));
  }
  if (user.role !== "admin" && user.mustCompleteSecurityQuestions) {
    return next(socketError("SECURITY_QUESTIONS_REQUIRED", "Complete your security questions first."));
  }
  if (!(await dependencies.users.hasActiveSession(identity))) {
    return next(socketError("INVALID_ACCESS_TOKEN", "A valid access token is required."));
  }

  socket.data = { ...identity, username: user.username };
  return next();
}

interface UpdateSender {
  data: Partial<RealtimeSocketData>;
  to(room: string): { emit(event: string, payload: unknown): unknown };
  emit(event: string, payload: unknown): unknown;
  disconnect(close?: boolean): void;
  connected?: boolean;
  borobiyaUpdateCount?: number;
  borobiyaUpdateWindowStart?: number;
}

/**
 * Handles one `location:update` from an authenticated socket: per-connection throttle,
 * priority-device verification, persistence, and fan-out to every accepting peer.
 */
/**
 * Handles one update and always resolves: the caller is an event listener with no reply object, and
 * a rejected promise there would be an unhandled rejection that takes the process down.
 */
export interface HandleLocationUpdateDependencies {
  live: LiveLocationService;
  users?: Pick<UserSecurityQuestionsStore, "findUserById" | "hasActiveSession" | "touchSessionPresence">;
  logger?: RealtimeLogger;
}

export async function handleLocationUpdate(
  sender: UpdateSender,
  payload: unknown,
  dependencies: HandleLocationUpdateDependencies
): Promise<LocationUpdateAck> {
  try {
    return await locationUpdateAck(sender, payload, dependencies);
  } catch (error) {
    dependencies.logger?.warn({ err: error }, "location update handler failed");
    return {
      ok: false,
      status: "rejected",
      code: SERVICE_UNAVAILABLE_CODE,
      message: "Location services are unavailable. Retry shortly."
    };
  }
}

async function locationUpdateAck(
  sender: UpdateSender,
  payload: unknown,
  dependencies: Pick<HandleLocationUpdateDependencies, "live" | "users">
): Promise<LocationUpdateAck> {
  const identity = sender.data;
  if (!identity?.userId || !identity.deviceId) {
    return { ok: false, status: "rejected", code: "UNAUTHORIZED", message: "Reconnect with a valid session." };
  }

  // Re-check live session and account status beyond the initial handshake so a logged-out,
  // deactivated, or newly suspended socket cannot keep streaming fixes over an old TCP pipe.
  if (dependencies.users) {
    const user = await dependencies.users.findUserById(identity.userId);
    if (!user || (identity.role && user.role !== identity.role)) {
      sender.disconnect(true);
      return { ok: false, status: "rejected", code: "UNAUTHORIZED", message: "Reconnect with a valid session." };
    }
    if (!user.isActive) {
      sender.disconnect(true);
      return { ok: false, status: "rejected", code: "ACCOUNT_INACTIVE", message: "This account is inactive. Contact an administrator." };
    }
    if (user.isSuspended) {
      sender.disconnect(true);
      return { ok: false, status: "rejected", code: "ACCOUNT_SUSPENDED", message: "This account is suspended. Contact an administrator." };
    }
    if (user.role !== "admin" && user.mustCompleteSecurityQuestions) {
      sender.disconnect(true);
      return { ok: false, status: "rejected", code: "SECURITY_QUESTIONS_REQUIRED", message: "Complete your security questions first." };
    }
    if (
      identity.sessionId &&
      !(await dependencies.users.hasActiveSession({
        userId: identity.userId,
        deviceId: identity.deviceId,
        sessionId: identity.sessionId
      }))
    ) {
      sender.disconnect(true);
      return { ok: false, status: "rejected", code: "UNAUTHORIZED", message: "Reconnect with a valid session." };
    }
  }

  const now = Date.now();
  const windowStart = sender.borobiyaUpdateWindowStart ?? 0;
  if (now - windowStart >= LOCATION_UPDATE_WINDOW_MS) {
    sender.borobiyaUpdateWindowStart = now;
    sender.borobiyaUpdateCount = 1;
  } else {
    const count = (sender.borobiyaUpdateCount ?? 0) + 1;
    sender.borobiyaUpdateCount = count;
    if (count > LOCATION_UPDATES_PER_MINUTE) {
      // TODO (SECURITY §10.1): auto-suspend after sustained spam needs the `suspendedUntil`
      // and `suspension_reason` columns, which are still an unchecked later task.
      return {
        ok: false,
        status: "rejected",
        code: "RATE_LIMITED",
        message: "Too many location updates. Slow the broadcast interval.",
        retryAfterMs: LOCATION_UPDATE_WINDOW_MS - (now - windowStart)
      };
    }
  }

  const result = await dependencies.live.applyUpdate({
    userId: identity.userId,
    deviceId: identity.deviceId,
    payload
  });

  if (result.status === "rejected") {
    return { ok: false, status: "rejected", code: result.code, message: result.message };
  }

  if (identity.sessionId && dependencies.users?.touchSessionPresence) {
    await dependencies.users.touchSessionPresence({
      userId: identity.userId,
      sessionId: identity.sessionId,
      deviceId: identity.deviceId,
      isOnline: true
    });
  }

  const update: PeerLocationUpdate = { userId: identity.userId, ...result.fix };
  for (const peerId of result.peers) {
    sender.to(userRoom(peerId)).emit(PEER_UPDATE_EVENT, update);
  }
  // Echo the accepted fix so the sender (and any other tab on the same account) can confirm
  // the server stored it, including when there is nobody to receive it yet.
  sender.to(userRoom(identity.userId)).emit(PEER_UPDATE_EVENT, update);

  return { ok: true, status: "accepted", peers: result.peers };
}

/** An explicit mission-location publish reuses all existing live GPS/session/device/rate checks. */
export async function publishMissionLocation(sender: UpdateSender, payload: unknown,
  dependencies: RealtimeDependencies): Promise<MissionLocationAck> {
  const parsed = missionLocationPublishSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, status: "rejected", code: "VALIDATION_ERROR", message: "Invalid mission location." };
  const { missionId, location } = parsed.data;
  const age = Date.now() - Date.parse(location.timestamp);
  if (age > 60_000 || age < -10_000) return {
    ok: false, status: "rejected", code: "INVALID_TIMESTAMP", message: "A live mission fix must be recent."
  };
  const identity = sender.data;
  if ((identity.role !== "user" && identity.role !== "admin") || !identity.userId || !dependencies.missions?.missionLocationRole) {
    return { ok: false, status: "rejected", code: "MISSION_UNAVAILABLE", message: "Mission unavailable." };
  }
  try {
    const role = await dependencies.missions.missionLocationRole(missionId, identity.userId, identity.role);
    if (!role) return { ok: false, status: "rejected", code: "MISSION_UNAVAILABLE", message: "Mission unavailable." };
    const accepted = await handleLocationUpdate(sender, location, dependencies);
    if (!accepted.ok) return accepted;
    // A cancellation may commit while the fix persists. Recheck immediately before fan-out
    // so an already-terminal mission cannot publish through a previously joined room.
    if (sender.connected === false || !sender.data.userId || sender.data.userId !== identity.userId ||
      !(await dependencies.missions.missionLocationRole(missionId, identity.userId, identity.role))) {
      return { ok: false, status: "rejected", code: "MISSION_UNAVAILABLE", message: "Mission unavailable." };
    }
    const event: MissionLocationEvent = { missionId, userId: identity.userId, role,
      lat: location.lat, lon: location.lon, accuracy: location.accuracy ?? null,
      timestamp: new Date().toISOString() };
    sender.to(missionRoom(missionId)).emit(MISSION_LOCATION_EVENT, event);
    sender.emit(MISSION_LOCATION_EVENT, event);
    return { ok: true, status: "accepted" };
  } catch (error) {
    dependencies.logger?.warn({ err: error }, "mission location publish failed");
    return { ok: false, status: "rejected", code: SERVICE_UNAVAILABLE_CODE,
      message: "Mission location is unavailable. Try again shortly." };
  }
}

/** The socket may be long-lived: recheck account and session before joining any private room. */
export async function joinMissionRoom(
  socket: Pick<Socket, "data" | "connected" | "join">,
  payload: unknown,
  dependencies: RealtimeDependencies
): Promise<MissionJoinAck> {
  const supplied = payload && typeof payload === "object" ? (payload as { missionId?: unknown }).missionId : undefined;
  const parsed = idSchema.safeParse(supplied);
  if (!parsed.success) return { ok: false, code: "INVALID_MISSION" };
  const identity = socket.data as Partial<RealtimeSocketData>;
  if (!identity.userId || !identity.sessionId || !identity.deviceId ||
    (identity.role !== "admin" && identity.role !== "user")) return { ok: false, code: "UNAUTHORIZED" };
  try {
    const user = await dependencies.users.findUserById(identity.userId);
    if (!user || !user.isActive || user.isSuspended || user.role !== identity.role ||
      (user.role !== "admin" && user.mustCompleteSecurityQuestions) ||
      !(await dependencies.users.hasActiveSession({ userId: identity.userId, sessionId: identity.sessionId, deviceId: identity.deviceId }))) {
      return { ok: false, code: "UNAUTHORIZED" };
    }
    if (!dependencies.missions?.canJoinMissionRoom ||
      !(await dependencies.missions.canJoinMissionRoom(parsed.data, identity.userId, identity.role))) {
      // No information about whether a foreign mission exists.
      return { ok: false, code: "MISSION_UNAVAILABLE" };
    }
    if (!socket.connected) return { ok: false, code: "UNAUTHORIZED" };
    await socket.join(missionRoom(parsed.data));
    return { ok: true };
  } catch (error) {
    dependencies.logger?.warn({ err: error }, "mission room subscription failed");
    return { ok: false, code: "SERVICE_UNAVAILABLE" };
  }
}

/** Wires the socket namespace onto an existing HTTP server (Fastify's `app.server`). */
export function attachRealtime(httpServer: HttpServer, dependencies: RealtimeDependencies): RealtimeServer {
  const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
    path: dependencies.path ?? "/socket.io",
    serveClient: false,
    pingInterval: PING_INTERVAL_MS,
    pingTimeout: PING_TIMEOUT_MS,
    cors: {
      ...(dependencies.corsOrigins && dependencies.corsOrigins.length > 0
        ? { origin: dependencies.corsOrigins, credentials: true }
        : {})
    }
  });

  io.use(createAuthMiddleware(dependencies));

  io.on("connection", (socket: Socket<ClientToServerEvents, ServerToClientEvents> & { data: Partial<RealtimeSocketData> }) => {
    const identity = socket.data;
    if (!identity.userId) {
      socket.disconnect(true);
      return;
    }
    void socket.join(userRoom(identity.userId));
    if (identity.sessionId) void socket.join(sessionRoom(identity.sessionId));
    if (identity.role === "admin") void socket.join(ADMIN_ROOM);

    if (identity.sessionId && identity.deviceId && dependencies.users.touchSessionPresence) {
      void dependencies.users
        .touchSessionPresence({
          userId: identity.userId,
          sessionId: identity.sessionId,
          deviceId: identity.deviceId,
          isOnline: true
        })
        .catch((error) => {
          dependencies.logger?.warn({ err: error }, "realtime session online update failed");
        });
    }

    socket.on("disconnect", () => {
      if (!identity.userId || !identity.sessionId || !identity.deviceId || !dependencies.users.touchSessionPresence) {
        return;
      }
      const userId = identity.userId;
      const sessionId = identity.sessionId;
      const deviceId = identity.deviceId;
      void io
        .in(sessionRoom(sessionId))
        .fetchSockets()
        .then((remaining) => {
          if (remaining.length > 0) return;
          return dependencies.users.touchSessionPresence?.({
            userId,
            sessionId,
            deviceId,
            isOnline: false
          });
        })
        .catch((error) => {
          dependencies.logger?.warn({ err: error }, "realtime session offline update failed");
        });
    });

    socket.on(MISSION_SUBSCRIBE_EVENT, async (payload: unknown, ack?: (response: MissionJoinAck) => void) => {
      const result = await joinMissionRoom(socket, payload, dependencies);
      if (typeof ack === "function") {
        try { ack(result); } catch (error) {
          dependencies.logger?.warn({ err: error }, "mission subscription ack failed");
        }
      }
    });

    socket.on(MISSION_LOCATION_PUBLISH_EVENT, async (payload: unknown, ack?: (response: MissionLocationAck) => void) => {
      const response = await publishMissionLocation(socket as unknown as UpdateSender, payload, dependencies);
      if (typeof ack === "function") {
        try { ack(response); } catch (error) {
          dependencies.logger?.warn({ err: error }, "mission location ack failed");
        }
      }
    });

    socket.on(LOCATION_UPDATE_EVENT, async (payload: unknown, ack?: (response: LocationUpdateAck) => void) => {
      const response = await handleLocationUpdate(socket as unknown as UpdateSender, payload, dependencies);
      if (typeof ack !== "function") return;
      try {
        ack(response);
      } catch (error) {
        // Delivering an ack to a socket that vanished mid-update must not outlive the process, and
        // there is no reply object left to fail here.
        dependencies.logger?.warn({ err: error }, "location update ack failed");
      }
    });
  });

  return {
    io,
    close: () =>
      new Promise<void>((resolve, reject) => {
        // `http.Server.close()` reports ERR_SERVER_NOT_RUNNING when the API never started
        // listening (Fastify inject tests build apps this way). That is a clean shutdown;
        // only a real listener's close error may reject.
        const wasListening = httpServer.listening;
        io.close((error) => {
          if (error && wasListening) reject(error);
          else resolve();
        });
      })
  };
}
