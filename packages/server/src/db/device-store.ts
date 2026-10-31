import { and, asc, desc, eq, isNotNull, ne, sql } from "drizzle-orm";
import type { Database } from "./client";
import { userSessions } from "./schema";
import { PRESENCE_STALE_MS } from "../realtime/presence";

/**
 * Account-scoped active-session read and remote-session termination. Login and refresh rotation
 * remain in login-store.ts; a remote termination updates the same session columns as logout,
 * but only for another active session owned by the authenticated caller.
 */

export interface UserDeviceRow {
  /** `user_sessions.id` — the session row, not the device identity. */
  id: string;
  /** `user_sessions.device_id` — the value `location_shares.priorityDeviceId` pins. */
  deviceId: string;
  deviceName: string | null;
  ip: string | null;
  lastActiveAt: Date;
  isOnline: boolean;
}

export interface UserDeviceRecord extends UserDeviceRow {
  isCurrentDevice: boolean;
}

export interface UserDeviceStore {
  /**
   * Sessions of one account that still hold a refresh token, newest activity first and capped.
   * Logged-out and admin-revoked rows are excluded: the table answers "which devices are signed in
   * as me right now", and a revoked row would otherwise accumulate forever (sessions have no
   * retention job of their own).
   */
  listDevices(input: {
    userId: string;
    currentSessionId: string;
    limit: number;
  }): Promise<UserDeviceRecord[]>;
  /** Atomic, owner-scoped and excludes the caller's own session even if a forged id reaches the route. */
  revokeOtherSession(input: { userId: string; sessionId: string; currentSessionId: string }): Promise<boolean>;
}

/** The single statement behind the device list, exported so its SQL shape is testable. */
export function userDeviceListQuery(db: Database, input: { userId: string; limit: number }) {
  return db
    .select({
      id: userSessions.id,
      deviceId: userSessions.deviceId,
      deviceName: userSessions.deviceName,
      ip: userSessions.ip,
      lastActiveAt: userSessions.lastActiveAt,
      isOnline: sql<boolean>`${userSessions.isOnline} and ${userSessions.lastActiveAt} >= now() - (${PRESENCE_STALE_MS} * interval '1 millisecond')`.mapWith(Boolean).as("is_online")
    })
    .from(userSessions)
    .where(and(eq(userSessions.userId, input.userId), isNotNull(userSessions.refreshTokenHash)))
    .orderBy(desc(userSessions.lastActiveAt), asc(userSessions.id))
    .limit(input.limit);
}

export class DrizzleUserDeviceStore implements UserDeviceStore {
  constructor(private readonly db: Database) {}

  async listDevices(input: {
    userId: string;
    currentSessionId: string;
    limit: number;
  }): Promise<UserDeviceRecord[]> {
    const rows = await userDeviceListQuery(this.db, { userId: input.userId, limit: input.limit });
    return rows.map((row) => ({ ...row, isCurrentDevice: row.id === input.currentSessionId }));
  }

  async revokeOtherSession(input: { userId: string; sessionId: string; currentSessionId: string }): Promise<boolean> {
    const revoked = await this.db.update(userSessions)
      .set({ refreshTokenHash: null, isOnline: false })
      .where(and(
        eq(userSessions.userId, input.userId),
        eq(userSessions.id, input.sessionId),
        ne(userSessions.id, input.currentSessionId),
        isNotNull(userSessions.refreshTokenHash)
      ))
      .returning({ id: userSessions.id });
    return revoked.length === 1;
  }
}
