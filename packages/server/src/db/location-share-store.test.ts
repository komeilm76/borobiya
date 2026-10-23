import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { PgDialect } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "./client";
import { locationHistory, locationShares, userSessions, users } from "./schema";
import {
  activeOwnedSharesQuery,
  DrizzleLocationShareStore,
  expireOverdueSharesQuery,
  planShareReuse,
  repairStaleSharePinsQuery,
  type LocationShareRecord
} from "./location-share-store";

// A driver is only needed to build SQL; no connection is opened until a query runs.
const offlineDb = drizzle(postgres("postgresql://borobiya:unused@127.0.0.1:5432/unused"), {
  schema: { locationShares, locationHistory, userSessions, users }
}) as unknown as Database;

const ownerId = randomUUID();
const callerDeviceId = randomUUID();
const targetId = randomUUID();

type Mutation = { type: "insert" | "update"; values: Record<string, unknown> };

/** Raw statements (the per-owner advisory lock) are recorded apart from row writes. */
interface ExecutedStatement { sql: string; params: unknown[] }

/**
 * Minimal Drizzle stand-in: every `select`/`insert`/`update` chain resolves the next
 * scripted row set, and writes are captured so call order is observable.
 */
class FakeQuery implements PromiseLike<unknown> {
  readonly innerJoin = vi.fn(() => this);
  readonly limit = vi.fn(() => this);
  readonly leftJoin = vi.fn(() => this);
  readonly from = vi.fn(() => this);
  readonly where = vi.fn(() => this);
  readonly orderBy = vi.fn(() => this);
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

const dialect = new PgDialect();

/** Raw statements are built by the same dialect the driver uses, so assertions see real SQL text. */
function statementText(statements: { sql: string }[]) {
  return statements.map((statement) => statement.sql.replace(/\s+/g, " ").trim());
}

function makeDatabase(scriptedResults: unknown[][]) {
  const mutations: Mutation[] = [];
  const executed: ExecutedStatement[] = [];
  let index = 0;
  const next = () => scriptedResults[index++] ?? [];
  const query = () => new FakeQuery(mutations, next);
  const transaction = {
    select: query,
    insert: query,
    update: query,
    // `execute` takes a built statement rather than a chain, so it records the SQL text and params
    // without consuming a scripted read.
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
  return {
    store: new DrizzleLocationShareStore(database),
    mutations,
    executed,
    get reads() { return index; }
  };
}

function shareRow(overrides: Partial<LocationShareRecord> = {}): LocationShareRecord {
  return {
    id: randomUUID(),
    ownerId,
    targetUserId: targetId,
    mode: "timed",
    expiresAt: new Date("2026-10-21T12:00:00.000Z"),
    isRevoked: false,
    priorityDeviceId: null,
    note: null,
    createdAt: new Date("2026-10-21T09:00:00.000Z"),
    ...overrides
  };
}

describe("DrizzleLocationShareStore", () => {
  it("classifies recipients into eligible, self, missing, and unavailable", async () => {
    const selfId = ownerId;
    const missingId = randomUUID();
    const inactiveId = randomUUID();
    const suspendedId = randomUUID();
    const eligibleId = randomUUID();
    const { store } = makeDatabase([[
      { id: eligibleId, isActive: true, isSuspended: false },
      { id: inactiveId, isActive: false, isSuspended: false },
      { id: suspendedId, isActive: true, isSuspended: true }
    ]]);

    const assessment = await store.assessShareTargets({
      ownerId,
      targetUserIds: [selfId, eligibleId, missingId, inactiveId, suspendedId, eligibleId]
    });

    expect(assessment).toEqual({
      eligible: [eligibleId],
      self: [selfId],
      missing: [missingId],
      unavailable: [inactiveId, suspendedId]
    });
  });

  describe("planShareReuse", () => {
    const device = randomUUID();
    const request = (overrides: Partial<Parameters<typeof planShareReuse>[1]> = {}) => ({
      mode: "timed" as const,
      expiresAt: new Date("2026-10-21T11:00:00.000Z"),
      note: null,
      priorityDeviceId: device,
      ...overrides
    });

    it("narrows a permanent share when the caller asks for an hour", () => {
      // The bug this pins: the reuse lookup used to filter by mode, so this request inserted a second
      // active row and the recipient kept seeing the owner forever while the UI reported one share.
      expect(
        planShareReuse({ mode: "permanent", expiresAt: null, priorityDeviceId: device }, request())
      ).toEqual({ mode: "timed", expiresAt: new Date("2026-10-21T11:00:00.000Z") });
    });

    it("widens a timed share into a permanent one by clearing the expiry", () => {
      expect(
        planShareReuse(
          { mode: "timed", expiresAt: new Date("2026-10-21T11:00:00.000Z"), priorityDeviceId: device },
          request({ mode: "permanent", expiresAt: null })
        )
      ).toEqual({ mode: "permanent", expiresAt: null });
    });

    it("extends a timed share only forward, because a repeat must not un-share someone mid-operation", () => {
      const existing = { mode: "timed" as const, expiresAt: new Date("2026-10-21T12:00:00.000Z"), priorityDeviceId: device };
      expect(planShareReuse(existing, request({ expiresAt: new Date("2026-10-21T13:00:00.000Z") })))
        .toEqual({ expiresAt: new Date("2026-10-21T13:00:00.000Z") });
      // A shorter window is a revoke-and-re-share, decided by the caller, not a silent side effect.
      expect(planShareReuse(existing, request({ expiresAt: new Date("2026-10-21T11:00:00.000Z") })))
        .toEqual({});
    });

    it("moves the note only with a change to the window", () => {
      const existing = { mode: "timed" as const, expiresAt: new Date("2026-10-21T12:00:00.000Z"), priorityDeviceId: device };
      expect(planShareReuse(existing, request({ expiresAt: new Date("2026-10-21T13:00:00.000Z"), note: "longer" })))
        .toEqual({ expiresAt: new Date("2026-10-21T13:00:00.000Z"), note: "longer" });
      expect(planShareReuse(existing, request({ note: "ignored on a no-op repeat" })))
        .toEqual({});
    });

    it("carries a device change into every branch", () => {
      const otherDevice = randomUUID();
      expect(
        planShareReuse({ mode: "permanent", expiresAt: null, priorityDeviceId: device }, request({ mode: "timed", priorityDeviceId: otherDevice }))
      ).toEqual({ mode: "timed", expiresAt: new Date("2026-10-21T11:00:00.000Z"), priorityDeviceId: otherDevice });
    });

    it("leaves an untouched row alone and re-points only a real device change", () => {
      const existing = { mode: "permanent" as const, expiresAt: null, priorityDeviceId: device };
      expect(planShareReuse(existing, request({ mode: "permanent", expiresAt: null, priorityDeviceId: device })))
        .toEqual({});
      expect(planShareReuse(existing, request({ mode: "permanent", expiresAt: null, priorityDeviceId: null })))
        .toEqual({});
      expect(planShareReuse(existing, request({ mode: "permanent", expiresAt: null, priorityDeviceId: randomUUID() })))
        .not.toEqual({});
    });

    it("refuses to write a timed row without an expiry rather than meeting a constraint error", () => {
      expect(() =>
        planShareReuse({ mode: "permanent", expiresAt: null, priorityDeviceId: null }, request({ expiresAt: null }))
      ).toThrow(/needs an expiry/);
    });
  });

  it("reuses the active row of the other mode instead of inserting a second one", async () => {
    const existingPermanent = shareRow({ mode: "permanent", expiresAt: null, priorityDeviceId: callerDeviceId });
    const narrowed = { ...existingPermanent, mode: "timed" as const, expiresAt: new Date("2026-10-21T11:00:00.000Z") };
    const fake = makeDatabase([[existingPermanent], [narrowed]]);

    const result = await fake.store.createShares({
      ownerId,
      targetUserIds: [targetId],
      mode: "timed",
      expiresAt: new Date("2026-10-21T11:00:00.000Z"),
      note: "برای یک ساعت",
      priorityDeviceId: callerDeviceId
    });

    expect(result.createdShareIds).toEqual([]);
    expect(result.reusedShareIds).toEqual([existingPermanent.id]);
    expect(result.shares).toEqual([narrowed]);
    expect(fake.mutations).toEqual([
      {
        type: "update",
        values: {
          mode: "timed",
          expiresAt: new Date("2026-10-21T11:00:00.000Z"),
          note: "برای یک ساعت"
        }
      }
    ]);
  });

  it("fails rather than reporting a reuse of a row that vanished mid-transaction", async () => {
    const existing = shareRow({ mode: "permanent", expiresAt: null });
    const fake = makeDatabase([[existing], []]);

    await expect(
      fake.store.createShares({
        ownerId,
        targetUserIds: [targetId],
        mode: "timed",
        expiresAt: new Date("2026-10-21T11:00:00.000Z"),
        note: null,
        priorityDeviceId: null
      })
    ).rejects.toThrow(/update returned no row/);
  });

  it("retires a sibling row the old mode-filtered lookup left behind", async () => {
    const strayPermanent = shareRow({ id: randomUUID(), mode: "permanent", expiresAt: null });
    const liveTimed = shareRow({ id: randomUUID(), mode: "timed", expiresAt: new Date("2026-10-21T14:00:00.000Z") });
    // Read order: the pair's active rows (permanent first, as `order by expires_at desc` yields), then
    // the sibling retirement, which returns nothing.
    const fake = makeDatabase([[strayPermanent, liveTimed], []]);

    const result = await fake.store.createShares({
      ownerId,
      targetUserIds: [targetId],
      mode: "timed",
      expiresAt: new Date("2026-10-21T14:00:00.000Z"),
      note: null,
      priorityDeviceId: null
    });

    // The same-mode row is kept as-is and the wider one is retired, so one recipient has one arrangement.
    expect(result.reusedShareIds).toEqual([liveTimed.id]);
    expect(result.createdShareIds).toEqual([]);
    expect(fake.mutations).toEqual([{ type: "update", values: { isRevoked: true } }]);
  });

  it("inserts one row per target with the caller's mode and expiry", async () => {
    const otherTarget = randomUUID();
    const expiresAt = new Date("2026-10-21T13:00:00.000Z");
    // Query order per target: existing-share read, then the write's RETURNING row.
    const fake = makeDatabase([[], [shareRow({ targetUserId: targetId, expiresAt })], [], [shareRow({ targetUserId: otherTarget, expiresAt })]]);

    const result = await fake.store.createShares({
      ownerId,
      targetUserIds: [targetId, otherTarget],
      mode: "timed",
      expiresAt,
      note: "night shift",
      priorityDeviceId: callerDeviceId
    });

    // Each target performs an existing-share read followed by its write.
    expect(fake.reads).toBe(4);
    expect(result.createdShareIds).toHaveLength(2);
    expect(result.reusedShareIds).toEqual([]);
    expect(fake.mutations).toHaveLength(2);
    expect(fake.mutations.every(({ type }) => type === "insert")).toBe(true);
    expect(fake.mutations[0]!.values).toMatchObject({ ownerId, targetUserId: targetId, mode: "timed", expiresAt, note: "night shift", priorityDeviceId: callerDeviceId });
    expect(fake.mutations[1]!.values.targetUserId).toBe(otherTarget);
    // Two targets, one decision lock: it guards the whole read-then-write, not each statement.
    expect(fake.executed).toHaveLength(1);
    expect(statementText(fake.executed)).toEqual(["select pg_advisory_xact_lock(hashtextextended($1, 0))"]);
    expect(fake.executed[0]!.params).toEqual([ownerId]);
  });

  it("takes the owner lock before reading for reuse, so a retry cannot stack a duplicate", async () => {
    // Nothing about this share changes (same pin, permanent, so no expiry to extend), so the only
    // statement is the lock: the decision itself still has to be serialized before the read.
    const fake = makeDatabase([[shareRow({ mode: "permanent", expiresAt: null, priorityDeviceId: callerDeviceId })]]);
    const result = await fake.store.createShares({
      ownerId,
      targetUserIds: [targetId],
      mode: "permanent",
      expiresAt: null,
      note: null,
      priorityDeviceId: callerDeviceId
    });

    expect(result.reusedShareIds).toEqual([expect.any(String)]);
    expect(fake.mutations).toEqual([]);
    expect(fake.executed).toHaveLength(1);
  });

  it("reuses an active permanent share instead of duplicating it", async () => {
    const existing = shareRow({ mode: "permanent", expiresAt: null });
    const fake = makeDatabase([[existing]]);

    const result = await fake.store.createShares({
      ownerId,
      targetUserIds: [targetId],
      mode: "permanent",
      expiresAt: null,
      note: "still sharing",
      priorityDeviceId: null
    });

    expect(fake.mutations).toEqual([]);
    expect(result.reusedShareIds).toEqual([existing.id]);
    expect(result.createdShareIds).toEqual([]);
    expect(result.shares).toEqual([existing]);
  });

  it("revokes an owned active share and distinguishes missing from already-revoked ids", async () => {
    const shareId = randomUUID();
    const retired = { id: shareId, ownerId, targetUserId: targetId };
    const revoked = makeDatabase([[retired]]);
    expect(await revoked.store.revokeShare({ ownerId, shareId })).toEqual({
      status: "revoked",
      share: retired
    });
    expect(revoked.mutations).toHaveLength(1);
    expect(revoked.mutations[0]).toMatchObject({ type: "update", values: { isRevoked: true } });

    const already = makeDatabase([[], [{ id: shareId }]]);
    expect(await already.store.revokeShare({ ownerId, shareId })).toEqual({ status: "already-revoked" });

    const missing = makeDatabase([[], []]);
    expect(await missing.store.revokeShare({ ownerId, shareId: randomUUID() })).toEqual({ status: "not-found" });
  });

  it("extends an active timed share only when the new expiry is later", async () => {
    const existing = shareRow({ expiresAt: new Date("2026-10-21T12:00:00.000Z") });
    const extended = shareRow({ expiresAt: new Date("2026-10-21T18:00:00.000Z") });
    const shorter = makeDatabase([[existing]]);
    const longer = makeDatabase([[existing], [extended]]);

    await shorter.store.createShares({
      ownerId,
      targetUserIds: [targetId],
      mode: "timed",
      expiresAt: new Date("2026-10-21T11:00:00.000Z"),
      note: null,
      priorityDeviceId: null
    });
    const result = await longer.store.createShares({
      ownerId,
      targetUserIds: [targetId],
      mode: "timed",
      expiresAt: new Date("2026-10-21T18:00:00.000Z"),
      note: "extended",
      priorityDeviceId: null
    });

    expect(shorter.mutations).toEqual([]);
    expect(longer.mutations).toHaveLength(1);
    expect(longer.mutations[0]).toMatchObject({ type: "update", values: { expiresAt: new Date("2026-10-21T18:00:00.000Z"), note: "extended" } });
    expect(result.shares[0]!.expiresAt).toEqual(new Date("2026-10-21T18:00:00.000Z"));
    expect(result.reusedShareIds).toEqual([extended.id]);
    expect(result.createdShareIds).toEqual([]);
  });

  it("re-points an existing share when the account chooses another device", async () => {
    const previousDevice = randomUUID();
    const existingPermanent = shareRow({ mode: "permanent", expiresAt: null, priorityDeviceId: previousDevice });
    const repointed = shareRow({ mode: "permanent", expiresAt: null, priorityDeviceId: callerDeviceId });
    const permanent = makeDatabase([[existingPermanent], [repointed]]);

    const result = await permanent.store.createShares({
      ownerId,
      targetUserIds: [targetId],
      mode: "permanent",
      expiresAt: null,
      note: null,
      priorityDeviceId: callerDeviceId
    });

    // Only the pin changes: the sharing window and note are left untouched.
    expect(permanent.mutations).toEqual([{ type: "update", values: { priorityDeviceId: callerDeviceId } }]);
    expect(result.reusedShareIds).toEqual([repointed.id]);
    expect(result.shares[0]!.priorityDeviceId).toBe(callerDeviceId);

    // An identical pin on a timed extension is not rewritten twice.
    const existingTimed = shareRow({ expiresAt: new Date("2026-10-21T12:00:00.000Z"), priorityDeviceId: callerDeviceId });
    const extended = shareRow({ expiresAt: new Date("2026-10-21T20:00:00.000Z"), priorityDeviceId: callerDeviceId });
    const timed = makeDatabase([[existingTimed], [extended]]);

    await timed.store.createShares({
      ownerId,
      targetUserIds: [targetId],
      mode: "timed",
      expiresAt: new Date("2026-10-21T20:00:00.000Z"),
      note: null,
      priorityDeviceId: callerDeviceId
    });

    expect(timed.mutations).toHaveLength(1);
    expect(timed.mutations[0]!.values).toEqual({ expiresAt: new Date("2026-10-21T20:00:00.000Z") });
  });
});

describe("activeOwnedSharesQuery", () => {
  it("labels an owned row with a left join, so an unreadable target cannot hide the share", () => {
    const built = activeOwnedSharesQuery(offlineDb, { userId: ownerId, limit: 100 }).toSQL();
    const text = built.sql.replace(/\s+/g, " ");

    // The alias is the point: the received half of the same read joins `users` for the owner, and two
    // joins on one table without distinct names is how a label silently ends up describing the wrong side.
    expect(text).toContain('left join "users" "share_target" on "share_target"."id" = "location_shares"."target_user_id"');
    // Drizzle names the result key from the selection object, so there is no SQL alias to assert — the
    // joined column itself is the thing that must be read.
    expect(text).toContain('"share_target"."username"');
    // A left join and not an inner one: dropping the row would drop the only way to revoke it.
    expect(text).not.toContain('inner join "users" "share_target"');
    // Active only, newest first, capped — the same predicates the received half applies.
    expect(text).toContain('"location_shares"."owner_id" = $1');
    expect(text).toContain('"location_shares"."is_revoked" = $2');
    expect(text).toContain('("location_shares"."expires_at" IS NULL OR "location_shares"."expires_at" > now())');
    expect(text).toContain('order by "location_shares"."created_at" desc limit $3');
    expect(built.params).toEqual([ownerId, false, 100]);
  });
});

describe("DrizzleLocationShareStore.listActiveShares", () => {
  it("reads owned shares first and maps the received owner position", async () => {
    const ownedRow = { ...shareRow(), targetUsername: "satellite" };
    const receivedRow = {
      ...shareRow({ mode: "permanent", expiresAt: null }),
      ownerUsername: "dispatch_lead",
      ownerLat: "35.6997",
      ownerLon: "51.3379"
    };
    const fake = makeDatabase([[ownedRow], [receivedRow]]);

    const result = await fake.store.listActiveShares({ userId: ownerId, limit: 100 });

    expect(result.owned).toEqual([ownedRow]);
    expect(result.sharedWithMe).toEqual([{
      id: receivedRow.id,
      ownerId: receivedRow.ownerId,
      targetUserId: receivedRow.targetUserId,
      mode: receivedRow.mode,
      expiresAt: receivedRow.expiresAt,
      isRevoked: receivedRow.isRevoked,
      priorityDeviceId: receivedRow.priorityDeviceId,
      note: receivedRow.note,
      createdAt: receivedRow.createdAt,
      owner: {
        id: ownerId,
        username: "dispatch_lead",
        lastLocation: { lat: 35.6997, lon: 51.3379 }
      }
    }]);
  });

  it("reports no position when the owner has never shared a fix", async () => {
    const receivedRow = {
      ...shareRow(),
      ownerUsername: "offline_user",
      ownerLat: null,
      ownerLon: null
    };
    const fake = makeDatabase([[], [receivedRow]]);

    const result = await fake.store.listActiveShares({ userId: targetId, limit: 100 });

    expect(result.owned).toEqual([]);
    expect(result.sharedWithMe[0]!.owner.lastLocation).toBeNull();
  });
});

describe("repairStaleSharePinsQuery", () => {
  it("moves only single-device accounts off a device that has no live session", () => {
    const built = repairStaleSharePinsQuery(offlineDb, new Date("2026-10-21T09:00:00.000Z"))
      .returning({ id: locationShares.id })
      .toSQL();
    const sql = built.sql.replace(/\s+/g, " ");

    // The replacement value is the account's only live device, correlated to the share's owner.
    expect(sql).toContain('set "priority_device_id" = (select min("user_sessions"."device_id") from "user_sessions"');
    expect(sql).toContain('"user_sessions"."user_id" = "location_shares"."owner_id"');
    expect(sql).toContain('"user_sessions"."refresh_token_hash" is not null');
    // Only active shares that actually pin a device are considered.
    expect(sql).toContain('"location_shares"."is_revoked" = $1');
    expect(sql).toContain('"location_shares"."expires_at" IS NULL OR "location_shares"."expires_at" > $2');
    expect(sql).toContain('"location_shares"."priority_device_id" is not null');
    // Exactly one live device, and the pinned one is not live: otherwise the user must choose again.
    // Distinct devices, not sessions: two live sessions of one device id are still one choice.
    expect(sql).toContain('(select count(distinct "user_sessions"."device_id") from "user_sessions" where "user_sessions"."user_id" = "location_shares"."owner_id" and "user_sessions"."refresh_token_hash" is not null) = 1');
    expect(sql).toContain("not exists (select 1");
    expect(sql).toContain('"user_sessions"."device_id" = "location_shares"."priority_device_id"');
    expect(built.params[0]).toBe(false);
    expect(built.params[1]).toEqual(new Date("2026-10-21T09:00:00.000Z"));
  });
});

describe("expireOverdueSharesQuery", () => {
  it("retires only timed shares whose window has closed", () => {
    const built = expireOverdueSharesQuery(offlineDb, new Date("2026-10-21T09:00:00.000Z"))
      .returning({
        id: locationShares.id,
        ownerId: locationShares.ownerId,
        targetUserId: locationShares.targetUserId
      })
      .toSQL();
    const sql = built.sql.replace(/\s+/g, " ");

    expect(sql).toContain('update "location_shares" set "is_revoked" = $1');
    expect(sql).toContain('"location_shares"."is_revoked" = $2');
    expect(sql).toContain('"location_shares"."expires_at" is not null');
    expect(sql).toContain('"location_shares"."expires_at" <= $3');
    expect(sql).toContain('returning "id", "owner_id", "target_user_id"');
    // Booleans and the bound cutoff are parameters, never inlined SQL text.
    expect(built.params).toEqual([true, false, "2026-10-21T09:00:00.000Z"]);
  });

  it("returns the retired share identities from DrizzleLocationShareStore.expireOverdueShares", async () => {
    const retired = [{ id: randomUUID(), ownerId, targetUserId: targetId }];
    const fake = makeDatabase([retired]);
    expect(await fake.store.expireOverdueShares({ now: new Date("2026-10-21T09:00:00.000Z") })).toEqual(retired);
  });
});
