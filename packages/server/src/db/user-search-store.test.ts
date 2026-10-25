import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { userSessions, users } from "./schema";
import {
  DrizzleUserSearchStore,
  escapeLikePattern,
  readDistanceKm,
  userSearchQueries,
  type UserSearchInput
} from "./user-search-store";
import type { Database } from "./client";

// A driver is only needed to build SQL; no connection is opened until a query runs.
const offlineDb = drizzle(postgres("postgresql://borobiya:unused@127.0.0.1:5432/unused"), {
  schema: { users, userSessions }
}) as unknown as Database;

const dialect = new PgDialect();
const callerId = randomUUID();

function searchInput(overrides: Partial<UserSearchInput> = {}): UserSearchInput {
  return {
    term: "field_resp",
    sort: "distance",
    radiusKm: null,
    minRating: null,
    online: null,
    callerId,
    reference: null,
    page: 1,
    limit: 20,
    ...overrides
  };
}

describe("escapeLikePattern", () => {
  it("neutralizes the wildcards a typed query could carry", () => {
    expect(escapeLikePattern("50%_off")).toBe("50\\%\\_off");
    expect(escapeLikePattern("back\\slash")).toBe("back\\\\slash");
    expect(escapeLikePattern("plain")).toBe("plain");
  });
});

describe("userSearchQueries", () => {
  it("matches a partial username over reachable accounts only", () => {
    const query = userSearchQueries(offlineDb, searchInput()).items.toSQL();

    expect(query.sql).toContain('"users"."username" ilike $');
    expect(query.sql).toContain('"is_active" = $');
    expect(query.sql).toContain('"is_suspended" = $');
    // The caller's own account is not a shareable recipient (`self_target` on the POST), so the picker
    // never sees it — the dialog cannot be tricked into offering it by a profile fetch that failed.
    expect(query.sql).toContain('"users"."id" <> $');
    expect(query.params).toContain(callerId);
    expect(query.sql).not.toContain(callerId);
    // Both statements of the page carry the same reachability clause, or a filtered-out row would still
    // be counted in the total and the client would page through a list that never shows it.
    const count = userSearchQueries(offlineDb, searchInput()).count.toSQL();
    expect(count.sql).toContain('"users"."id" <> $');
    expect(count.params).toContain(callerId);
    // The term is a parameter, never inline text, and it arrives as a contains-pattern.
    // The underscore is a single-character wildcard in LIKE, so it reaches the driver escaped;
    // usernames are `[a-z0-9_]`, and an unescaped `field_responder` term would also match `fieldXresponder`.
    expect(query.params).toContain("%field\\_resp%");

    const wildcards = userSearchQueries(offlineDb, searchInput({ term: "50%_x" })).items.toSQL();
    expect(wildcards.params).toContain("%50\\%\\_x%");
    // The total is its own statement, so an out-of-range page still reports how many hits exist.
    expect(userSearchQueries(offlineDb, searchInput()).count.toSQL().sql).toContain('count(*)::int from "users"');
  });

  it("measures distance in kilometres from an explicit point, longitude before latitude", () => {
    const query = userSearchQueries(
      offlineDb,
      searchInput({ reference: { lat: 35.6997, lon: 51.3379 } })
    ).items.toSQL();

    // The `::numeric` cast is the difference between a working search and a 500: PostgreSQL has no
    // two-argument `round` for `double precision`, which is exactly how this slice failed live.
    expect(query.sql).toContain("round((ST_Distance(");
    expect(query.sql).toContain("/ 1000.0)::numeric, 1)::float8");
    expect(query.sql).not.toContain("round(ST_Distance(");
    expect(query.sql).toContain('order by "distanceKm" nulls last');
    expect(query.sql).toContain('"username" asc');
    // PostGIS X is longitude and Y as latitude; swapping them silently moves every distance.
    const lonIndex = query.params.indexOf(51.3379);
    const latIndex = query.params.indexOf(35.6997);
    expect(lonIndex).toBeGreaterThan(-1);
    expect(latIndex).toBe(lonIndex + 1);
  });

  it("falls back to the caller's own stored position in the same statement", () => {
    const query = userSearchQueries(offlineDb, searchInput()).items.toSQL();

    // A scalar subquery rather than a second round trip, and no constructed point: the reference is
    // whatever the caller's account already holds, which may be nothing.
    expect(query.sql).toContain('from "users" where "users"."id" =');
    expect(query.sql).not.toContain("ST_MakePoint");
    expect(query.params).toContain(callerId);
  });

  it("treats an unrated account as zero for a rating floor", () => {
    const query = userSearchQueries(offlineDb, searchInput({ minRating: 4 })).items.toSQL();

    expect(query.sql).toContain('coalesce("users"."avg_rating", 0) >=');
    expect(query.params).toContain(4);
  });

  it("uses session liveness for the online filter, in both directions", () => {
    const online = userSearchQueries(offlineDb, searchInput({ online: true })).items.toSQL();
    const offline = userSearchQueries(offlineDb, searchInput({ online: false })).items.toSQL();

    expect(online.sql).toContain('exists (select 1 from "user_sessions"');
    expect(online.sql).toContain('"refresh_token_hash" is not null');
    expect(online.sql).toContain('"last_active_at" >= now()');
    expect(online.params).toContain(70_000);
    expect(offline.sql).toContain('"last_active_at" >= now()');
    expect(offline.sql).toContain("not exists (");
    expect(offline.sql).toContain('exists (select 1 from "user_sessions"');
  });

  it("browses without an unindexed empty ILIKE, and filters by a GiST-backed distance predicate", () => {
    const browse = userSearchQueries(offlineDb, searchInput({ term: "", sort: "username" }));
    const items = browse.items.toSQL();
    expect(items.sql).not.toContain('"username" ilike');
    expect(browse.count.toSQL().sql).not.toContain('"username" ilike');
    expect(items.sql).toContain('order by "users"."username" asc');
    const radius = userSearchQueries(offlineDb, searchInput({ term: "", radiusKm: 1.5,
      reference: { lat: 35.7, lon: 51.4 } }));
    expect(radius.items.toSQL().sql).toContain('ST_DWithin("users"."last_location"');
    expect(radius.items.toSQL().params).toContain(1500);
    expect(radius.count.toSQL().params).toContain(1500);
  });

  it("paginates with limit and offset", () => {
    const query = userSearchQueries(offlineDb, searchInput({ page: 3, limit: 25 })).items.toSQL();

    expect(query.sql).toMatch(/limit \$\d+ offset \$\d+/);
    // offset = (page - 1) * limit
    expect(query.params.slice(-2)).toEqual([25, 50]);
  });
});

/**
 * Minimal stand-in: the store builds two statements (`select().from().where()…` each) and awaits both,
 * so every awaited chain resolves the next scripted row set. The SQL itself is pinned above through the
 * dialect, where a real builder produces it.
 */
function fakeDatabase(results: unknown[][]) {
  let index = 0;
  const readNext = () => results[index++] ?? [];

  const chain: unknown = new Proxy(function noop() {} as unknown as () => unknown, {
    get(_target, property) {
      if (property === "then") {
        return (onFulfilled: (value: unknown) => unknown) => Promise.resolve(onFulfilled(readNext()));
      }
      // Debug/inspection hooks must not be answered with the chain, or a failing assertion would
      // recurse through every property name the inspector tries.
      if (typeof property === "symbol") {
        return undefined;
      }
      return chain;
    },
    apply() {
      return chain;
    }
  });

  return { store: new DrizzleUserSearchStore(chain as Database) };
}

describe("readDistanceKm", () => {
  it("keeps a missing position missing rather than reading as zero kilometres", () => {
    // `Number(null)` is 0, and 0 km is the *nearest possible* result: an unguarded mapper would put
    // every account without a fix at the top of a "nearest first" list, labelled "0.0 km away".
    expect(readDistanceKm(null)).toBeNull();
    expect(readDistanceKm(undefined)).toBeNull();
    expect(readDistanceKm(Number.NaN)).toBeNull();
    expect(readDistanceKm("not a number")).toBeNull();
  });

  it("accepts the numeric and string forms a driver can return", () => {
    expect(readDistanceKm(12.45)).toBe(12.45);
    expect(readDistanceKm("12.4")).toBe(12.4);
    expect(readDistanceKm(0)).toBe(0);
  });
});

describe("DrizzleUserSearchStore.searchUsers", () => {
  it("returns the page and the count of the whole filtered set", async () => {
    const { store } = fakeDatabase([
      [
        {
          id: randomUUID(),
          username: "field_responder",
          avgRating: 4.5,
          isOnline: true,
          distanceKm: 12.4
        },
        { id: randomUUID(), username: "field_volunteer", avgRating: null, isOnline: false, distanceKm: null }
      ],
      [{ total: 41 }]
    ]);

    const page = await store.searchUsers(searchInput());

    expect(page.total).toBe(41);
    expect(page.items).toEqual([
      {
        id: expect.any(String),
        username: "field_responder",
        category: null,
        avgRating: 4.5,
        isOnline: true,
        distanceKm: 12.4
      },
      {
        id: expect.any(String),
        username: "field_volunteer",
        category: null,
        avgRating: null,
        isOnline: false,
        distanceKm: null
      }
    ]);
  });

  it("reports zero rather than nothing when no account matches", async () => {
    const { store } = fakeDatabase([[], [{ total: 0 }]]);

    await expect(store.searchUsers(searchInput({ term: "zzz" }))).resolves.toEqual({ items: [], total: 0 });
  });

  it("reports zero when the count statement returned no row rather than inventing one", async () => {
    // A `count(*)` always answers with a row in PostgreSQL; this guards the store's own assumption, so a
    // driver that hands back an empty set cannot make `total` become `undefined` in the response.
    const { store } = fakeDatabase([[
      { id: randomUUID(), username: "solo", avgRating: null, isOnline: false, distanceKm: null }
    ]]);

    const page = await store.searchUsers(searchInput());

    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(0);
  });
});
