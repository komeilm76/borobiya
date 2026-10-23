import { and, asc, eq, inArray } from "drizzle-orm";
import type { Database } from "./client";
import {
  adminAuditLog,
  categories,
  categoryIncidentTypes,
  categoryUsers,
  incidentTypes,
  users
} from "./schema";

/**
 * Persistence for responder categories and their two membership pivots — T3.1.3's routes.
 *
 * A category is a name plus one set, and the set is addressed by sending the whole of it: that is a
 * replace, not a diff, because the contract has no language for "add one" (`{ incidentTypeIds: [...] }` is
 * the only shape) and half-diffing a field the caller named is how a stale admin list quietly deletes
 * assignments it never showed.
 */
export interface CategoryMemberRecord {
  id: string;
  username: string;
}

export interface CategoryRecord {
  id: string;
  name: string;
  description: string | null;
  /** Ordered by the incident type's name, so the same set always renders in the same sequence. */
  incidentTypeIds: string[];
  /** Ordered by username then id so membership lists render deterministically. */
  members: CategoryMemberRecord[];
  createdAt: Date;
}

export type CategoryCreateResult =
  | { status: "created"; record: CategoryRecord }
  | { status: "unknown_incident_types"; ids: string[] };

export type CategoryUpdateResult =
  | { status: "updated"; record: CategoryRecord; changed: boolean }
  | { status: "not_found" }
  | { status: "unknown_incident_types"; ids: string[] };

/**
 * `added` counts the rows this call actually created, so a re-assignment of the same members is reported as
 * what it was (zero new rows) rather than as a failure. It exists for the audit entry and the caller's log
 * line, not for the response body, which the contract fixes at no content.
 */
export type CategoryAssignResult =
  | { status: "assigned"; added: number }
  | { status: "not_found" }
  | { status: "unknown_users"; ids: string[] };

/** `wasMember` is deliberately not an error: removal asks for a state, and an already-met one is fine. */
export type CategoryRemoveMemberResult =
  | { status: "removed"; wasMember: boolean }
  | { status: "not_found" };

export interface CategoryStore {
  listCategories(): Promise<CategoryRecord[]>;
  createCategory(input: {
    adminId: string;
    name: string;
    description: string | null;
    incidentTypeIds: string[];
  }): Promise<CategoryCreateResult>;
  updateCategory(input: {
    adminId: string;
    id: string;
    patch: { name?: string; description?: string | null; incidentTypeIds?: string[] };
  }): Promise<CategoryUpdateResult>;
  assignUsers(input: { adminId: string; id: string; userIds: string[] }): Promise<CategoryAssignResult>;
  removeUser(input: { adminId: string; id: string; userId: string }): Promise<CategoryRemoveMemberResult>;
}

const categorySelection = {
  id: categories.id,
  name: categories.name,
  description: categories.description,
  createdAt: categories.createdAt
};

/**
 * The list read, exported so the joins and the ordering are facts a test can read off the SQL instead of
 * prose. Both pivot reads are separate statements grouped in code rather than `jsonb_agg`-ing in the
 * database: the aggregate would be one round trip, but it hides the ordering guarantee, the empty-set
 * case, and the join's cardinality inside an expression. The catalog is small; the certainty is cheaper.
 */
export function categoryListQueries(db: Database) {
  return {
    rows: db.select(categorySelection).from(categories).orderBy(asc(categories.name)),
    // Only tables in this statement's FROM may appear in its ORDER BY: ordering the links by category name
    // read naturally in review and would have failed as `missing FROM-clause entry` the first time Postgres
    // ran it. The list's order comes from the `rows` query; this one only has to be deterministic inside a
    // category, which is what the two `incident_types` terms do.
    incidentTypes: db
      .select({ categoryId: categoryIncidentTypes.categoryId, incidentTypeId: incidentTypes.id })
      .from(categoryIncidentTypes)
      .innerJoin(incidentTypes, eq(incidentTypes.id, categoryIncidentTypes.incidentTypeId))
      .orderBy(asc(incidentTypes.name), asc(incidentTypes.id)),
    members: db
      .select({ categoryId: categoryUsers.categoryId, id: users.id, username: users.username })
      .from(categoryUsers)
      .innerJoin(users, eq(users.id, categoryUsers.userId))
      .orderBy(asc(users.username), asc(users.id))
  };
}

/** Which of the requested ids the catalog does not have — reported in the order the caller sent them. */
export function foundIncidentTypeIdsQuery(db: Database, ids: string[]) {
  return db
    .select({ id: incidentTypes.id })
    .from(incidentTypes)
    .where(inArray(incidentTypes.id, ids))
    .orderBy(asc(incidentTypes.id));
}

/** The same question for accounts: assigning a user who does not exist is a refusal, not a typo. */
export function foundUserIdsQuery(db: Database, ids: string[]) {
  return db.select({ id: users.id }).from(users).where(inArray(users.id, ids)).orderBy(asc(users.id));
}

export function deleteCategoryIncidentTypesQuery(db: Database, categoryId: string) {
  return db.delete(categoryIncidentTypes).where(eq(categoryIncidentTypes.categoryId, categoryId));
}

function missingFrom(requested: string[], found: { id: string }[]): string[] {
  const present = new Set(found.map((row) => row.id));
  return requested.filter((id) => !present.has(id));
}

/** Exported with the same reasoning as the read builders: every pivot write is one statement a test can read. */
export function categoryIncidentTypeInsertQuery(db: Database, input: { categoryId: string; incidentTypeIds: string[] }) {
  return db
    .insert(categoryIncidentTypes)
    .values(input.incidentTypeIds.map((incidentTypeId) => ({ categoryId: input.categoryId, incidentTypeId })));
}

/**
 * Membership insert, with `on conflict do nothing` on the composite key: an admin pressing "assign" twice,
 * or a form that double-submits, must not fail. A duplicate inside one statement is skipped the same way
 * (measured on PostgreSQL: the repeated row neither errors nor appears in `returning`), and the count this
 * reports is only meaningful because `uniqueIdsSchema` in the shared contract rejects duplicate ids in the
 * body first — without that rule a caller sending the same user twice would hear "0 added" about a write
 * that did insert one row.
 */
export function categoryMemberInsertQuery(db: Database, input: { categoryId: string; userIds: string[] }) {
  return db
    .insert(categoryUsers)
    .values(input.userIds.map((userId) => ({ categoryId: input.categoryId, userId })))
    .onConflictDoNothing({ target: [categoryUsers.categoryId, categoryUsers.userId] })
    .returning({ userId: categoryUsers.userId });
}

async function insertIncidentTypeLinks(db: Database, categoryId: string, incidentTypeIds: string[]) {
  if (incidentTypeIds.length === 0) return;
  await categoryIncidentTypeInsertQuery(db, { categoryId, incidentTypeIds });
}

async function readIncidentTypeIds(db: Database, categoryId: string): Promise<string[]> {
  const rows = await db
    .select({ id: incidentTypes.id })
    .from(categoryIncidentTypes)
    .innerJoin(incidentTypes, eq(incidentTypes.id, categoryIncidentTypes.incidentTypeId))
    .where(eq(categoryIncidentTypes.categoryId, categoryId))
    .orderBy(asc(incidentTypes.name), asc(incidentTypes.id));
  return rows.map((row) => row.id);
}

async function readCategoryMembers(db: Database, categoryId: string): Promise<CategoryMemberRecord[]> {
  return db
    .select({ id: users.id, username: users.username })
    .from(categoryUsers)
    .innerJoin(users, eq(users.id, categoryUsers.userId))
    .where(eq(categoryUsers.categoryId, categoryId))
    .orderBy(asc(users.username), asc(users.id));
}

/** The audit entry's before/after for exactly the columns a PATCH wrote. */
function auditChanges(
  fields: string[],
  before: Record<string, unknown>,
  after: Record<string, unknown>
) {
  return {
    before: Object.fromEntries(fields.map((field) => [field, before[field] ?? null])),
    after: Object.fromEntries(fields.map((field) => [field, after[field] ?? null]))
  };
}

export class DrizzleCategoryStore implements CategoryStore {
  constructor(private readonly db: Database) {}

  async listCategories(): Promise<CategoryRecord[]> {
    const queries = categoryListQueries(this.db);
    const [rows, links, memberLinks] = await Promise.all([
      queries.rows,
      queries.incidentTypes,
      queries.members
    ]);

    const byCategory = new Map<string, string[]>();
    for (const link of links) {
      const bucket = byCategory.get(link.categoryId);
      if (bucket) bucket.push(link.incidentTypeId);
      else byCategory.set(link.categoryId, [link.incidentTypeId]);
    }
    const membersByCategory = new Map<string, CategoryMemberRecord[]>();
    for (const member of memberLinks) {
      const item: CategoryMemberRecord = { id: member.id, username: member.username };
      const bucket = membersByCategory.get(member.categoryId);
      if (bucket) bucket.push(item);
      else membersByCategory.set(member.categoryId, [item]);
    }
    return rows.map((row) => ({
      ...row,
      incidentTypeIds: byCategory.get(row.id) ?? [],
      members: membersByCategory.get(row.id) ?? []
    }));
  }

  /**
   * Validation runs before the write, inside the same transaction as it. An unknown incident-type id would
   * otherwise reach the pivot's foreign key and surface as a 500 quoting a constraint — the failure mode the
   * share routes already decided against, where the caller is told which index of their own array was wrong.
   */
  async createCategory(input: {
    adminId: string;
    name: string;
    description: string | null;
    incidentTypeIds: string[];
  }): Promise<CategoryCreateResult> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      if (input.incidentTypeIds.length > 0) {
        const found = await foundIncidentTypeIdsQuery(db, input.incidentTypeIds);
        const unknown = missingFrom(input.incidentTypeIds, found);
        if (unknown.length > 0) return { status: "unknown_incident_types" as const, ids: unknown };
      }

      const inserted = await db
        .insert(categories)
        .values({ name: input.name, description: input.description })
        .returning(categorySelection);
      const row = inserted[0];
      // An insert with `returning` that yields nothing is not a caller error; reporting it as one would
      // hide a broken database from the logs. The error envelope turns it into a generic 500.
      if (!row) throw new Error("category insert returned no row");

      await insertIncidentTypeLinks(db, row.id, input.incidentTypeIds);
      await db.insert(adminAuditLog).values({
        adminId: input.adminId,
        action: "category_created",
        targetType: "category",
        targetId: row.id,
        meta: { name: row.name, incidentTypeCount: input.incidentTypeIds.length }
      });

      return {
        status: "created" as const,
        record: { ...row, incidentTypeIds: input.incidentTypeIds, members: [] }
      };
    });
  }

  async updateCategory(input: {
    adminId: string;
    id: string;
    patch: { name?: string; description?: string | null; incidentTypeIds?: string[] };
  }): Promise<CategoryUpdateResult> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const existing = (
        await db.select(categorySelection).from(categories).where(eq(categories.id, input.id)).limit(1)
      )[0];
      if (!existing) return { status: "not_found" as const };

      const requestedIds = input.patch.incidentTypeIds;
      if (requestedIds && requestedIds.length > 0) {
        const found = await foundIncidentTypeIdsQuery(db, requestedIds);
        const unknown = missingFrom(requestedIds, found);
        if (unknown.length > 0) return { status: "unknown_incident_types" as const, ids: unknown };
      }

      const set: Record<string, string | null> = {};
      if (input.patch.name !== undefined && input.patch.name !== existing.name) set.name = input.patch.name;
      if (input.patch.description !== undefined && input.patch.description !== existing.description) {
        set.description = input.patch.description;
      }
      const currentIds = await readIncidentTypeIds(db, input.id);
      const idsDiffer = requestedIds !== undefined && requestedIds.join(",") !== currentIds.join(",");
      // Sorted as one list, so the audit entry does not depend on which keys the caller happened to send.
      const writtenFields = [...Object.keys(set), ...(idsDiffer ? ["incidentTypeIds"] : [])].sort();

      if (writtenFields.length === 0) {
        const members = await readCategoryMembers(db, input.id);
        return {
          status: "updated" as const,
          record: { ...existing, incidentTypeIds: currentIds, members },
          changed: false
        };
      }

      let after = existing;
      if (Object.keys(set).length > 0) {
        const updated = await db
          .update(categories)
          .set(set)
          .where(eq(categories.id, input.id))
          .returning(categorySelection);
        const row = updated[0];
        // The row was there a statement ago in this same transaction; gone now means something outside
        // this code deleted it, which is not a caller error and is not reported as one.
        if (!row) return { status: "not_found" as const };
        after = row;
      }

      if (idsDiffer) {
        await deleteCategoryIncidentTypesQuery(db, input.id);
        await insertIncidentTypeLinks(db, input.id, requestedIds ?? []);
      }
      const incidentTypeIds = idsDiffer ? requestedIds ?? [] : currentIds;

      await db.insert(adminAuditLog).values({
        adminId: input.adminId,
        action: "category_updated",
        targetType: "category",
        targetId: after.id,
        meta: {
          fields: writtenFields,
          ...auditChanges(writtenFields, { ...existing, incidentTypeIds: currentIds }, { ...after, incidentTypeIds })
        }
      });

      const members = await readCategoryMembers(db, after.id);
      return { status: "updated" as const, record: { ...after, incidentTypeIds, members }, changed: true };
    });
  }

  /**
   * Idempotent by construction: `on conflict do nothing` on the composite key, because pressing "assign"
   * twice and double-clicking the form must not fail, and must not add a second audit row either — which
   * is what the `added` count decides.
   */
  async assignUsers(input: { adminId: string; id: string; userIds: string[] }): Promise<CategoryAssignResult> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const category = (
        await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.id)).limit(1)
      )[0];
      if (!category) return { status: "not_found" as const };

      const found = await foundUserIdsQuery(db, input.userIds);
      const unknown = missingFrom(input.userIds, found);
      if (unknown.length > 0) return { status: "unknown_users" as const, ids: unknown };

      const inserted = await categoryMemberInsertQuery(db, { categoryId: input.id, userIds: input.userIds });

      if (inserted.length === 0) return { status: "assigned" as const, added: 0 };

      await db.insert(adminAuditLog).values({
        adminId: input.adminId,
        action: "category_users_assigned",
        targetType: "category",
        targetId: input.id,
        meta: { added: inserted.length, userIds: inserted.map((row) => row.userId) }
      });

      return { status: "assigned" as const, added: inserted.length };
    });
  }

  /**
   * Removing a non-member succeeds with `wasMember: false` rather than 404-ing. The difference from share
   * revocation is real: there, "you were never granted this" is information the caller needs; here the admin
   * asked for a state that already holds, and the list on their screen will agree with them.
   */
  async removeUser(input: { adminId: string; id: string; userId: string }): Promise<CategoryRemoveMemberResult> {
    return this.db.transaction(async (transaction) => {
      const db = transaction as unknown as Database;
      const category = (
        await db.select({ id: categories.id }).from(categories).where(eq(categories.id, input.id)).limit(1)
      )[0];
      if (!category) return { status: "not_found" as const };

      const deleted = await db
        .delete(categoryUsers)
        .where(and(eq(categoryUsers.categoryId, input.id), eq(categoryUsers.userId, input.userId)))
        .returning({ userId: categoryUsers.userId });

      if (deleted.length === 0) return { status: "removed" as const, wasMember: false };

      await db.insert(adminAuditLog).values({
        adminId: input.adminId,
        action: "category_user_removed",
        targetType: "category",
        targetId: input.id,
        meta: { userId: input.userId }
      });

      return { status: "removed" as const, wasMember: true };
    });
  }
}
