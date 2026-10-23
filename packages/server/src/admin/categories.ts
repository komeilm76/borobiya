import { apiRoutes, categoryUserParamsSchema } from "@borobiya/shared/api";
import {
  categoryCreateSchema,
  categoryUpdateSchema,
  assignCategoryUsersSchema,
  idParamsSchema,
  type Category
} from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { CategoryRecord, CategoryStore } from "../db/category-store";
import type { AdminAuthorizerDependencies } from "./authorize";
import { authorizeAdmin, errorResponse } from "./authorize";
import { blankToNull, validationIssues } from "./normalize";

/**
 * Responder categories and their members (`/_admin/categories`) — T3.1.3. The incident catalog in
 * `./incidents` is the pattern this follows on purpose: same authorization, same audit discipline, same way
 * of refusing an id the caller invented.
 */
export interface AdminCategoriesRouteDependencies {
  store: CategoryStore;
  adminStore: AdminAuthorizerDependencies["store"];
  jwtSecret: string;
}

function categoryPayload(record: CategoryRecord): Category {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    incidentTypeIds: record.incidentTypeIds,
    members: record.members,
    createdAt: record.createdAt.toISOString()
  };
}

/**
 * One issue per offending id, pointing at its index in the array the caller sent — the shape the share
 * routes established with `unknown_target`. A single message reading "some ids are unknown" would make the
 * admin clear the whole form and retype it to find the one typo.
 */
function unknownIdIssues(field: "incidentTypeIds" | "userIds", ids: string[], idsInRequest: string[]) {
  const indexById = new Map(idsInRequest.map((id, index) => [id, index]));
  const message =
    field === "incidentTypeIds"
      ? "One or more incident types do not exist."
      : "One or more users do not exist.";
  return ids.map((id) => ({ code: `unknown_${field === "userIds" ? "user" : "incident_type"}`, message, path: [field, indexById.get(id) ?? 0] }));
}

export async function registerAdminCategoryRoutes(
  app: FastifyInstance,
  dependencies: AdminCategoriesRouteDependencies
): Promise<void> {
  const listRoute = apiRoutes.admin.listCategories;
  const createRoute = apiRoutes.admin.createCategory;
  const updateRoute = apiRoutes.admin.updateCategory;
  const assignRoute = apiRoutes.admin.assignCategoryUsers;
  const removeRoute = apiRoutes.admin.removeCategoryUser;

  const authorize = (request: FastifyRequest, reply: FastifyReply) =>
    authorizeAdmin(request, reply, { store: dependencies.adminStore, jwtSecret: dependencies.jwtSecret });

  app.get(listRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;

    const records = await dependencies.store.listCategories();
    return reply.code(200).header("cache-control", "no-store").send(records.map(categoryPayload));
  });

  app.post(createRoute.url, async (request, reply) => {
    const identity = await authorize(request, reply);
    if (!identity) return;

    const parsed = categoryCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", "Request body validation failed.", validationIssues(parsed.error)));
    }

    const result = await dependencies.store.createCategory({
      adminId: identity.userId,
      name: parsed.data.name,
      description: blankToNull(parsed.data.description) ?? null,
      incidentTypeIds: parsed.data.incidentTypeIds
    });

    if (result.status === "unknown_incident_types") {
      return reply.code(400).send(
        errorResponse("VALIDATION_ERROR", "Request body validation failed.", unknownIdIssues(
          "incidentTypeIds",
          result.ids,
          parsed.data.incidentTypeIds
        ))
      );
    }

    return reply.code(201).header("cache-control", "no-store").send(categoryPayload(result.record));
  });

  app.patch(updateRoute.url, async (request, reply) => {
    const identity = await authorize(request, reply);
    if (!identity) return;

    const parsedParams = idParamsSchema.safeParse(request.params);
    const parsedBody = categoryUpdateSchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      const issues = [
        ...(!parsedParams.success ? validationIssues(parsedParams.error) : []),
        ...(!parsedBody.success ? validationIssues(parsedBody.error) : [])
      ];
      return reply.code(400).send(errorResponse("VALIDATION_ERROR", "Request validation failed.", issues));
    }

    const body = parsedBody.data;
    const result = await dependencies.store.updateCategory({
      adminId: identity.userId,
      id: parsedParams.data.id,
      patch: {
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.description === undefined ? {} : { description: blankToNull(body.description) }),
        ...(body.incidentTypeIds === undefined ? {} : { incidentTypeIds: body.incidentTypeIds })
      }
    });

    if (result.status === "not_found") {
      return reply.code(404).send(errorResponse("CATEGORY_NOT_FOUND", "The requested category does not exist."));
    }
    if (result.status === "unknown_incident_types") {
      return reply.code(400).send(
        errorResponse("VALIDATION_ERROR", "Request validation failed.", unknownIdIssues(
          "incidentTypeIds",
          result.ids,
          body.incidentTypeIds ?? []
        ))
      );
    }

    return reply.code(200).header("cache-control", "no-store").send(categoryPayload(result.record));
  });

  app.post(assignRoute.url, async (request, reply) => {
    const identity = await authorize(request, reply);
    if (!identity) return;

    const parsedParams = idParamsSchema.safeParse(request.params);
    const parsedBody = assignCategoryUsersSchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      const issues = [
        ...(!parsedParams.success ? validationIssues(parsedParams.error) : []),
        ...(!parsedBody.success ? validationIssues(parsedBody.error) : [])
      ];
      return reply.code(400).send(errorResponse("VALIDATION_ERROR", "Request validation failed.", issues));
    }

    const result = await dependencies.store.assignUsers({
      adminId: identity.userId,
      id: parsedParams.data.id,
      userIds: parsedBody.data.userIds
    });

    if (result.status === "not_found") {
      return reply.code(404).send(errorResponse("CATEGORY_NOT_FOUND", "The requested category does not exist."));
    }
    if (result.status === "unknown_users") {
      return reply.code(400).send(
        errorResponse("VALIDATION_ERROR", "Request validation failed.", unknownIdIssues(
          "userIds",
          result.ids,
          parsedBody.data.userIds
        ))
      );
    }

    return reply.code(200).header("cache-control", "no-store").send();
  });

  app.delete(removeRoute.url, async (request, reply) => {
    const identity = await authorize(request, reply);
    if (!identity) return;

    const parsedParams = categoryUserParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", "Path parameter validation failed.", validationIssues(parsedParams.error)));
    }

    const result = await dependencies.store.removeUser({
      adminId: identity.userId,
      id: parsedParams.data.id,
      userId: parsedParams.data.userId
    });

    if (result.status === "not_found") {
      return reply.code(404).send(errorResponse("CATEGORY_NOT_FOUND", "The requested category does not exist."));
    }

    return reply.code(200).header("cache-control", "no-store").send();
  });
}
