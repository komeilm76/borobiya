import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { checkSchemaReadiness, REQUIRED_MIGRATION, REQUIRED_MIGRATION_TIMESTAMP, schemaReadinessMessage } from "./schema-readiness";

describe("proposal/mission database readiness", () => {
  it("probes the process database before serving HTTP, without auto-migrating", () => {
    const server = readFileSync(new URL("../server.ts", import.meta.url), "utf8");
    const check = server.indexOf("await checkSchemaReadiness(");
    const listen = server.indexOf("await app.listen(");
    expect(check).toBeGreaterThan(0);
    expect(listen).toBeGreaterThan(check);
    expect(server.indexOf("await createFastifyApp(")).toBeGreaterThan(check);
    expect(server).not.toContain("await migrate(");
    expect(server).toContain("schemaReadinessMessage(state)");
  });

  it("identifies missing tables and an out-of-date journal without modifying the database", async () => {
    const pg = new PGlite();
    const check = () => checkSchemaReadiness(async (sql) => (await pg.query(sql)).rows as Record<string, unknown>[]);
    try {
      const empty = await check();
      expect(empty).toMatchObject({ ready: false, latestAppliedAt: null });
      expect(empty.missingTables).toEqual([
        "drizzle.__drizzle_migrations", "public.mission_proposals", "public.missions",
        "public.mission_track_points", "public.mission_suggested_routes"
      ]);
      expect(empty.missingColumns).toEqual([]);
      expect(schemaReadinessMessage(empty)).toContain("db:migrate:runtime");
      expect(schemaReadinessMessage(empty)).not.toContain("postgresql://");

      await pg.exec(`CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (created_at bigint NOT NULL);
        CREATE TABLE public.mission_proposals (id uuid PRIMARY KEY);
        CREATE TABLE public.missions (id uuid PRIMARY KEY);`);
      await pg.query("INSERT INTO drizzle.__drizzle_migrations (created_at) VALUES ($1)", [REQUIRED_MIGRATION_TIMESTAMP - 1]);
      const old = await check();
      expect(old).toMatchObject({ ready: false, latestAppliedAt: REQUIRED_MIGRATION_TIMESTAMP - 1 });
      expect(old.missingTables).toEqual(["public.mission_track_points", "public.mission_suggested_routes"]);
      expect(old.missingColumns).toEqual([
        "rescuer_visible_to_requester", "requester_visible_to_rescuer",
        "admin_visible_to_requester", "admin_visible_to_rescuer"
      ]);
      // Every reported URL selects the whole missions row, including these four new
      // columns; an empty table is enough to reproduce SQLSTATE 42703.
      await expect(pg.query('SELECT "admin_visible_to_requester" FROM missions')).rejects.toMatchObject({ code: "42703" });
      expect(schemaReadinessMessage(old)).toContain("db:migrate:runtime");

      await pg.query("INSERT INTO drizzle.__drizzle_migrations (created_at) VALUES ($1)", [REQUIRED_MIGRATION_TIMESTAMP]);
      const drift = await check();
      expect(drift.ready).toBe(false); // A forged/partially restored journal must never pass.
      expect(schemaReadinessMessage(drift)).toContain("rerunning migrations cannot repair");
      await pg.exec(`ALTER TABLE public.missions ADD COLUMN rescuer_visible_to_requester boolean DEFAULT true NOT NULL;
        ALTER TABLE public.missions ADD COLUMN requester_visible_to_rescuer boolean DEFAULT true NOT NULL;
        ALTER TABLE public.missions ADD COLUMN admin_visible_to_requester boolean DEFAULT false NOT NULL;
        ALTER TABLE public.missions ADD COLUMN admin_visible_to_rescuer boolean DEFAULT false NOT NULL;
        CREATE TABLE public.mission_track_points (id bigint PRIMARY KEY);
        CREATE TABLE public.mission_suggested_routes (id uuid PRIMARY KEY);`);
      expect(await check()).toMatchObject({ ready: true, missingTables: [], missingColumns: [],
        latestAppliedAt: REQUIRED_MIGRATION_TIMESTAMP });
      expect(REQUIRED_MIGRATION).toMatch(/^\d{4}_/);
    } finally {
      await pg.close();
    }
  });
});
