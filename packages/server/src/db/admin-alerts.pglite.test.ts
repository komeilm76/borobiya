import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "./client";
import * as schema from "./schema";
import { DrizzleAdminAlertStore } from "./admin-alert-store";

const ADMIN = "10000000-0000-4000-8000-00000000000a";
const REQUESTER = "10000000-0000-4000-8000-000000000001";
const RESCUER = "20000000-0000-4000-8000-000000000002";
const INCIDENT = "30000000-0000-4000-8000-000000000003";
const SOS = "40000000-0000-4000-8000-000000000004";
const MISSION = "50000000-0000-4000-8000-000000000005";
const OPEN_ALERT = "60000000-0000-4000-8000-000000000006";
const RESOLVED_ALERT = "60000000-0000-4000-8000-000000000007";

/**
 * The admin alert queue against the real migrations.
 *
 * Two things here can only be wrong in SQL: whether "unresolved first" survives Postgres's NULL ordering, and
 * whether pagination counts what the page shows. Both are invisible to a source-pinned test.
 */
describe("admin alert queue (migrated PostgreSQL/PGlite)", () => {
  let pg: PGlite;
  let store: DrizzleAdminAlertStore;

  beforeAll(async () => {
    pg = new PGlite({ extensions: { pg_trgm } });
    await pg.exec(`CREATE DOMAIN geography AS text; CREATE DOMAIN geometry AS text;
      CREATE FUNCTION ST_X(point geometry) RETURNS double precision LANGUAGE SQL IMMUTABLE AS $$
        SELECT split_part(split_part(point::text, '(', 2), ' ', 1)::double precision $$;
      CREATE FUNCTION ST_Y(point geometry) RETURNS double precision LANGUAGE SQL IMMUTABLE AS $$
        SELECT split_part(split_part(point::text, ' ', 2), ')', 1)::double precision $$;`);
    const journal = JSON.parse(
      readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8")
    ) as { entries: { tag: string }[] };
    for (const { tag } of journal.entries) {
      const sql = readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8");
      for (const part of sql.split("--> statement-breakpoint")) {
        const statement = part.trim();
        if (!statement || /\bpostgis\b|\bUSING\s+gist\s*\(/i.test(statement)) continue;
        await pg.exec(statement.replace(/(?<!")geography\(Point,4326\)(?!")/g, "text"));
      }
    }

    await pg.query(
      `INSERT INTO "users" ("id", "username", "password_hash", "role") VALUES
        ($1, 'alert_admin', 'hash', 'admin'), ($2, 'alert_requester', 'hash', 'user'), ($3, 'alert_rescuer', 'hash', 'user')`,
      [ADMIN, REQUESTER, RESCUER]
    );
    await pg.query(`INSERT INTO "incident_types" ("id", "name", "slug") VALUES ($1, 'Rescue', 'rescue')`, [INCIDENT]);
    await pg.query(
      `INSERT INTO "sos_requests" ("id", "requester_id", "severity", "description", "incident_type_id", "location")
        VALUES ($1, $2, 'high', 'A person needs urgent rescue.', $3, 'POINT(51.4 35.7)')`,
      [SOS, REQUESTER, INCIDENT]
    );
    await pg.query(
      `INSERT INTO "missions" ("id", "sos_request_id", "rescuer_id", "requester_id") VALUES ($1, $2, $3, $4)`,
      [MISSION, SOS, RESCUER, REQUESTER]
    );
    // The open alert is the older one: ordering must come from `resolved_at`, not from `created_at`.
    await pg.query(
      `INSERT INTO "admin_alerts" ("id", "type", "user_id", "mission_id", "created_at", "resolved_at") VALUES
        ($1, 'rescuer_other_reason', $3, $4, '2026-10-20T08:00:00Z', NULL),
        ($2, 'rescuer_cancelled', $3, $4, '2026-10-22T09:00:00Z', '2026-10-22T10:00:00Z')`,
      [OPEN_ALERT, RESOLVED_ALERT, RESCUER, MISSION]
    );

    store = new DrizzleAdminAlertStore(drizzle(pg, { schema }) as unknown as Database);
  });

  afterAll(async () => {
    await pg.close();
  });

  it("puts the unresolved queue above the reviewed rows", async () => {
    const page = await store.listAlerts({ page: 1, limit: 10 });
    expect(page.items).toHaveLength(2);
    // Postgres places NULLs last on ASC; asking for DESC is what puts the open alert on top.
    expect(page.items[0]?.id).toBe(OPEN_ALERT);
    expect(page.items[0]?.resolvedAt).toBeNull();
    expect(page.items[1]?.id).toBe(RESOLVED_ALERT);
  });

  it("counts the filtered set, not the whole table", async () => {
    const open = await store.listAlerts({ page: 1, limit: 10, resolved: false });
    expect(open.items.map((item) => item.id)).toEqual([OPEN_ALERT]);
    expect(open.total).toBe(1);

    const resolved = await store.listAlerts({ page: 1, limit: 10, resolved: true });
    expect(resolved.items.map((item) => item.id)).toEqual([RESOLVED_ALERT]);
    expect(resolved.total).toBe(1);

    // A page past the end still reports the real total, so the pager can say "1 of 1" rather than "0 of 0".
    const beyond = await store.listAlerts({ page: 5, limit: 10 });
    expect(beyond.items).toHaveLength(0);
    expect(beyond.total).toBe(2);
  });

  it("carries the mission and rescuer the reviewer needs, without a second read", async () => {
    const [alert] = (await store.listAlerts({ page: 1, limit: 1 })).items;
    expect(alert?.username).toBe("alert_rescuer");
    expect(alert?.missionId).toBe(MISSION);
    expect(alert?.sosRequestId).toBe(SOS);
  });

  it("resolves once, audits once, and stays idempotent", async () => {
    const first = await store.resolveAlert({ id: OPEN_ALERT, adminId: ADMIN });
    expect(first.status).toBe("resolved");
    expect(first.status === "resolved" && first.changed).toBe(true);
    expect(first.status === "resolved" && first.alert.resolvedAt).not.toBeNull();

    const auditRows = await pg.query<{ action: string; target_id: string; admin_id: string }>(
      `SELECT "action", "target_id", "admin_id" FROM "admin_audit_log" WHERE "target_id" = $1`,
      [OPEN_ALERT]
    );
    expect(auditRows.rows).toHaveLength(1);
    expect(auditRows.rows[0]).toMatchObject({ action: "alert_resolved", admin_id: ADMIN });

    const second = await store.resolveAlert({ id: OPEN_ALERT, adminId: ADMIN });
    expect(second.status).toBe("resolved");
    expect(second.status === "resolved" && second.changed).toBe(false);
    const afterSecond = await pg.query(`SELECT 1 FROM "admin_audit_log" WHERE "target_id" = $1`, [OPEN_ALERT]);
    expect(afterSecond.rows).toHaveLength(1);
  });

  it("reports a missing alert instead of inventing one", async () => {
    const missing = await store.resolveAlert({ id: "70000000-0000-4000-8000-000000000009", adminId: ADMIN });
    expect(missing).toEqual({ status: "not_found" });
  });
});
