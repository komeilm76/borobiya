import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "./client";
import { locationHistory, locationShares, userSessions, users } from "./schema";
import {
  DrizzleLocationShareStore,
  expireOverdueSharesQuery,
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

/**
 * Minimal Drizzle stand-in: every `select`/`insert`/`update` chain resolves the next
 * scripted row set, and writes are captured so call order is observable.
 */
class FakeQuery implements PromiseLike<unknown> {
  readonly innerJoin = vi.fn(() => this);
  readonly limit = vi.fn(() => this);
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

function makeDatabase(scriptedResults: unknown[][]) {
  const mutations: Mutation[] = [];
  let index = 0;
  const next = () => scriptedResults[index++] ?? [];
  const query = () => new FakeQuery(mutations, next);
  const transaction = { select: query, insert: query, update: query };
  const database = {
    select: query,
    insert: query,
    update: query,
    transaction: vi.fn(async (handler: (tx: typeof transaction) => Promise<unknown>) => handler(transaction))
  } as unknown as Database;
  return {
    store: new DrizzleLocationShareStore(database),
    mutations,
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
    const revoked = makeDatabase([[{ id: targetId }]]);
    expect(await revoked.store.revokeShare({ ownerId, shareId: targetId })).toBe("revoked");
    expect(revoked.mutations).toHaveLength(1);
    expect(revoked.mutations[0]).toMatchObject({ type: "update", values: { isRevoked: true } });

    const already = makeDatabase([[], [{ id: targetId }]]);
    expect(await already.store.revokeShare({ ownerId, shareId: targetId })).toBe("already-revoked");

    const missing = makeDatabase([[], []]);
    expect(await missing.store.revokeShare({ ownerId, shareId: randomUUID() })).toBe("not-found");
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

describe("DrizzleLocationShareStore.listActiveShares", () => {
  it("reads owned shares first and maps the received owner position", async () => {
    const ownedRow = shareRow();
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
    expect(sql).toContain('"user_sessions" where "user_sessions"."user_id" = "location_shares"."owner_id" and "user_sessions"."refresh_token_hash" is not null) = 1');
    expect(sql).toContain("not exists (select 1");
    expect(sql).toContain('"user_sessions"."device_id" = "location_shares"."priority_device_id"');
    expect(built.params[0]).toBe(false);
    expect(built.params[1]).toEqual(new Date("2026-10-21T09:00:00.000Z"));
  });
});

describe("expireOverdueSharesQuery", () => {
  it("retires only timed shares whose window has closed", () => {
    const built = expireOverdueSharesQuery(offlineDb, new Date("2026-10-21T09:00:00.000Z")).toSQL();
    const sql = built.sql.replace(/\s+/g, " ");

    expect(sql).toContain('update "location_shares" set "is_revoked" = $1');
    expect(sql).toContain('"location_shares"."is_revoked" = $2');
    expect(sql).toContain('"location_shares"."expires_at" is not null');
    expect(sql).toContain('"location_shares"."expires_at" <= $3');
    // Booleans and the bound cutoff are parameters, never inlined SQL text.
    expect(built.params).toEqual([true, false, "2026-10-21T09:00:00.000Z"]);
  });
});
