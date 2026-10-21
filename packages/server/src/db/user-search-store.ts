import { and, asc, eq, gte, ilike, sql, type SQLWrapper } from "drizzle-orm";
import type { Database } from "./client";
import { userSessions, users } from "./schema";

/**
 * The read behind `GET /_user/users/search` (spec §5, T4.1.1's first slice). It answers the question
 * the location-share picker asks — "which account is this?" — and nothing else: category membership
 * and incident specialty have no tables yet, so the route refuses those filters rather than ignoring
 * them.
 */

/** `LIKE`/`ILIKE` wildcards in user text would widen the match; backslash is the default escape character. */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

export interface UserSearchRow {
  id: string;
  username: string;
  avgRating: number | null;
  isOnline: boolean;
  /**
   * Kilometres from the reference point, `null` when either side has no position. `ST_Distance` yields
   * `NULL` if either argument is `NULL`, so the missing cases need no special handling.
   */
  distanceKm: number | null;
}

export interface UserSearchInput {
  /** Trimmed partial username match; at least 2 characters, enforced by the route. */
  term: string;
  minRating: number | null;
  online: boolean | null;
  /** The requesting account, whose stored position is the fallback reference point. */
  callerId: string;
  /** An explicit reference position, or `null` to use the caller's last known position. */
  reference: { lat: number; lon: number } | null;
  page: number;
  limit: number;
}

export interface UserSearchPage {
  items: UserSearchRow[];
  total: number;
}

export interface UserSearchStore {
  searchUsers(input: UserSearchInput): Promise<UserSearchPage>;
}

/** Accounts a share could actually reach. */
function reachableUserConditions() {
  // `POST /_user/location/share` refuses a deactivated or suspended recipient, so the picker must not
  // offer one: an "unreachable account" result would become a 400 the user cannot fix.
  return [eq(users.isActive, true), eq(users.isSuspended, false)];
}

/**
 * One statement for the page and one for its total, both keyed on the same conditions — exported so the
 * SQL shape and the parameter order are reviewable apart from the method that runs them.
 *
 * Two statements rather than `count(*) OVER ()`: an out-of-range page has no rows to carry a total, and
 * a search that reports `total: 0` for page 4 of 40 hits would send a client into an empty loop. The
 * pair is not transactional, so on a busy instance the total can be off by whatever signed up in
 * between — an accurate-as-of-its-own-statement count is the honest trade for one less round trip.
 */
export function userSearchQueries(db: Database, input: UserSearchInput) {
  const conditions: SQLWrapper[] = [
    ilike(users.username, `%${escapeLikePattern(input.term)}%`),
    ...reachableUserConditions()
  ];

  if (input.minRating !== null) {
    // unrated accounts are `NULL`, and a rating floor is a quality filter: treating "no ratings yet" as
    // 0 keeps a brand-new account out of a `minRating=4` list rather than letting the absence of data
    // look like the maximum score.
    conditions.push(gte(sql`coalesce(${users.avgRating}, 0)`, input.minRating));
  }

  if (input.online !== null) {
    // Same liveness rule as the device list (T2.3.1): a session that still holds a refresh token.
    const liveSessions = sql`select 1 from ${userSessions} where ${userSessions.userId} = ${users.id} and ${userSessions.refreshTokenHash} is not null`;
    conditions.push(input.online ? sql`exists (${liveSessions})` : sql`not exists (${liveSessions})`);
  }

  const where = and(...conditions);

  // PostGIS takes X = longitude and Y = latitude. Falling back to a scalar subquery keeps the whole
  // query one statement when the caller sent no coordinates and just uses their own last position.
  const reference = input.reference
    ? sql`ST_SetSRID(ST_MakePoint(${input.reference.lon}, ${input.reference.lat}), 4326)::geography`
    : sql`(select ${users.lastLocation} from ${users} where ${users.id} = ${input.callerId})`;
  // Geography distance is metres; the contract's `distance` is what a list renders as "12.4 km away".
  const distanceKm = sql`round(ST_Distance(${users.lastLocation}, ${reference}) / 1000.0, 1)`;

  return {
    items: db
      .select({
        id: users.id,
        username: users.username,
        avgRating: users.avgRating,
        isOnline: sql<boolean>`exists (${sql`select 1 from ${userSessions} where ${userSessions.userId} = ${users.id} and ${userSessions.refreshTokenHash} is not null`})`
          .mapWith(Boolean)
          .as("isOnline"),
        distanceKm: distanceKm.mapWith(Number).as("distanceKm")
      })
      .from(users)
      .where(where)
      // Nearest first, but accounts without a position are not dropped: they sort last, then by name, so
      // a search never loses a reachable person just because their phone has not reported since install.
      .orderBy(sql`"distanceKm" nulls last`, asc(users.username))
      .limit(input.limit)
      .offset((input.page - 1) * input.limit),
    count: db
      .select({ total: sql<number>`count(*)::int` })
      .from(users)
      .where(where)
  };
}

export class DrizzleUserSearchStore implements UserSearchStore {
  constructor(private readonly db: Database) {}

  async searchUsers(input: UserSearchInput): Promise<UserSearchPage> {
    const queries = userSearchQueries(this.db, input);
    const [rows, [totals]] = await Promise.all([queries.items, queries.count]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        username: row.username,
        avgRating: row.avgRating,
        isOnline: row.isOnline,
        distanceKm: row.distanceKm
      })),
      total: totals?.total ?? 0
    };
  }
}
