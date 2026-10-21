import { apiRoutes, sharePathParamsSchema } from "@borobiya/shared/api";
import { createLocationShareSchema, MAX_LOCATION_SHARE_LIST_ITEMS } from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { LocationShareRecord, LocationShareStore } from "../db/location-share-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";

const MINUTE_MS = 60_000;

export interface LocationSharesRouteDependencies {
  store: LocationShareStore;
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

/** Maps a persisted row onto the shared `LocationShare` contract. */
export function sharePayload(share: LocationShareRecord) {
  return {
    id: share.id,
    ownerId: share.ownerId,
    targetUserId: share.targetUserId,
    mode: share.mode,
    expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
    isRevoked: share.isRevoked,
    priorityDeviceId: share.priorityDeviceId,
    note: share.note,
    createdAt: share.createdAt.toISOString()
  };
}

function currentUserIdentity(request: FastifyRequest): AuthenticatedUserContext | null {
  const user = request.authenticatedUser;
  if (!user) return null;
  return user;
}

/**
 * Live-location share creation (T2.1.2).
 *
 * TODO: Privacy v2 — the receiver of a share may read the owner's live position for the
 * whole share window; allowlists/blocklists and finer windows remain out of scope (spec §7.4).
 * TODO: T2.3.3 — when the account has more than one active device, the client must collect a
 * `priorityDeviceId` and the server must require/reject updates from other devices (T2.3.4).
 */
export async function registerLocationShareRoutes(
  app: FastifyInstance,
  dependencies: LocationSharesRouteDependencies
): Promise<void> {
  const createRoute = apiRoutes.location.createShare;
  const revokeRoute = apiRoutes.location.revokeShare;
  const listRoute = apiRoutes.location.listShares;

  app.post(createRoute.url, async (request, reply) => {
    const user = currentUserIdentity(request);
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const parsed = createLocationShareSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Request body validation failed.",
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    const { targetUserIds, mode, durationMinutes, note } = parsed.data;
    const assessment = await dependencies.store.assessShareTargets({
      ownerId: user.userId,
      targetUserIds
    });
    const indexById = new Map(targetUserIds.map((id, index) => [id, index]));
    const issues = [
      ...assessment.self.map((id) => ({
        code: "self_target",
        message: "You cannot share your location with your own account.",
        path: [indexById.get(id) ?? 0]
      })),
      ...assessment.missing.map((id) => ({
        code: "unknown_target",
        message: "One or more recipients do not exist.",
        path: [indexById.get(id) ?? 0]
      })),
      ...assessment.unavailable.map((id) => ({
        code: "unavailable_target",
        message: "One or more recipients are inactive or suspended.",
        path: [indexById.get(id) ?? 0]
      }))
    ];
    // Reject the whole request instead of partially sharing so the caller always learns
    // which recipients were refused.
    if (issues.length > 0) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Location sharing requires active recipients that are not your own account.",
        issues
      );
    }

    const expiresAt = mode === "timed"
      ? new Date(Date.now() + (durationMinutes ?? 0) * MINUTE_MS)
      : null;

    const result = await dependencies.store.createShares({
      ownerId: user.userId,
      targetUserIds: assessment.eligible,
      mode,
      expiresAt,
      note: note ?? null
    });

    return reply
      .code(201)
      .header("cache-control", "no-store")
      .send({
        shares: result.shares.map(sharePayload),
        createdShareIds: result.createdShareIds,
        reusedShareIds: result.reusedShareIds
      });
  });

  // TODO (T2.1.5): once Socket.IO fan-out exists, notify the affected targets that sharing
  // stopped so their markers clear without waiting for the next list refresh.
  app.delete(revokeRoute.url, async (request, reply) => {
    const user = currentUserIdentity(request);
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const parsedParams = sharePathParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Path parameter validation failed.",
        parsedParams.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    const outcome = await dependencies.store.revokeShare({
      ownerId: user.userId,
      shareId: parsedParams.data.shareId
    });
    if (outcome === "not-found") {
      return sendError(
        reply,
        404,
        "SHARE_NOT_FOUND",
        "No share with that id belongs to this account."
      );
    }

    // An already-revoked id repeats the successful outcome so a retried revoke stays idempotent.
    return reply.code(200).header("cache-control", "no-store").send();
  });

  app.get(listRoute.url, async (request, reply) => {
    const user = currentUserIdentity(request);
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const { owned, sharedWithMe } = await dependencies.store.listActiveShares({
      userId: user.userId,
      limit: MAX_LOCATION_SHARE_LIST_ITEMS
    });

    return reply.code(200).header("cache-control", "no-store").send({
      owned: owned.map(sharePayload),
      sharedWithMe: sharedWithMe.map((share) => ({
        ...sharePayload(share),
        owner: {
          id: share.owner.id,
          username: share.owner.username,
          lastLocation: share.owner.lastLocation
        }
      }))
    });
  });
}
