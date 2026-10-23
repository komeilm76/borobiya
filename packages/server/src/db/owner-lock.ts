import { sql, type SQL, type SQLChunk } from "drizzle-orm";

/**
 * A transaction-scoped advisory lock keyed on an account id.
 *
 * Share creation (live and history) decides "reuse the existing grant or insert a new one" with a read
 * followed by a write. Nothing unique behind that decision — retired rows are kept for audit and a
 * partial index would fight the expiry sweep's grace period — so two requests from one account (a
 * double-tapped button, a client retry after a timeout) could each read "nothing there" and both
 * write. The lock is held until the transaction ends, is global to the database rather than to one
 * process (so it also serializes API replicas), and never blocks a different account.
 *
 * `hashtextextended` needs PostgreSQL 11+, and `docker-compose.yml` pins the PostGIS 16 image.
 */
export function ownerAdvisoryLockSql(ownerId: string): SQL {
  return sql`select pg_advisory_xact_lock(hashtextextended(${ownerId as SQLChunk}, 0))`;
}
