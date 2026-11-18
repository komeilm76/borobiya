import { z } from "zod";
import type { FastifyInstance } from "fastify";
import { MISSION_LOCATION_POLICY_EVENT, userRoom, type RoomEmitter } from "../realtime/socket";
import type { MissionLocationStore } from "../db/mission-location-store";

const params = z.object({ id: z.uuid() });
const policy = z.strictObject({
  rescuerVisibleToRequester: z.boolean(), requesterVisibleToRescuer: z.boolean(),
  adminVisibleToRequester: z.boolean(), adminVisibleToRescuer: z.boolean()
});
/** OSRM polyline5 grammar and geodetic bounds; reject corrupted/unbounded previews at the boundary. */
export function validRoutePolyline(encoded: string): boolean {
  if (!encoded || encoded.length > 200_000) return false;
  let index = 0, lat = 0, lon = 0, count = 0;
  const delta = (): number | null => {
    let shift = 0, value = 0;
    while (index < encoded.length && shift <= 30) {
      const part = encoded.charCodeAt(index++) - 63;
      if (part < 0 || part > 63) return null;
      value += (part & 31) * 2 ** shift;
      shift += 5;
      if (part < 32) return value & 1 ? -(Math.floor(value / 2) + 1) : Math.floor(value / 2);
    }
    return null;
  };
  while (index < encoded.length && count++ < 30_000) {
    const a = delta(), b = delta();
    if (a === null || b === null) return false;
    lat += a; lon += b;
    if (Math.abs(lat) > 9_000_000 || Math.abs(lon) > 18_000_000) return false;
  }
  return count >= 2 && index === encoded.length;
}
const suggested = z.strictObject({
  profile: z.enum(["car", "bicycle", "foot"]),
  polyline: z.string().refine(validRoutePolyline),
  distanceM: z.number().finite().min(0).max(2_000_000)
});
const traceQuery = z.object({ cursor: z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional() });
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
  app.post("/_user/missions/:id/suggested-route", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = params.safeParse(request.params);
    const user = request.authenticatedUser;
    if (!parsed.success || user?.role !== "user") return reply.code(404).send(error("MISSION_NOT_FOUND"));
    const body = suggested.safeParse(request.body);
    if (!body.success) return reply.code(400).send(error("VALIDATION_ERROR"));
    if (!(await store.saveSuggestedRoute(parsed.data.id, user.userId, body.data))) {
      return reply.code(404).send(error("MISSION_NOT_FOUND"));
    }
    return reply.code(204).send();
  });
  app.get("/_user/missions/:id/location-trace", async (request, reply) => {
    reply.header("cache-control", "no-store");
    const parsed = params.safeParse(request.params);
    const query = traceQuery.safeParse(request.query);
    const user = request.authenticatedUser;
    if (!parsed.success || !user) return reply.code(404).send(error("MISSION_NOT_FOUND"));
    if (!query.success) return reply.code(400).send(error("VALIDATION_ERROR"));
    const result = await store.history(parsed.data.id, user.userId, user.role === "admin" ? "admin" : "user",
      1000, query.data.cursor ?? 0);
    if (!result) return reply.code(404).send(error("MISSION_NOT_FOUND"));
    return reply.send(result);
  });
}
