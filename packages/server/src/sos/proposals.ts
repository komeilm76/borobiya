import { apiRoutes } from "@borobiya/shared/api";
import type { FastifyInstance } from "fastify";
import { missionProposalPayload, type SosDispatchStore } from "../db/sos-dispatch-store";

/** A rescuer's pending proposals only; enforced after the live-session `/_user` hook. */
export async function registerSosProposalRoutes(app: FastifyInstance, store: SosDispatchStore): Promise<void> {
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
}
