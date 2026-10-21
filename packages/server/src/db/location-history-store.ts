import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Database } from "./client";
import { locationHistory, users } from "./schema";

/** PostGIS writes keep `users.last_location` and `location_history` in one transaction. */
export interface LocationFixInput {
  userId: string;
  lat: number;
  lon: number;
  accuracy: number | null;
  /** Observation time reported by the device, already validated by the caller. */
  timestamp: Date;
}

export interface LocationHistoryStore {
  recordFix(input: LocationFixInput): Promise<void>;
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

export class DrizzleLocationHistoryStore implements LocationHistoryStore {
  constructor(private readonly db: Database) {}

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
