import { and, eq, gt, inArray, lte, or, sql } from "drizzle-orm";
import type { Database } from "../db/client";
import { locationTrips, missions, userSessions } from "../db/schema";

const ACTIVE_MISSION_STATUSES = ["pending", "on_the_way", "arrived", "in_progress"] as const;
const TRIP_LEASE_MS = 90_000;

/** A trip is foreground/session-owned. Its permission lapses without a heartbeat, even after a crashed tab. */
export function createLocationActivityStore(db: Database) {
  return {
    async setTrip(userId: string, sessionId: string, active: boolean): Promise<void> {
      if (!active) {
        await db.delete(locationTrips).where(and(eq(locationTrips.userId, userId), eq(locationTrips.sessionId, sessionId)));
        return;
      }
      // An access token alone cannot resurrect a revoked session.
      const [session] = await db.select({ id: userSessions.id }).from(userSessions).where(and(
        eq(userSessions.id, sessionId), eq(userSessions.userId, userId)
      )).limit(1);
      if (!session) return;
      await db.insert(locationTrips).values({ userId, sessionId, expiresAt: new Date(Date.now() + TRIP_LEASE_MS) })
        .onConflictDoUpdate({ target: locationTrips.sessionId, set: { expiresAt: new Date(Date.now() + TRIP_LEASE_MS),
          startedAt: sql`case when ${locationTrips.expiresAt} <= now() then now() else ${locationTrips.startedAt} end` } });
    },
    async isActive(userId: string, sessionId?: string, observedAt?: Date): Promise<boolean> {
      const [mission] = await db.select({ id: missions.id }).from(missions).where(and(
        or(eq(missions.requesterId, userId), eq(missions.rescuerId, userId)),
        inArray(missions.status, ACTIVE_MISSION_STATUSES),
        observedAt ? lte(missions.createdAt, observedAt) : undefined
      )).limit(1);
      if (mission) return true;
      if (!sessionId) return false;
      const [trip] = await db.select({ sessionId: locationTrips.sessionId }).from(locationTrips).where(and(
        eq(locationTrips.userId, userId), eq(locationTrips.sessionId, sessionId),
        gt(locationTrips.expiresAt, new Date()),
        observedAt ? lte(locationTrips.startedAt, observedAt) : undefined
      )).limit(1);
      return !!trip;
    }
  };
}
export type LocationActivityStore = ReturnType<typeof createLocationActivityStore>;
