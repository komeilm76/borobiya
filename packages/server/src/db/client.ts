import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Construct a Drizzle/Postgres.js client for runtime handlers. Postgres.js opens
 * connections on demand when a query is issued; app shutdown closes the pool.
 */
export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl);
  const db = drizzle(client, { schema });
  return { db, client };
}

export type Database = ReturnType<typeof createDatabase>["db"];
