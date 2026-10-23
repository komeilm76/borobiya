import { apiRoutes } from "@borobiya/shared/api";
import type { FastifyInstance } from "fastify";
import { missionProposalPayload, type SosDispatchStore } from "../db/sos-dispatch-store";
import { sosRequestRecordPayload, type SosRequestStore } from "../db/sos-request-store";
import { emitSosNewRequest, emitSosProposalAccepted, type RoomEmitter } from "../realtime/socket";

/** A rescuer's pending proposals only; enforced after the live-session `/_user` hook. */
export async function registerSosProposalRoutes(
  app: FastifyInstance,
  store: SosDispatchStore,
  options?: { sosRequests: SosRequestStore; io?: RoomEmitter }
): Promise<void> {
  const route = apiRoutes.sos.listProposals;
  app.get(route.url, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) return reply.code(401).header("cache-control", "no-store")
      .send({ error: true, code: "UNAUTHORIZED", message: "Authentication required.", issues: [] });
    const parsed = route.schema.query.safeParse(request.query);
    if (!parsed.success) return reply.code(400).header("cache-control", "no-store").send({
      error: true, code: "VALIDATION_ERROR", message: "Invalid pagination query.",
      issues: parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
    });
    const { page, limit } = parsed.data;
    const result = await store.listPendingProposals?.(user.userId, page, limit) ?? { items: [], total: 0 };
    return reply.header("cache-control", "no-store").send({
      items: result.items.map(missionProposalPayload),
      total: result.total,
      page, limit,
      totalPages: Math.ceil(result.total / limit)
    });
  });

  const acceptRoute = apiRoutes.sos.acceptProposal;
  app.post(acceptRoute.url, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) return reply.code(401).header("cache-control", "no-store")
      .send({ error: true, code: "UNAUTHORIZED", message: "Authentication required.", issues: [] });
    const parsed = acceptRoute.schema.params.safeParse(request.params);
    if (!parsed.success) return reply.code(404).header("cache-control", "no-store")
      .send({ error: true, code: "PROPOSAL_NOT_FOUND", message: "Proposal not found.", issues: [] });
    const result = await store.acceptProposal?.(parsed.data.id, user.userId) ?? { status: "not_found" as const };
    const response = reply.header("cache-control", "no-store");
    if (result.status === "not_found") return response.code(404)
      .send({ error: true, code: "PROPOSAL_NOT_FOUND", message: "Proposal not found.", issues: [] });
    if (result.status === "on_mission") return response.code(400)
      .send({ error: true, code: "RESCUER_ON_MISSION", message: "Finish the current mission before accepting another.", issues: [] });
    if (result.status === "not_pending" || result.status === "sos_closed") return response.code(409)
      .send({ error: true, code: "PROPOSAL_UNAVAILABLE", message: "Proposal is no longer available.", issues: [] });

    if (result.status === "accepted") {
      // Side effects are best-effort and only run after the atomic DB commit; a missing
      // socket or failed readback must never turn a committed accept into a retryable 500.
      try {
        emitSosProposalAccepted(options?.io, result.requesterId, {
          proposal: missionProposalPayload(result.proposal), missionId: result.missionId
        });
        const updated = await options?.sosRequests.getRequestById?.(result.sosRequestId);
        if (updated) emitSosNewRequest(options?.io, sosRequestRecordPayload(updated));
      } catch (error) {
        request.log.warn({ err: error }, "Failed to refresh SOS status notification after acceptance");
      }
    }
    return response.send({ missionId: result.missionId });
  });
}
