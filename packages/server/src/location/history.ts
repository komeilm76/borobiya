import { apiRoutes } from "@borobiya/shared/api";
import { createLocationHistoryShareSchema } from "@borobiya/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { LocationHistoryShareRecord, LocationHistoryStore } from "../db/location-history-store";
import type { LocationShareStore } from "../db/location-share-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import { shareRecipientIssues } from "./shares";

const DAY_MS = 24 * 60 * 60_000;

export interface LocationHistoryRouteDependencies {
  store: Pick<LocationHistoryStore, "createHistoryShares">;
  /** Recipient classification is the live-share rule, so both endpoints refuse the same targets. */
  shares: Pick<LocationShareStore, "assessShareTargets">;
  /** `LOCATION_HISTORY_MAX_SHARE_DAYS` (spec §7.2). */
  maxShareDays: number;
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

/**
 * History-share creation (T2.2.3, spec §7.2): one fixed window granted to 1–50 recipients.
 *
 * Unlike a live share, a grant here needs no priority device — it replays rows the server already
 * stored — and it never expires on its own: it lasts until retention prunes the points underneath it
 * (T2.2.5). An empty window is not an error, so a range whose points were already pruned creates a
 * grant that reads back as no points rather than a confusing refusal at creation time.
 *
 * TODO: revoking a history grant needs a deletion path; the table keeps no `is_revoked` flag, so
 * removal is a real `DELETE` and belongs with the receiver read API (T2.2.4).
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
}
