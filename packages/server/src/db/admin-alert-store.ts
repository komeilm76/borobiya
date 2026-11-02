import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { AdminAlert, AdminAlertQuery } from "@borobiya/shared";
import type { Database } from "./client";
import { adminAlerts, adminAuditLog, missions, users } from "./schema";

/**
 * The admin alert queue. Rows are produced by the cancellation workflow (`sos-cancellation-store`), so this
 * store only reads them and records the reviewer's decision; it never invents an alert.
 *
 * Resolving is idempotent on purpose: two admins opening the same queue is normal, and the second click must
 * not turn into a 409 the first reviewer has to explain. The audit entry is written once, by the call that
 * actually changed the row.
 */
export interface AdminAlertPage {
  items: AdminAlert[];
  total: number;
}

export type AdminAlertResolveResult =
  | { status: "resolved"; alert: AdminAlert; changed: boolean }
  | { status: "not_found" };

export interface AdminAlertStore {
  listAlerts(query: AdminAlertQuery): Promise<AdminAlertPage>;
  resolveAlert(input: { id: string; adminId: string }): Promise<AdminAlertResolveResult>;
}

const alertSelection = {
  id: adminAlerts.id,
  type: adminAlerts.type,
  userId: adminAlerts.userId,
  username: users.username,
  missionId: adminAlerts.missionId,
  sosRequestId: missions.sosRequestId,
  details: adminAlerts.details,
  createdAt: adminAlerts.createdAt,
  resolvedAt: adminAlerts.resolvedAt
};

function alertFilters(query: AdminAlertQuery) {
  return [
    query.type === undefined ? undefined : eq(adminAlerts.type, query.type),
    query.resolved === undefined
      ? undefined
      : query.resolved
        ? isNotNull(adminAlerts.resolvedAt)
        : isNull(adminAlerts.resolvedAt)
  ].filter((clause) => clause !== undefined);
}

function alertRowQuery(db: Database, id: string) {
  return db
    .select(alertSelection)
    .from(adminAlerts)
    .innerJoin(users, eq(users.id, adminAlerts.userId))
    .innerJoin(missions, eq(missions.id, adminAlerts.missionId))
    .where(eq(adminAlerts.id, id));
}

export function alertListQuery(db: Database, query: AdminAlertQuery) {
  const where = alertFilters(query);
  return {
    rows: db
      .select(alertSelection)
      .from(adminAlerts)
      .innerJoin(users, eq(users.id, adminAlerts.userId))
      .innerJoin(missions, eq(missions.id, adminAlerts.missionId))
      .where(where.length === 0 ? undefined : and(...where))
      // Unresolved first — the queue exists to be emptied — then newest.
      // Postgres sorts NULLs last on ASC, so the unresolved rows (NULL `resolved_at`) have to come from a
      // DESC: that is NULLS FIRST here, and it also puts the most recently reviewed row on top.
      .orderBy(desc(adminAlerts.resolvedAt), desc(adminAlerts.createdAt), desc(adminAlerts.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit),
    total: db
      .select({ value: count() })
      .from(adminAlerts)
      .where(where.length === 0 ? undefined : and(...where))
  };
}

type AlertRow = {
  id: string;
  type: string;
  userId: string;
  username: string;
  missionId: string;
  sosRequestId: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
  resolvedAt: Date | null;
};

function alertPayload(row: AlertRow): AdminAlert {
  return {
    id: row.id,
    type: row.type,
    userId: row.userId,
    username: row.username,
    missionId: row.missionId,
    sosRequestId: row.sosRequestId,
    details: row.details ?? null,
    createdAt: row.createdAt.toISOString(),
    resolvedAt: row.resolvedAt === null ? null : row.resolvedAt.toISOString()
  };
}

export class DrizzleAdminAlertStore implements AdminAlertStore {
  constructor(private readonly db: Database) {}

  async listAlerts(query: AdminAlertQuery): Promise<AdminAlertPage> {
    const { rows, total } = alertListQuery(this.db, query);
    const [items, [totals]] = await Promise.all([rows, total]);
    return { items: items.map(alertPayload), total: totals?.value ?? 0 };
  }

  async resolveAlert(input: { id: string; adminId: string }): Promise<AdminAlertResolveResult> {
    return this.db.transaction(async (tx) => {
      const [existing] = await alertRowQuery(tx as unknown as Database, input.id).for("update");
      if (!existing) return { status: "not_found" as const };
      // The row is locked, so the reviewer's decision and the audit entry commit together or not at all.
      const now = new Date();
      const changed = existing.resolvedAt === null;
      if (changed) {
        await tx.update(adminAlerts).set({ resolvedAt: now }).where(eq(adminAlerts.id, input.id));
        await tx.insert(adminAuditLog).values({
          adminId: input.adminId,
          action: "alert_resolved",
          targetType: "alert",
          targetId: input.id,
          meta: { type: existing.type, missionId: existing.missionId, rescuerId: existing.userId }
        });
      }
      return {
        status: "resolved" as const,
        changed,
        alert: alertPayload({ ...existing, resolvedAt: existing.resolvedAt ?? now })
      };
    });
  }
}
