import { apiRoutes } from "@borobiya/shared/api";
import { userSearchSchema } from "@borobiya/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import type { UserSearchRow, UserSearchStore } from "../db/user-search-store";

/** Below this length a partial username match on an unindexed column returns more noise than signal. */
const MIN_SEARCH_TERM_LENGTH = 2;

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

/** How many pages `total` fills at `limit` — zero for an empty result, so a client can stop asking. */
export function searchTotalPages(total: number, limit: number) {
  return Math.ceil(total / limit);
}

/** Maps a hit onto the shared `UserSearchResult` contract. */
export function userSearchPayload(row: UserSearchRow) {
  return {
    id: row.id,
    username: row.username,
    category: row.category ?? null,
    avgRating: row.avgRating === null ? null : Number(row.avgRating),
    isOnline: row.isOnline,
    distance: row.distanceKm
  };
}

/**
 * User search (spec §5): partial username match over reachable accounts, with responder category and
 * incident specialty filters (`category_users` / `category_incident_types`), rating floor, online state,
 * and distance from the caller or an explicit point.
 */
export async function registerUserSearchRoute(
  app: FastifyInstance,
  dependencies: { store: UserSearchStore }
): Promise<void> {
  const route = apiRoutes.user.search;

  app.get(route.url, async (request, reply) => {
    const user: AuthenticatedUserContext | null = request.authenticatedUser;
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const parsed = userSearchSchema.safeParse(request.query);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Query parameter validation failed.",
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    const term = parsed.data.q?.trim() ?? "";
    if (term.length < MIN_SEARCH_TERM_LENGTH) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        `User search needs a username fragment of at least ${MIN_SEARCH_TERM_LENGTH} characters.`,
        [{ code: term.length === 0 ? "q_required" : "q_too_short", path: ["q"], minLength: MIN_SEARCH_TERM_LENGTH }]
      );
    }

    const { page, limit, category, incidentType, minRating, online, lat, lon } = parsed.data;
    const { items, total } = await dependencies.store.searchUsers({
      term,
      category: category ?? null,
      incidentType: incidentType ?? null,
      minRating: minRating ?? null,
      online: online ?? null,
      callerId: user.userId,
      reference: lat !== undefined && lon !== undefined ? { lat, lon } : null,
      page,
      limit
    });

    return reply.code(200).header("cache-control", "no-store").send({
      items: items.map(userSearchPayload),
      total,
      page,
      limit,
      totalPages: searchTotalPages(total, limit)
    });
  });
}
