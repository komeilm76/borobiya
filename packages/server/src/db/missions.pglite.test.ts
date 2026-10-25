import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { missionSchema, missionTimelineSchema } from "@borobiya/shared";
import type { Database } from "./client";
import * as schema from "./schema";
import { DrizzleMissionProgressStore, missionTransition } from "./mission-progress-store";
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
    pg = new PGlite({ extensions: { pg_trgm } });
    await pg.exec(`CREATE DOMAIN geography AS text; CREATE DOMAIN geometry AS text;
      CREATE FUNCTION ST_X(point geometry) RETURNS double precision LANGUAGE SQL IMMUTABLE AS $$
        SELECT split_part(split_part(point::text, '(', 2), ' ', 1)::double precision $$;
      CREATE FUNCTION ST_Y(point geometry) RETURNS double precision LANGUAGE SQL IMMUTABLE AS $$
        SELECT split_part(split_part(point::text, ' ', 2), ')', 1)::double precision $$;`);
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

  it("never interprets a duplicate retry as an additional transition", () => {
    expect(missionTransition("on_the_way", "on_the_way")).toBe("unchanged");
    expect(missionTransition("on_the_way", "in_progress")).toBe("invalid_transition");
    expect(missionTransition("cancelled_by_rescuer", "on_the_way")).toBe("invalid_transition");
  });

  it("advances only ordered rescuer-owned steps, records history once, and releases the rescuer on completion", async () => {
    const store = new DrizzleMissionProgressStore(drizzle(pg, { schema }) as unknown as Database);
    await pg.query(`INSERT INTO "missions" ("id", "sos_request_id", "rescuer_id", "requester_id")
      VALUES ($1, $2, $3, $4)`, [MISSION, SOS, RESCUER, REQUESTER]);
    expect(await store.canJoinMissionRoom(MISSION, RESCUER, "user")).toBe(true);
    expect(await store.canJoinMissionRoom(MISSION, REQUESTER, "user")).toBe(true);
    expect(await store.canJoinMissionRoom(MISSION, "90000000-0000-4000-8000-000000000009", "user")).toBe(false);
    expect(await store.canJoinMissionRoom(MISSION, "90000000-0000-4000-8000-000000000009", "admin")).toBe(true);
    expect(await store.canJoinMissionRoom("90000000-0000-4000-8000-000000000009", REQUESTER, "admin")).toBe(false);
    const timeline = await store.findTimeline(MISSION, REQUESTER, "user");
    expect(missionTimelineSchema.parse(timeline).map((entry) => entry.toStatus)).toEqual([]);
    expect(await store.findTimeline(MISSION, "90000000-0000-4000-8000-000000000009", "user")).toBeNull();
    expect(await store.findTimeline("90000000-0000-4000-8000-000000000009", REQUESTER, "admin")).toBeNull();
    expect(await store.missionLocationRole(MISSION, RESCUER)).toBe("rescuer");
    expect(await store.missionLocationRole(MISSION, REQUESTER, "admin")).toBe("admin");
    expect(await store.missionLocationRole(MISSION, REQUESTER)).toBe("requester");
    expect(await store.missionLocationRole(MISSION, "90000000-0000-4000-8000-000000000009")).toBeNull();
    expect(await store.findNavigationTarget(MISSION, RESCUER)).toEqual({
      missionId: MISSION, incident: { lat: 35.7, lon: 51.4 }
    });
    expect(await store.findNavigationTarget(MISSION, REQUESTER)).toBeNull();
    expect(await store.findNavigationTarget("90000000-0000-4000-8000-000000000009", RESCUER)).toBeNull();
    await pg.query(`UPDATE "users" SET "is_on_mission" = true WHERE "id" = $1`, [RESCUER]);
    await pg.query(`UPDATE "sos_requests" SET "status" = 'accepted' WHERE "id" = $1`, [SOS]);
    await pg.query(`INSERT INTO "mission_status_history" ("mission_id", "to_status", "changed_by")
      VALUES ($1, 'pending', $2)`, [MISSION, RESCUER]);
    expect(await store.advanceStatus(MISSION, REQUESTER, "on_the_way")).toEqual({ status: "not_found" });
    expect(await store.advanceStatus(MISSION, RESCUER, "completed")).toEqual({
      status: "invalid_transition", currentStatus: "pending"
    });
    for (const status of ["on_the_way", "arrived", "in_progress", "completed"] as const) {
      const result = await store.advanceStatus(MISSION, RESCUER, status);
      expect(result.status).toBe("updated");
      if (result.status === "updated") expect(missionSchema.parse(result.mission).status).toBe(status);
      expect((await store.advanceStatus(MISSION, RESCUER, status)).status).toBe("unchanged");
    }
    expect((await pg.query<{ to_status: string }>(`SELECT "to_status" FROM "mission_status_history" WHERE "mission_id" = $1`, [MISSION])).rows)
      .toHaveLength(5);
    expect((await pg.query<{ is_on_mission: boolean }>(`SELECT "is_on_mission" FROM "users" WHERE "id" = $1`, [RESCUER])).rows[0]?.is_on_mission).toBe(false);
    expect((await pg.query<{ status: string }>(`SELECT "status" FROM "sos_requests" WHERE "id" = $1`, [SOS])).rows[0]?.status).toBe("completed");
    expect(await store.findNavigationTarget(MISSION, RESCUER)).toBeNull();
    expect(await store.canJoinMissionRoom(MISSION, RESCUER, "user")).toBe(false);
    expect(await store.canJoinMissionRoom(MISSION, REQUESTER, "admin")).toBe(false);
    expect(missionTimelineSchema.parse(await store.findTimeline(MISSION, RESCUER, "user"))
      .map((entry) => entry.toStatus)).toEqual(["pending", "on_the_way", "arrived", "in_progress", "completed"]);
    expect((await store.listActiveRequestMissions(SOS)).length).toBe(0);
    expect((await store.listActiveRequestMissions(SOS, true)).map((entry) => entry.status)).toEqual(["completed"]);
    expect(await store.missionLocationRole(MISSION, RESCUER)).toBeNull();
    expect(await store.missionLocationRole(MISSION, REQUESTER, "admin")).toBeNull();
    expect(await store.advanceStatus(MISSION, RESCUER, "on_the_way")).toEqual({
      status: "invalid_transition", currentStatus: "completed"
    });
  });

  it("keeps progression order when distinct transitions share the same stored timestamp", async () => {
    const id = "50000000-0000-4000-8000-000000000006";
    const at = "2026-10-24T10:00:00.000Z";
    await pg.query(`INSERT INTO missions (id,sos_request_id,rescuer_id,requester_id,status)
      VALUES ($1,$2,$3,$4,'completed')`, [id, SOS, RESCUER, REQUESTER]);
    // Lexicographic UUID order is deliberately the reverse of the legal transition order.
    for (const [rowId, from, to] of [
      ["60000000-0000-4000-8000-000000000004", null, "pending"],
      ["60000000-0000-4000-8000-000000000003", "pending", "on_the_way"],
      ["60000000-0000-4000-8000-000000000002", "on_the_way", "arrived"],
      ["60000000-0000-4000-8000-000000000001", "arrived", "in_progress"],
      ["60000000-0000-4000-8000-000000000000", "in_progress", "completed"]
    ]) await pg.query(`INSERT INTO mission_status_history (id,mission_id,from_status,to_status,changed_by,created_at)
      VALUES ($1,$2,$3,$4,$5,$6)`, [rowId, id, from, to, RESCUER, at]);
    const store = new DrizzleMissionProgressStore(drizzle(pg, { schema }) as unknown as Database);
    const steps = await store.findTimeline(id, REQUESTER, "user");
    expect(missionTimelineSchema.parse(steps).map((step) => step.toStatus))
      .toEqual(["pending", "on_the_way", "arrived", "in_progress", "completed"]);
    expect(new Set(steps?.map((step) => step.createdAt)).size).toBe(1);
  });

  it("stores one completed-mission rating per requester and transactionally maintains the responder average", async () => {
    const first = "50000000-0000-4000-8000-000000000007";
    const second = "50000000-0000-4000-8000-000000000008";
    const pending = "50000000-0000-4000-8000-000000000009";
    for (const [id, status] of [[first, "completed"], [second, "completed"], [pending, "pending"]]) {
      await pg.query(`INSERT INTO missions (id,sos_request_id,rescuer_id,requester_id,status)
        VALUES ($1,$2,$3,$4,$5)`, [id, SOS, RESCUER, REQUESTER, status]);
    }
    const insert = (missionId: string, raterId: string, rateeId: string, rating: number, comment: string | null = null) =>
      pg.query(`INSERT INTO mission_ratings (mission_id,rater_id,ratee_id,rating,comment)
        VALUES ($1,$2,$3,$4,$5)`, [missionId, raterId, rateeId, rating, comment]);
    const average = async () => (await pg.query<{ avg_rating: string | null }>(
      `SELECT avg_rating FROM users WHERE id=$1`, [RESCUER])).rows[0]?.avg_rating;

    expect(await average()).toBeNull();
    await expect(insert(pending, REQUESTER, RESCUER, 5)).rejects.toThrow();
    await expect(insert(first, RESCUER, REQUESTER, 5)).rejects.toThrow();
    await expect(insert(first, REQUESTER, REQUESTER, 5)).rejects.toThrow();
    await expect(insert(first, REQUESTER, RESCUER, 0)).rejects.toThrow();
    await expect(insert(first, REQUESTER, RESCUER, 5, "x".repeat(501))).rejects.toThrow();
    expect(await average()).toBeNull();

    await insert(first, REQUESTER, RESCUER, 5, "Helpful responder");
    expect(Number(await average())).toBe(5);
    await expect(insert(first, REQUESTER, RESCUER, 1)).rejects.toThrow();
    expect(Number(await average())).toBe(5);
    await insert(second, REQUESTER, RESCUER, 4);
    expect(Number(await average())).toBe(4.5);
    await expect(pg.query(`UPDATE mission_ratings SET ratee_id=$1 WHERE mission_id=$2`,
      [REQUESTER, first])).rejects.toThrow();
    expect(Number(await average())).toBe(4.5);
    await pg.query(`UPDATE mission_ratings SET rating=3 WHERE mission_id=$1`, [first]);
    expect(Number(await average())).toBe(3.5);
    await pg.query(`DELETE FROM mission_ratings WHERE mission_id=$1`, [second]);
    expect(Number(await average())).toBe(3);
    await pg.query(`DELETE FROM mission_ratings WHERE mission_id=$1`, [first]);
    expect(await average()).toBeNull();
  });

  it("rolls back the status and busy flag when history cannot be inserted", async () => {
    const store = new DrizzleMissionProgressStore(drizzle(pg, { schema }) as unknown as Database);
    await pg.query(`UPDATE "missions" SET "status" = 'in_progress' WHERE "id" = $1`, [MISSION]);
    await pg.query(`UPDATE "users" SET "is_on_mission" = true WHERE "id" = $1`, [RESCUER]);
    await pg.exec(`CREATE FUNCTION reject_progress() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'history unavailable'; END $$;
      CREATE TRIGGER reject_progress BEFORE INSERT ON mission_status_history
      FOR EACH ROW EXECUTE FUNCTION reject_progress();`);
    await expect(store.advanceStatus(MISSION, RESCUER, "completed")).rejects.toThrow();
    expect((await pg.query<{ status: string }>(`SELECT "status" FROM "missions" WHERE "id" = $1`, [MISSION])).rows[0]?.status).toBe("in_progress");
    expect((await pg.query<{ is_on_mission: boolean }>(`SELECT "is_on_mission" FROM "users" WHERE "id" = $1`, [RESCUER])).rows[0]?.is_on_mission).toBe(true);
    await pg.exec("DROP TRIGGER reject_progress ON mission_status_history; DROP FUNCTION reject_progress();");
  });
});
