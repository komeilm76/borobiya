import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const REQUESTER = "10000000-0000-4000-8000-000000000001";
const RESCUER = "20000000-0000-4000-8000-000000000002";
const INCIDENT = "30000000-0000-4000-8000-000000000003";
const SOS = "40000000-0000-4000-8000-000000000004";
const MISSION = "50000000-0000-4000-8000-000000000005";

/** Executes the actual shipped migrations, substituting text only for PGlite's missing PostGIS. */
describe("mission tables (migrated PostgreSQL/PGlite)", () => {
  let pg: PGlite;
  beforeAll(async () => {
    pg = new PGlite();
    await pg.exec("CREATE DOMAIN geography AS text; CREATE DOMAIN geometry AS text;");
    const journal = JSON.parse(readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8")) as {
      entries: { tag: string }[];
    };
    for (const { tag } of journal.entries) {
      const sql = readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8");
      for (const part of sql.split("--> statement-breakpoint")) {
        const statement = part.trim();
        if (!statement || /\bpostgis\b|\bUSING\s+gist\s*\(/i.test(statement)) continue;
        await pg.exec(statement.replace(/(?<!")geography\(Point,4326\)(?!")/g, "text"));
      }
    }
    await pg.query(`INSERT INTO "users" ("id", "username", "password_hash", "role") VALUES
      ($1, 'mission_requester', 'hash', 'user'), ($2, 'mission_rescuer', 'hash', 'user')`, [REQUESTER, RESCUER]);
    await pg.query(`INSERT INTO "incident_types" ("id", "name", "slug") VALUES ($1, 'Rescue', 'rescue')`, [INCIDENT]);
    await pg.query(`INSERT INTO "sos_requests" ("id", "requester_id", "severity", "description", "incident_type_id", "location")
      VALUES ($1, $2, 'high', 'A person needs urgent rescue.', $3, 'POINT(51.4 35.7)')`,
      [SOS, REQUESTER, INCIDENT]);
  });
  afterAll(async () => { await pg.close(); });

  it("persists contract-valid defaults, indexed participants, chronological history, and rejects invalid states", async () => {
    await pg.query(`INSERT INTO "missions" ("id", "sos_request_id", "rescuer_id", "requester_id")
      VALUES ($1, $2, $3, $4)`, [MISSION, SOS, RESCUER, REQUESTER]);
    const row = await pg.query<{ status: string; created_at: string; updated_at: string }>(
      `SELECT "status", "created_at", "updated_at" FROM "missions" WHERE "id" = $1`, [MISSION]
    );
    expect(row.rows[0]?.status).toBe("pending");
    expect(row.rows[0]?.created_at).toBeTruthy();
    expect(row.rows[0]?.updated_at).toBeTruthy();

    await pg.query(`INSERT INTO "mission_status_history" ("mission_id", "to_status", "changed_by")
      VALUES ($1, 'pending', $2)`, [MISSION, RESCUER]);
    await pg.query(`INSERT INTO "mission_status_history" ("mission_id", "from_status", "to_status", "changed_by")
      VALUES ($1, 'pending', 'on_the_way', $2)`, [MISSION, RESCUER]);
    const history = await pg.query<{ from_status: string | null; to_status: string }>(
      `SELECT "from_status", "to_status" FROM "mission_status_history" WHERE "mission_id" = $1 ORDER BY "created_at", "id"`, [MISSION]
    );
    expect(history.rows.map((entry) => entry.to_status).sort()).toEqual(["on_the_way", "pending"]);

    await expect(pg.query(`UPDATE "missions" SET "status" = 'invented' WHERE "id" = $1`, [MISSION])).rejects.toThrow();
    await expect(pg.query(`UPDATE "missions" SET "cancelled_by" = 'unknown' WHERE "id" = $1`, [MISSION])).rejects.toThrow();
    await expect(pg.query(`INSERT INTO "mission_status_history" ("mission_id", "to_status") VALUES ($1, 'invented')`, [MISSION])).rejects.toThrow();
    await expect(pg.query(`INSERT INTO "missions" ("sos_request_id", "rescuer_id", "requester_id")
      VALUES ($1, $2, $2)`, [SOS, RESCUER])).rejects.toThrow();
    await expect(pg.query(`DELETE FROM "users" WHERE "id" = $1`, [RESCUER])).rejects.toThrow();
    await expect(pg.query(`DELETE FROM "sos_requests" WHERE "id" = $1`, [SOS])).rejects.toThrow();

    await pg.query(`DELETE FROM "missions" WHERE "id" = $1`, [MISSION]);
    const after = await pg.query(`SELECT "id" FROM "mission_status_history" WHERE "mission_id" = $1`, [MISSION]);
    expect(after.rows).toHaveLength(0);
  });
});
