import { apiRoutes } from "@borobiya/shared/api";
import {
  idParamsSchema,
  incidentTypeCreateSchema,
  incidentTypeUpdateSchema,
  resolveIncidentSlug,
  type IncidentType
} from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { IncidentTypeRecord, IncidentTypeSlugConflict, IncidentTypeStore } from "../db/incident-type-store";
import { authorizeAdmin, errorResponse, type AdminAuthorizerDependencies } from "./authorize";

/**
 * The incident-type catalog (`/_admin/incidents`) — T3.1.2's three routes. Categories and membership
 * (`/_admin/categories`) are T3.1.3 and deliberately not stubbed here.
 */
export interface AdminIncidentsRouteDependencies {
  store: IncidentTypeStore;
  /** Reused only for the shared admin checks, so a caller does not have to pass one store twice. */
  adminStore: AdminAuthorizerDependencies["store"];
  jwtSecret: string;
}

function incidentTypePayload(record: IncidentTypeRecord): IncidentType {
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    icon: record.icon,
    color: record.color,
    description: record.description,
    createdAt: record.createdAt.toISOString()
  };
}

/**
 * Only `description` can arrive blank. `icon`/`color` are `min(1)` in the schema, so clearing those means
 * sending `null` and an empty string is a validation error rather than a silent one; `description` accepts
 * `""`, and without this the column would hold "unset" in two representations forever. Collapsing it at the
 * boundary keeps one empty state, lets the store's no-op check see the same value back, and stops a
 * re-sent clear from adding an audit row.
 */
function blankToNull(value: string | null | undefined): string | null | undefined {
  if (value === undefined || value === null) return value;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function slugConflictResponse(conflict: IncidentTypeSlugConflict | null) {
  const taken = conflict?.name
    ? `"${conflict.name}" already uses the slug "${conflict.slug}". Choose a different name or slug.`
    : `The slug "${conflict?.slug ?? "that one"}" is already in use by another incident type.`;
  // `issues[0].slug` follows the precedent of `SHARE_RANGE_TOO_LARGE` carrying `maxShareDays`: the admin
  // form can put the marker on the field it needs without parsing prose.
  return errorResponse("INCIDENT_TYPE_SLUG_TAKEN", taken, [
    { code: "incident_type_slug_taken", message: taken, path: ["slug"], slug: conflict?.slug ?? null }
  ]);
}

const UNDERIVABLE_SLUG_MESSAGE =
  "This name has no letters or digits to build a slug from, so provide a `slug` of your own.";

/**
 * Zod's issue objects are a union of variants whose `path` is a readonly `PropertyKey[]`, so the parameter
 * is deliberately wide: the route only re-emits `code`/`message`/`path` verbatim, exactly as `./users` does
 * inline. Narrowing it here would tie this file to one Zod release's issue shape for no gain.
 */
function validationIssues(error: { issues: readonly { code: string; message: string; path: readonly unknown[] }[] }) {
  return error.issues.map(({ code, message, path }) => ({ code, message, path }));
}

export async function registerAdminIncidentRoutes(
  app: FastifyInstance,
  dependencies: AdminIncidentsRouteDependencies
): Promise<void> {
  const listRoute = apiRoutes.admin.listIncidentTypes;
  const createRoute = apiRoutes.admin.createIncidentType;
  const updateRoute = apiRoutes.admin.updateIncidentType;

  const authorize = (request: FastifyRequest, reply: FastifyReply) =>
    authorizeAdmin(request, reply, { store: dependencies.adminStore, jwtSecret: dependencies.jwtSecret });

  app.get(listRoute.url, async (request, reply) => {
    if (!(await authorize(request, reply))) return;

    const records = await dependencies.store.listIncidentTypes();
    return reply.code(200).header("cache-control", "no-store").send(records.map(incidentTypePayload));
  });

  app.post(createRoute.url, async (request, reply) => {
    const identity = await authorize(request, reply);
    if (!identity) return;

    const parsed = incidentTypeCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send(errorResponse("VALIDATION_ERROR", "Request body validation failed.", validationIssues(parsed.error)));
    }

    const slug = resolveIncidentSlug({
      name: parsed.data.name,
      ...(parsed.data.slug === undefined ? {} : { slug: parsed.data.slug })
    });
    if (slug === null) {
      return reply.code(400).send(errorResponse("VALIDATION_ERROR", "Request body validation failed.", [
        { code: "invalid_incident_slug", message: UNDERIVABLE_SLUG_MESSAGE, path: ["slug"] }
      ]));
    }

    const result = await dependencies.store.createIncidentType({
      adminId: identity.userId,
      name: parsed.data.name,
      slug,
      // On create there is nothing to leave alone, so an absent field means NULL.
      icon: parsed.data.icon ?? null,
      color: parsed.data.color ?? null,
      description: blankToNull(parsed.data.description) ?? null
    });

    if (result.status === "slug_taken") {
      return reply.code(409).send(slugConflictResponse(result.conflict));
    }

    return reply.code(201).header("cache-control", "no-store").send(incidentTypePayload(result.record));
  });

  app.patch(updateRoute.url, async (request, reply) => {
    const identity = await authorize(request, reply);
    if (!identity) return;

    const parsedParams = idParamsSchema.safeParse(request.params);
    const parsedBody = incidentTypeUpdateSchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      const issues = [
        ...(!parsedParams.success ? validationIssues(parsedParams.error) : []),
        ...(!parsedBody.success ? validationIssues(parsedBody.error) : [])
      ];
      return reply.code(400).send(errorResponse("VALIDATION_ERROR", "Request validation failed.", issues));
    }

    const body = parsedBody.data;
    // A rename is the only thing that can move the slug, so it is the only time the slug is resolved; a
    // body that changes neither `name` nor `slug` must leave the stored identifier exactly where it is.
    let slug: string | undefined;
    if (body.name !== undefined || body.slug !== undefined) {
      const resolved = resolveIncidentSlug({ name: body.name ?? "", ...(body.slug === undefined ? {} : { slug: body.slug }) });
      if (resolved === null) {
        return reply.code(400).send(errorResponse("VALIDATION_ERROR", "Request validation failed.", [
          { code: "invalid_incident_slug", message: UNDERIVABLE_SLUG_MESSAGE, path: ["slug"] }
        ]));
      }
      slug = resolved;
    }

    const result = await dependencies.store.updateIncidentType({
      adminId: identity.userId,
      id: parsedParams.data.id,
      patch: {
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(slug === undefined ? {} : { slug }),
        ...(body.icon === undefined ? {} : { icon: body.icon }),
        ...(body.color === undefined ? {} : { color: body.color }),
        ...(body.description === undefined ? {} : { description: blankToNull(body.description) })
      }
    });

    if (result.status === "not_found") {
      return reply.code(404).send(errorResponse("INCIDENT_TYPE_NOT_FOUND", "The requested incident type does not exist."));
    }
    if (result.status === "slug_taken") {
      return reply.code(409).send(slugConflictResponse(result.conflict));
    }

    return reply.code(200).header("cache-control", "no-store").send(incidentTypePayload(result.record));
  });
}
