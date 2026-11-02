import { and, count, desc, eq, gte, lte } from "drizzle-orm";
import type { AdminAuditEntry, AdminAuditQuery } from "@borobiya/shared";
import type { Database } from "./client";
import { adminAuditLog, users } from "./schema";

/**
 * Read side of `admin_audit_log` — the table every privileged mutation already writes.
 *
 * Only a read is exposed: an audit trail that can be edited or deleted from the console is not an audit
 * trail, so there is deliberately no write path here and no route that deletes a row.
 */
export interface AdminAuditPage {
  items: AdminAuditEntry[];
  total: number;
}

export interface AdminAuditStore {
  listEntries(query: AdminAuditQuery): Promise<AdminAuditPage>;
}

function filters(query: AdminAuditQuery) {
  const clauses = [
    query.action === undefined ? undefined : eq(adminAuditLog.action, query.action),
    query.targetType === undefined ? undefined : eq(adminAuditLog.targetType, query.targetType),
    query.adminId === undefined ? undefined : eq(adminAuditLog.adminId, query.adminId),
    query.from === undefined ? undefined : gte(adminAuditLog.createdAt, new Date(query.from)),
    query.to === undefined ? undefined : lte(adminAuditLog.createdAt, new Date(query.to))
  ];
  return clauses.filter((clause) => clause !== undefined);
}

export function auditListQuery(db: Database, query: AdminAuditQuery) {
  const where = filters(query);
  return {
    rows: db
      .select({
        id: adminAuditLog.id,
        adminId: adminAuditLog.adminId,
        adminUsername: users.username,
        action: adminAuditLog.action,
        targetType: adminAuditLog.targetType,
        targetId: adminAuditLog.targetId,
        meta: adminAuditLog.meta,
        createdAt: adminAuditLog.createdAt
      })
      .from(adminAuditLog)
      // A left join keeps an entry whose actor row is gone: losing the name is not losing the record.
      .leftJoin(users, eq(users.id, adminAuditLog.adminId))
      .where(where.length === 0 ? undefined : and(...where))
      // `id` breaks ties: two actions in the same millisecond still page deterministically.
      .orderBy(desc(adminAuditLog.createdAt), desc(adminAuditLog.id))
      .limit(query.limit)
      .offset((query.page - 1) * query.limit),
    total: db
      .select({ value: count() })
      .from(adminAuditLog)
      .where(where.length === 0 ? undefined : and(...where))
  };
}

export class DrizzleAdminAuditStore implements AdminAuditStore {
  constructor(private readonly db: Database) {}

  async listEntries(query: AdminAuditQuery): Promise<AdminAuditPage> {
    const { rows, total } = auditListQuery(this.db, query);
    const [items, [totals]] = await Promise.all([rows, total]);
    return {
      items: items.map((entry) => ({
        id: entry.id,
        adminId: entry.adminId,
        adminUsername: entry.adminUsername ?? null,
        action: entry.action,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        meta: entry.meta ?? null,
        createdAt: entry.createdAt.toISOString()
      })),
      total: totals?.value ?? 0
    };
  }
}
