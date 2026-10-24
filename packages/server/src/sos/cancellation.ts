import { apiRoutes } from "@borobiya/shared/api";
import type { FastifyInstance } from "fastify";
import type { SosCancellationStore } from "../db/sos-cancellation-store";
import { emitRequesterCancellation, emitRescuerCancellation, type RoomEmitter } from "../realtime/socket";
import { sosRateLimitKey } from "./requests";

const error = (code: string, message: string, issues: unknown[] = []) => ({ error: true as const, code, message, issues });

/** Cancel only pending/dispatched SOSes; accepted mission teardown is handled by T3.6.4. */
export const rescuerCancelRateLimit = {
  max: 3, timeWindow: 3_600_000, hook: "preHandler", groupId: "rescuer-mission-cancel"
} as const;

export async function registerSosCancellationRoutes(app: FastifyInstance, store: SosCancellationStore, io?: RoomEmitter): Promise<void> {
  const catalog = apiRoutes.sos.listCancellationReasons;
  app.get(catalog.url, async (request, reply) => {
    if (!request.authenticatedUser) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required."));
    const parsed = catalog.schema.querystring.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send(error("VALIDATION_ERROR", "Select a cancellation type."));
    return reply.code(200).send(await store.listReasons(parsed.data.type));
  });

  const route = apiRoutes.sos.cancelRequest;
  app.post(route.url, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required."));
    const params = route.schema.params.safeParse(request.params);
    if (!params.success) return reply.code(404).send(error("SOS_REQUEST_NOT_FOUND", "SOS request not found."));
    const body = route.schema.body.safeParse(request.body);
    if (!body.success) return reply.code(400).send(error("VALIDATION_ERROR", "Select a valid cancellation reason.",
      body.error.issues.map(({ code, message, path }) => ({ code, message, path }))));
    const result = await store.cancelRequestAsRequester(params.data.id, user.userId, body.data);
    switch (result.status) {
      case "not_found": return reply.code(404).send(error("SOS_REQUEST_NOT_FOUND", "SOS request not found."));
      case "invalid_reason": return reply.code(400).send(error("INVALID_CANCELLATION_REASON", "Select an active requester cancellation reason."));
      case "custom_reason_required": return reply.code(400).send(error("CUSTOM_REASON_REQUIRED", "Explain your reason in 10–200 characters."));
      case "custom_reason_not_allowed": return reply.code(400).send(error("CUSTOM_REASON_NOT_ALLOWED", "Only the Other reason accepts a written explanation."));
      case "already_in_progress": return reply.code(409).send(error("SOS_ALREADY_IN_PROGRESS", "This SOS no longer has an active mission to cancel. Refresh its status."));
      case "cancelled": {
        for (const notice of result.notices) emitRequesterCancellation(io, notice, (cause) => {
          request.log.warn({ err: cause, missionId: notice.missionId }, "Requester cancellation notification failed");
        });
        return reply.code(200).send();
      }
      case "unchanged": return reply.code(200).send();
    }
  });


  const missionRoute = apiRoutes.sos.cancelMission;
  app.post(missionRoute.url, { config: { rateLimit: { ...rescuerCancelRateLimit, keyGenerator: sosRateLimitKey } } }, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) return reply.code(401).send(error("UNAUTHORIZED", "Authentication required."));
    const params = missionRoute.schema.params.safeParse(request.params);
    if (!params.success) return reply.code(404).send(error("MISSION_NOT_FOUND", "Mission not found."));
    const body = missionRoute.schema.body.safeParse(request.body);
    if (!body.success) return reply.code(400).send(error("VALIDATION_ERROR", "Select a valid cancellation reason.",
      body.error.issues.map(({ code, message, path }) => ({ code, message, path }))));
    const result = await store.cancelMissionAsRescuer(params.data.id, user.userId, body.data);
    switch (result.status) {
      case "not_found": return reply.code(404).send(error("MISSION_NOT_FOUND", "Mission not found."));
      case "invalid_reason": return reply.code(400).send(error("INVALID_CANCELLATION_REASON", "Select an active rescuer cancellation reason."));
      case "custom_reason_required": return reply.code(400).send(error("CUSTOM_REASON_REQUIRED", "Explain your reason in 10–200 characters."));
      case "custom_reason_not_allowed": return reply.code(400).send(error("CUSTOM_REASON_NOT_ALLOWED", "Only the Other reason accepts a written explanation."));
      case "not_active": return reply.code(409).send(error("MISSION_NOT_ACTIVE", "This mission is no longer active. Refresh its status."));
      case "cancelled": {
        const { requesterId, ...notice } = result.notice;
        emitRescuerCancellation(io, notice, requesterId, (cause) => {
          request.log.warn({ err: cause, missionId: notice.missionId }, "Rescuer cancellation notification failed");
        });
        return reply.code(200).send();
      }
      case "unchanged": return reply.code(200).send();
    }
  });
}
