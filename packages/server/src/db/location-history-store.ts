import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./client";
import { locationHistory, locationHistoryShares, users } from "./schema";
import { ownerAdvisoryLockSql } from "./owner-lock";

/** PostGIS writes keep `users.last_location` and `location_history` in one transaction. */
export interface LocationFixInput {
  userId: string;
  lat: number;
  lon: number;
  accuracy: number | null;
  /** Observation time reported by the device, already validated by the caller. */
  timestamp: Date;
}

/** One granted history window for one recipient, as the shared `LocationHistoryShare` contract reads it. */
export interface LocationHistoryShareRecord {
  id: string;
  ownerId: string;
  targetUserId: string;
  fromTime: Date;
  toTime: Date;
  maxPoints: number | null;
  createdAt: Date;
}

export interface CreateLocationHistorySharesInput {
  ownerId: string;
  /** Already classified by the caller: no self-grants, no unknown or inactive recipients. */
  targetUserIds: string[];
  fromTime: Date;
  toTime: Date;
  maxPoints: number | null;
}

export interface CreatedLocationHistoryShares {
  shares: LocationHistoryShareRecord[];
  createdShareIds: string[];
  reusedShareIds: string[];
}

export interface LocationHistoryStore {
  recordFix(input: LocationFixInput): Promise<void>;
  /**
   * Grants `fromTime..toTime` to each target, reusing the existing grant when one already covers the
   * identical owner/target/window pair (the unique index that enforces it is also the duplicate rule).
   */
  createHistoryShares(input: CreateLocationHistorySharesInput): Promise<CreatedLocationHistoryShares>;
  /**
   * Deletes at most `limit` rows ingested before `olderThan` and returns how many were removed.
   * Callers loop until a batch comes back short, which bounds each statement's lock time.
   */
  pruneOlderThan(input: { olderThan: Date; limit: number }): Promise<number>;
}

/**
 * Batched retention delete: the inner `SELECT … ORDER BY id LIMIT n` picks the oldest rows so a
 * single statement can never scan the whole table. Exported for SQL-shape tests.
 */
export function pruneLocationHistoryQuery(db: Database, input: { olderThan: Date; limit: number }) {
  const oldestIds = db
    .select({ id: locationHistory.id })
    .from(locationHistory)
    .where(lt(locationHistory.createdAt, input.olderThan))
    .orderBy(asc(locationHistory.id))
    .limit(input.limit);

  return db
    .delete(locationHistory)
    .where(and(
      lt(locationHistory.createdAt, input.olderThan),
      sql`${locationHistory.id} IN (${oldestIds})`
    ));
}

/** Builds the geography literal from WGS84 lon/lat; parameterized values only. */
export function geographyPointSql(lon: number, lat: number) {
  // PostGIS takes X = longitude and Y = latitude; swapping them silently moves every marker.
  return sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;
}

/**
 * The two statements one accepted fix needs, built together so the ordering and parameters are
 * reviewable (and SQL-testable) apart from the transaction that executes them.
 */
export function locationFixQueries(db: Database, input: LocationFixInput) {
  return {
    updateLastLocation: db
      .update(users)
      .set({ lastLocation: geographyPointSql(input.lon, input.lat) })
      .where(eq(users.id, input.userId)),
    appendHistory: db.insert(locationHistory).values({
      userId: input.userId,
      lat: input.lat,
      lon: input.lon,
      accuracy: input.accuracy,
      timestamp: input.timestamp
    })
  };
}

const historyShareSelection = {
  id: locationHistoryShares.id,
  ownerId: locationHistoryShares.ownerId,
  targetUserId: locationHistoryShares.targetUserId,
  fromTime: locationHistoryShares.fromTime,
  toTime: locationHistoryShares.toTime,
  maxPoints: locationHistoryShares.maxPoints,
  createdAt: locationHistoryShares.createdAt
};

export class DrizzleLocationHistoryStore implements LocationHistoryStore {
  constructor(private readonly db: Database) {}

  async createHistoryShares(
    input: CreateLocationHistorySharesInput
  ): Promise<CreatedLocationHistoryShares> {
    return this.db.transaction(async (transaction) => {
      // Same reasoning as live-share creation: reuse-or-insert is a read-then-write, and the unique
      // index over (owner, target, window) would turn the loser of that race into an error rather than
      // a reuse. Locking the owner first makes a retried request idempotent.
      await transaction.execute(ownerAdvisoryLockSql(input.ownerId));

      const shares: LocationHistoryShareRecord[] = [];
      const createdShareIds: string[] = [];
      const reusedShareIds: string[] = [];

      for (const targetUserId of input.targetUserIds) {
        const [existing] = await transaction
          .select(historyShareSelection)
          .from(locationHistoryShares)
          .where(and(
            eq(locationHistoryShares.ownerId, input.ownerId),
            eq(locationHistoryShares.targetUserId, targetUserId),
            eq(locationHistoryShares.fromTime, input.fromTime),
            eq(locationHistoryShares.toTime, input.toTime)
          ))
          .limit(1);

        if (existing) {
          // The window is what identifies the grant, so a repeat only re-reads it. `maxPoints` is the
          // one column the owner may still change for the same window, and unlike the live-share device
          // pin an omitted value means "no preference" — so it is rewritten on any difference,
          // including back to null.
          const patch: { maxPoints?: number | null } =
            input.maxPoints !== existing.maxPoints ? { maxPoints: input.maxPoints } : {};
          const [updated] = Object.keys(patch).length > 0
            ? await transaction
                .update(locationHistoryShares)
                .set(patch)
                .where(eq(locationHistoryShares.id, existing.id))
                .returning(historyShareSelection)
            : [existing];

          const reused = updated ?? existing;
          shares.push(reused);
          reusedShareIds.push(reused.id);
          continue;
        }

        const [created] = await transaction
          .insert(locationHistoryShares)
          .values({
            ownerId: input.ownerId,
            targetUserId,
            fromTime: input.fromTime,
            toTime: input.toTime,
            maxPoints: input.maxPoints
          })
          .returning(historyShareSelection);
        if (!created) {
          throw new Error("Location history share insert returned no row.");
        }
        shares.push(created);
        createdShareIds.push(created.id);
      }

      return { shares, createdShareIds, reusedShareIds };
    });
  }

  async recordFix(input: LocationFixInput): Promise<void> {
    await this.db.transaction(async (transaction) => {
      const queries = locationFixQueries(transaction as unknown as Database, input);
      await queries.updateLastLocation;
      await queries.appendHistory;
    });
  }

  async pruneOlderThan(input: { olderThan: Date; limit: number }): Promise<number> {
    const deleted = await pruneLocationHistoryQuery(this.db, input).returning({ id: locationHistory.id });
    return deleted.length;
  }
}
