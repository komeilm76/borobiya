import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { MissionTimeline } from "@borobiya/shared";
import { signAccessToken, verifyAccessToken } from "../security/tokens";
import { registerMissionTimelineEvents, TIMELINE_EVENTS_PATH } from "./timeline-events";

const secret = "s".repeat(48);
const missionId = randomUUID();
const userId = randomUUID();
const deviceId = randomUUID();
const sessionId = randomUUID();
const url = TIMELINE_EVENTS_PATH.replace(":id", missionId);
const row: MissionTimeline[number] = { id: randomUUID(), missionId, fromStatus: null, toStatus: "pending",
  changedBy: userId, createdAt: new Date().toISOString() };

async function harness() {
  const app = Fastify({ logger: false });
  let allowed = true;
  let activeSession = true;
  let timeline: MissionTimeline = [row];
  const read = vi.fn(async (id: string, caller: string) => id === missionId && caller === userId ? timeline : null);
  const token = await signAccessToken({ userId, deviceId, sessionId, role: "user" }, secret);
  app.decorateRequest("authenticatedUser", null);
  app.addHook("preHandler", async (request) => {
    const input = /^Bearer\s+(.+)$/.exec(request.headers.authorization ?? "")?.[1];
    const claims = input ? await verifyAccessToken(input, secret) : null;
    request.authenticatedUser = claims ? { ...claims, username: "responder", isActive: true,
      isSuspended: false, mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date() } : null;
  });
  registerMissionTimelineEvents(app, { store: { findTimeline: read }, sessions: {
    async findUserById() { return allowed ? { role: "user" as const, isActive: true, isSuspended: false,
      mustCompleteSecurityQuestions: false, id: userId, username: "responder", avgRating: null, createdAt: new Date() } : null; },
    async hasActiveSession() { return activeSession; }
  }, jwtSecret: secret, pollMs: 30 });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  if (!address || typeof address === "string") throw new Error("No listener");
  return { app, token, read, base: `http://127.0.0.1:${address.port}`,
    changeTimeline(next: MissionTimeline) { timeline = next; },
    revoke() { activeSession = false; },
    deactivate() { allowed = false; } };
}

async function nextFrame(reader: ReadableStreamDefaultReader<Uint8Array>) {
  // One frame fits in one write, but a TCP read may split it; preserve frames between chunks.
  let text = "";
  for (let i = 0; i < 10; i++) {
    const { value, done } = await reader.read();
    if (done) return text;
    text += new TextDecoder().decode(value);
    if (text.includes("\n\n")) return text;
  }
  throw new Error("No SSE frame");
}

describe("private mission timeline SSE transport", () => {
  it("rejects missing credentials, foreign/invalid missions, and caps streams per persisted session", async () => {
    const h = await harness();
    const controllers = [new AbortController(), new AbortController()];
    try {
      const unauthorized = await fetch(h.base + url);
      expect(unauthorized.status).toBe(401);
      const foreign = await fetch(h.base + url.replace(missionId, randomUUID()), {
        headers: { authorization: `Bearer ${h.token}` }
      });
      expect(foreign.status).toBe(404);
      const invalid = await fetch(h.base + url.replace(missionId, "bad"), {
        headers: { authorization: `Bearer ${h.token}` }
      });
      expect(invalid.status).toBe(404);
      const requests = await Promise.all(controllers.map((controller) => fetch(h.base + url, {
        headers: { authorization: `Bearer ${h.token}` }, signal: controller.signal
      })));
      expect(requests.map((response) => response.status)).toEqual([200, 200]);
      const limited = await fetch(h.base + url, { headers: { authorization: `Bearer ${h.token}` } });
      expect(limited.status).toBe(429);
    } finally { controllers.forEach((controller) => controller.abort()); await h.app.close(); }
  });

  it("ends an open stream on account deactivation without disclosing later changes", async () => {
    const h = await harness();
    const controller = new AbortController();
    try {
      const response = await fetch(h.base + url, {
        headers: { authorization: `Bearer ${h.token}` }, signal: controller.signal
      });
      expect(response.status).toBe(200);
      const reader = response.body!.getReader();
      expect(await nextFrame(reader)).toContain("event: refresh");
      h.deactivate();
      h.changeTimeline([row, { ...row, id: randomUUID(), toStatus: "completed" }]);
      let output = "";
      for (let i = 0; i < 5; i++) {
        const part = await reader.read();
        if (part.done) break;
        output += new TextDecoder().decode(part.value);
      }
      expect(output).not.toContain("event: refresh");
      expect(h.read).toHaveBeenCalledTimes(1); // no scoped timeline read after deactivation
    } finally { controller.abort(); await h.app.close(); }
  });

  it("emits only invalidations when scoped rows change, and ends on session revocation", async () => {
    const h = await harness();
    const controller = new AbortController();
    try {
      const response = await fetch(h.base + url, {
        headers: { authorization: `Bearer ${h.token}` }, signal: controller.signal
      });
      expect(response.status).toBe(200);
      expect(response.headers.get("cache-control")).toContain("no-store");
      expect(response.headers.get("x-accel-buffering")).toBe("no");
      const reader = response.body!.getReader();
      const first = await nextFrame(reader);
      expect(first).toContain(`data: {"missionId":"${missionId}"}`);
      expect(first).not.toContain(row.changedBy);
      h.changeTimeline([row, { ...row, id: randomUUID(), toStatus: "arrived" }]);
      await vi.waitFor(() => expect(h.read.mock.calls.length).toBeGreaterThan(1));
      let changed = "";
      // Keepalive frames may arrive between the first and the changed snapshot.
      for (let i = 0; i < 5 && !changed.includes("event: refresh"); i++) changed = await nextFrame(reader);
      expect(changed).toContain(`data: {"missionId":"${missionId}"}`);
      h.revoke();
      let finished = false;
      for (let i = 0; i < 6; i++) {
        if ((await reader.read()).done) { finished = true; break; }
      }
      expect(finished).toBe(true);
    } finally { controller.abort(); await h.app.close(); }
  });
});
