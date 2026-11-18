import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { MISSION_LOCATION_POLICY_EVENT, userRoom, type RoomEmitter } from "../realtime/socket";
import type { MissionLocationStore } from "../db/mission-location-store";

const params = z.object({ id: z.uuid() });
const policy = z.strictObject({
  rescuerVisibleToRequester: z.boolean(), requesterVisibleToRescuer: z.boolean(),
  adminVisibleToRequester: z.boolean(), adminVisibleToRescuer: z.boolean()
});
const error = (code: string) => ({ error: true, code, message: code === "MISSION_NOT_FOUND" ?
  "Mission not found." : "Invalid location policy.", issues: [] });

/** All endpoints inherit the /_user live-session guard. Admins use the same guard,
 * but only an admin may change another member's visibility. */
export function registerMissionLocationRoutes(app: FastifyInstance, store: MissionLocationStore, io?: RoomEmitter): void {
  app.get("/_user/missions/:id/location-policy", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = params.safeParse(request.params);
    const user = request.authenticatedUser;
    if (!parsed.success || !user) return reply.code(404).send(error("MISSION_NOT_FOUND"));
    const result = await store.policy(parsed.data.id, user.userId, user.role === "admin" ? "admin" : "user");
    if (!result) return reply.code(404).send(error("MISSION_NOT_FOUND"));
    return reply.send(result);
  });
  app.put("/_user/missions/:id/location-policy", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = params.safeParse(request.params);
    const user = request.authenticatedUser;
    if (!parsed.success || user?.role !== "admin") return reply.code(404).send(error("MISSION_NOT_FOUND"));
    const body = policy.safeParse(request.body);
    if (!body.success) return reply.code(400).send(error("VALIDATION_ERROR"));
    const updated = await store.setPolicy(parsed.data.id, body.data);
    if (!updated) return reply.code(404).send(error("MISSION_NOT_FOUND"));
    const members = await store.policy(parsed.data.id, user.userId, "admin");
    // Changes are already committed: notify each participant separately so a revoked
    // marker is erased rather than lingering until its GPS timestamp expires.
    if (members && io) {
      try {
        io.to(userRoom(members.requesterId)).emit(MISSION_LOCATION_POLICY_EVENT, {
          missionId: parsed.data.id, visibleRoles: ["requester",
            ...(updated.rescuerVisibleToRequester ? ["rescuer"] : []),
            ...(updated.adminVisibleToRequester ? ["admin"] : [])] });
        io.to(userRoom(members.rescuerId)).emit(MISSION_LOCATION_POLICY_EVENT, {
          missionId: parsed.data.id, visibleRoles: ["rescuer",
            ...(updated.requesterVisibleToRescuer ? ["requester"] : []),
            ...(updated.adminVisibleToRescuer ? ["admin"] : [])] });
      } catch (err) { request.log.warn({ err }, "mission location policy notice failed"); }
    }
    return reply.send(updated);
  });
  app.get("/_user/missions/:id/location-trace", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = params.safeParse(request.params);
    const user = request.authenticatedUser;
    if (!parsed.success || !user) return reply.code(404).send(error("MISSION_NOT_FOUND"));
    // A bounded snapshot; clients must not interpret a truncated trace as complete.
    const points = await store.history(parsed.data.id, user.userId, user.role === "admin" ? "admin" : "user", 10_000);
    if (!points) return reply.code(404).send(error("MISSION_NOT_FOUND"));
    return reply.send({ points, truncated: points.length === 10_000 });
  });
}
