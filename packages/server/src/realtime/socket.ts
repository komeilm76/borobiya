import type { Server as HttpServer } from "node:http";
import { Server, type Socket } from "socket.io";
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
export const LOCATION_UPDATE_EVENT = "location:update";
export const PEER_UPDATE_EVENT = "location:peer-update";

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
  /** Allowed browser origins for the WebSocket handshake; omitted means same-origin only. */
  corsOrigins?: string[];
  /** Where a swallowed dependency failure is reported; socket handlers have no HTTP reply to fail. */
  logger?: RealtimeLogger;
  path?: string;
}

export interface RealtimeServer {
  io: Server;
  close(): Promise<void>;
}

function socketError(code: string, message: string): Error & { data: { code: string } } {
  return Object.assign(new Error(message), { data: { code } });
}

export function userRoom(userId: string): string {
  return `user:${userId}`;
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
  if (user.mustCompleteSecurityQuestions) {
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
  borobiyaUpdateCount?: number;
  borobiyaUpdateWindowStart?: number;
}

export interface LocationUpdateAck {
  ok: boolean;
  status: "accepted" | "rejected";
  code?: string;
  message?: string;
  peers?: string[];
  retryAfterMs?: number;
}

/**
 * Handles one `location:update` from an authenticated socket: per-connection throttle,
 * priority-device verification, persistence, and fan-out to every accepting peer.
 */
/**
 * Handles one update and always resolves: the caller is an event listener with no reply object, and
 * a rejected promise there would be an unhandled rejection that takes the process down.
 */
export async function handleLocationUpdate(
  sender: UpdateSender,
  payload: unknown,
  dependencies: Pick<RealtimeDependencies, "live" | "logger">
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
  dependencies: Pick<RealtimeDependencies, "live">
): Promise<LocationUpdateAck> {
  const identity = sender.data;
  if (!identity?.userId || !identity.deviceId) {
    return { ok: false, status: "rejected", code: "UNAUTHORIZED", message: "Reconnect with a valid session." };
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

  const update: PeerLocationUpdate = { userId: identity.userId, ...result.fix };
  for (const peerId of result.peers) {
    sender.to(userRoom(peerId)).emit(PEER_UPDATE_EVENT, update);
  }
  // Echo the accepted fix so the sender (and any other tab on the same account) can confirm
  // the server stored it, including when there is nobody to receive it yet.
  sender.to(userRoom(identity.userId)).emit(PEER_UPDATE_EVENT, update);

  return { ok: true, status: "accepted", peers: result.peers };
}

/** Wires the socket namespace onto an existing HTTP server (Fastify's `app.server`). */
export function attachRealtime(httpServer: HttpServer, dependencies: RealtimeDependencies): RealtimeServer {
  const io = new Server(httpServer, {
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

  io.on("connection", (socket: Socket & { data: Partial<RealtimeSocketData> }) => {
    const identity = socket.data;
    if (!identity.userId) {
      socket.disconnect(true);
      return;
    }
    void socket.join(userRoom(identity.userId));
    if (identity.role === "admin") void socket.join("admin");

    socket.on(LOCATION_UPDATE_EVENT, async (payload: unknown, ack?: (response: LocationUpdateAck) => void) => {
      const response = await handleLocationUpdate(socket as unknown as UpdateSender, payload, dependencies);
      if (typeof ack === "function") ack(response);
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
