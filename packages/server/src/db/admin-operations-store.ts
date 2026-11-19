import { asc, and, count, eq, gte, inArray, isNotNull, sql } from "drizzle-orm";
import type { CancellationReason, CancellationReasonCreateInput, SosRequestStatus } from "@borobiya/shared";
import type { Database } from "./client";
import { adminAuditLog, cancellationReasons, missions, sosRequests, userSessions, users } from "./schema";
import { PRESENCE_STALE_MS } from "../realtime/presence";

export interface AdminOperationsStore {
  getStats(): Promise<{ counts: Record<string, number>; activeMissions: number; onlineUsers: number }>;
  listCancellationReasons(): Promise<CancellationReason[]>;
  createCancellationReason(input: CancellationReasonCreateInput & { adminId: string }):
    Promise<CancellationReason | null>;
}

/** Admin-only reads and writes; the unique (type, key) index is the final arbiter of duplicates. */
export class DrizzleAdminOperationsStore implements AdminOperationsStore {
  constructor(private readonly db: Database) {}

  async getStats(): ReturnType<AdminOperationsStore["getStats"]> {
    const [statuses, [active], [online]] = await Promise.all([
      this.db.select({ status: sosRequests.status, total: count() }).from(sosRequests).groupBy(sosRequests.status),
      this.db.select({ total: count() }).from(missions)
        .where(inArray(missions.status, ["pending", "on_the_way", "arrived", "in_progress"])),
      this.db.select({ total: sql<number>`count(distinct ${userSessions.userId})::int` }).from(userSessions)
        .innerJoin(users, eq(users.id, userSessions.userId))
        .where(and(eq(users.isActive, true), eq(users.isSuspended, false),
          eq(userSessions.isOnline, true), isNotNull(userSessions.refreshTokenHash),
          gte(userSessions.lastActiveAt, new Date(Date.now() - PRESENCE_STALE_MS))))
    ]);
    const counts: Record<string, number> = Object.fromEntries(([
      "pending", "dispatched", "accepted", "cancelled_by_requester", "cancelled_by_rescuer", "expired", "completed"
    ] satisfies SosRequestStatus[]).map((status) => [status, 0]));
    for (const row of statuses) counts[row.status] = row.total;
    return { counts, activeMissions: active?.total ?? 0, onlineUsers: online?.total ?? 0 };
  }

  async listCancellationReasons(): Promise<CancellationReason[]> {
    return this.db.select().from(cancellationReasons)
      .orderBy(asc(cancellationReasons.type), asc(cancellationReasons.key));
  }

  async createCancellationReason(input: CancellationReasonCreateInput & { adminId: string }):
    Promise<CancellationReason | null> {
    return this.db.transaction(async (tx) => {
      const [reason] = await tx.insert(cancellationReasons).values({
        type: input.type, key: input.key, label: input.label, labelFa: input.labelFa,
        requiresCustomText: input.requiresCustomText, isActive: input.isActive
      }).onConflictDoNothing({ target: [cancellationReasons.type, cancellationReasons.key] }).returning();
      if (!reason) return null;
      await tx.insert(adminAuditLog).values({
        adminId: input.adminId, action: "cancellation_reason_created", targetType: "cancellation_reason",
        targetId: reason.id, meta: { type: reason.type, key: reason.key }
      });
      return reason;
    });
  }
}
