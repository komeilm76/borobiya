import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { locationHistory, locationHistoryShares, users } from "./schema";
import {
  DrizzleLocationHistoryStore,
  locationFixQueries,
  pruneLocationHistoryQuery,
  type LocationFixInput,
  type LocationHistoryShareRecord
} from "./location-history-store";
import type { Database } from "./client";

// A driver is only needed to build SQL; no connection is opened until a query runs.
const offlineDb = drizzle(postgres("postgresql://borobiya:unused@127.0.0.1:5432/unused"), {
  schema: { locationHistory, locationHistoryShares, users }
}) as unknown as Database;

describe("location history writes", () => {
  it("builds the PostGIS upsert and the history insert with the same fix", () => {
    const input: LocationFixInput = {
      userId: "11111111-1111-4111-8111-111111111111",
      lat: 35.6997,
      lon: 51.3379,
      accuracy: 12,
      timestamp: new Date("2026-10-21T09:00:00.000Z")
    };
    const queries = locationFixQueries(offlineDb, input);
    const update = queries.updateLastLocation.toSQL();
    const insert = queries.appendHistory.toSQL();

    expect(update.sql).toContain('update "users" set "last_location" = ST_SetSRID(ST_MakePoint(');
    expect(update.sql).toContain(")::geography");
    // PostGIS X is longitude and Y is latitude.
    expect(update.params).toEqual([51.3379, 35.6997, input.userId]);
    expect(insert.sql).toContain('insert into "location_history"');
    // Drizzle serializes the timestamptz to its ISO text before it reaches the driver.
    expect(insert.params).toEqual([input.userId, 35.6997, 51.3379, 12, "2026-10-21T09:00:00.000Z"]);
  });

  it("leaves accuracy null when the device did not report one", () => {
    const queries = locationFixQueries(offlineDb, {
      userId: "11111111-1111-4111-8111-111111111111",
      lat: 35.7,
      lon: 51.4,
      accuracy: null,
      timestamp: new Date("2026-10-21T09:00:00.000Z")
    });

    expect(queries.appendHistory.toSQL().params).toEqual([
      "11111111-1111-4111-8111-111111111111",
      35.7,
      51.4,
      null,
      "2026-10-21T09:00:00.000Z"
    ]);
  });
});

const ownerId = randomUUID();
const targetId = randomUUID();
const fromTime = new Date("2026-10-14T00:00:00.000Z");
const toTime = new Date("2026-10-21T00:00:00.000Z");
const dialect = new PgDialect();

type Mutation = { type: "insert" | "update"; values: Record<string, unknown> };

/**
 * Minimal Drizzle stand-in for the history-share write path: every chained builder resolves the next
 * scripted row set, inserts and updates are captured, and raw `execute` statements keep their SQL text.
 */
class FakeQuery implements PromiseLike<unknown> {
  readonly from = vi.fn(() => this);
  readonly where = vi.fn(() => this);
  readonly limit = vi.fn(() => this);
  readonly returning = vi.fn(() => this);
  readonly set = vi.fn((values: Record<string, unknown>) => {
    this.mutations.push({ type: "update", values });
    return this;
  });
  readonly values = vi.fn((values: Record<string, unknown>) => {
    this.mutations.push({ type: "insert", values });
    return this;
  });

  constructor(
    private readonly mutations: Mutation[],
    private readonly next: () => unknown
  ) {}

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.next()).then(onfulfilled, onrejected);
  }
}

function makeDatabase(scriptedResults: unknown[][]) {
  const mutations: Mutation[] = [];
  const executed: { sql: string; params: unknown[] }[] = [];
  let index = 0;
  const next = () => scriptedResults[index++] ?? [];
  const query = () => new FakeQuery(mutations, next);
  const transaction = {
    select: query,
    insert: query,
    update: query,
    execute: vi.fn(async (statement: never) => {
      executed.push(dialect.sqlToQuery(statement));
      return [];
    })
  };
  const database = {
    select: query,
    insert: query,
    update: query,
    transaction: vi.fn(async (handler: (tx: typeof transaction) => Promise<unknown>) => handler(transaction))
  } as unknown as Database;
  return { store: new DrizzleLocationHistoryStore(database), mutations, executed };
}

function grantRow(overrides: Partial<LocationHistoryShareRecord> = {}): LocationHistoryShareRecord {
  return {
    id: randomUUID(),
    ownerId,
    targetUserId: targetId,
    fromTime,
    toTime,
    maxPoints: null,
    createdAt: new Date("2026-10-21T09:00:00.000Z"),
    ...overrides
  };
}

describe("DrizzleLocationHistoryStore.createHistoryShares", () => {
  it("grants one row per recipient with the window and the requested resolution", async () => {
    const otherTarget = randomUUID();
    const created = grantRow();
    const fake = makeDatabase([[], [created], [], [grantRow({ id: randomUUID(), targetUserId: otherTarget })]]);

    const result = await fake.store.createHistoryShares({
      ownerId,
      targetUserIds: [targetId, otherTarget],
      fromTime,
      toTime,
      maxPoints: 500
    });

    expect(fake.mutations).toHaveLength(2);
    expect(fake.mutations.every(({ type }) => type === "insert")).toBe(true);
    expect(fake.mutations[0]!.values).toEqual({ ownerId, targetUserId: targetId, fromTime, toTime, maxPoints: 500 });
    expect(result.createdShareIds).toEqual([created.id, expect.any(String)]);
    expect(result.reusedShareIds).toEqual([]);
    // One decision lock for the whole batch, keyed on the owner.
    expect(fake.executed).toHaveLength(1);
    expect(fake.executed[0]!.sql).toBe("select pg_advisory_xact_lock(hashtextextended($1, 0))");
    expect(fake.executed[0]!.params).toEqual([ownerId]);
  });

  it("reuses the grant for an identical window and only rewrites maxPoints", async () => {
    const existing = grantRow({ maxPoints: 250 });
    // Two scripted reads: the grant lookup, then the row the UPDATE returns.
    const fake = makeDatabase([[existing], [grantRow({ id: existing.id, maxPoints: 1_000 })]]);

    const result = await fake.store.createHistoryShares({
      ownerId,
      targetUserIds: [targetId],
      fromTime,
      toTime,
      maxPoints: 1_000
    });

    expect(fake.mutations).toEqual([{ type: "update", values: { maxPoints: 1_000 } }]);
    expect(result.reusedShareIds).toEqual([existing.id]);
    expect(result.createdShareIds).toEqual([]);
    expect(result.shares[0]?.maxPoints).toBe(1_000);
  });

  it("clears maxPoints when the repeated request states no preference", async () => {
    const existing = grantRow({ maxPoints: 250 });
    const fake = makeDatabase([[existing]]);

    await fake.store.createHistoryShares({
      ownerId,
      targetUserIds: [targetId],
      fromTime,
      toTime,
      maxPoints: null
    });

    expect(fake.mutations).toEqual([{ type: "update", values: { maxPoints: null } }]);
  });

  it("writes nothing when the same window and resolution is requested again", async () => {
    const existing = grantRow({ maxPoints: 250 });
    const fake = makeDatabase([[existing]]);

    const result = await fake.store.createHistoryShares({
      ownerId,
      targetUserIds: [targetId],
      fromTime,
      toTime,
      maxPoints: 250
    });

    expect(fake.mutations).toEqual([]);
    expect(result.reusedShareIds).toEqual([existing.id]);
    expect(result.shares[0]?.id).toBe(existing.id);
  });
});

describe("pruneLocationHistoryQuery", () => {
  it("deletes only the oldest batch below the cutoff", () => {
    const built = pruneLocationHistoryQuery(offlineDb, {
      olderThan: new Date("2026-07-23T00:00:00.000Z"),
      limit: 5000
    }).toSQL();
    const sql = built.sql.replace(/\s+/g, " ");

    expect(sql).toContain('delete from "location_history"');
    expect(sql).toContain('"location_history"."created_at" <');
    expect(sql).toContain('"location_history"."id" IN ((');
    expect(sql).toContain('select "id" from "location_history" where "location_history"."created_at" < $2 order by "location_history"."id" asc limit $3');
    expect(built.params).toEqual(["2026-07-23T00:00:00.000Z", "2026-07-23T00:00:00.000Z", 5000]);
  });
});
