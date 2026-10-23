import { describe, expect, it, vi } from "vitest";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import type { Database } from "./client";
import {
  adminAuditLog,
  categories,
  categoryIncidentTypes,
  categoryUsers,
  incidentTypes,
  users
} from "./schema";
import {
  DrizzleCategoryStore,
  categoryIncidentTypeInsertQuery,
  categoryListQueries,
  categoryMemberInsertQuery,
  deleteCategoryIncidentTypesQuery,
  foundUserIdsQuery,
  type CategoryRecord
} from "./category-store";

const adminId = "11111111-1111-4111-8111-111111111111";
const categoryId = "55555555-5555-4555-8555-555555555555";
const userA = "66666666-6666-4666-8666-666666666666";
const userB = "99999999-9999-4999-8999-999999999999";
const typeA = "77777777-7777-4777-8777-777777777777";
const typeB = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

function categoryRow(overrides: Partial<CategoryRecord> = {}): CategoryRecord {
  return {
    id: categoryId,
    name: "Mountain Rescue",
    description: "alpine",
    incidentTypeIds: [typeA],
    members: [],
    createdAt: new Date("2026-10-22T10:00:00.000Z"),
    ...overrides
  };
}

interface Script {
  selects?: unknown[][];
  insertedRows?: unknown[];
  updatedRows?: unknown[];
  deletedRows?: unknown[];
}

function makeStore(script: Script = {}) {
  const log = {
    selectTables: [] as unknown[],
    selects: 0,
    inserts: [] as { table: unknown; values: unknown; conflict: unknown }[],
    updates: [] as { table: unknown; set: unknown }[],
    deletes: [] as unknown[],
    audit: () => log.inserts.filter((entry) => entry.table === adminAuditLog)
  };
  const queue = [...(script.selects ?? [])];

  // Recording is per kind and per order, which is exactly what these assertions are about: that a refusal
  // happens before a write, and that a no-op writes nothing.
  const insertLog = log.inserts;
  const select = vi.fn(() => {
    log.selects += 1;
    const index = log.selects;
    const builder: Record<string, unknown> = {};
    builder.from = vi.fn((table: unknown) => {
      log.selectTables.push(table);
      return builder;
    });
    for (const method of ["where", "orderBy", "limit", "innerJoin", "leftJoin"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(queue[index - 1] ?? []).then(resolve);
    return builder;
  });

  const insert = vi.fn((table: unknown) => {
    const entry = { table, values: undefined as unknown, conflict: undefined as unknown };
    insertLog.push(entry);
    const builder: Record<string, unknown> = {};
    builder.values = vi.fn((values: unknown) => {
      entry.values = values;
      return builder;
    });
    builder.onConflictDoNothing = vi.fn((config: { target: unknown }) => {
      entry.conflict = config?.target;
      return builder;
    });
    builder.returning = vi.fn(async () => script.insertedRows ?? []);
    builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(undefined).then(resolve);
    return builder;
  });

  const update = vi.fn((table: unknown) => {
    const entry = { table, set: undefined as unknown };
    log.updates.push(entry);
    const builder: Record<string, unknown> = {};
    builder.set = vi.fn((set: unknown) => {
      entry.set = set;
      return builder;
    });
    builder.where = vi.fn(() => builder);
    builder.returning = vi.fn(async () => script.updatedRows ?? []);
    return builder;
  });

  const del = vi.fn((table: unknown) => {
    log.deletes.push(table);
    const builder: Record<string, unknown> = {};
    builder.where = vi.fn(() => builder);
    builder.returning = vi.fn(async () => script.deletedRows ?? []);
    return builder;
  });

  const context = { select, insert, update, delete: del };
  const transaction = vi.fn(async (callback: (tx: typeof context) => Promise<unknown>) => callback(context));
  const database = { ...context, transaction } as unknown as Database;
  return { store: new DrizzleCategoryStore(database), log, transaction };
}

// A driver is only needed to build SQL; no connection is opened until a query runs.
const offlineDb = drizzle(postgres("postgresql://borobiya:unused@127.0.0.1:5432/unused"), {
  schema: { categories, categoryIncidentTypes, categoryUsers, incidentTypes, users, adminAuditLog }
}) as unknown as Database;

describe("category store", () => {
  it("builds each category from the pivot rows rather than one query per category", async () => {
    const { store, log } = makeStore({
      selects: [
        [{ id: categoryId, name: "Mountain Rescue", description: null, createdAt: new Date() }],
        [
          { categoryId, incidentTypeId: typeA },
          { categoryId, incidentTypeId: typeB }
        ],
        [{ categoryId, id: userA, username: "alpine_1" }]
      ]
    });

    const result = await store.listCategories();

    expect(log.selects, "three statements total (rows + incident links + members), not N+1").toBe(3);
    expect(result).toEqual([
      expect.objectContaining({
        id: categoryId,
        name: "Mountain Rescue",
        description: null,
        incidentTypeIds: [typeA, typeB],
        members: [{ id: userA, username: "alpine_1" }]
      })
    ]);
    // A category with no links still appears, with empty sets: the admin list must not hide it.
    const empty = makeStore({
      selects: [[{ id: categoryId, name: "General", description: null, createdAt: new Date() }], [], []]
    });
    await expect(empty.store.listCategories()).resolves.toEqual([
      expect.objectContaining({ id: categoryId, name: "General", description: null, incidentTypeIds: [], members: [] })
    ]);
  });

  it("orders the list and the links it groups, so the payload is stable", () => {
    expect(categoryListQueries(offlineDb).rows.toSQL().sql).toContain('order by "categories"."name" asc');
    expect(categoryListQueries(offlineDb).incidentTypes.toSQL().sql).toContain('inner join "incident_types"');
    expect(categoryListQueries(offlineDb).incidentTypes.toSQL().sql).toContain(
      'order by "incident_types"."name" asc, "incident_types"."id" asc'
    );
    expect(categoryListQueries(offlineDb).members.toSQL().sql).toContain('inner join "users"');
    expect(categoryListQueries(offlineDb).members.toSQL().sql).toContain(
      'order by "users"."username" asc, "users"."id" asc'
    );
    // A guard on the bug this file nearly shipped with: the links query has no `categories` in its FROM, so
    // any reference to it in the SQL is an error Postgres raises at runtime, not one a test would otherwise see.
    expect(categoryListQueries(offlineDb).incidentTypes.toSQL().sql).not.toContain('"categories".');
  });

  it("validates the incident types before it writes anything", async () => {
    const ghost = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
    const { store, log } = makeStore({ selects: [[{ id: typeA }]] });

    const result = await store.createCategory({
      adminId,
      name: "Mountain Rescue",
      description: null,
      incidentTypeIds: [typeA, ghost]
    });

    expect(result).toEqual({ status: "unknown_incident_types", ids: [ghost] });
    expect(log.inserts, "a refusal must not have created the category already").toEqual([]);
    expect(log.audit()).toEqual([]);
  });

  it("writes the category, its links, and one audit row in the same transaction", async () => {
    const stored = { id: categoryId, name: "Mountain Rescue", description: "alpine", createdAt: new Date() };
    const { store, log, transaction } = makeStore({
      selects: [[{ id: typeA }, { id: typeB }]],
      insertedRows: [stored]
    });

    const result = await store.createCategory({
      adminId,
      name: "Mountain Rescue",
      description: "alpine",
      incidentTypeIds: [typeA, typeB]
    });

    expect(transaction, "the set and its audit entry are one unit").toHaveBeenCalledOnce();
    expect(result).toEqual({
      status: "created",
      record: { ...stored, incidentTypeIds: [typeA, typeB], members: [] }
    });
    expect(log.inserts.map((entry) => entry.table)).toEqual([categories, categoryIncidentTypes, adminAuditLog]);
    expect(log.inserts[1]?.values).toEqual([
      { categoryId, incidentTypeId: typeA },
      { categoryId, incidentTypeId: typeB }
    ]);
    expect(log.inserts[2]?.values).toMatchObject({ action: "category_created", targetType: "category", targetId: categoryId });
  });

  it("skips the link insert entirely for an empty set, which is a legal category", async () => {
    const stored = { id: categoryId, name: "General", description: null, createdAt: new Date() };
    const { store, log } = makeStore({ insertedRows: [stored] });

    await store.createCategory({ adminId, name: "General", description: null, incidentTypeIds: [] });

    expect(log.inserts.map((entry) => entry.table)).toEqual([categories, adminAuditLog]);
    expect(log.selects, "nothing to validate against an empty list").toBe(0);
  });

  it("treats a PATCH that matches the row as no change at all", async () => {
    const existing = { id: categoryId, name: "Mountain Rescue", description: "alpine", createdAt: new Date() };
    const { store, log } = makeStore({
      // Three reads in this order: the row, the id-existence check, then the category's current links.
      selects: [[existing], [{ id: typeA }], [{ id: typeA }]],
      updatedRows: [existing]
    });

    const result = await store.updateCategory({
      adminId,
      id: categoryId,
      patch: { name: "Mountain Rescue", incidentTypeIds: [typeA] }
    });

    expect(result).toEqual({
      status: "updated",
      record: { ...existing, incidentTypeIds: [typeA], members: [] },
      changed: false
    });
    expect(log.updates).toEqual([]);
    expect(log.deletes, "a set that already matches is not rewritten").toEqual([]);
    expect(log.audit()).toEqual([]);
  });

  it("replaces the set only when it differs, and says so in the audit fields", async () => {
    const existing = { id: categoryId, name: "Mountain Rescue", description: "alpine", createdAt: new Date() };
    const after = { ...existing, name: "Alpine Response" };
    const { store, log } = makeStore({
      // The second read answers "do these ids exist", the third "what does the category have today".
      selects: [[existing], [{ id: typeB }], [{ id: typeA }]],
      updatedRows: [after]
    });

    const result = await store.updateCategory({
      adminId,
      id: categoryId,
      patch: { name: "Alpine Response", incidentTypeIds: [typeB] }
    });

    expect(result).toMatchObject({ status: "updated", changed: true, record: { name: "Alpine Response", incidentTypeIds: [typeB] } });
    expect(log.updates).toEqual([{ table: categories, set: { name: "Alpine Response" } }]);
    expect(log.deletes).toEqual([categoryIncidentTypes]);
    expect(log.inserts.map((entry) => entry.table)).toEqual([categoryIncidentTypes, adminAuditLog]);
    expect(log.audit()[0]?.values).toMatchObject({
      action: "category_updated",
      meta: {
        fields: ["incidentTypeIds", "name"],
        before: { name: "Mountain Rescue", incidentTypeIds: [typeA] },
        after: { name: "Alpine Response", incidentTypeIds: [typeB] }
      }
    });
  });

  it("answers not_found for an unknown category without reading the pivot", async () => {
    const { store, log } = makeStore({ selects: [[]] });

    await expect(store.updateCategory({ adminId, id: categoryId, patch: { name: "x" } })).resolves.toEqual({
      status: "not_found"
    });
    expect(log.selects).toBe(1);
    expect(log.updates).toEqual([]);
  });

  it("assigns through the composite key so a repeated assignment cannot fail", async () => {
    const { store, log } = makeStore({
      selects: [[{ id: categoryId }], [{ id: userA }, { id: userB }]],
      insertedRows: [{ userId: userA }, { userId: userB }]
    });

    await expect(store.assignUsers({ adminId, id: categoryId, userIds: [userA, userB] })).resolves.toEqual({
      status: "assigned",
      added: 2
    });
    const membership = log.inserts.find((entry) => entry.table === categoryUsers);
    expect(membership?.conflict).toEqual([categoryUsers.categoryId, categoryUsers.userId]);
    expect(log.audit()[0]?.values).toMatchObject({
      action: "category_users_assigned",
      meta: { added: 2, userIds: [userA, userB] }
    });
    expect(foundUserIdsQuery(offlineDb, [userA]).toSQL().sql).toContain('where "users"."id" in ($1)');
  });

  it("adds no audit row when everybody was already a member", async () => {
    const { store, log } = makeStore({
      selects: [[{ id: categoryId }], [{ id: userA }]],
      insertedRows: []
    });

    await expect(store.assignUsers({ adminId, id: categoryId, userIds: [userA] })).resolves.toEqual({
      status: "assigned",
      added: 0
    });
    expect(log.audit()).toEqual([]);
  });

  it("refuses unknown users before writing the membership", async () => {
    const ghost = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const { store, log } = makeStore({ selects: [[{ id: categoryId }], [{ id: userA }]] });

    await expect(store.assignUsers({ adminId, id: categoryId, userIds: [ghost, userA] })).resolves.toEqual({
      status: "unknown_users",
      ids: [ghost]
    });
    expect(log.inserts.filter((entry) => entry.table === categoryUsers)).toEqual([]);
  });

  it("says the category is missing, not the membership, when only the category is gone", async () => {
    const { store } = makeStore({ selects: [[]] });

    await expect(store.assignUsers({ adminId, id: categoryId, userIds: [userA] })).resolves.toEqual({
      status: "not_found"
    });
    await expect(store.removeUser({ adminId, id: categoryId, userId: userA })).resolves.toEqual({
      status: "not_found"
    });
  });

  it("reports a non-member removal as the state it is, without auditing it", async () => {
    const { store, log } = makeStore({ selects: [[{ id: categoryId }]], deletedRows: [] });

    await expect(store.removeUser({ adminId, id: categoryId, userId: userA })).resolves.toEqual({
      status: "removed",
      wasMember: false
    });
    expect(log.deletes).toEqual([categoryUsers]);
    expect(log.audit()).toEqual([]);
  });

  it("audits a removal that actually removed something", async () => {
    const { store, log } = makeStore({ selects: [[{ id: categoryId }]], deletedRows: [{ userId: userA }] });

    await expect(store.removeUser({ adminId, id: categoryId, userId: userA })).resolves.toEqual({
      status: "removed",
      wasMember: true
    });
    expect(log.audit()[0]?.values).toMatchObject({
      action: "category_user_removed",
      targetId: categoryId,
      meta: { userId: userA }
    });
  });

  it("lets one account belong to several categories, which is what T3.1.4 is about", async () => {
    const second = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
    const { store, log } = makeStore({
      selects: [[{ id: categoryId }], [{ id: userA }], [{ id: second }], [{ id: userA }]],
      insertedRows: [{ userId: userA }]
    });

    await store.assignUsers({ adminId, id: categoryId, userIds: [userA] });
    await store.assignUsers({ adminId, id: second, userIds: [userA] });

    // Nothing in the writes or the keys prevents a second membership: the pivot's key is the *pair*, and
    // the two statements below are what the admin screen will run for one account in two categories.
    const memberships = log.inserts.filter((entry) => entry.table === categoryUsers).map((entry) => entry.values);
    expect(memberships).toEqual([
      [{ categoryId, userId: userA }],
      [{ categoryId: second, userId: userA }]
    ]);
    expect(
      categoryMemberInsertQuery(offlineDb, { categoryId, userIds: [userA] }).toSQL().sql
    ).toContain('on conflict ("category_id","user_id") do nothing');
  });

  it("deletes exactly one category's links, which is what makes the replace safe", () => {
    expect(deleteCategoryIncidentTypesQuery(offlineDb, categoryId).toSQL().sql).toContain(
      'where "category_incident_types"."category_id" = $1'
    );
  });

  it("renders the two pivot writes the way the claims describe them", () => {
    expect(
      categoryMemberInsertQuery(offlineDb, { categoryId, userIds: [userA, userB] }).toSQL().sql
    ).toContain(
      'on conflict ("category_id","user_id") do nothing returning "user_id"'
    );
    expect(
      categoryIncidentTypeInsertQuery(offlineDb, { categoryId, incidentTypeIds: [typeA] }).toSQL().sql
    ).toContain('insert into "category_incident_types" ("category_id", "incident_type_id") values ($1, $2)');
    expect(
      categoryIncidentTypeInsertQuery(offlineDb, { categoryId, incidentTypeIds: [typeA, userB] }).toSQL().sql
    ).toContain("($3, $4)");
  });
});
