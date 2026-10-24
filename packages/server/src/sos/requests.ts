import { apiRoutes } from "@borobiya/shared/api";
import { createSosRequestSchema, type CreateSosRequestInput } from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import {
  SosIncidentTypeUnavailableError,
  sosRequestRecordPayload,
  type CreatedSosRequest,
  type NewSosRequest,
  type SosRequestRecord,
  type SosRequestStore
} from "../db/sos-request-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import { emitSosNewRequest, type RoomEmitter } from "../realtime/socket";

export interface SosRequestRouteDependencies {
  store: SosRequestStore;
  io?: RoomEmitter;
}

function errorResponse(code: string, message: string, issues: unknown[] = []) {
  return { error: true as const, code, message, issues };
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  issues: unknown[] = []
) {
  return reply
    .code(statusCode)
    .header("cache-control", "no-store")
    .send(errorResponse(code, message, issues));
}

/**
 * The one rule this endpoint adds on top of the shared schema, and the message that explains it.
 *
 * `photoUrl` is in §11.2's field list, so the shared schema accepts it; what the schema cannot know is
 * that no legal value exists yet at create time. The photo is uploaded *after* the request exists
 * (`POST /_user/sos/requests/:id/photo`, T3.2.3) and that endpoint is what mints the stored path —
 * because a URL the requester invented is an address the dispatcher's browser would have to load to
 * read the evidence (`docs/SECURITY.md` §9). Refusing it here, instead of accepting and ignoring it, is what makes
 * the client learn the correct call rather than wonder where its photo went.
 */
const PHOTO_URL_ISSUE = {
  code: "photo_url_not_accepted",
  message:
    "Photos are attached after the request exists, with POST /_user/sos/requests/<requestId>/photo (multipart, 5 MB maximum).",
  path: ["photoUrl"]
} as const;

/**
 * The documented throttle for filing an SOS — `docs/SECURITY.md` §3's `3 req/min`, keyed by user.
 *
 * Exported as a value rather than inlined so the number a test can compare against the table is the
 * number the route uses, and `groupId` keeps this budget separate from the mission-cancel limit §3
 * also keys by user (the plugin concatenates the group to the key instead of namespacing per route).
 */
export const sosCreateRateLimit = {
  max: 3,
  timeWindow: 60_000,
  hook: "preHandler",
  groupId: "sos-requests"
} as const;

/**
 * The per-user SOS throttle (SECURITY §3: 3 requests/minute, keyed by `userId`).
 *
 * It is a `preHandler` limiter on purpose. At `onRequest` — the plugin's default — the throttle would
 * run before the `/_user` hook, so `userId` would not be known yet and every anonymous probe would be
 * counted under whatever the attacker's socket IP happened to be, burning a real responder's budget
 * from a spoofed `X-Forwarded-For` chain. Behind the session guard, an unauthenticated caller spends
 * nothing, and one account cannot bury another. The returned key is namespaced by the route's
 * `groupId`, so this budget stays separate from the mission-cancel limit that §3 also keys by user.
 */
export function sosRateLimitKey(request: FastifyRequest): string {
  return request.authenticatedUser?.userId ?? request.ip;
}

/**
 * Maps a validated body onto the store's input.
 *
 * `accuracy` is the field worth looking at: an absent radius becomes NULL rather than 0, because
 * "the device reported no accuracy" and "the device reported a perfect fix" are opposite facts and
 * the second one is what `?? 0` would have written.
 */
export function sosRequestInput(
  user: AuthenticatedUserContext,
  body: CreateSosRequestInput
): NewSosRequest {
  return {
    requesterId: user.userId,
    severity: body.severity,
    description: body.description,
    incidentTypeId: body.incidentTypeId,
    location: {
      lat: body.location.lat,
      lon: body.location.lon,
      accuracy: body.location.accuracy ?? null,
      isManual: body.location.isManual
    }
  };
}

/**
 * `POST /_user/sos/requests` (T3.2.2).
 *
 * The SOS form promises a severity choice, a 10–500 character description, an incident type picked
 * from the admin catalog, and a position — the device's GPS fix by default, or a pin a human moved
 * on the map (`isManual`) when that fix was missing or unusable. Every one of those promises is
 * enforced on the server through the shared schema, so none of them depends on the client that
 * happens to be calling: a five-character plea, `severity: "critical"`, a 91° latitude, a negative
 * accuracy, or an invented extra field all answer 400 naming the field.
 *
 * A caller gets 3 of these per minute (`sosRateLimitKey`), which is the documented figure and the only
 * spam defence this route has: there is deliberately no "one open SOS per account" rule, because
 * nothing in the spec states one and a suppression that swallows a second, genuinely different
 * emergency is worse than a duplicate an admin closes.
 *
 * The incident type is the one rule the schema cannot check, because the catalog is data: an id no
 * admin has created is refused with that id named, and nothing is filed. Nothing is seeded, so on a
 * fresh install that refusal is the *expected* first answer until an admin creates at least one type
 * (T3.1.1/T3.1.2) — which is also why the SOS screen must fill its dropdown from the catalog the
 * server offers (`incidentTypes` in the generated client) rather than hardcode a list.
 *
 * TODO(T3.2.2 follow-up in T3.2.3/T3.2.5): the photo upload endpoint, and dispatch's use of the row
 * this creates. Cancellation (T3.6) still has no cross-column CHECK at the database layer.
 */
export async function registerSosRequestRoutes(
  app: FastifyInstance,
  dependencies: SosRequestRouteDependencies
): Promise<void> {
  const createRoute = apiRoutes.sos.createRequest;

  app.post(createRoute.url, { config: { rateLimit: { ...sosCreateRateLimit, keyGenerator: sosRateLimitKey } } }, async (request, reply) => {
    // The app-wide `/_user` hook normally rejects an unauthenticated, inactive, suspended or
    // onboarding-incomplete caller before this handler runs. This guard is for the route being
    // mounted somewhere that hook does not cover, so it can never read `user.userId` off `undefined`.
    const user = request.authenticatedUser;
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const parsed = createSosRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Request body validation failed.",
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    if (parsed.data.photoUrl !== undefined) {
      return sendError(reply, 400, "PHOTO_URL_NOT_ACCEPTED", PHOTO_URL_ISSUE.message, [PHOTO_URL_ISSUE]);
    }

    let created: CreatedSosRequest;
    try {
      created = await dependencies.store.createRequest(sosRequestInput(user, parsed.data));
    } catch (error) {
      if (error instanceof SosIncidentTypeUnavailableError) {
        return sendError(
          reply,
          400,
          "VALIDATION_ERROR",
          "Request body validation failed.",
          [
            {
              code: "unknown_incident_type",
              message: `The incident type ${error.incidentTypeId} does not exist. Pick one of the types an admin has created.`,
              path: ["incidentTypeId"]
            }
          ]
        );
      }
      throw error;
    }

    // The insert committed. A failed notification read or socket broadcast must not turn the
    // response into a 500: a caller retrying that response would file a second emergency.
    let persisted: SosRequestRecord | null | undefined;
    try {
      persisted = await dependencies.store.getRequestById?.(created.requestId);
    } catch (error) {
      request.log.warn({ err: error, requestId: created.requestId }, "SOS notification read failed");
    }
    try {
      emitSosNewRequest(
        dependencies.io,
        persisted
          ? sosRequestRecordPayload(persisted)
          : {
              id: created.requestId,
              requesterId: user.userId,
              severity: parsed.data.severity,
              description: parsed.data.description,
              incidentTypeId: parsed.data.incidentTypeId,
              location: parsed.data.location,
              photoUrl: null,
              status: created.status,
              cancellationReasonId: null,
              cancellationCustomText: null,
              cancelledAt: null,
              createdAt: new Date().toISOString()
            }
      );
    } catch (error) {
      request.log.warn({ err: error, requestId: created.requestId }, "SOS notification broadcast failed");
    }

    return reply
      .code(201)
      .header("cache-control", "no-store")
      .send({ requestId: created.requestId, status: created.status });
  });


  const listRoute = apiRoutes.sos.listRequests;
  app.get(listRoute.url, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) return sendError(reply, 401, "UNAUTHORIZED", "Authentication required.");
    const query = listRoute.schema.query.safeParse(request.query);
    if (!query.success) return sendError(reply, 400, "VALIDATION_ERROR", "Invalid SOS list filters.",
      query.error.issues.map(({ code, message, path }) => ({ code, message, path })));
    if (query.data.role === "rescuer") return sendError(reply, 400, "SOS_ROLE_UNSUPPORTED",
      "SOS request history is requester-only; rescuers should use their mission history.");
    if (!dependencies.store.listOwnedRequests) return sendError(reply, 503, "SERVICE_UNAVAILABLE", "SOS history is unavailable.");
    const page = await dependencies.store.listOwnedRequests(user.userId, query.data.page, query.data.limit);
    return reply.code(200).send({ ...page, items: page.items.map(sosRequestRecordPayload) });
  });

  const detailRoute = apiRoutes.sos.getRequest;
  app.get(detailRoute.url, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) return sendError(reply, 401, "UNAUTHORIZED", "Authentication required.");
    const params = detailRoute.schema.params.safeParse(request.params);
    if (!params.success) return sendError(reply, 404, "SOS_REQUEST_NOT_FOUND", "SOS request not found.");
    if (!dependencies.store.getOwnedRequest) return sendError(reply, 503, "SERVICE_UNAVAILABLE", "SOS history is unavailable.");
    const found = await dependencies.store.getOwnedRequest(params.data.id, user.userId);
    if (!found) return sendError(reply, 404, "SOS_REQUEST_NOT_FOUND", "SOS request not found.");
    const cancellationReason = await dependencies.store.getCancellationReason?.(
      found.cancellationReasonId, found.cancellationCustomText) ?? null;
    return reply.code(200).send({ ...sosRequestRecordPayload(found),
      cancelledBy: found.status === "cancelled_by_requester" ? "requester" :
        found.status === "cancelled_by_rescuer" ? "rescuer" : null,
      cancellationReason });
  });
}
