import { and, asc, eq, gt, gte, inArray, or, sql } from "drizzle-orm";
import type { UserSyncResponse } from "@borobiya/shared";
import type { Database } from "./client";
import { missionStatusHistory, missions } from "./schema";
import { toMission } from "./mission-progress-store";

export const SYNC_EVENT_PAGE_SIZE = 100;
export const SYNC_MISSION_LIMIT = 100;
export const SYNC_MAX_AGE_MS = 30 * 24 * 60 * 60_000;

export interface SyncStore {
  readSync(input: { userId: string; since: Date; cursor?: string }): Promise<UserSyncResponse | "invalid_cursor">;
}

/** Durable, owner-scoped mission recovery. Never replays GPS or emits stale proposal/socket events. */
export class DrizzleSyncStore implements SyncStore {
  constructor(private readonly db: Database) {}

  async readSync({ userId, since, cursor }: { userId: string; since: Date; cursor?: string }): Promise<UserSyncResponse | "invalid_cursor"> {
    const owned = or(eq(missions.requesterId, userId), eq(missions.rescuerId, userId));
    let after: { createdAt: Date; id: string } | null = null;
    if (cursor) {
      // Cursor must belong to a mission this account can read; a foreign cursor is not a timing oracle.
      const [row] = await this.db.select({ id: missionStatusHistory.id, createdAt: missionStatusHistory.createdAt })
        .from(missionStatusHistory).innerJoin(missions, eq(missions.id, missionStatusHistory.missionId))
        .where(and(eq(missionStatusHistory.id, cursor), owned, gte(missionStatusHistory.createdAt, since))).limit(1);
      if (!row) return "invalid_cursor";
      after = row;
    }
    const [steps, missionRows] = await Promise.all([
      this.db.select({ id: missionStatusHistory.id, missionId: missionStatusHistory.missionId,
        fromStatus: missionStatusHistory.fromStatus, toStatus: missionStatusHistory.toStatus,
        changedBy: missionStatusHistory.changedBy, createdAt: missionStatusHistory.createdAt })
        .from(missionStatusHistory).innerJoin(missions, eq(missions.id, missionStatusHistory.missionId))
        .where(and(owned, gte(missionStatusHistory.createdAt, since), after ? or(
          gt(missionStatusHistory.createdAt, after.createdAt),
          and(eq(missionStatusHistory.createdAt, after.createdAt), gt(missionStatusHistory.id, after.id))
        ) : undefined))
        .orderBy(asc(missionStatusHistory.createdAt), asc(missionStatusHistory.id))
        .limit(SYNC_EVENT_PAGE_SIZE + 1),
      // Active missions must appear even if they predate since. Terminal missions changed during
      // the gap appear too. An overfull list is explicitly flagged rather than silently losing one.
      this.db.select().from(missions).where(and(owned, or(
        inArray(missions.status, ["pending", "on_the_way", "arrived", "in_progress"]),
        gte(missions.updatedAt, since)
      ))).orderBy(sql`CASE WHEN ${missions.status} IN ('pending','on_the_way','arrived','in_progress') THEN 0 ELSE 1 END`,
        asc(missions.createdAt), asc(missions.id)).limit(SYNC_MISSION_LIMIT + 1)
    ]);
    const events = steps.slice(0, SYNC_EVENT_PAGE_SIZE);
    return {
      events: events.map((step) => ({ ...step, createdAt: step.createdAt.toISOString() })),
      missions: missionRows.slice(0, SYNC_MISSION_LIMIT).map(toMission),
      missionsTruncated: missionRows.length > SYNC_MISSION_LIMIT,
      nextCursor: steps.length > SYNC_EVENT_PAGE_SIZE ? events.at(-1)!.id : null,
      location: null
    };
  }
}
