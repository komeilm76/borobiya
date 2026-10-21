import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { locationHistory, users } from "./schema";
import { DrizzleLocationHistoryStore, locationFixQueries, pruneLocationHistoryQuery, type LocationFixInput } from "./location-history-store";
import type { Database } from "./client";

// A driver is only needed to build SQL; no connection is opened until a query runs.
const offlineDb = drizzle(postgres("postgresql://borobiya:unused@127.0.0.1:5432/unused"), {
  schema: { locationHistory, users }
}) as unknown as Database;

describe("location history writes", () => {
  it("builds the PostGIS upsert and the history insert with the same fix", () => {
    const input: LocationFixInput = {
      userId: "11111111-1111-4111-8111-111111111111",
      lat: 35.6997,
      lon: 51.3379,
      accuracy: 12,
      timestamp: new Date("2026-10-21T09:00:00.000Z")
    };
    const queries = locationFixQueries(offlineDb, input);
    const update = queries.updateLastLocation.toSQL();
    const insert = queries.appendHistory.toSQL();

    expect(update.sql).toContain('update "users" set "last_location" = ST_SetSRID(ST_MakePoint(');
    expect(update.sql).toContain(")::geography");
    // PostGIS X is longitude and Y is latitude.
    expect(update.params).toEqual([51.3379, 35.6997, input.userId]);
    expect(insert.sql).toContain('insert into "location_history"');
    // Drizzle serializes the timestamptz to its ISO text before it reaches the driver.
    expect(insert.params).toEqual([input.userId, 35.6997, 51.3379, 12, "2026-10-21T09:00:00.000Z"]);
  });

  it("leaves accuracy null when the device did not report one", () => {
    const queries = locationFixQueries(offlineDb, {
      userId: "11111111-1111-4111-8111-111111111111",
      lat: 35.7,
      lon: 51.4,
      accuracy: null,
      timestamp: new Date("2026-10-21T09:00:00.000Z")
    });

    expect(queries.appendHistory.toSQL().params).toEqual([
      "11111111-1111-4111-8111-111111111111",
      35.7,
      51.4,
      null,
      "2026-10-21T09:00:00.000Z"
    ]);
  });
});

describe("pruneLocationHistoryQuery", () => {
  it("deletes only the oldest batch below the cutoff", () => {
    const built = pruneLocationHistoryQuery(offlineDb, {
      olderThan: new Date("2026-07-23T00:00:00.000Z"),
      limit: 5000
    }).toSQL();
    const sql = built.sql.replace(/\s+/g, " ");

    expect(sql).toContain('delete from "location_history"');
    expect(sql).toContain('"location_history"."created_at" <');
    expect(sql).toContain('"location_history"."id" IN ((');
    expect(sql).toContain('select "id" from "location_history" where "location_history"."created_at" < $2 order by "location_history"."id" asc limit $3');
    expect(built.params).toEqual(["2026-07-23T00:00:00.000Z", "2026-07-23T00:00:00.000Z", 5000]);
  });
});
