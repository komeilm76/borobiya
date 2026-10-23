import { apiRoutes, locationHistoryQuerySchema, sharePathParamsSchema } from "@borobiya/shared/api";
import { createLocationHistoryShareSchema, MAX_LOCATION_SHARE_LIST_ITEMS } from "@borobiya/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type {
  LocationHistoryPointRecord,
  LocationHistoryShareRecord,
  LocationHistoryStore,
  LocationHistoryWindowResult
} from "../db/location-history-store";
import type { LocationShareStore } from "../db/location-share-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import { shareRecipientIssues } from "./shares";

const DAY_MS = 24 * 60 * 60_000;

export interface LocationHistoryRouteDependencies {
  store: Pick<
    LocationHistoryStore,
    "createHistoryShares" | "readHistoryWindow" | "readSharedHistoryWindow" | "deleteHistoryShare" | "listHistoryShares"
  >;
  /** Recipient classification is the live-share rule, so both endpoints refuse the same targets. */
  shares: Pick<LocationShareStore, "assessShareTargets">;
  /** `LOCATION_HISTORY_MAX_SHARE_DAYS` (spec §7.2). */
  maxShareDays: number;
  /**
   * `LOCATION_HISTORY_READ_POINTS`: the sampling target when a grant stores none, and the target of the
   * owner's own read, which has no grant to take one from.
   */
  defaultReadPoints: number;
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

/** Maps a persisted grant onto the shared `LocationHistoryShare` contract. */
export function historySharePayload(share: LocationHistoryShareRecord) {
  return {
    id: share.id,
    ownerId: share.ownerId,
    targetUserId: share.targetUserId,
    from: share.fromTime.toISOString(),
    to: share.toTime.toISOString(),
    maxPoints: share.maxPoints,
    createdAt: share.createdAt.toISOString()
  };
}

/**
 * How much of the requested window the account could still have stored, given retention. Kept separate
 * from the schema so the bound follows configuration rather than a constant.
 */
export function historyShareRangeDays(fromIso: string, toIso: string) {
  return (Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS;
}

/** One stored point onto the shared `LocationHistoryPoint` contract; the field is absent, not null. */
export function historyPointPayload(point: LocationHistoryPointRecord) {
  return {
    lat: point.lat,
    lon: point.lon,
    timestamp: point.timestamp.toISOString(),
    ...(point.accuracy === null ? {} : { accuracy: point.accuracy })
  };
}

/** Both lists of a windowed read, mapped once so the owner's and the receiver's answers match. */
export function historyWindowPayload(window: LocationHistoryWindowResult) {
  return { points: window.points.map(historyPointPayload), totalPoints: window.totalPoints };
}

/**
 * Which sampling target a read of a given grant uses. A grant that names one keeps it (the owner chose
 * it, and the write path already bounded it), so the default only applies when the owner expressed no
 * preference — the server never quietly reduces a resolution somebody asked for.
 */
export function historyReadPoints(stored: number | null, defaultReadPoints: number) {
  return stored ?? defaultReadPoints;
}

/**
 * History-share creation (T2.2.3, spec §7.2): one fixed window granted to 1–50 recipients.
 *
 * Unlike a live share, a grant here needs no priority device — it replays rows the server already
 * stored — and it never expires on its own: it lasts until retention prunes the points underneath it
 * (T2.2.5). An empty window is not an error, so a range whose points were already pruned creates a
 * grant that reads back as no points rather than a confusing refusal at creation time.
 *
 * The same registration also serves the read path (T2.2.4): the owner's window, a receiver's window, the
 * two grant lists, and the delete that retires a grant.
 */
export async function registerLocationHistoryShareRoutes(
  app: FastifyInstance,
  dependencies: LocationHistoryRouteDependencies
): Promise<void> {
  const createRoute = apiRoutes.location.createHistoryShare;

  app.post(createRoute.url, async (request, reply) => {
    const user: AuthenticatedUserContext | null = request.authenticatedUser;
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const parsed = createLocationHistoryShareSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Request body validation failed.",
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    const { targetUserIds, from, to, maxPoints } = parsed.data;
    const requestedDays = historyShareRangeDays(from, to);
    if (requestedDays > dependencies.maxShareDays) {
      return sendError(
        reply,
        400,
        "SHARE_RANGE_TOO_LARGE",
        `A shared history window must not span more than ${dependencies.maxShareDays} days.`,
        [{
          code: "range_too_large",
          maxShareDays: dependencies.maxShareDays,
          requestedDays: Math.ceil(requestedDays),
          path: ["to"]
        }]
      );
    }

    const assessment = await dependencies.shares.assessShareTargets({
      ownerId: user.userId,
      targetUserIds
    });
    const issues = shareRecipientIssues(assessment, targetUserIds);
    if (issues.length > 0) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Location history sharing requires active recipients that are not your own account.",
        issues
      );
    }

    const result = await dependencies.store.createHistoryShares({
      ownerId: user.userId,
      targetUserIds: assessment.eligible,
      fromTime: new Date(from),
      toTime: new Date(to),
      maxPoints: maxPoints ?? null
    });

    return reply
      .code(201)
      .header("cache-control", "no-store")
      .send({
        shares: result.shares.map(historySharePayload),
        createdShareIds: result.createdShareIds,
        reusedShareIds: result.reusedShareIds
      });
  });

  const ownHistoryRoute = apiRoutes.location.getHistory;
  app.get(ownHistoryRoute.url, async (request, reply) => {
    const user: AuthenticatedUserContext | null = request.authenticatedUser;
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const parsedQuery = locationHistoryQuerySchema.safeParse(request.query);
    if (!parsedQuery.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Query parameter validation failed.",
        parsedQuery.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    const window = await dependencies.store.readHistoryWindow({
      userId: user.userId,
      fromTime: new Date(parsedQuery.data.from),
      toTime: new Date(parsedQuery.data.to),
      maxPoints: dependencies.defaultReadPoints
    });

    return reply.code(200).header("cache-control", "no-store").send(historyWindowPayload(window));
  });

  const sharedHistoryRoute = apiRoutes.location.getSharedHistory;
  app.get(sharedHistoryRoute.url, async (request, reply) => {
    const user: AuthenticatedUserContext | null = request.authenticatedUser;
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

    // The authorization row remains locked until its history window is read. A revoke
    // cannot land between a separate grant lookup and a later owner-history query.
    const window = await dependencies.store.readSharedHistoryWindow({
      shareId: parsedParams.data.shareId,
      targetUserId: user.userId,
      defaultReadPoints: dependencies.defaultReadPoints
    });
    // Unknown and foreign grants are deliberately indistinguishable.
    if (!window) {
      return sendError(
        reply,
        404,
        "SHARE_NOT_FOUND",
        "No shared history with that id is available to this account."
      );
    }

    return reply.code(200).header("cache-control", "no-store").send(historyWindowPayload(window));
  });

  const listHistoryRoute = apiRoutes.location.listHistoryShares;
  app.get(listHistoryRoute.url, async (request, reply) => {
    const user: AuthenticatedUserContext | null = request.authenticatedUser;
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const { owned, sharedWithMe } = await dependencies.store.listHistoryShares({
      userId: user.userId,
      limit: MAX_LOCATION_SHARE_LIST_ITEMS
    });

    return reply.code(200).header("cache-control", "no-store").send({
      owned: owned.map((share) => ({ ...historySharePayload(share), targetUsername: share.targetUsername })),
      sharedWithMe: sharedWithMe.map((share) => ({
        ...historySharePayload(share),
        owner: { id: share.owner.id, username: share.owner.username }
      }))
    });
  });

  const revokeHistoryRoute = apiRoutes.location.revokeHistoryShare;
  app.delete(revokeHistoryRoute.url, async (request, reply) => {
    const user: AuthenticatedUserContext | null = request.authenticatedUser;
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

    const deleted = await dependencies.store.deleteHistoryShare({
      ownerId: user.userId,
      shareId: parsedParams.data.shareId
    });
    if (!deleted) {
      // Unknown id or somebody else's grant, answered identically — and unlike a live share there is no
      // second outcome for "already gone": the row is deleted, so a retry is a 404 from here on.
      return sendError(reply, 404, "SHARE_NOT_FOUND", "No share with that id belongs to this account.");
    }

    return reply.code(200).header("cache-control", "no-store").send();
  });
}
