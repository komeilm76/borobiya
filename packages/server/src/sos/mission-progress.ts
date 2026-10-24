import { apiRoutes } from "@borobiya/shared/api";
import type { FastifyInstance } from "fastify";
import type { MissionProgressStore } from "../db/mission-progress-store";
import { emitMissionStatusUpdated, type RoomEmitter } from "../realtime/socket";

/** Rescuer-only, ordered mission progress. Never advances a state outside the DB transaction. */
export async function registerMissionProgressRoutes(
  app: FastifyInstance,
  store: MissionProgressStore,
  io?: RoomEmitter
): Promise<void> {
  const route = apiRoutes.sos.updateMissionStatus;
  app.patch(route.url, async (request, reply) => {
    const response = reply.header("cache-control", "no-store");
    const user = request.authenticatedUser;
    if (!user) return response.code(401).send({
      error: true, code: "UNAUTHORIZED", message: "Authentication required.", issues: []
    });
    const params = route.schema.params.safeParse(request.params);
    if (!params.success) return response.code(404).send({
      error: true, code: "MISSION_NOT_FOUND", message: "Mission not found.", issues: []
    });
    const body = route.schema.body.safeParse(request.body);
    if (!body.success) return response.code(400).send({
      error: true, code: "VALIDATION_ERROR", message: "Invalid mission status.",
      issues: body.error.issues.map(({ code, message, path }) => ({ code, message, path }))
    });
    const result = await store.advanceStatus(params.data.id, user.userId, body.data.status);
    if (result.status === "not_found") return response.code(404).send({
      error: true, code: "MISSION_NOT_FOUND", message: "Mission not found.", issues: []
    });
    if (result.status === "invalid_transition") return response.code(409).send({
      error: true, code: "INVALID_MISSION_TRANSITION",
      message: `This mission is ${result.currentStatus}; the requested step is not next. Refresh its status.`,
      issues: []
    });
    if (result.status === "updated") {
      const mission = result.mission;
      emitMissionStatusUpdated(io, {
        missionId: mission.id, status: mission.status, by: user.userId, at: mission.updatedAt
      }, mission.requesterId, mission.rescuerId, (error) => {
        request.log.warn({ err: error, missionId: mission.id }, "Mission status notification failed");
      });
    }
    return response.code(200).send(result.mission);
  });
}
