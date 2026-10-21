import { apiRoutes } from "@borobiya/shared/api";
import { userSearchSchema } from "@borobiya/shared";
import type { FastifyInstance, FastifyReply } from "fastify";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import type { UserSearchRow, UserSearchStore } from "../db/user-search-store";

/**
 * The filters this build cannot honor because their tables do not exist yet. Silently ignoring a filter
 * would return a list that looks filtered and is not, which is worse than a refusal: `category` and
 * `incidentType` depend on the domain migrations scheduled with T4.1.1.
 */
const UNSUPPORTED_FILTERS = ["category", "incidentType"] as const;

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
    // No category tables exist yet (T4.1.1), and the contract types this field nullable for exactly
    // that reason: the field is present and empty rather than absent, so a client never guesses.
    category: null,
    avgRating: row.avgRating,
    isOnline: row.isOnline,
    distance: row.distanceKm
  };
}

function isPresent(query: Record<string, unknown>, key: string) {
  const value = query[key];
  return value !== undefined && value !== null && value !== "";
}

/**
 * User search (spec §5) in the form the location-share picker needs: a partial username match over
 * reachable accounts, with the rating and online filters, and distance from the caller or an explicit
 * point. Advanced browsing — no term at all, category and incident specialty, radius limits — remains
 * T4.1.1, and this route says so instead of pretending to filter.
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

    const rawQuery = (request.query ?? {}) as Record<string, unknown>;
    const unsupported = UNSUPPORTED_FILTERS.filter((key) => isPresent(rawQuery, key));
    if (unsupported.length > 0) {
      return sendError(
        reply,
        400,
        "SEARCH_FILTER_UNSUPPORTED",
        `User search cannot filter by ${unsupported.join(", ")} yet.`,
        [{ code: "filter_unsupported", filters: unsupported, path: [unsupported[0]!] }]
      );
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

    const { page, limit, minRating, online, lat, lon } = parsed.data;
    const { items, total } = await dependencies.store.searchUsers({
      term,
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
