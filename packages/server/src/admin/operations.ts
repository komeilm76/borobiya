import { apiRoutes } from "@borobiya/shared/api";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminOperationsStore } from "../db/admin-operations-store";
import { authorizeAdmin, errorResponse, type AdminAuthorizerDependencies } from "./authorize";
import { validationIssues } from "./normalize";

export async function registerAdminOperationsRoutes(app: FastifyInstance, dependencies: {
  store: AdminOperationsStore;
  adminStore: AdminAuthorizerDependencies["store"];
  jwtSecret: string;
}): Promise<void> {
  const authorize = (request: FastifyRequest, reply: FastifyReply) =>
    authorizeAdmin(request, reply, { store: dependencies.adminStore, jwtSecret: dependencies.jwtSecret });
  const stats = apiRoutes.admin.stats;
  const list = apiRoutes.admin.listCancellationReasons;
  const create = apiRoutes.admin.createCancellationReason;

  app.get(stats.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;
    return reply.code(200).header("cache-control", "no-store").send(await dependencies.store.getStats());
  });

  app.get(list.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;
    return reply.code(200).header("cache-control", "no-store").send(await dependencies.store.listCancellationReasons());
  });

  app.post(create.url, async (request, reply) => {
    const identity = await authorize(request, reply);
    if (!identity) return;
    const parsed = create.schema.body.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorResponse(
      "VALIDATION_ERROR", "Request body validation failed.", validationIssues(parsed.error)
    ));
    const reason = await dependencies.store.createCancellationReason({ ...parsed.data, adminId: identity.userId });
    if (!reason) return reply.code(409).send(errorResponse(
      "CANCELLATION_REASON_KEY_TAKEN", "A reason with this type and key already exists."
    ));
    return reply.code(201).header("cache-control", "no-store").send(reason);
  });
}
