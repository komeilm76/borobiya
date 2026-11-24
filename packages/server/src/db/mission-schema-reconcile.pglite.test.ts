import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { describe, expect, it } from "vitest";
import { checkSchemaReadiness, REQUIRED_MIGRATION_TIMESTAMP } from "./schema-readiness";

const sql = readFileSync(new URL("../../drizzle/0022_reconcile_private_mission_schema.sql", import.meta.url), "utf8");
const journal = JSON.parse(readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
  entries: { tag: string; when: number }[];
};
const userId = "10000000-0000-4000-8000-000000000001";
const missionId = "20000000-0000-4000-8000-000000000002";

/** A real PostgreSQL-compatible DDL run against the exact old-column state,
 * not a mocked migration or an edit to an existing journal row. */
describe("forward-only private mission schema reconciliation", () => {
  it("runs after the foreign checkpoint, preserves missions, and becomes a no-op on a complete schema", async () => {
    const checkpoint = 1793612911359; // Seen on a VM whose 0020/0021 were skipped.
    const entry = journal.entries.at(-2);
    const tripEntry = journal.entries.at(-1);
    expect(tripEntry?.tag).toBe("0023_numerous_purple_man");
    expect(entry?.tag).toBe("0022_reconcile_private_mission_schema");
    expect(entry?.when).toBeGreaterThan(checkpoint);
    expect(tripEntry?.when).toBe(REQUIRED_MIGRATION_TIMESTAMP);
    const pg = new PGlite();
    const ready = () => checkSchemaReadiness(async (query) => (await pg.query(query)).rows as Record<string, unknown>[]);
    try {
      await pg.exec(`CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (id serial PRIMARY KEY, hash text NOT NULL, created_at bigint);
        CREATE TABLE users (id uuid PRIMARY KEY);
        CREATE TABLE missions (id uuid PRIMARY KEY);
        CREATE TABLE mission_proposals (id uuid PRIMARY KEY);
        CREATE TABLE user_sessions (id uuid PRIMARY KEY);`);
      await pg.query("INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ($1, $2)",
        ["foreign-branch-migration", checkpoint]);
      await pg.query("INSERT INTO users (id) VALUES ($1)", [userId]);
      await pg.query("INSERT INTO missions (id) VALUES ($1)", [missionId]);
      expect((await ready()).ready).toBe(false);
      await expect(pg.query('SELECT "admin_visible_to_requester" FROM missions')).rejects.toMatchObject({ code: "42703" });

      // Refuse a partially present schema rather than apply an uncertain mix of DDL.
      const config = { migrationsFolder: fileURLToPath(new URL("../../drizzle/", import.meta.url)) };
      await pg.exec('ALTER TABLE missions ADD COLUMN "rescuer_visible_to_requester" boolean DEFAULT true NOT NULL;');
      await expect(migrate(drizzle(pg), config)).rejects.toThrow("partial private mission schema");
      expect((await pg.query<{ t: string | null }>("SELECT to_regclass('public.mission_track_points') AS t")).rows[0]?.t).toBeNull();
      expect((await pg.query<{ total: number }>("SELECT count(*)::integer AS total FROM drizzle.__drizzle_migrations")).rows[0]?.total).toBe(1);
      await pg.exec('ALTER TABLE missions DROP COLUMN "rescuer_visible_to_requester";'); // disposable fixture only

      // Exercise Drizzle's real max(created_at) filter, SQL execution and
      // transaction/journal write. It must skip 0020/0021 and run 0022/0023.
      await migrate(drizzle(pg), config);
      expect((await pg.query<{ created_at: number }>("SELECT created_at FROM drizzle.__drizzle_migrations ORDER BY id DESC LIMIT 1")).rows[0]?.created_at)
        .toBe(tripEntry!.when);
      expect(await ready()).toMatchObject({ ready: true, missingColumns: [], missingTables: [] });
      const row = (await pg.query(`SELECT id, rescuer_visible_to_requester, requester_visible_to_rescuer,
        admin_visible_to_requester, admin_visible_to_rescuer FROM missions`)).rows[0];
      expect(row).toEqual({ id: missionId, rescuer_visible_to_requester: true,
        requester_visible_to_rescuer: true, admin_visible_to_requester: false, admin_visible_to_rescuer: false });
      await pg.query(`INSERT INTO mission_track_points (mission_id, user_id, role, lat, lon, observed_at)
        VALUES ($1, $2, 'requester', 35.7, 51.4, now())`, [missionId, userId]);
      await pg.query(`INSERT INTO mission_suggested_routes (mission_id, profile, polyline, distance_m)
        VALUES ($1, 'foot', 'test-route', 50)`, [missionId]);
      await pg.query("UPDATE missions SET admin_visible_to_requester = true WHERE id = $1", [missionId]);
      await pg.exec(sql); // fresh installs applied 0020 and 0021 already: safe, non-destructive.
      expect((await pg.query<{ visible: boolean }>("SELECT admin_visible_to_requester AS visible FROM missions WHERE id = $1", [missionId])).rows[0]?.visible)
        .toBe(true);
      expect((await pg.query<{ total: number }>("SELECT count(*)::integer AS total FROM mission_track_points")).rows[0]?.total).toBe(1);
      expect((await pg.query<{ total: number }>("SELECT count(*)::integer AS total FROM mission_suggested_routes")).rows[0]?.total).toBe(1);
      expect((await pg.query<{ total: number }>("SELECT count(*)::integer AS total FROM drizzle.__drizzle_migrations")).rows[0]?.total).toBe(3);
    } finally { await pg.close(); }
  });
});
