import { describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { Database } from "./client";
import { DrizzleLocationShareStore, type LocationShareRecord } from "./location-share-store";

const ownerId = randomUUID();
const targetId = randomUUID();

type Mutation = { type: "insert" | "update"; values: Record<string, unknown> };

/**
 * Minimal Drizzle stand-in: every `select`/`insert`/`update` chain resolves the next
 * scripted row set, and writes are captured so call order is observable.
 */
class FakeQuery implements PromiseLike<unknown> {
  readonly from = vi.fn(() => this);
  readonly where = vi.fn(() => this);
  readonly orderBy = vi.fn(() => this);
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
      note: "night shift"
    });

    // Each target performs an existing-share read followed by its write.
    expect(fake.reads).toBe(4);
    expect(result.createdShareIds).toHaveLength(2);
    expect(result.reusedShareIds).toEqual([]);
    expect(fake.mutations).toHaveLength(2);
    expect(fake.mutations.every(({ type }) => type === "insert")).toBe(true);
    expect(fake.mutations[0]!.values).toMatchObject({ ownerId, targetUserId: targetId, mode: "timed", expiresAt, note: "night shift" });
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
      note: "still sharing"
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
      note: null
    });
    const result = await longer.store.createShares({
      ownerId,
      targetUserIds: [targetId],
      mode: "timed",
      expiresAt: new Date("2026-10-21T18:00:00.000Z"),
      note: "extended"
    });

    expect(shorter.mutations).toEqual([]);
    expect(longer.mutations).toHaveLength(1);
    expect(longer.mutations[0]).toMatchObject({ type: "update", values: { expiresAt: new Date("2026-10-21T18:00:00.000Z"), note: "extended" } });
    expect(result.shares[0]!.expiresAt).toEqual(new Date("2026-10-21T18:00:00.000Z"));
    expect(result.reusedShareIds).toEqual([extended.id]);
    expect(result.createdShareIds).toEqual([]);
  });
});
