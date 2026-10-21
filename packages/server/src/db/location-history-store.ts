import { eq, sql } from "drizzle-orm";
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
}

/** Builds the geography literal from WGS84 lon/lat; parameterized values only. */
function geographyPoint(lon: number, lat: number) {
  return sql`ST_SetSRID(ST_MakePoint(${lon}, ${lat}), 4326)::geography`;
}

export class DrizzleLocationHistoryStore implements LocationHistoryStore {
  constructor(private readonly db: Database) {}

  async recordFix(input: LocationFixInput): Promise<void> {
    await this.db.transaction(async (transaction) => {
      await transaction
        .update(users)
        .set({ lastLocation: geographyPoint(input.lon, input.lat) })
        .where(eq(users.id, input.userId));
      await transaction.insert(locationHistory).values({
        userId: input.userId,
        lat: input.lat,
        lon: input.lon,
        accuracy: input.accuracy,
        timestamp: input.timestamp
      });
    });
  }
}
