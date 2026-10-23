import { adminSosListQuerySchema, apiRoutes, uuidPathParamsSchema } from "@borobiya/shared/api";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SosDispatchStore } from "../db/sos-dispatch-store";
import { sosRequestRecordPayload, type SosRequestStore } from "../db/sos-request-store";
import type { AdminAuthorizerDependencies } from "./authorize";
import { authorizeAdmin, errorResponse } from "./authorize";
import { validationIssues } from "./normalize";

export interface AdminSosRouteDependencies {
  store: SosRequestStore;
  dispatchStore?: SosDispatchStore;
  adminStore: AdminAuthorizerDependencies["store"];
  jwtSecret: string;
}

export async function registerAdminSosRoutes(
  app: FastifyInstance,
  dependencies: AdminSosRouteDependencies
): Promise<void> {
  const listRoute = apiRoutes.admin.listSosRequests;
  const getRoute = apiRoutes.admin.getSosRequest;
  const nearestRoute = apiRoutes.admin.getNearestResponders;

  const authorize = (request: FastifyRequest, reply: FastifyReply) =>
    authorizeAdmin(request, reply, {
      store: dependencies.adminStore,
      jwtSecret: dependencies.jwtSecret
    });

  app.get(listRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;

    const parsed = adminSosListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .header("cache-control", "no-store")
        .send(
          errorResponse(
            "VALIDATION_ERROR",
            "Query parameter validation failed.",
            validationIssues(parsed.error)
          )
        );
    }

    if (!dependencies.store.listRequests) {
      return reply
        .code(200)
        .header("cache-control", "no-store")
        .send({
          items: [],
          total: 0,
          page: parsed.data.page,
          limit: parsed.data.limit,
          totalPages: 0
        });
    }

    const result = await dependencies.store.listRequests(parsed.data);
    return reply
      .code(200)
      .header("cache-control", "no-store")
      .send({
        items: result.items.map(sosRequestRecordPayload),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      });
  });

  app.get(getRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;

    const parsed = uuidPathParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply
        .code(400)
        .header("cache-control", "no-store")
        .send(
          errorResponse(
            "VALIDATION_ERROR",
            "Path parameter validation failed.",
            validationIssues(parsed.error)
          )
        );
    }

    const record = await dependencies.store.getRequestById?.(parsed.data.id);
    if (!record) {
      return reply
        .code(404)
        .header("cache-control", "no-store")
        .send(errorResponse("SOS_REQUEST_NOT_FOUND", "SOS request not found."));
    }

    return reply
      .code(200)
      .header("cache-control", "no-store")
      .send(sosRequestRecordPayload(record));
  });

  app.get(nearestRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;

    const parsed = uuidPathParamsSchema.safeParse(request.params);
    if (!parsed.success) {
      return reply
        .code(400)
        .header("cache-control", "no-store")
        .send(
          errorResponse(
            "VALIDATION_ERROR",
            "Path parameter validation failed.",
            validationIssues(parsed.error)
          )
        );
    }

    const result = dependencies.dispatchStore
      ? await dependencies.dispatchStore.findNearestResponders(parsed.data.id)
      : { status: "not_found" as const };
    if (result.status === "not_found") {
      return reply
        .code(404)
        .header("cache-control", "no-store")
        .send(errorResponse("SOS_REQUEST_NOT_FOUND", "SOS request not found."));
    }

    return reply
      .code(200)
      .header("cache-control", "no-store")
      .send({ responders: result.responders });
  });
}
