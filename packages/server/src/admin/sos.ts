import { dispatchSosRequestSchema } from "@borobiya/shared";
import { adminSosListQuerySchema, apiRoutes, uuidPathParamsSchema } from "@borobiya/shared/api";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { missionProposalPayload, type SosDispatchStore } from "../db/sos-dispatch-store";
import { sosRequestRecordPayload, type SosRequestStore } from "../db/sos-request-store";
import {
  emitSosNewRequest,
  emitSosProposalReceived,
  type RoomEmitter
} from "../realtime/socket";
import type { MissionProgressStore } from "../db/mission-progress-store";
import type { AdminAuthorizerDependencies } from "./authorize";
import { authorizeAdmin, errorResponse } from "./authorize";
import { validationIssues } from "./normalize";

export interface AdminSosRouteDependencies {
  store: SosRequestStore;
  dispatchStore?: SosDispatchStore;
  missionStore?: MissionProgressStore;
  adminStore: AdminAuthorizerDependencies["store"];
  jwtSecret: string;
  io?: RoomEmitter;
}

export async function registerAdminSosRoutes(
  app: FastifyInstance,
  dependencies: AdminSosRouteDependencies
): Promise<void> {
  const listRoute = apiRoutes.admin.listSosRequests;
  const getRoute = apiRoutes.admin.getSosRequest;
  const nearestRoute = apiRoutes.admin.getNearestResponders;
  const dispatchRoute = apiRoutes.admin.dispatchSosRequest;

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

  const missionsRoute = apiRoutes.admin.listSosMissions;
  app.get(missionsRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;
    const parsed = missionsRoute.schema.params.safeParse(request.params);
    if (!parsed.success) return reply.code(404).header("cache-control", "no-store")
      .send(errorResponse("SOS_REQUEST_NOT_FOUND", "SOS request not found."));
    const filters = missionsRoute.schema.query.safeParse(request.query);
    if (!filters.success) return reply.code(400).header("cache-control", "no-store")
      .send(errorResponse("VALIDATION_ERROR", "Invalid mission list filters."));
    const record = await dependencies.store.getRequestById?.(parsed.data.id);
    if (!record) return reply.code(404).header("cache-control", "no-store")
      .send(errorResponse("SOS_REQUEST_NOT_FOUND", "SOS request not found."));
    return reply.code(200).header("cache-control", "no-store")
      .send(await dependencies.missionStore?.listActiveRequestMissions?.(parsed.data.id, filters.data.includeTerminal === "true") ?? []);
  });

  const timelineRoute = apiRoutes.admin.getMissionTimeline;
  app.get(timelineRoute.url, async (request, reply) => {
    const actor = await authorizeAdmin(request, reply, {
      store: dependencies.adminStore, jwtSecret: dependencies.jwtSecret
    });
    if (!actor) return;
    const parsed = timelineRoute.schema.params.safeParse(request.params);
    const timeline = parsed.success
      ? await dependencies.missionStore?.findTimeline?.(parsed.data.id, actor.userId, "admin") : null;
    if (!timeline) return reply.code(404).header("cache-control", "no-store")
      .send(errorResponse("MISSION_NOT_FOUND", "Mission not found."));
    return reply.code(200).header("cache-control", "no-store").send(timeline);
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

  app.post(dispatchRoute.url, async (request, reply) => {
    const adminIdentity = await authorize(request, reply);
    if (!adminIdentity) return;

    const parsedParams = uuidPathParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply
        .code(400)
        .header("cache-control", "no-store")
        .send(
          errorResponse(
            "VALIDATION_ERROR",
            "Path parameter validation failed.",
            validationIssues(parsedParams.error)
          )
        );
    }

    const parsedBody = dispatchSosRequestSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply
        .code(400)
        .header("cache-control", "no-store")
        .send(
          errorResponse(
            "VALIDATION_ERROR",
            "Request body validation failed.",
            validationIssues(parsedBody.error)
          )
        );
    }

    const result = dependencies.dispatchStore?.dispatchResponders
      ? await dependencies.dispatchStore.dispatchResponders({
          sosRequestId: parsedParams.data.id,
          rescuerIds: parsedBody.data.rescuerIds,
          adminId: adminIdentity.userId
        })
      : { status: "not_found" as const };

    if (result.status === "not_found") {
      return reply
        .code(404)
        .header("cache-control", "no-store")
        .send(errorResponse("SOS_REQUEST_NOT_FOUND", "SOS request not found."));
    }

    if (result.status === "invalid_status") {
      return reply
        .code(409)
        .header("cache-control", "no-store")
        .send(
          errorResponse(
            "INVALID_SOS_STATUS",
            `Cannot dispatch responders while SOS request is in '${result.currentStatus}' status.`
          )
        );
    }

    if (result.status === "invalid_rescuers") {
      return reply
        .code(400)
        .header("cache-control", "no-store")
        .send(
          errorResponse(
            "VALIDATION_ERROR",
            "One or more selected responders cannot be dispatched.",
            result.issues
          )
        );
    }

    if (result.status === "rescuer_busy") {
      return reply
        .code(409)
        .header("cache-control", "no-store")
        .send(
          errorResponse(
            "RESCUER_BUSY",
            "One or more selected responders are already on an active mission.",
            result.issues
          )
        );
    }

    const serializedSos = sosRequestRecordPayload(result.sosRequest);
    for (const proposal of result.notifiedProposals) {
      emitSosProposalReceived(dependencies.io, proposal.rescuerId, {
        proposal: missionProposalPayload(proposal),
        sosRequest: serializedSos
      });
    }
    emitSosNewRequest(dependencies.io, serializedSos);

    return reply
      .code(201)
      .header("cache-control", "no-store")
      .send({ proposals: result.proposals.map(missionProposalPayload) });
  });
}
