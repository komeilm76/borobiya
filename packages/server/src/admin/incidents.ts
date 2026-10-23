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
import { blankToNull, validationIssues } from "./normalize";

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

/**
 * `resolveIncidentSlug` answers `null` for more than one input, and the sentence this replaced described only
 * one of them: "This name has no letters or digits to build a slug from" is true of `عسل`, and untrue in a way
 * the admin can see with their own eyes for a pasted paragraph — a name whose slug would run past 64 characters
 * is refused because of its *length*, not because it has no letters. A refusal that contradicts what is on screen teaches people not to believe the API, so the message
 * names the value being refused and states the rule that failed.
 *
 * The quote is capped because the slug rule is the only thing bounding `incident_types.name` (the column is
 * plain TEXT in the ERD and the DDL, on purpose: a long name with an explicit `slug` is a legitimate row).
 * Without the cap, an oversized paste would come back at full length in the response body and in any log line.
 */
function slugRuleFailure(name: string) {
  const quoted = name.length > 60 ? `${name.slice(0, 60)}…` : name;
  return (
    `The name "${quoted}" does not reduce to a usable slug: a slug is lowercase letters, digits, and single ` +
    "hyphens, at most 64 characters. Shorten the name or send a `slug` of your own."
  );
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
        { code: "invalid_incident_slug", message: slugRuleFailure(parsed.data.name), path: ["slug"] }
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
          // `body.name` is always present when this branch can be reached: an explicit `slug` is checked
          // against the same shape by the body schema, so `null` here means derivation from the name failed.
          { code: "invalid_incident_slug", message: slugRuleFailure(body.name ?? ""), path: ["slug"] }
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
