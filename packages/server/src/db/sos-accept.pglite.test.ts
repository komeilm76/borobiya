import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Database } from "./client";
import * as schema from "./schema";
import { DrizzleSosDispatchStore, missionProposalPayload } from "./sos-dispatch-store";
import { proposalInboxItemSchema } from "@borobiya/shared";

const REQUESTER = "10000000-0000-4000-8000-000000000001";
const RESCUER = "20000000-0000-4000-8000-000000000002";
const INCIDENT = "30000000-0000-4000-8000-000000000003";
const SOS = ["40000000-0000-4000-8000-000000000004", "40000000-0000-4000-8000-000000000005"];
const PROPOSAL = ["50000000-0000-4000-8000-000000000004", "50000000-0000-4000-8000-000000000005"];

/** Real migrated constraints and row-lock order, without a mocked transaction. */
describe("atomic proposal acceptance (migrated PGlite)", () => {
  let pg: PGlite;
  let store: DrizzleSosDispatchStore;
  beforeAll(async () => {
    pg = new PGlite({ extensions: { pg_trgm } });
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
      ($1, 'accept_requester', 'hash', 'user'), ($2, 'accept_rescuer', 'hash', 'user')`, [REQUESTER, RESCUER]);
    await pg.query(`INSERT INTO "incident_types" ("id", "name", "slug") VALUES ($1, 'Rescue', 'rescue')`, [INCIDENT]);
    for (let i = 0; i < 2; i += 1) {
      await pg.query(`INSERT INTO "sos_requests" ("id", "requester_id", "severity", "description", "incident_type_id", "location", "status")
        VALUES ($1, $2, 'high', 'A person needs urgent rescue.', $3, 'POINT(51.4 35.7)', 'dispatched')`,
      [SOS[i], REQUESTER, INCIDENT]);
      await pg.query(`INSERT INTO "mission_proposals" ("id", "sos_request_id", "rescuer_id") VALUES ($1, $2, $3)`,
        [PROPOSAL[i], SOS[i], RESCUER]);
    }
    store = new DrizzleSosDispatchStore(drizzle(pg, { schema }) as unknown as Database);
  });
  afterAll(async () => { await pg.close(); });

  it("lists only this rescuer's pending offers with incident, requester, photo and coordinates", async () => {
    await pg.exec(`CREATE FUNCTION ST_X(point geometry) RETURNS double precision LANGUAGE SQL IMMUTABLE AS $$
      SELECT split_part(split_part(point::text, '(', 2), ' ', 1)::double precision $$;
      CREATE FUNCTION ST_Y(point geometry) RETURNS double precision LANGUAGE SQL IMMUTABLE AS $$
      SELECT split_part(split_part(point::text, ' ', 2), ')', 1)::double precision $$;`);
    await pg.query(`UPDATE "sos_requests" SET "photo_url" = '/uploads/evidence.png' WHERE "id" = $1`, [SOS[0]]);
    const first = await store.listPendingProposals(RESCUER, 1, 1);
    expect(first.total).toBe(2);
    expect(first.items).toHaveLength(1);
    expect(proposalInboxItemSchema.parse({ ...missionProposalPayload(first.items[0]!), details: first.items[0]!.details })).toMatchObject({
      id: first.items[0]?.id
    });
    expect(first.items[0]?.details).toMatchObject({
      incidentTypeName: "Rescue", requesterName: "accept_requester",
      sosRequest: {
        severity: "high", description: "A person needs urgent rescue.",
        location: { lat: 35.7, lon: 51.4, isManual: false }
      }
    });
    const second = await store.listPendingProposals(RESCUER, 2, 1);
    expect(second.total).toBe(2);
    expect(second.items).toHaveLength(1);
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    expect([first.items[0], second.items[0]].some((item) => item?.details?.sosRequest.photoUrl === '/uploads/evidence.png')).toBe(true);
    expect(await store.listPendingProposals(REQUESTER, 1, 20)).toEqual({ items: [], total: 0 });
  });

  it("rolls back all acceptance writes if the history insert fails", async () => {
    await pg.exec(`CREATE FUNCTION reject_accept_history() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'history unavailable'; END $$;
      CREATE TRIGGER reject_accept_history BEFORE INSERT ON mission_status_history
      FOR EACH ROW EXECUTE FUNCTION reject_accept_history();`);
    await expect(store.acceptProposal(PROPOSAL[0]!, RESCUER)).rejects.toThrow("Failed query");
    expect((await pg.query(`SELECT "id" FROM "missions"`)).rows).toHaveLength(0);
    expect((await pg.query<{ status: string }>(`SELECT "status" FROM "mission_proposals" WHERE "id" = $1`, [PROPOSAL[0]])).rows[0]?.status).toBe("pending");
    expect((await pg.query<{ is_on_mission: boolean }>(`SELECT "is_on_mission" FROM "users" WHERE "id" = $1`, [RESCUER])).rows[0]?.is_on_mission).toBe(false);
    await pg.exec("DROP TRIGGER reject_accept_history ON mission_status_history; DROP FUNCTION reject_accept_history();");
  });

  it("serializes competing accepts and declines the other pending proposal", async () => {
    const outcomes = await Promise.all(PROPOSAL.map((id) => store.acceptProposal(id, RESCUER)));
    expect(outcomes.filter((value) => value.status === "accepted")).toHaveLength(1);
    expect(outcomes.filter((value) => value.status !== "accepted")).toHaveLength(1);
    expect((await pg.query(`SELECT "id" FROM "missions"`)).rows).toHaveLength(1);
    expect((await pg.query(`SELECT "id" FROM "mission_status_history"`)).rows).toHaveLength(1);
    expect((await pg.query<{ status: string }>(`SELECT "status" FROM "mission_proposals" ORDER BY "status"`)).rows.map((r) => r.status))
      .toEqual(["accepted", "declined"]);
    // Even if a stale flag is cleared externally, the active mission row prevents another accept.
    const thirdSos = "40000000-0000-4000-8000-000000000006";
    const thirdProposal = "50000000-0000-4000-8000-000000000006";
    await pg.query(`INSERT INTO "sos_requests" ("id", "requester_id", "severity", "description", "incident_type_id", "location", "status")
      VALUES ($1, $2, 'high', 'Another person needs urgent rescue.', $3, 'POINT(51.4 35.7)', 'dispatched')`,
    [thirdSos, REQUESTER, INCIDENT]);
    await pg.query(`INSERT INTO "mission_proposals" ("id", "sos_request_id", "rescuer_id") VALUES ($1, $2, $3)`,
      [thirdProposal, thirdSos, RESCUER]);
    await pg.query(`UPDATE "users" SET "is_on_mission" = false WHERE "id" = $1`, [RESCUER]);
    expect(await store.acceptProposal(thirdProposal, RESCUER)).toEqual({ status: "on_mission" });
    expect((await pg.query(`SELECT "id" FROM "missions"`)).rows).toHaveLength(1);
    await expect(pg.query(`UPDATE "mission_proposals" SET "decline_reason" = 'stale' WHERE "id" = $1`, [thirdProposal]))
      .rejects.toThrow();
  });

  it("races decline against accept without overwriting a committed decision", async () => {
    const secondRescuer = "20000000-0000-4000-8000-000000000007";
    const proposal = "50000000-0000-4000-8000-000000000007";
    await pg.query(`INSERT INTO "users" ("id", "username", "password_hash", "role")
      VALUES ($1, 'accept_race_rescuer', 'hash', 'user')`, [secondRescuer]);
    await pg.query(`INSERT INTO "mission_proposals" ("id", "sos_request_id", "rescuer_id") VALUES ($1, $2, $3)`,
      [proposal, SOS[1], secondRescuer]);
    const outcomes = await Promise.all([
      store.acceptProposal(proposal, secondRescuer),
      store.declineProposal(proposal, secondRescuer, "Unsafe crossing")
    ]);
    const proposalRow = await pg.query<{ status: string; decline_reason: string | null }>(
      `SELECT "status", "decline_reason" FROM "mission_proposals" WHERE "id" = $1`, [proposal]
    );
    const missions = await pg.query(`SELECT "id" FROM "missions" WHERE "rescuer_id" = $1`, [secondRescuer]);
    if (proposalRow.rows[0]?.status === "accepted") {
      expect(outcomes).toMatchObject([{ status: "accepted" }, "not_pending"]);
      expect(proposalRow.rows[0]?.decline_reason).toBeNull();
      expect(missions.rows).toHaveLength(1);
    } else {
      expect(outcomes).toEqual([{ status: "not_pending" }, "declined"]);
      expect(proposalRow.rows).toEqual([{ status: "declined", decline_reason: "Unsafe crossing" }]);
      expect(missions.rows).toHaveLength(0);
    }
  });
});
