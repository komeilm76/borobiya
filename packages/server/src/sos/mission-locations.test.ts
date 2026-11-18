import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { registerMissionLocationRoutes, validRoutePolyline } from "./mission-locations";
import type { MissionLocationStore } from "../db/mission-location-store";

const missionId = randomUUID();
const requesterId = randomUUID();
const rescuerId = randomUUID();
const policy = { requesterId, rescuerId,
  rescuerVisibleToRequester: true, requesterVisibleToRescuer: false,
  adminVisibleToRequester: false, adminVisibleToRescuer: false };

async function setup(role: "user" | "admin", userId: string) {
  const app = Fastify();
  app.decorateRequest("authenticatedUser", null);
  app.addHook("preHandler", async (request) => {
    request.authenticatedUser = { userId, role, sessionId: randomUUID(), deviceId: randomUUID(),
      username: "test", isActive: true, isSuspended: false, mustCompleteSecurityQuestions: false,
      avgRating: null, createdAt: new Date() };
  });
  let currentPolicy = { ...policy };
  const store = { policy: vi.fn(async (_id: string, id: string, accountRole: string) =>
    accountRole === "admin" || id === requesterId || id === rescuerId ? currentPolicy : null),
  record: vi.fn(), saveSuggestedRoute: vi.fn(async () => true), setPolicy: vi.fn(async (_id: string, next: typeof policy) => {
    currentPolicy = { ...next, requesterId, rescuerId }; return currentPolicy;
  }),
  history: vi.fn(async (_id: string, id: string, accountRole: string) =>
    accountRole === "admin" || id === requesterId || id === rescuerId ?
      { points: [], nextCursor: null, suggestedRoute: null } : null) };
  const emitted: { room: string; event: string; payload: unknown }[] = [];
  registerMissionLocationRoutes(app, store as unknown as MissionLocationStore, {
    to(room: string) { return { emit(event: string, payload: unknown) { emitted.push({ room, event, payload }); } }; }
  });
  await app.ready();
  return { app, store, emitted };
}

describe("mission-only policy and completed trace API", () => {
  it("returns 404 for a nonmember even with a valid mission id", async () => {
    const { app, store } = await setup("user", randomUUID());
    for (const suffix of ["location-policy", "location-trace"]) {
      expect((await app.inject({ method: "GET", url: `/_user/missions/${missionId}/${suffix}` })).statusCode).toBe(404);
    }
    expect(store.setPolicy).not.toHaveBeenCalled();
    await app.close();
  });
  it("rejects malformed or foreign route saves; only the active assigned rescuer can persist one", async () => {
    const path = `/_user/missions/${missionId}/suggested-route`;
    const input = { profile: "foot", polyline: "_p~iF~ps|U_ulLnnqC_mqNvxq`@", distanceM: 1200 };
    expect(validRoutePolyline(input.polyline)).toBe(true);
    expect(validRoutePolyline("invalid")).toBe(false);
    const admin = await setup("admin", randomUUID());
    expect((await admin.app.inject({ method: "POST", url: path, payload: input })).statusCode).toBe(404);
    await admin.app.close();
    const rescuer = await setup("user", rescuerId);
    expect((await rescuer.app.inject({ method: "POST", url: path,
      payload: { ...input, polyline: "broken" } })).statusCode).toBe(400);
    expect((await rescuer.app.inject({ method: "POST", url: path, payload: input })).statusCode).toBe(204);
    expect(rescuer.store.saveSuggestedRoute).toHaveBeenCalledWith(missionId, rescuerId, input);
    await rescuer.app.close();
  });
  it("only admins can set four independent switches and notify the right member rooms", async () => {
    const path = `/_user/missions/${missionId}/location-policy`;
    const body = { rescuerVisibleToRequester: false, requesterVisibleToRescuer: true,
      adminVisibleToRequester: true, adminVisibleToRescuer: false };
    const user = await setup("user", requesterId);
    expect((await user.app.inject({ method: "PUT", url: path, payload: body })).statusCode).toBe(404);
    expect(user.store.setPolicy).not.toHaveBeenCalled();
    await user.app.close();
    const admin = await setup("admin", randomUUID());
    expect((await admin.app.inject({ method: "PUT", url: path,
      payload: { ...body, rescuerVisibleToRequester: "false" } })).statusCode).toBe(400);
    expect((await admin.app.inject({ method: "PUT", url: path, payload: body })).statusCode).toBe(200);
    expect(admin.store.setPolicy).toHaveBeenCalledWith(missionId, body);
    expect(admin.emitted.map((event) => event.room)).toEqual([`user:${requesterId}`, `user:${rescuerId}`]);
    expect(admin.emitted[0]?.payload).toMatchObject({ visibleRoles: ["requester", "admin"] });
    expect(admin.emitted[1]?.payload).toMatchObject({ visibleRoles: ["rescuer", "requester"] });
    await admin.app.close();
  });
});
