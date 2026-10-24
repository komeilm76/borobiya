import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import type { SosCancellationStore } from "../db/sos-cancellation-store";
import { MISSION_CANCELLED_BY_RESCUER_EVENT, type RoomEmitter } from "../realtime/socket";
import { registerSosCancellationRoutes } from "./cancellation";

const userId = randomUUID();
const requesterId = randomUUID();
const sosId = randomUUID();
const missionId = randomUUID();
const reasonId = randomUUID();
const at = "2026-10-24T12:00:00.000Z";
const notice = { missionId, sosRequestId: sosId, requesterId, rescuerId: userId, reason: "Unable to reach",
  rescuerLocation: { lat: 35.7, lon: 51.4 }, at, reviewRequired: false };

async function appFor(status: Awaited<ReturnType<SosCancellationStore["cancelMissionAsRescuer"]>>,
  io?: RoomEmitter, signedIn = true) {
  const app = Fastify({ logger: false });
  const cancelMissionAsRescuer = vi.fn(async () => status);
  app.addHook("onRequest", async (request) => {
    request.authenticatedUser = signedIn ? {
      userId, role: "user", sessionId: randomUUID(), deviceId: randomUUID(),
      username: "rescuer", isActive: true, isSuspended: false,
      mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date()
    } : null;
  });
  await registerSosCancellationRoutes(app, {
    listReasons: async () => [], cancelUnaccepted: async () => ({ status: "not_found" }), cancelMissionAsRescuer
  }, io);
  await app.ready();
  return { app, cancelMissionAsRescuer };
}

const url = `/_user/missions/${missionId}/cancel`;
const payload = { cancellationReasonId: reasonId };

describe("rescuer mission cancellation route", () => {
  it("acknowledges committed cancellation even if a recipient broadcast fails", async () => {
    const emitted: Array<{ room: unknown; event: string; payload: unknown }> = [];
    const io: RoomEmitter = { to: (room) => ({ emit: (event, sent) => {
      if (room === "admin") throw new Error("socket unavailable");
      emitted.push({ room, event, payload: sent });
    } }) };
    const { app, cancelMissionAsRescuer } = await appFor({ status: "cancelled", notice }, io);
    try {
      const response = await app.inject({ method: "POST", url, payload });
      expect(response.statusCode).toBe(200);
      expect(response.body).toBe("");
      expect(cancelMissionAsRescuer).toHaveBeenCalledWith(missionId, userId, payload);
      expect(emitted).toHaveLength(1);
      expect(emitted[0]?.room).toEqual([`user:${requesterId}`, `user:${userId}`]);
      expect(emitted[0]?.event).toBe(MISSION_CANCELLED_BY_RESCUER_EVENT);
      expect(emitted[0]?.payload).not.toHaveProperty("rescuerLocation");
    } finally { await app.close(); }
  });

  it("never repeats a broadcast for a same-step retry or for a foreign mission", async () => {
    const emit = vi.fn();
    const io: RoomEmitter = { to: () => ({ emit }) };
    const { app } = await appFor({ status: "unchanged" }, io);
    try {
      expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(200);
      expect(emit).not.toHaveBeenCalled();
    } finally { await app.close(); }
    const foreign = await appFor({ status: "not_found" }, io);
    try {
      const response = await foreign.app.inject({ method: "POST", url, payload });
      expect(response.statusCode).toBe(404);
      expect(response.json().code).toBe("MISSION_NOT_FOUND");
      expect(emit).not.toHaveBeenCalled();
    } finally { await foreign.app.close(); }
  });

  it("rejects invalid input before storage and never lets unauthenticated callers spend the budget", async () => {
    const { app, cancelMissionAsRescuer } = await appFor({ status: "not_active" });
    try {
      expect((await app.inject({ method: "POST", url: "/_user/missions/not-a-uuid/cancel", payload })).statusCode).toBe(404);
      expect((await app.inject({ method: "POST", url, payload: { cancellationReasonId: "bogus" } })).statusCode).toBe(400);
      expect(cancelMissionAsRescuer).not.toHaveBeenCalled();
      expect((await app.inject({ method: "POST", url, payload })).statusCode).toBe(409);
    } finally { await app.close(); }
    const guest = await appFor({ status: "cancelled", notice }, undefined, false);
    try {
      expect((await guest.app.inject({ method: "POST", url, payload })).statusCode).toBe(401);
      expect(guest.cancelMissionAsRescuer).not.toHaveBeenCalled();
    } finally { await guest.app.close(); }
  });
});
