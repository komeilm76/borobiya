import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { MissionProgressStore } from "../db/mission-progress-store";
import { registerMissionProgressRoutes } from "./mission-progress";
import { MISSION_STATUS_UPDATED_EVENT, missionRoom, userRoom, type RoomEmitter } from "../realtime/socket";
import { missionStatusUpdatedEventSchema } from "@borobiya/shared";

const missionId = randomUUID();
const rescuerId = randomUUID();
const requesterId = randomUUID();
const now = new Date("2026-10-24T12:00:00Z").toISOString();
const mission = {
  id: missionId, sosRequestId: randomUUID(), rescuerId, requesterId,
  status: "on_the_way" as const, cancelledBy: null, cancellationReasonId: null,
  cancellationCustomText: null, cancelledAt: null, createdAt: now, updatedAt: now
};

async function appFor(result: Awaited<ReturnType<MissionProgressStore["advanceStatus"]>>, signedIn = true, io?: RoomEmitter) {
  const app = Fastify({ logger: false });
  const advanceStatus = vi.fn(async () => result);
  app.addHook("onRequest", async (request) => {
    request.authenticatedUser = signedIn ? {
      userId: rescuerId, role: "user", sessionId: randomUUID(), deviceId: randomUUID(),
      username: "rescuer", isActive: true, isSuspended: false,
      mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date()
    } : null;
  });
  await registerMissionProgressRoutes(app, { advanceStatus }, io);
  await app.ready();
  return { app, advanceStatus };
}

describe("PATCH /_user/missions/:id/status", () => {
  it("advances a rescuer-owned mission with a no-store response", async () => {
    const { app, advanceStatus } = await appFor({ status: "updated", mission });
    try {
      const result = await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`, payload: { status: "on_the_way" } });
      expect(result.statusCode).toBe(200);
      expect(result.headers["cache-control"]).toBe("no-store");
      expect(result.json()).toEqual(mission);
      expect(advanceStatus).toHaveBeenCalledWith(missionId, rescuerId, "on_the_way");
    } finally { await app.close(); }
  });

  it("keeps unknown or foreign missions indistinguishable and refuses skipped steps", async () => {
    const { app, advanceStatus } = await appFor({ status: "not_found" });
    try {
      const missing = await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`, payload: { status: "arrived" } });
      expect(missing.statusCode).toBe(404);
      expect(missing.json().code).toBe("MISSION_NOT_FOUND");
      expect((await app.inject({ method: "PATCH", url: "/_user/missions/not-a-uuid/status", payload: { status: "arrived" } })).statusCode).toBe(404);
      expect((await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`, payload: { status: "invented" } })).statusCode).toBe(400);
      expect(advanceStatus).toHaveBeenCalledTimes(1);
    } finally { await app.close(); }
  });

  it("returns a conflict for an invalid transition, not an untrue success", async () => {
    const { app } = await appFor({ status: "invalid_transition", currentStatus: "pending" });
    try {
      const result = await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`, payload: { status: "completed" } });
      expect(result.statusCode).toBe(409);
      expect(result.json().code).toBe("INVALID_MISSION_TRANSITION");
    } finally { await app.close(); }
  });

  it("broadcasts one event to the union of participant, admin and mission rooms after commit", async () => {
    const emitted: Array<{ rooms: string[]; event: string; payload: unknown }> = [];
    const io: RoomEmitter = { to: (rooms) => ({ emit: (event, payload) => {
      emitted.push({ rooms: rooms as unknown as string[], event, payload });
    } }) };
    const { app } = await appFor({ status: "updated", mission }, true, io);
    try {
      const reply = await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`, payload: { status: "on_the_way" } });
      expect(reply.statusCode).toBe(200);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]?.rooms).toEqual([missionRoom(missionId), userRoom(requesterId), userRoom(rescuerId), "admin"]);
      expect(emitted[0]?.event).toBe(MISSION_STATUS_UPDATED_EVENT);
      expect(missionStatusUpdatedEventSchema.parse(emitted[0]?.payload)).toEqual({
        missionId, status: "on_the_way", by: rescuerId, at: now
      });
    } finally { await app.close(); }
  });

  it("acknowledges a committed update even when the socket broadcast fails", async () => {
    const io: RoomEmitter = { to: () => ({ emit: () => { throw new Error("socket unavailable"); } }) };
    const { app } = await appFor({ status: "updated", mission }, true, io);
    try {
      expect((await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`, payload: { status: "on_the_way" } })).statusCode).toBe(200);
    } finally { await app.close(); }
  });

  it("does not broadcast a same-step retry or invalid transition", async () => {
    const emit = vi.fn();
    const io: RoomEmitter = { to: () => ({ emit }) };
    const { app } = await appFor({ status: "unchanged", mission }, true, io);
    try {
      expect((await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`, payload: { status: "on_the_way" } })).statusCode).toBe(200);
      expect(emit).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it("never reaches the store for an unauthenticated caller", async () => {
    const { app, advanceStatus } = await appFor({ status: "updated", mission }, false);
    try {
      expect((await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`, payload: { status: "on_the_way" } })).statusCode).toBe(401);
      expect(advanceStatus).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
