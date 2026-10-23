import { and, asc, desc, eq, gte, lt, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
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
/** The target's `users` row, on its own alias — same reason as `shareTargetUsers` next door. */
export const historyShareTargetUsers = alias(users, "history_share_target");

/** An owned grant as the list reads it: the record plus the label the dashboard needs. */
export interface OwnedLocationHistoryShareRecord extends LocationHistoryShareRecord {
  targetUsername: string | null;
}

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

/** One stored observation, as a windowed read returns it. */
export interface LocationHistoryPointRecord {
  lat: number;
  lon: number;
  accuracy: number | null;
  timestamp: Date;
}

export interface ReadLocationHistoryWindowInput {
  /** Whose rows may be read at all — the grant's owner for a receiver, the caller for their own history. */
  userId: string;
  fromTime: Date;
  toTime: Date;
  /** Ceiling on returned rows. The caller resolves the grant's stored target (or the server default) first. */
  maxPoints: number;
}

export interface ReadSharedHistoryWindowInput {
  shareId: string;
  targetUserId: string;
  defaultReadPoints: number;
}

export interface LocationHistoryWindowResult {
  points: LocationHistoryPointRecord[];
  /** Rows the window holds before sampling, so a client can tell a sampled view from the whole record. */
  totalPoints: number;
}

/** A sampled row carries the pre-sampling total on every row; the first one is enough. */
export interface LocationHistoryWindowRow extends LocationHistoryPointRecord {
  totalPoints: number;
}

export interface LocationHistoryShareWithOwner extends LocationHistoryShareRecord {
  owner: { id: string; username: string };
}

export interface LocationHistoryStore {
  recordFix(input: LocationFixInput): Promise<void>;

  /**
   * Reads `fromTime..toTime` for one account, oldest first, sampled evenly down to `maxPoints`. The
   * sample is even in *position* (one row in every `stride`-th), which keeps the polyline's shape
   * regardless of how bursty the device's reports were.
   */
  readHistoryWindow(input: ReadLocationHistoryWindowInput): Promise<LocationHistoryWindowResult>;

  /** A receiver's read, authorized and sampled under the same locked grant row. Null means no access. */
  readSharedHistoryWindow(input: ReadSharedHistoryWindowInput): Promise<LocationHistoryWindowResult | null>;

  /** Metadata lookup only; NEVER use a separate lookup to authorize a history read (use readSharedHistoryWindow). */
  findHistoryShare(shareId: string): Promise<LocationHistoryShareRecord | null>;

  /** Deletes one grant of one owner and reports whether a row was there; the receiver's read starts 404-ing. */
  deleteHistoryShare(input: { ownerId: string; shareId: string }): Promise<boolean>;

  /** Every grant the account holds in either direction, newest first, capped at `limit` per list. */
  listHistoryShares(input: {
    userId: string;
    limit: number;
  }): Promise<{ owned: OwnedLocationHistoryShareRecord[]; sharedWithMe: LocationHistoryShareWithOwner[] }>;
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

/**
 * One statement that reads a window and samples it, exported for SQL-shape tests.
 *
 * The sampling happens in SQL on purpose. `row_number()` and `count(*) OVER ()` are computed over the
 * window filtered by `(user_id, timestamp)` — the index T2.2.1 added for exactly these reads — so the
 * database never ships a 30-day firehose to Node just so the route could drop 99% of it. Stride is
 * `ceil(total / maxPoints)`, integer arithmetic that keeps the first point, aims for `maxPoints` rows,
 * and degenerates to "everything" when the window already holds fewer.
 */
export function historyWindowQuery(db: Database, input: ReadLocationHistoryWindowInput) {
  const sampled = db.$with("sampled").as(
    db
      .select({
        lat: locationHistory.lat,
        lon: locationHistory.lon,
        accuracy: locationHistory.accuracy,
        timestamp: locationHistory.timestamp,
        position: sql<number>`row_number() over (order by ${locationHistory.timestamp}, ${locationHistory.id})`
          .mapWith(Number)
          .as("position"),
        totalPoints: sql<number>`count(*) over ()`.mapWith(Number).as("totalPoints")
      })
      .from(locationHistory)
      .where(and(
        eq(locationHistory.userId, input.userId),
        gte(locationHistory.timestamp, input.fromTime),
        lt(locationHistory.timestamp, input.toTime)
      ))
  );

  const stride = sql`greatest(1, (${sampled.totalPoints} + ${input.maxPoints} - 1) / ${input.maxPoints})`;

  return db
    .with(sampled)
    .select({ lat: sampled.lat, lon: sampled.lon, accuracy: sampled.accuracy, timestamp: sampled.timestamp, totalPoints: sampled.totalPoints })
    .from(sampled)
    .where(sql`(${sampled.position} - 1) % ${stride} = 0`)
    .orderBy(asc(sampled.timestamp));
}

/** Maps sampled rows onto the window result. Pure, because `totalPoints` coming from row zero is the part worth pinning. */
export function historyWindowResult(rows: readonly LocationHistoryWindowRow[]): LocationHistoryWindowResult {
  return {
    points: rows.map(({ lat, lon, accuracy, timestamp }) => ({ lat, lon, accuracy, timestamp })),
    // Every row of the same window carries the same count, and an empty window has no rows to read it from.
    totalPoints: rows[0]?.totalPoints ?? 0
  };
}

/**
 * The owned half of the history-grant list, as an exported builder so the left join is assertable as SQL
 * text. A grant whose target cannot be named is still a grant the owner can delete, so the join must not
 * be able to hide one.
 */
export function ownedHistorySharesQuery(db: Database, input: { userId: string; limit: number }) {
  return db
    .select({ ...historyShareSelection, targetUsername: historyShareTargetUsers.username })
    .from(locationHistoryShares)
    .leftJoin(historyShareTargetUsers, eq(historyShareTargetUsers.id, locationHistoryShares.targetUserId))
    .where(eq(locationHistoryShares.ownerId, input.userId))
    .orderBy(desc(locationHistoryShares.createdAt))
    .limit(input.limit);
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

  async readHistoryWindow(input: ReadLocationHistoryWindowInput): Promise<LocationHistoryWindowResult> {
    return historyWindowResult(await historyWindowQuery(this.db, input));
  }

  async readSharedHistoryWindow(input: ReadSharedHistoryWindowInput): Promise<LocationHistoryWindowResult | null> {
    return this.db.transaction(async (tx) => {
      // A naked find followed by a second query can return the owner's history *after*
      // the owner revokes the grant. FOR SHARE conflicts with DELETE/UPDATE: either
      // revocation commits first and this read returns null, or it waits until the
      // authorized history read finishes. The target predicate is part of the lock.
      const [grant] = await tx.select({
        ownerId: locationHistoryShares.ownerId,
        fromTime: locationHistoryShares.fromTime,
        toTime: locationHistoryShares.toTime,
        maxPoints: locationHistoryShares.maxPoints
      }).from(locationHistoryShares).where(and(
        eq(locationHistoryShares.id, input.shareId),
        eq(locationHistoryShares.targetUserId, input.targetUserId)
      )).for("share").limit(1);
      if (!grant) return null;
      return historyWindowResult(await historyWindowQuery(tx as unknown as Database, {
        userId: grant.ownerId,
        fromTime: grant.fromTime,
        toTime: grant.toTime,
        maxPoints: grant.maxPoints ?? input.defaultReadPoints
      }));
    });
  }

  async findHistoryShare(shareId: string): Promise<LocationHistoryShareRecord | null> {
    const [share] = await this.db
      .select(historyShareSelection)
      .from(locationHistoryShares)
      .where(eq(locationHistoryShares.id, shareId))
      .limit(1);
    return share ?? null;
  }

  async deleteHistoryShare(input: { ownerId: string; shareId: string }): Promise<boolean> {
    // No advisory lock: this is one statement keyed on the row's own id and owner, so the write itself
    // is the guard. `createHistoryShares` locks because it decides between reuse and insert by reading.
    const deleted = await this.db
      .delete(locationHistoryShares)
      .where(and(eq(locationHistoryShares.id, input.shareId), eq(locationHistoryShares.ownerId, input.ownerId)))
      .returning({ id: locationHistoryShares.id });
    return deleted.length > 0;
  }

  async listHistoryShares(input: {
    userId: string;
    limit: number;
  }): Promise<{ owned: OwnedLocationHistoryShareRecord[]; sharedWithMe: LocationHistoryShareWithOwner[] }> {
    const owned = await ownedHistorySharesQuery(this.db, input);

    const receivedRows = await this.db
      .select({ ...historyShareSelection, ownerUsername: users.username })
      .from(locationHistoryShares)
      .innerJoin(users, eq(users.id, locationHistoryShares.ownerId))
      .where(eq(locationHistoryShares.targetUserId, input.userId))
      .orderBy(desc(locationHistoryShares.createdAt))
      .limit(input.limit);

    return {
      owned,
      sharedWithMe: receivedRows.map((row) => ({
        id: row.id,
        ownerId: row.ownerId,
        targetUserId: row.targetUserId,
        fromTime: row.fromTime,
        toTime: row.toTime,
        maxPoints: row.maxPoints,
        createdAt: row.createdAt,
        owner: { id: row.ownerId, username: row.ownerUsername }
      }))
    };
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
