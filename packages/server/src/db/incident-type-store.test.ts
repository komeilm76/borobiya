import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "./client";
import { adminAuditLog, incidentTypes } from "./schema";
import {
  DrizzleIncidentTypeStore,
  incidentTypeListQuery,
  incidentTypeSlugOwnerQuery,
  type IncidentTypeRecord,
  type IncidentTypeStore
} from "./incident-type-store";

const adminId = "11111111-1111-4111-8111-111111111111";
const typeId = "22222222-2222-4222-8222-222222222222";

function record(overrides: Partial<IncidentTypeRecord> = {}): IncidentTypeRecord {
  return {
    id: typeId,
    name: "Flood response",
    slug: "flood-response",
    icon: null,
    color: null,
    description: null,
    createdAt: new Date("2026-10-22T09:00:00.000Z"),
    ...overrides
  };
}

interface FakeOptions {
  /** Rows returned by successive `select` calls, in order. */
  selects?: unknown[][];
  /** Rows returned by `update().returning()`. */
  updated?: IncidentTypeRecord[];
  /** Rows returned by `insert().values().onConflictDoNothing().returning()`. */
  inserted?: IncidentTypeRecord[];
  /** Thrown by `update()` — used to simulate a race that the unique index won. */
  updateError?: unknown;
}

function makeStore(options: FakeOptions = {}) {
  const calls = {
    selectTables: [] as unknown[],
    selectWheres: [] as unknown[],
    orderBys: [] as unknown[],
    setValues: [] as Record<string, unknown>[],
    updateTables: [] as unknown[],
    updateWheres: [] as unknown[],
    conflictTargets: [] as unknown[],
    /** `insert` calls keyed by table, in call order. */
    inserts: [] as { table: unknown; values: Record<string, unknown> }[],
    transactionDepth: 0
  };
  const selectQueue = [...(options.selects ?? [])];

  const makeSelect = () => {
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn((table: unknown) => {
      calls.selectTables.push(table);
      return builder;
    });
    builder.where = vi.fn((condition: unknown) => {
      calls.selectWheres.push(condition);
      return builder;
    });
    builder.orderBy = vi.fn((...order: unknown[]) => {
      calls.orderBys.push(...order);
      return builder;
    });
    builder.limit = vi.fn(() => builder);
    builder.for = vi.fn(() => builder);
    // The store awaits the builder itself, so it has to resolve to the queued rows.
    builder.then = (resolve: (rows: unknown[]) => unknown) =>
      Promise.resolve(selectQueue.shift() ?? []).then(resolve);
    return builder;
  };

  const insert = vi.fn((table: unknown) => {
    const builder: Record<string, unknown> = {};
    builder.values = vi.fn((values: Record<string, unknown>) => {
      calls.inserts.push({ table, values });
      return builder;
    });
    builder.onConflictDoNothing = vi.fn((config: { target: unknown }) => {
      calls.conflictTargets.push(config.target);
      return builder;
    });
    builder.returning = vi.fn(async () => options.inserted ?? []);
    return builder;
  });

  const update = vi.fn((table: unknown) => {
    calls.updateTables.push(table);
    const builder: Record<string, unknown> = {};
    builder.set = vi.fn((values: Record<string, unknown>) => {
      calls.setValues.push(values);
      return builder;
    });
    builder.where = vi.fn((condition: unknown) => {
      calls.updateWheres.push(condition);
      return builder;
    });
    builder.returning = vi.fn(async () => {
      if (options.updateError) throw options.updateError;
      return options.updated ?? [];
    });
    return builder;
  });

  // Every read/write the store performs happens inside `db.transaction(...)`, so the fake hands the same
  // builders to the callback and counts the nesting for tests that care whether it happened at all.
  const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
    calls.transactionDepth += 1;
    try {
      return await callback({ select: makeSelect, insert, update });
    } finally {
      calls.transactionDepth -= 1;
    }
  });
  const database = { transaction, select: makeSelect, insert, update } as unknown as Database;

  const store: IncidentTypeStore = new DrizzleIncidentTypeStore(database);
  return { store, calls, insert, update, transaction };
}

// A driver is only needed to build SQL; no connection is opened until a query runs. Pinning the rendered
// statement is how the ordering and the self-exclusion stay facts rather than intentions.
const offlineDb = drizzle(postgres("postgresql://borobiya:unused@127.0.0.1:5432/unused"), {
  schema: { incidentTypes }
}) as unknown as Database;

describe("incident type store", () => {
  it("reads the whole catalog ordered by name, because an admin scrolls this list", async () => {
    const { store, calls, transaction } = makeStore({ selects: [[record()]] });

    await expect(store.listIncidentTypes()).resolves.toEqual([record()]);
    expect(transaction, "a pure read needs no transaction").not.toHaveBeenCalled();
    expect(calls.selectTables).toEqual([incidentTypes]);
    expect(incidentTypeListQuery(offlineDb).toSQL().sql).toContain('order by "incident_types"."name" asc');
  });

  it("creates through the unique index rather than a read-then-write", async () => {
    const created = record();
    const { store, calls, transaction } = makeStore({ inserted: [created] });

    const result = await store.createIncidentType({
      adminId,
      name: created.name,
      slug: created.slug,
      icon: "wave",
      color: "#123456",
      description: null
    });

    expect(transaction).toHaveBeenCalledOnce();
    expect(calls.conflictTargets).toEqual([incidentTypes.slug]);
    expect(calls.inserts[0]).toEqual({
      table: incidentTypes,
      values: {
        name: "Flood response",
        slug: "flood-response",
        icon: "wave",
        color: "#123456",
        description: null
      }
    });
    // The refusal must name the row it collided with, and the audit entry must say what was decided.
    expect(calls.inserts[1]).toEqual({
      table: adminAuditLog,
      values: {
        adminId,
        action: "incident_type_created",
        targetType: "incident_type",
        targetId: typeId,
        meta: { slug: "flood-response", name: "Flood response" }
      }
    });
    expect(result).toEqual({ status: "created", record: created });
  });

  it("reports a lost slug race by naming the row that won it", async () => {
    const { store, calls } = makeStore({ inserted: [], selects: [[{ name: "Flood" }]] });

    const result = await store.createIncidentType({
      adminId,
      name: "Flood",
      slug: "flood",
      icon: null,
      color: null,
      description: null
    });

    expect(result).toEqual({ status: "slug_taken", conflict: { slug: "flood", name: "Flood" } });
    // The rejected insert is still an insert call, so the assertion is about the audit row specifically.
    expect(calls.inserts.filter((entry) => entry.table === adminAuditLog), "a rejected insert must not be audited").toEqual([]);
  });

  it("says the slug is taken even when the owner vanished before the lookup", async () => {
    const { store } = makeStore({ inserted: [], selects: [[]] });

    await expect(
      store.createIncidentType({ adminId, name: "Flood", slug: "flood", icon: null, color: null, description: null })
    ).resolves.toEqual({ status: "slug_taken", conflict: { slug: "flood", name: null } });
  });

  it("answers not_found without touching the table when the id is unknown", async () => {
    const { store, calls } = makeStore({ selects: [[]] });

    await expect(store.updateIncidentType({ adminId, id: typeId, patch: { name: "x" } })).resolves.toEqual({
      status: "not_found"
    });
    expect(calls.updateTables).toEqual([]);
    expect(calls.inserts).toEqual([]);
  });

  it("treats a PATCH that changes nothing as no decision at all", async () => {
    const existing = record({ icon: "wave" });
    const { store, calls } = makeStore({ selects: [[existing]] });

    const result = await store.updateIncidentType({ adminId, id: typeId, patch: { icon: "wave" } });

    expect(result).toEqual({ status: "updated", record: existing, changed: false });
    expect(calls.setValues, "nothing to write").toEqual([]);
    expect(calls.inserts, "an empty edit must not add an audit row").toEqual([]);
  });

  it("writes only the fields the PATCH named, keeping absent ones alone", async () => {
    const existing = record();
    const after = record({ color: null, description: "storm season only" });
    const { store, calls } = makeStore({ selects: [[existing]], updated: [after] });

    const result = await store.updateIncidentType({
      adminId,
      id: typeId,
      patch: { color: null, description: "storm season only" }
    });

    // `color` already holds null, so it is not rewritten and does not appear in the audit either: the
    // entry records what changed, not what was sent.
    expect(calls.setValues).toEqual([{ description: "storm season only" }]);
    expect(calls.updateTables).toEqual([incidentTypes]);
    expect(calls.conflictTargets, "a rename that is not a rename needs no slug lookup").toEqual([]);
    expect(result).toEqual({ status: "updated", record: after, changed: true });
    expect(calls.inserts[0]?.values).toMatchObject({
      action: "incident_type_updated",
      meta: {
        fields: ["description"],
        before: { description: null },
        after: { description: "storm season only" }
      }
    });
  });

  it("refuses a rename that walks onto another type's slug, excluding itself from the lookup", async () => {
    const existing = record();
    const { store, calls } = makeStore({
      selects: [[existing], [{ name: "Fire service" }]]
    });

    const result = await store.updateIncidentType({ adminId, id: typeId, patch: { name: "Fire", slug: "fire" } });

    expect(result).toEqual({ status: "slug_taken", conflict: { slug: "fire", name: "Fire service" } });
    // `ne(id)` is what keeps "save the same form twice" from refusing on the row's own slug.
    expect(incidentTypeSlugOwnerQuery(offlineDb, { slug: "fire", excludeId: typeId }).toSQL().sql).toContain(
      '("incident_types"."slug" = $1 and "incident_types"."id" <> $2)'
    );
    expect(incidentTypeSlugOwnerQuery(offlineDb, { slug: "fire" }).toSQL().sql).not.toContain("<>");
    expect(calls.updateTables).toEqual([]);
  });

  it("accepts a rename whose target slug is already the row's own", async () => {
    const existing = record({ slug: "flood" });
    const after = record({ slug: "flood", name: "Flood" });
    const { store, calls } = makeStore({ selects: [[existing], []], updated: [after] });

    const result = await store.updateIncidentType({ adminId, id: typeId, patch: { name: "Flood", slug: "flood" } });

    expect(calls.selectWheres, "no conflict lookup when the slug is unchanged").toHaveLength(1);
    expect(result).toEqual({ status: "updated", record: after, changed: true });
  });

  it("reports the unique index as a conflict, not a 500, when a rename races another commit", async () => {
    const existing = record();
    const { store } = makeStore({
      selects: [[existing], []],
      updateError: Object.assign(new Error("duplicate key value"), { code: "23505" })
    });

    await expect(store.updateIncidentType({ adminId, id: typeId, patch: { slug: "fire" } })).resolves.toEqual({
      status: "slug_taken",
      conflict: { slug: "fire", name: null }
    });
  });

  it("rethrows an ordinary database failure instead of swallowing it", async () => {
    const existing = record();
    const boom = Object.assign(new Error("connection lost"), { code: "08006" });
    const { store } = makeStore({ selects: [[existing], []], updateError: boom });

    await expect(store.updateIncidentType({ adminId, id: typeId, patch: { slug: "fire" } })).rejects.toBe(boom);
  });

  it("reports not_found when the row disappears between the read and the write", async () => {
    const existing = record();
    const { store, calls } = makeStore({ selects: [[existing], []], updated: [] });

    await expect(store.updateIncidentType({ adminId, id: typeId, patch: { name: "Renamed" } })).resolves.toEqual({
      status: "not_found"
    });
    expect(calls.inserts).toEqual([]);
  });
});
