import { randomUUID } from "node:crypto";
import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { MissionProgressStore, MissionRatingResult } from "../db/mission-progress-store";
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

async function appFor(result: Awaited<ReturnType<MissionProgressStore["advanceStatus"]>>, signedIn = true, io?: RoomEmitter, rating: MissionRatingResult = "rated", role: "user" | "admin" = "user") {
  const app = Fastify({ logger: false });
  const advanceStatus = vi.fn(async () => result);
  const rateMission = vi.fn(async () => rating);
  app.addHook("onRequest", async (request) => {
    request.authenticatedUser = signedIn ? {
      userId: rescuerId, role, sessionId: randomUUID(), deviceId: randomUUID(),
      username: "rescuer", isActive: true, isSuspended: false,
      mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date()
    } : null;
  });
  await registerMissionProgressRoutes(app, {
    advanceStatus, rateMission, findMission: async () => null, findNavigationTarget: async () => null,
    listMissions: async (_id, _role, page, limit) => ({ items: [], total: 0, page, limit, totalPages: 0 })
  }, io);
  await app.ready();
  return { app, advanceStatus, rateMission };
}

describe("PATCH /_user/missions/:id/status", () => {
  it("fails closed for foreign and terminal mission presence, and never returns locations", async () => {
    const app = Fastify({ logger: false });
    let caller = requesterId;
    const findActiveMissionPresence = vi.fn(async (_id: string, user: string) =>
      user === requesterId ? { missionId, requester: { online: false, lastSeenAt: now },
        rescuer: { online: true, lastSeenAt: now } } : null);
    app.addHook("onRequest", async (request) => {
      request.authenticatedUser = { userId: caller, role: "user", sessionId: randomUUID(), deviceId: randomUUID(),
        username: "participant", isActive: true, isSuspended: false,
        mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date() };
    });
    await registerMissionProgressRoutes(app, {
      advanceStatus: async () => ({ status: "not_found" }), findMission: async () => null,
      listMissions: async (_id, _role, page, limit) => ({ items: [], total: 0, page, limit, totalPages: 0 }),
      findNavigationTarget: async () => null, findActiveMissionPresence
    });
    try {
      const url = `/_user/sos/missions/${missionId}/presence`;
      const own = await app.inject({ method: "GET", url });
      expect(own.statusCode).toBe(200);
      expect(own.headers["cache-control"]).toBe("no-store");
      expect(own.json()).toEqual({ missionId, requester: { online: false, lastSeenAt: now },
        rescuer: { online: true, lastSeenAt: now } });
      caller = randomUUID();
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/_user/sos/missions/invalid/presence" })).statusCode).toBe(404);
      expect(findActiveMissionPresence).toHaveBeenCalledTimes(2);
    } finally { await app.close(); }
  });

  it("authorizes navigation coordinates only for the assigned active rescuer", async () => {
    const app = Fastify({ logger: false });
    let currentUser = rescuerId;
    let role: "user" | "admin" = "user";
    const findNavigationTarget = vi.fn(async (_id: string, userId: string) => userId === rescuerId
      ? { missionId, incident: { lat: 35.7, lon: 51.4 } } : null);
    app.addHook("onRequest", async (request) => {
      request.authenticatedUser = {
        userId: currentUser, role, sessionId: randomUUID(), deviceId: randomUUID(),
        username: "rescuer", isActive: true, isSuspended: false,
        mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date()
      };
    });
    await registerMissionProgressRoutes(app, {
      advanceStatus: async () => ({ status: "not_found" }), findMission: async () => null,
      listMissions: async (_id, _role, page, limit) => ({ items: [], total: 0, page, limit, totalPages: 0 }),
      findNavigationTarget
    });
    try {
      const url = `/_user/sos/missions/${missionId}/navigation`;
      const own = await app.inject({ method: "GET", url });
      expect(own.statusCode).toBe(200);
      expect(own.headers["cache-control"]).toBe("no-store");
      expect(own.json()).toEqual({ missionId, incident: { lat: 35.7, lon: 51.4 } });
      currentUser = requesterId;
      const foreign = await app.inject({ method: "GET", url });
      expect(foreign.statusCode).toBe(404);
      expect(foreign.json().code).toBe("MISSION_NOT_FOUND");
      expect((await app.inject({ method: "GET", url: "/_user/sos/missions/not-a-uuid/navigation" })).statusCode).toBe(404);
      role = "admin";
      expect((await app.inject({ method: "GET", url })).statusCode).toBe(404);
      expect(findNavigationTarget).toHaveBeenCalledTimes(2);
    } finally { await app.close(); }
  });

  it("refuses an admin even if that account ID is still assigned as the rescuer", async () => {
    const { app, advanceStatus } = await appFor({ status: "updated", mission }, true, undefined, "rated", "admin");
    try {
      const result = await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`, payload: { status: "on_the_way" } });
      expect(result.statusCode).toBe(404);
      expect(result.json().code).toBe("MISSION_NOT_FOUND");
      expect(advanceStatus).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it("never caches a mission list used to verify an uncertain status update", async () => {
    const { app } = await appFor({ status: "not_found" });
    try {
      const result = await app.inject({ method: "GET", url: "/_user/sos/missions?role=rescuer&page=1&limit=20" });
      expect(result.statusCode).toBe(200);
      expect(result.headers["cache-control"]).toBe("no-store");
    } finally { await app.close(); }
  });

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


describe("POST /_user/missions/:id/rate", () => {
  const url = `/_user/missions/${missionId}/rate`;
  it("rejects unauthenticated, invalid, and malformed requests before reaching storage", async () => {
    const { app: anonymous, rateMission: anonymousWrite } = await appFor({ status: "not_found" }, false);
    try {
      const reply = await anonymous.inject({ method: "POST", url, payload: { rating: 5 } });
      expect(reply.statusCode).toBe(401);
      expect(reply.headers["cache-control"]).toBe("no-store");
      expect(anonymousWrite).not.toHaveBeenCalled();
    } finally { await anonymous.close(); }
    const { app, rateMission } = await appFor({ status: "not_found" });
    try {
      for (const payload of [
        { rating: 0 }, { rating: 6 }, { rating: 2.5 }, { rating: "5" },
        { rating: 5, comment: "x".repeat(501) }, { rating: 5, unwanted: true }
      ]) {
        const reply = await app.inject({ method: "POST", url, payload });
        expect(reply.statusCode).toBe(400);
        expect(reply.json().code).toBe("VALIDATION_ERROR");
      }
      expect((await app.inject({ method: "POST", url: "/_user/missions/bad-id/rate", payload: { rating: 5 } })).statusCode).toBe(404);
      expect(rateMission).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });

  it("trims comments, returns an empty success and maps ownership/state/duplicate outcomes", async () => {
    for (const [result, status, code] of [
      ["rated", 200, null], ["not_found", 404, "MISSION_NOT_FOUND"],
      ["not_completed", 409, "MISSION_NOT_COMPLETED"],
      ["already_rated", 409, "MISSION_ALREADY_RATED"]
    ] as const) {
      const { app, rateMission } = await appFor({ status: "not_found" }, true, undefined, result);
      try {
        const reply = await app.inject({ method: "POST", url, payload: { rating: 5, comment: "  thanks  " } });
        expect(reply.statusCode).toBe(status);
        expect(reply.headers["cache-control"]).toBe("no-store");
        if (code) expect(reply.json().code).toBe(code);
        else expect(reply.body).toBe("");
        expect(rateMission).toHaveBeenCalledWith(missionId, rescuerId, { rating: 5, comment: "thanks" });
      } finally { await app.close(); }
    }
  });
});
