import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import { checkSchemaReadiness, REQUIRED_MIGRATION, REQUIRED_MIGRATION_TIMESTAMP, schemaReadinessMessage } from "./schema-readiness";

describe("proposal/mission database readiness", () => {
  it("identifies missing tables and an out-of-date journal without modifying the database", async () => {
    const pg = new PGlite();
    const check = () => checkSchemaReadiness(async (sql) => (await pg.query(sql)).rows as Record<string, unknown>[]);
    try {
      const empty = await check();
      expect(empty).toMatchObject({ ready: false, latestAppliedAt: null });
      expect(empty.missingTables).toEqual([
        "drizzle.__drizzle_migrations", "public.mission_proposals", "public.missions"
      ]);
      expect(schemaReadinessMessage(empty)).toContain("db:migrate:runtime");
      expect(schemaReadinessMessage(empty)).not.toContain("postgresql://");

      await pg.exec(`CREATE SCHEMA drizzle;
        CREATE TABLE drizzle.__drizzle_migrations (created_at bigint NOT NULL);
        CREATE TABLE public.mission_proposals (id uuid PRIMARY KEY);
        CREATE TABLE public.missions (id uuid PRIMARY KEY);`);
      await pg.query("INSERT INTO drizzle.__drizzle_migrations (created_at) VALUES ($1)", [REQUIRED_MIGRATION_TIMESTAMP - 1]);
      expect(await check()).toMatchObject({ ready: false, missingTables: [], latestAppliedAt: REQUIRED_MIGRATION_TIMESTAMP - 1 });

      await pg.query("INSERT INTO drizzle.__drizzle_migrations (created_at) VALUES ($1)", [REQUIRED_MIGRATION_TIMESTAMP]);
      expect(await check()).toMatchObject({ ready: true, missingTables: [], latestAppliedAt: REQUIRED_MIGRATION_TIMESTAMP });
      expect(REQUIRED_MIGRATION).toMatch(/^\d{4}_/);
    } finally {
      await pg.close();
    }
  });
});
