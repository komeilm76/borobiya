import { count, countDistinct, eq, inArray } from "drizzle-orm";
import { sosRequestStatusSchema, type MissionStatus } from "@borobiya/shared";
import type { Database } from "./client";
import { missions, sosRequests, userSessions } from "./schema";

/**
 * The one aggregate the dashboard contract promised (`/_admin/stats`) and nothing served.
 *
 * It reports what the database can answer in constant time — status counts, live missions, and sessions
 * currently flagged online — and deliberately not a time series: per-day charts over an arbitrary range are
 * a reports concern, and a range endpoint that silently buckets in the server's timezone is how two admins
 * with different devices disagree about yesterday.
 */
export interface AdminStats {
  counts: Record<string, number>;
  activeMissions: number;
  onlineUsers: number;
}

export interface AdminStatsStore {
  readStats(): Promise<AdminStats>;
}

/** Missions still occupying a rescuer; matches the `active` set every store uses for the same question. */
const ACTIVE_MISSION_STATUSES: MissionStatus[] = ["pending", "on_the_way", "arrived", "in_progress"];

export async function readStats(db: Database): Promise<AdminStats> {
  const [statusRows, activeRows, onlineRows] = await Promise.all([
    db.select({ status: sosRequests.status, value: count() }).from(sosRequests).groupBy(sosRequests.status),
    db.select({ value: count() }).from(missions).where(inArray(missions.status, ACTIVE_MISSION_STATUSES)),
    db.select({ value: countDistinct(userSessions.userId) }).from(userSessions).where(eq(userSessions.isOnline, true))
  ]);
  // Every known status is present, zero included: the dashboard renders a fixed legend and a missing key
  // would silently turn one bar into "no data".
  const counts: Record<string, number> = Object.fromEntries(sosRequestStatusSchema.options.map((status) => [status, 0]));
  for (const row of statusRows) counts[row.status] = row.value;
  return {
    counts,
    activeMissions: activeRows[0]?.value ?? 0,
    onlineUsers: onlineRows[0]?.value ?? 0
  };
}

export class DrizzleAdminStatsStore implements AdminStatsStore {
  constructor(private readonly db: Database) {}
  readStats(): Promise<AdminStats> {
    return readStats(this.db);
  }
}

/** Every status counts as zero when there is no database to ask. */
export const emptyAdminStats: AdminStatsStore = {
  readStats: async () => ({
    counts: Object.fromEntries(sosRequestStatusSchema.options.map((status) => [status, 0])),
    activeMissions: 0,
    onlineUsers: 0
  })
};

