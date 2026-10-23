import { asc, and, eq, ne } from "drizzle-orm";
import type { Database } from "./client";
import { adminAuditLog, incidentTypes } from "./schema";

/**
 * Persistence for the incident-type catalog behind `/_admin/incidents` (T3.1.2).
 *
 * The slug rule lives in `@borobiya/shared` (`resolveIncidentSlug`): this store receives the value it
 * must write, never the name it came from, so the derivation has exactly one owner and the admin form
 * previewing a slug cannot drift from the one the server enforces.
 */
export interface IncidentTypeRecord {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  description: string | null;
  createdAt: Date;
}

/** The fields a PATCH may carry; an absent key means "leave this alone". */
export interface IncidentTypePatch {
  name?: string;
  slug?: string;
  icon?: string | null;
  color?: string | null;
  description?: string | null;
}

/**
 * Which existing row already owns the slug. `name` is included so the refusal can point at something —
 * "Flood response" already uses `flood` is actionable, "unique constraint violation" is not. It is
 * `null` when the owner disappeared between our write and our lookup, which leaves the generic message.
 */
export interface IncidentTypeSlugConflict {
  slug: string;
  name: string | null;
}

export type IncidentTypeCreateResult =
  | { status: "created"; record: IncidentTypeRecord }
  | { status: "slug_taken"; conflict: IncidentTypeSlugConflict | null };

export type IncidentTypeUpdateResult =
  | { status: "updated"; record: IncidentTypeRecord; changed: boolean }
  | { status: "not_found" }
  | { status: "slug_taken"; conflict: IncidentTypeSlugConflict | null };

export interface IncidentTypeStore {
  listIncidentTypes(): Promise<IncidentTypeRecord[]>;
  createIncidentType(input: {
    adminId: string;
    name: string;
    slug: string;
    icon: string | null;
    color: string | null;
    description: string | null;
  }): Promise<IncidentTypeCreateResult>;
  updateIncidentType(input: { adminId: string; id: string; patch: IncidentTypePatch }): Promise<IncidentTypeUpdateResult>;
}

const incidentTypeSelection = {
  id: incidentTypes.id,
  name: incidentTypes.name,
  slug: incidentTypes.slug,
  icon: incidentTypes.icon,
  color: incidentTypes.color,
  description: incidentTypes.description,
  createdAt: incidentTypes.createdAt
};

/** Postgres' code for a unique violation; the only one this store has to recognize. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === "23505";
}

/**
 * A PATCH is a no-op when every field it names already holds that value. The comparison is deliberately
 * field-by-field rather than "did the row change": the audit log records an admin's decisions, and a
 * request that decided nothing must not add an entry saying otherwise.
 */
function unchangedFields(existing: IncidentTypeRecord, patch: IncidentTypePatch): Set<string> {
  const unchanged = new Set<string>();
  for (const key of ["name", "slug", "icon", "color", "description"] as const) {
    if (patch[key] !== undefined && patch[key] === existing[key]) unchanged.add(key);
  }
  return unchanged;
}

/**
 * The whole catalog, ordered by name. Exported so the ordering is a fact a test can read off the SQL
 * rather than a claim in prose: without an explicit `order by`, Postgres may return catalog rows in
 * whatever sequence the plan happens to produce, and an admin list that reorders itself reads as flicker.
 */
export function incidentTypeListQuery(db: Database) {
  return db.select(incidentTypeSelection).from(incidentTypes).orderBy(asc(incidentTypes.name));
}

/**
 * Who owns a slug — with the row being renamed excluded, so "save this form again" does not collide with
 * itself. Exported because that exclusion is the whole difference between a working rename and one that
 * refuses on its own value.
 */
export function incidentTypeSlugOwnerQuery(db: Database, input: { slug: string; excludeId?: string }) {
  const condition =
    input.excludeId === undefined
      ? eq(incidentTypes.slug, input.slug)
      : and(eq(incidentTypes.slug, input.slug), ne(incidentTypes.id, input.excludeId));
  return db
    .select({ slug: incidentTypes.slug, name: incidentTypes.name })
    .from(incidentTypes)
    .where(condition)
    .limit(1);
}

/**
 * The create statement, exported for the same reason as the reads: the conflict target is the duplicate
 * rule, and a test should be able to see it in the SQL the driver will receive rather than in a comment.
 */
export function incidentTypeInsertQuery(
  db: Database,
  values: { name: string; slug: string; icon: string | null; color: string | null; description: string | null }
) {
  return db
    .insert(incidentTypes)
    .values(values)
    .onConflictDoNothing({ target: incidentTypes.slug })
    .returning(incidentTypeSelection);
}

/** The rename/edit statement. `set` holds only the fields that actually differ, so the audit entry and
 * the write agree about what changed. */
export function incidentTypeUpdateQuery(db: Database, input: { id: string; set: Record<string, string | null> }) {
  return db.update(incidentTypes).set(input.set).where(eq(incidentTypes.id, input.id)).returning(incidentTypeSelection);
}

/** The row lock-free existence probe used before a rename; see `incidentTypeSlugOwnerQuery`. */
export function incidentTypeByIdQuery(db: Database, id: string) {
  return db.select(incidentTypeSelection).from(incidentTypes).where(eq(incidentTypes.id, id)).limit(1);
}

export class DrizzleIncidentTypeStore implements IncidentTypeStore {
  constructor(private readonly db: Database) {}

  async listIncidentTypes(): Promise<IncidentTypeRecord[]> {
    return incidentTypeListQuery(this.db);
  }

  /**
   * The unique index on `slug` is the duplicate rule, so the insert asks it directly with
   * `onConflictDoNothing` instead of reading first: two admins submitting the same name at once must not
   * both believe they won.
   */
  async createIncidentType(input: {
    adminId: string;
    name: string;
    slug: string;
    icon: string | null;
    color: string | null;
    description: string | null;
  }): Promise<IncidentTypeCreateResult> {
    return this.db.transaction(async (tx) => {
      const inserted = await incidentTypeInsertQuery(tx as unknown as Database, {
        name: input.name,
        slug: input.slug,
        icon: input.icon,
        color: input.color,
        description: input.description
      });

      const record = inserted[0];
      if (!record) {
        const owners = await incidentTypeSlugOwnerQuery(tx as unknown as Database, { slug: input.slug });
        return {
          status: "slug_taken" as const,
          conflict: { slug: input.slug, name: owners[0]?.name ?? null }
        };
      }

      await tx.insert(adminAuditLog).values({
        adminId: input.adminId,
        action: "incident_type_created",
        targetType: "incident_type",
        targetId: record.id,
        meta: { slug: record.slug, name: record.name }
      });

      return { status: "created" as const, record };
    });
  }

  /**
   * One transaction for read, decide, write, audit. There is no row lock: the catalog is small, the only
   * invariant that matters is slug uniqueness, and the index enforces it even if another admin commits
   * the same slug between our lookup and our write — that surfaces as `23505` and is reported as the
   * same conflict rather than a 500.
   */
  async updateIncidentType(input: {
    adminId: string;
    id: string;
    patch: IncidentTypePatch;
  }): Promise<IncidentTypeUpdateResult> {
    return this.db.transaction(async (tx) => {
      const existing = (await incidentTypeByIdQuery(tx as unknown as Database, input.id))[0];
      if (!existing) return { status: "not_found" as const };

      const unchanged = unchangedFields(existing, input.patch);
      const set: Record<string, string | null> = {};
      for (const key of ["name", "slug", "icon", "color", "description"] as const) {
        const value = input.patch[key];
        if (value !== undefined && !unchanged.has(key)) set[key] = value;
      }

      if (Object.keys(set).length === 0) {
        return { status: "updated" as const, record: existing, changed: false };
      }

      const targetSlug = typeof set.slug === "string" ? set.slug : existing.slug;
      if (targetSlug !== existing.slug) {
        const owners = await incidentTypeSlugOwnerQuery(tx as unknown as Database, {
          slug: targetSlug,
          excludeId: input.id
        });
        const owner = owners[0];
        if (owner) {
          return { status: "slug_taken" as const, conflict: { slug: targetSlug, name: owner.name } };
        }
      }

      let updated: IncidentTypeRecord[];
      try {
        updated = await incidentTypeUpdateQuery(tx as unknown as Database, { id: input.id, set });
      } catch (error) {
        if (isUniqueViolation(error)) {
          return { status: "slug_taken" as const, conflict: { slug: targetSlug, name: null } };
        }
        throw error;
      }

      const record = updated[0];
      if (!record) return { status: "not_found" as const };

      await tx.insert(adminAuditLog).values({
        adminId: input.adminId,
        action: "incident_type_updated",
        targetType: "incident_type",
        targetId: record.id,
        meta: {
          fields: Object.keys(set).sort(),
          before: Object.fromEntries(Object.keys(set).map((field) => [field, existing[field as keyof IncidentTypeRecord]])),
          after: Object.fromEntries(Object.keys(set).map((field) => [field, record[field as keyof IncidentTypeRecord]]))
        }
      });

      return { status: "updated" as const, record, changed: true };
    });
  }
}
