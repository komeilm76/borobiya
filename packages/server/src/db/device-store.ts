import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { Database } from "./client";
import { userSessions } from "./schema";

/**
 * Reads for the Active Devices table (spec §7.3). Writing `user_sessions` belongs to
 * `login-store.ts` (login, refresh rotation, revocation); this store only reads it back so the
 * account owner — and the priority-device selection in T2.3.3 — can see what is signed in.
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
      isOnline: userSessions.isOnline
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
}
