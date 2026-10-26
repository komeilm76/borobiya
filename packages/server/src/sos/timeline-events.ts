import type { OutgoingHttpHeaders } from "node:http";
import type { FastifyInstance } from "fastify";
import { idSchema } from "@borobiya/shared";
import type { MissionProgressStore } from "../db/mission-progress-store";
import type { UserSecurityQuestionsStore } from "../db/security-questions-store";
import { verifyAccessToken } from "../security/tokens";

/** Transport-only invalidation stream (not an OpenAPI JSON operation). No GPS, timeline rows or credentials. */
export const TIMELINE_EVENTS_PATH = "/_user/sos/missions/:id/timeline/events";
const MAX_CONNECTIONS_PER_SESSION = 2;
const MAX_STREAM_MS = 14 * 60_000; // reconnect with a new short-lived access token before expiry
const DEFAULT_POLL_MS = 15_000;

export function registerMissionTimelineEvents(app: FastifyInstance, dependencies: {
  store: Pick<MissionProgressStore, "findTimeline">;
  sessions: Pick<UserSecurityQuestionsStore, "findUserById" | "hasActiveSession">;
  jwtSecret: string;
  /** Short interval for integration tests only. */
  pollMs?: number;
}): void {
  const active = new Map<string, number>();
  const dispose = new Set<() => void>();
  app.addHook("onClose", async () => { for (const stop of [...dispose]) stop(); });
  app.get(TIMELINE_EVENTS_PATH, async (request, reply) => {
    // The shared /_user pre-handler has already checked the JWT, persisted session and onboarding.
    const user = request.authenticatedUser;
    if (!user) return reply.code(401).send({ error: true, code: "UNAUTHORIZED", message: "Authentication required.", issues: [] });
    const id = idSchema.safeParse((request.params as { id?: unknown }).id);
    const missionId = id.success ? id.data : null;
    const timeline = missionId ? await dependencies.store.findTimeline?.(missionId, user.userId,
      user.role === "admin" ? "admin" : "user") : null;
    if (!timeline) return reply.code(404).send({ error: true, code: "MISSION_NOT_FOUND", message: "Mission not found.", issues: [] });

    const sessionId = user.sessionId;
    if ((active.get(sessionId) ?? 0) >= MAX_CONNECTIONS_PER_SESSION) {
      return reply.code(429).send({ error: true, code: "RATE_LIMITED", message: "Too many live mission streams.", issues: [] });
    }
    active.set(sessionId, (active.get(sessionId) ?? 0) + 1);
    const token = /^Bearer\s+([^\s]+)$/i.exec(request.headers.authorization?.trim() ?? "")?.[1] ?? "";
    let last = JSON.stringify(timeline);
    let closed = false;
    let busy = false;
    let interval: ReturnType<typeof setInterval>;
    let deadline: ReturnType<typeof setTimeout>;
    const stop = () => {
      if (closed) return;
      closed = true;
      clearInterval(interval);
      clearTimeout(deadline);
      dispose.delete(stop);
      reply.raw.off("close", stop);
      const remaining = (active.get(sessionId) ?? 1) - 1;
      if (remaining > 0) active.set(sessionId, remaining);
      else active.delete(sessionId);
      if (!reply.raw.destroyed) reply.raw.end();
    };
    // Keep headers set by the security/CORS plugins even though this handler uses raw streaming.
    reply.header("cache-control", "no-store, no-transform");
    reply.header("x-accel-buffering", "no");
    reply.hijack();
    reply.raw.writeHead(200, { ...(reply.getHeaders() as OutgoingHttpHeaders),
      "content-type": "text/event-stream; charset=utf-8", connection: "keep-alive" });
    const write = (text: string) => { if (!closed && !reply.raw.write(text)) stop(); };
    reply.raw.on("close", stop);
    dispose.add(stop);
    write(`event: refresh\ndata: ${JSON.stringify({ missionId })}\n\n`);
    if (closed) return;
    deadline = setTimeout(stop, MAX_STREAM_MS);
    deadline.unref?.();
    interval = setInterval(() => { void (async () => {
      if (closed || busy) return;
      busy = true;
      try {
        // Revocation/role change may occur while an HTTP response is open. A stream is not
        // an indefinite grant: recheck JWT expiry, account, session and mission ownership.
        const identity = await verifyAccessToken(token, dependencies.jwtSecret);
        const account = identity?.userId === user.userId && identity.sessionId === sessionId &&
          identity.deviceId === user.deviceId && identity.role === user.role
          ? await dependencies.sessions.findUserById(user.userId) : null;
        if (!account || !account.isActive || account.isSuspended || account.role !== user.role ||
            (account.role !== "admin" && account.mustCompleteSecurityQuestions) ||
            !(await dependencies.sessions.hasActiveSession({ userId: user.userId, sessionId,
              deviceId: user.deviceId }))) { stop(); return; }
        const next = await dependencies.store.findTimeline?.(missionId!, user.userId,
          user.role === "admin" ? "admin" : "user");
        if (!next) { stop(); return; }
        const signature = JSON.stringify(next);
        if (signature !== last) {
          last = signature;
          write(`event: refresh\ndata: ${JSON.stringify({ missionId })}\n\n`);
        } else write(": keepalive\n\n");
      } catch (error) {
        request.log.warn({ err: error }, "Mission stream validation failed");
        stop(); // never stream stale or unauthorized information after a failed recheck
      } finally { busy = false; }
    })(); }, dependencies.pollMs ?? DEFAULT_POLL_MS);
    interval.unref?.();
  });
}
