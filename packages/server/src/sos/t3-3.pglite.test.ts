import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { io as createClientSocket, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  dispatchResponseSchema,
  nearestRespondersResponseSchema,
  sosNewRequestEventSchema,
  sosProposalReceivedEventSchema,
  missionStatusUpdatedEventSchema, missionLocationEventSchema, rescuerCancellationEventSchema, requesterCancellationEventSchema,
  type SosNewRequestEvent,
  type SosProposalReceivedEvent
} from "@borobiya/shared";
import { createFastifyApp } from "../app";
import { parseServerEnv } from "../config/env";
import * as schema from "../db/schema";
import type { Database } from "../db/client";
import { DrizzleAdminUserStore } from "../db/admin-user-store";
import { DrizzleCategoryStore } from "../db/category-store";
import { DrizzleIncidentTypeStore } from "../db/incident-type-store";
import { DrizzleUserLoginStore } from "../db/login-store";
import { DrizzleLocationHistoryStore } from "../db/location-history-store";
import { DrizzleLocationShareStore } from "../db/location-share-store";
import { DrizzleUserRecoveryStore } from "../db/recovery-store";
import { DrizzleUserRegistrationStore } from "../db/registration-store";
import { DrizzleUserSecurityQuestionsStore } from "../db/security-questions-store";
import { DrizzleSosDispatchStore } from "../db/sos-dispatch-store";
import { DrizzleMissionProgressStore } from "../db/mission-progress-store";
import { DrizzleSosCancellationStore } from "../db/sos-cancellation-store";
import { DrizzleSosPhotoStore } from "../db/sos-photo-store";
import { DrizzleSosRequestStore } from "../db/sos-request-store";
import { DrizzleUserDeviceStore } from "../db/device-store";
import { DrizzleUserSearchStore } from "../db/user-search-store";
import { SOS_NEW_REQUEST_EVENT, SOS_PROPOSAL_RECEIVED_EVENT, MISSION_SUBSCRIBE_EVENT, MISSION_LOCATION_PUBLISH_EVENT, MISSION_LOCATION_EVENT, MISSION_STATUS_UPDATED_EVENT, MISSION_CANCELLED_BY_RESCUER_EVENT, MISSION_CANCELLED_BY_REQUESTER_EVENT } from "../realtime/socket";
import { signAccessToken } from "../security/tokens";
import { createPhotoStorage } from "./photo-storage";

const JWT_SECRET = "t3-3-test-secret-with-at-least-thirty-two-bytes-long!";
const JWT_REFRESH_SECRET = "t3-3-refresh-secret-with-at-least-thirty-two-bytes!";

const ADMIN_ID = "10000000-0000-4000-8000-000000000001";
const ADMIN_SESSION_ID = "10000000-0000-4000-8000-000000000002";
const REQUESTER_ID = "20000000-0000-4000-8000-000000000001";
const REQUESTER_SESSION_ID = "20000000-0000-4000-8000-000000000002";

const INCIDENT_MEDICAL_ID = "30000000-0000-4000-8000-000000000001";
const INCIDENT_FIRE_ID = "30000000-0000-4000-8000-000000000002";
const CAT_MEDICAL_ALPHA_ID = "40000000-0000-4000-8000-000000000001";
const CAT_MEDICAL_BETA_ID = "40000000-0000-4000-8000-000000000002";
const CAT_FIRE_ONLY_ID = "40000000-0000-4000-8000-000000000003";

describe("T3.3.1 + T3.3.3 nearest qualified responder SQL & GET /_admin/sos/requests/:id/nearest (PGlite)", () => {
  let pg: PGlite;
  let db: Database;
  let uploadDir: string;
  let serverUrl: string;
  let app: FastifyInstance;
  let adminToken: string;
  let requesterToken: string;

  async function seedUser(options: {
    id: string;
    username: string;
    role?: "user" | "admin";
    isActive?: boolean;
    isSuspended?: boolean;
    isOnMission?: boolean;
    avgRating?: number | null;
    lat?: number | null;
    lon?: number | null;
    sessionId?: string;
    lastActiveAt?: string;
    createdAt?: string;
  }) {
    const locationText =
      options.lat !== undefined && options.lat !== null && options.lon !== undefined && options.lon !== null
        ? `POINT(${options.lon} ${options.lat})`
        : null;
    await pg.query(
      `INSERT INTO "users" (
        "id", "username", "password_hash", "role", "is_active", "is_suspended",
        "is_on_mission", "must_complete_security_questions", "avg_rating", "last_location", "created_at"
      ) VALUES ($1, $2, 'argon2id$test', $3, $4, $5, $6, false, $7, $8, COALESCE($9::timestamptz, now()))`,
      [
        options.id,
        options.username,
        options.role ?? "user",
        options.isActive ?? true,
        options.isSuspended ?? false,
        options.isOnMission ?? false,
        options.avgRating ?? null,
        locationText,
        options.createdAt ?? "2026-10-20T08:00:00.000Z"
      ]
    );
    if (options.sessionId) {
      await pg.query(
        `INSERT INTO "user_sessions" (
          "id", "user_id", "device_id", "device_name", "refresh_token_hash", "last_active_at"
        ) VALUES ($1, $2, $3, 'Test Device', $4, COALESCE($5::timestamptz, now()))`,
        [
          options.sessionId,
          options.id,
          `dev-${options.id.slice(-6)}`,
          `hash-${options.sessionId}`,
          options.lastActiveAt ?? "2026-10-23T12:00:00.000Z"
        ]
      );
    }
  }

  beforeAll(async () => {
    uploadDir = mkdtempSync(join(tmpdir(), "borobiya-t33-"));
    pg = new PGlite();

    // Replay all checked-in Drizzle migrations (0000..0013) plus exact spherical Haversine ST_Distance.
    const journal = JSON.parse(
      readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8")
    ) as { entries: { tag: string }[] };

    await pg.exec(`
      CREATE DOMAIN geography AS text;
      CREATE DOMAIN geometry AS text;
      CREATE FUNCTION st_makepoint(lon double precision, lat double precision)
        RETURNS text LANGUAGE sql IMMUTABLE AS $$
          SELECT 'POINT(' || lon::text || ' ' || lat::text || ')';
        $$;
      CREATE FUNCTION st_setsrid(pt text, srid integer)
        RETURNS text LANGUAGE sql IMMUTABLE AS $$
          SELECT pt;
        $$;
      CREATE FUNCTION st_x(pt text)
        RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
          SELECT split_part(trim(trailing ')' from trim(leading 'POINT(' from pt)), ' ', 1)::double precision;
        $$;
      CREATE FUNCTION st_y(pt text)
        RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
          SELECT split_part(trim(trailing ')' from trim(leading 'POINT(' from pt)), ' ', 2)::double precision;
        $$;
      CREATE FUNCTION st_distance(a text, b text)
        RETURNS double precision LANGUAGE sql IMMUTABLE STRICT AS $$
          SELECT 6371000.0 * 2.0 * asin(
            sqrt(
              power(sin(radians((st_y(b) - st_y(a)) / 2.0)), 2) +
              cos(radians(st_y(a))) * cos(radians(st_y(b))) *
              power(sin(radians((st_x(b) - st_x(a)) / 2.0)), 2)
            )
          );
        $$;
    `);

    for (const { tag } of journal.entries) {
      const raw = readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8");
      const statements = raw
        .split("--> statement-breakpoint")
        .map((part) => part.trim())
        .filter(Boolean);

      for (const statement of statements) {
        if (/\bpostgis\b|\bUSING\s+gist\s*\(/i.test(statement)) continue;
        const adapted = statement.replace(/(?<!")geography\(Point,4326\)(?!")/g, "text");
        await pg.exec(adapted);
      }
    }

    db = drizzle(pg, { schema }) as unknown as Database;
    const config = parseServerEnv({
      NODE_ENV: "test",
      PORT: "3000",
      HOST: "127.0.0.1",
      DATABASE_URL: "postgres://unused:unused@127.0.0.1:5432/unused",
      JWT_SECRET,
      JWT_REFRESH_SECRET,
      CORS_ORIGINS: "http://localhost:5173",
      UPLOAD_DIR: uploadDir
    });

    app = await createFastifyApp(config, {
      registrationStore: new DrizzleUserRegistrationStore(db),
      loginStore: new DrizzleUserLoginStore(db),
      recoveryStore: new DrizzleUserRecoveryStore(db),
      adminUserStore: new DrizzleAdminUserStore(db),
      securityQuestionsStore: new DrizzleUserSecurityQuestionsStore(db),
      userDeviceStore: new DrizzleUserDeviceStore(db),
      locationShareStore: new DrizzleLocationShareStore(db),
      locationHistoryStore: new DrizzleLocationHistoryStore(db),
      userSearchStore: new DrizzleUserSearchStore(db),
      incidentTypeStore: new DrizzleIncidentTypeStore(db),
      categoryStore: new DrizzleCategoryStore(db),
      sosRequestStore: new DrizzleSosRequestStore(db),
      sosDispatchStore: new DrizzleSosDispatchStore(db),
      missionProgressStore: new DrizzleMissionProgressStore(db),
      sosCancellationStore: new DrizzleSosCancellationStore(db),
      photoStore: new DrizzleSosPhotoStore(db),
      photoStorage: createPhotoStorage(uploadDir)
    });
    serverUrl = await app.listen({ host: "127.0.0.1", port: 0 });

    adminToken = await signAccessToken(
      { userId: ADMIN_ID, role: "admin", sessionId: ADMIN_SESSION_ID, deviceId: `dev-${ADMIN_ID.slice(-6)}` },
      JWT_SECRET
    );
    requesterToken = await signAccessToken(
      {
        userId: REQUESTER_ID,
        role: "user",
        sessionId: REQUESTER_SESSION_ID,
        deviceId: `dev-${REQUESTER_ID.slice(-6)}`
      },
      JWT_SECRET
    );
  });

  afterAll(async () => {
    await app.close();
    await pg.close();
    rmSync(uploadDir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await pg.exec(`
      TRUNCATE TABLE
        "mission_proposals",
        "cancellation_reasons",
        "sos_requests",
        "category_users",
        "category_incident_types",
        "categories",
        "incident_types",
        "admin_audit_log",
        "user_sessions",
        "users"
      RESTART IDENTITY CASCADE;
    `);

    await seedUser({
      id: ADMIN_ID,
      username: "dispatch_admin",
      role: "admin",
      sessionId: ADMIN_SESSION_ID
    });
    await seedUser({
      id: REQUESTER_ID,
      username: "trapped_requester",
      role: "user",
      lat: 35.6997,
      lon: 51.338,
      sessionId: REQUESTER_SESSION_ID
    });

    await pg.query(
      `INSERT INTO "incident_types" ("id", "name", "slug")
       VALUES ($1, 'امداد پزشکی', 'medical'), ($2, 'آتش‌نشانی', 'fire')`,
      [INCIDENT_MEDICAL_ID, INCIDENT_FIRE_ID]
    );
    await pg.query(
      `INSERT INTO "categories" ("id", "name")
       VALUES ($1, 'امداد شهری'), ($2, 'تیم واکنش سریع'), ($3, 'آتش‌نشانان')`,
      [CAT_MEDICAL_ALPHA_ID, CAT_MEDICAL_BETA_ID, CAT_FIRE_ONLY_ID]
    );
    await pg.query(
      `INSERT INTO "category_incident_types" ("category_id", "incident_type_id")
       VALUES ($1, $4), ($2, $4), ($3, $5)`,
      [CAT_MEDICAL_ALPHA_ID, CAT_MEDICAL_BETA_ID, CAT_FIRE_ONLY_ID, INCIDENT_MEDICAL_ID, INCIDENT_FIRE_ID]
    );
    // Even if the requester belongs to a matching category at 0m, they must never be suggested to rescue themselves.
    await pg.query(
      `INSERT INTO "category_users" ("category_id", "user_id") VALUES ($1, $2)`,
      [CAT_MEDICAL_ALPHA_ID, REQUESTER_ID]
    );
  });

  it("does not truncate replacement candidates before excluding previously assigned rescuers", async () => {
    const sosId = "76000000-0000-4000-8000-000000000001";
    const assigned: string[] = [];
    const nextId = "77000000-0000-4000-8000-000000000011";
    await pg.query(`INSERT INTO sos_requests (id,requester_id,severity,description,incident_type_id,location,status)
      VALUES ($1,$2,'high','A responder replacement is urgently needed.', $3,'POINT(51.4 35.7)','cancelled_by_rescuer')`,
      [sosId, REQUESTER_ID, INCIDENT_MEDICAL_ID]);
    for (let n = 1; n <= 11; n++) {
      const id = `77000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      await seedUser({ id, username: `replacement_${n}`, lat: 35.7, lon: 51.4 + n * 0.001 });
      await pg.query(`INSERT INTO category_users (category_id,user_id) VALUES ($1,$2)`, [CAT_MEDICAL_ALPHA_ID, id]);
      if (n <= 10) {
        assigned.push(id);
        await pg.query(`INSERT INTO missions (sos_request_id,rescuer_id,requester_id,status)
          VALUES ($1,$2,$3,'cancelled_by_rescuer')`, [sosId, id, REQUESTER_ID]);
      }
    }
    const url = `/_admin/sos/requests/${sosId}/nearest`;
    const headers = { authorization: `Bearer ${adminToken}` };
    const ordinary = await app.inject({ method: "GET", url, headers });
    expect(ordinary.json().responders.map((row: { userId: string }) => row.userId)).toEqual(assigned);
    const replacement = await app.inject({ method: "GET", url: `${url}?excludeAssigned=true`, headers });
    expect(replacement.statusCode).toBe(200);
    expect(nearestRespondersResponseSchema.parse(replacement.json()).responders.map((row) => row.userId))
      .toEqual([nextId]);
    expect((await app.inject({ method: "GET", url: `${url}?excludeAssigned=garbage`, headers })).statusCode).toBe(400);
  });

  it("enforces admin auth, UUID validation, and 404 on unknown SOS request IDs", async () => {
    const unauth = await app.inject({
      method: "GET",
      url: "/_admin/sos/requests/99999999-9999-4999-8999-999999999999/nearest"
    });
    expect(unauth.statusCode).toBe(401);

    const nonAdmin = await app.inject({
      method: "GET",
      url: "/_admin/sos/requests/99999999-9999-4999-8999-999999999999/nearest",
      headers: { authorization: `Bearer ${requesterToken}` }
    });
    expect(nonAdmin.statusCode).toBe(403);

    const badUuid = await app.inject({
      method: "GET",
      url: "/_admin/sos/requests/not-a-valid-uuid/nearest",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(badUuid.statusCode).toBe(400);
    expect(badUuid.json()).toMatchObject({ code: "VALIDATION_ERROR" });

    const missing = await app.inject({
      method: "GET",
      url: "/_admin/sos/requests/99999999-9999-4999-8999-999999999999/nearest",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "SOS_REQUEST_NOT_FOUND" });
  });

  it("filters ineligible responders, deduplicates multi-category memberships, breaks distance ties by avgRating DESC, and caps at 10", async () => {
    const createRes = await app.inject({
      method: "POST",
      url: "/_user/sos/requests",
      headers: { authorization: `Bearer ${requesterToken}` },
      payload: {
        severity: "high",
        description: "حادثه شدید در میدان آزادی نیازمند تیم پزشکی",
        incidentTypeId: INCIDENT_MEDICAL_ID,
        location: { lat: 35.6997, lon: 51.338, accuracy: 6, isManual: false }
      }
    });
    expect(createRes.statusCode).toBe(201);
    const { requestId } = createRes.json() as { requestId: string };

    // Seed 5 ineligible responders very close to the SOS point:
    const wrongSpecialtyId = "50000000-0000-4000-8000-000000000001";
    const unassignedId = "50000000-0000-4000-8000-000000000002";
    const inactiveId = "50000000-0000-4000-8000-000000000003";
    const suspendedId = "50000000-0000-4000-8000-000000000004";
    const onMissionId = "50000000-0000-4000-8000-000000000005";
    const nullLocationId = "50000000-0000-4000-8000-000000000006";

    await seedUser({ id: wrongSpecialtyId, username: "fire_only_near", lat: 35.6998, lon: 51.3381 });
    await seedUser({ id: unassignedId, username: "unassigned_near", lat: 35.6998, lon: 51.3381 });
    await seedUser({ id: inactiveId, username: "inactive_medic", isActive: false, lat: 35.6998, lon: 51.3381 });
    await seedUser({ id: suspendedId, username: "suspended_medic", isSuspended: true, lat: 35.6998, lon: 51.3381 });
    await seedUser({ id: onMissionId, username: "busy_medic", isOnMission: true, lat: 35.6998, lon: 51.3381 });
    await seedUser({ id: nullLocationId, username: "unknown_gps_medic", lat: null, lon: null });

    await pg.query(
      `INSERT INTO "category_users" ("category_id", "user_id")
       VALUES ($1, $3), ($2, $4), ($2, $5), ($2, $6), ($2, $7)`,
      [
        CAT_FIRE_ONLY_ID,
        CAT_MEDICAL_ALPHA_ID,
        wrongSpecialtyId,
        inactiveId,
        suspendedId,
        onMissionId,
        nullLocationId
      ]
    );

    // Seed 2 responders standing at the EXACT same ~400m coordinate with different ratings,
    // plus multi-category membership on the higher-rated one:
    const tieHighRatedDualCatId = "60000000-0000-4000-8000-000000000001";
    const tieLowRatedId = "60000000-0000-4000-8000-000000000002";
    await seedUser({
      id: tieHighRatedDualCatId,
      username: "medic_elite_dual",
      avgRating: 4.9,
      lat: 35.7033,
      lon: 51.338,
      sessionId: "61000000-0000-4000-8000-000000000001",
      lastActiveAt: "2026-10-23T13:30:00.000Z"
    });
    await seedUser({
      id: tieLowRatedId,
      username: "medic_rookie",
      avgRating: 3.4,
      lat: 35.7033,
      lon: 51.338,
      createdAt: "2026-10-21T09:15:00.000Z" // No session row -> falls back to createdAt!
    });
    await pg.query(
      `INSERT INTO "category_users" ("category_id", "user_id")
       VALUES ($1, $4), ($2, $4), ($3, $4), ($1, $5)`,
      [CAT_MEDICAL_ALPHA_ID, CAT_MEDICAL_BETA_ID, CAT_FIRE_ONLY_ID, tieHighRatedDualCatId, tieLowRatedId]
    );

    // Seed 10 progressively farther qualified responders (~1km to ~10km away) so total qualified = 12 -> capped at 10.
    for (let i = 1; i <= 10; i++) {
      const uid = `70000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
      await seedUser({
        id: uid,
        username: `medic_ring_${String(i).padStart(2, "0")}`,
        avgRating: 4.0,
        lat: 35.6997 + i * 0.01,
        lon: 51.338
      });
      await pg.query(`INSERT INTO "category_users" ("category_id", "user_id") VALUES ($1, $2)`, [
        CAT_MEDICAL_ALPHA_ID,
        uid
      ]);
    }

    const res = await app.inject({
      method: "GET",
      url: `/_admin/sos/requests/${requestId}/nearest`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(res.statusCode).toBe(200);
    const parsed = nearestRespondersResponseSchema.safeParse(res.json());
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const { responders } = parsed.data;
    expect(responders).toHaveLength(10);

    // 1. Tie at ~400m broken strictly by avgRating DESC, with dual matching categories deduplicated & joined cleanly:
    expect(responders[0]?.username).toBe("medic_elite_dual");
    expect(responders[0]?.avgRating).toBe(4.9);
    expect(responders[0]?.categoryName).toBe("امداد شهری، تیم واکنش سریع");
    expect(responders[0]?.lastActiveAt).toBe("2026-10-23T13:30:00.000Z");
    expect(responders[0]?.distance).toBeGreaterThan(390);
    expect(responders[0]?.distance).toBeLessThan(410);

    expect(responders[1]?.username).toBe("medic_rookie");
    expect(responders[1]?.avgRating).toBe(3.4);
    expect(responders[1]?.categoryName).toBe("امداد شهری");
    expect(responders[1]?.lastActiveAt).toBe("2026-10-21T09:15:00.000Z");

    // 2. Remaining 8 slots ordered strictly nearest-first up to ring_08 (rings 09 & 10 excluded by LIMIT 10):
    expect(responders.slice(2).map((r) => r.username)).toEqual([
      "medic_ring_01",
      "medic_ring_02",
      "medic_ring_03",
      "medic_ring_04",
      "medic_ring_05",
      "medic_ring_06",
      "medic_ring_07",
      "medic_ring_08"
    ]);
  });

  it("does not suggest or dispatch a rescuer with an active mission even when the busy flag is stale", async () => {
    const rescuerId = "80000000-0000-4000-8000-000000000021";
    await seedUser({ id: rescuerId, username: "rescuer_stale_flag", lat: 35.7, lon: 51.34 });
    await pg.query(`INSERT INTO "category_users" ("category_id", "user_id") VALUES ($1, $2)`,
      [CAT_MEDICAL_ALPHA_ID, rescuerId]);
    const createSos = async () => {
      const response = await app.inject({ method: "POST", url: "/_user/sos/requests",
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { severity: "high", description: "Medical team needed at the rescue site urgently.",
          incidentTypeId: INCIDENT_MEDICAL_ID,
          location: { lat: 35.6997, lon: 51.338, isManual: false } }
      });
      expect(response.statusCode).toBe(201);
      return (response.json() as { requestId: string }).requestId;
    };
    const occupiedRequestId = "90000000-0000-4000-8000-000000000021";
    await pg.query(`INSERT INTO "sos_requests" ("id", "requester_id", "severity", "description", "incident_type_id", "location", "status")
      VALUES ($1, $2, 'high', 'Another emergency needs a rescuer.', $3, 'POINT(51.34 35.7)', 'accepted')`,
      [occupiedRequestId, REQUESTER_ID, INCIDENT_MEDICAL_ID]);
    const targetRequestId = await createSos();
    const mission = await pg.query<{ id: string }>(
      `INSERT INTO "missions" ("sos_request_id", "requester_id", "rescuer_id") VALUES ($1, $2, $3) RETURNING "id"`,
      [occupiedRequestId, REQUESTER_ID, rescuerId]
    );
    const nearest = async () => app.inject({ method: "GET", url: `/_admin/sos/requests/${targetRequestId}/nearest`,
      headers: { authorization: `Bearer ${adminToken}` } });
    const dispatch = async () => app.inject({ method: "POST", url: `/_admin/sos/requests/${targetRequestId}/dispatch`,
      headers: { authorization: `Bearer ${adminToken}` }, payload: { rescuerIds: [rescuerId] } });

    const candidates = await nearest();
    expect(candidates.statusCode).toBe(200);
    expect(nearestRespondersResponseSchema.parse(candidates.json()).responders).toEqual([]);
    const blocked = await dispatch();
    expect(blocked.statusCode).toBe(409);
    expect(blocked.json()).toMatchObject({ code: "RESCUER_BUSY" });
    expect((await pg.query(`SELECT "id" FROM "mission_proposals" WHERE "sos_request_id" = $1`, [targetRequestId])).rows).toEqual([]);

    await pg.query(`UPDATE "missions" SET "status" = 'completed' WHERE "id" = $1`, [mission.rows[0]!.id]);
    expect(nearestRespondersResponseSchema.parse((await nearest()).json()).responders.map((r) => r.userId)).toEqual([rescuerId]);
    expect((await dispatch()).statusCode).toBe(201);
  });

  it("dispatches proposals atomically, transitions SOS status, emits sos:proposal-received per rescuer room, handles re-dispatch idempotently, and enforces busy/invalid guards (T3.3.2 / T3.4.5)", async () => {
    const rescuer1Id = "80000000-0000-4000-8000-000000000001";
    const rescuer1Session = "81000000-0000-4000-8000-000000000001";
    const rescuer2Id = "80000000-0000-4000-8000-000000000002";
    const rescuer2Session = "81000000-0000-4000-8000-000000000002";
    const rescuer3Id = "80000000-0000-4000-8000-000000000003";
    const rescuer3Session = "81000000-0000-4000-8000-000000000003";
    const busyRescuerId = "80000000-0000-4000-8000-000000000004";
    const bystanderId = "80000000-0000-4000-8000-000000000005";
    const bystanderSession = "81000000-0000-4000-8000-000000000005";

    await seedUser({ id: rescuer1Id, username: "rescuer_alpha", lat: 35.701, lon: 51.339, sessionId: rescuer1Session });
    await seedUser({ id: rescuer2Id, username: "rescuer_beta", lat: 35.703, lon: 51.34, sessionId: rescuer2Session });
    await seedUser({ id: rescuer3Id, username: "rescuer_gamma", lat: 35.706, lon: 51.342, sessionId: rescuer3Session });
    await seedUser({ id: busyRescuerId, username: "rescuer_busy_1", isOnMission: true, lat: 35.702, lon: 51.339 });
    await seedUser({ id: bystanderId, username: "bystander_user", lat: 35.71, lon: 51.35, sessionId: bystanderSession });

    const r1Token = await signAccessToken(
      { userId: rescuer1Id, role: "user", sessionId: rescuer1Session, deviceId: `dev-${rescuer1Id.slice(-6)}` },
      JWT_SECRET
    );
    const r2Token = await signAccessToken(
      { userId: rescuer2Id, role: "user", sessionId: rescuer2Session, deviceId: `dev-${rescuer2Id.slice(-6)}` },
      JWT_SECRET
    );
    const bystanderToken = await signAccessToken(
      { userId: bystanderId, role: "user", sessionId: bystanderSession, deviceId: `dev-${bystanderId.slice(-6)}` },
      JWT_SECRET
    );

    const openSocket = (token: string) =>
      new Promise<ClientSocket>((resolve, reject) => {
        const sock = createClientSocket(serverUrl, {
          auth: { token },
          transports: ["websocket"],
          reconnection: false
        });
        sock.once("connect", () => resolve(sock));
        sock.once("connect_error", reject);
      });

    const adminSocket = await openSocket(adminToken);
    const r1Socket = await openSocket(r1Token);
    const r2Socket = await openSocket(r2Token);
    const bystanderSocket = await openSocket(bystanderToken);

    const r1Events: SosProposalReceivedEvent[] = [];
    const r2Events: SosProposalReceivedEvent[] = [];
    const bystanderEvents: unknown[] = [];
    const adminEvents: SosNewRequestEvent[] = [];

    r1Socket.on(SOS_PROPOSAL_RECEIVED_EVENT, (payload) => {
      r1Events.push(sosProposalReceivedEventSchema.parse(payload));
    });
    r2Socket.on(SOS_PROPOSAL_RECEIVED_EVENT, (payload) => {
      r2Events.push(sosProposalReceivedEventSchema.parse(payload));
    });
    bystanderSocket.on(SOS_PROPOSAL_RECEIVED_EVENT, (payload) => {
      bystanderEvents.push(payload);
    });
    adminSocket.on(SOS_NEW_REQUEST_EVENT, (payload) => {
      adminEvents.push(sosNewRequestEventSchema.parse(payload));
    });

    try {
      const createRes = await app.inject({
        method: "POST",
        url: "/_user/sos/requests",
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          severity: "high",
          description: "ریزش آوار در ساختمان مسکونی و نیاز فوری به امدادگر",
          incidentTypeId: INCIDENT_MEDICAL_ID,
          location: { lat: 35.6997, lon: 51.338, accuracy: 5, isManual: false }
        }
      });
      expect(createRes.statusCode).toBe(201);
      const { requestId } = createRes.json() as { requestId: string };

      // 1. Dispatching busy responder rejects with 409 RESCUER_BUSY and writes zero proposals:
      const busyDispatch = await app.inject({
        method: "POST",
        url: `/_admin/sos/requests/${requestId}/dispatch`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { rescuerIds: [rescuer1Id, busyRescuerId] }
      });
      expect(busyDispatch.statusCode).toBe(409);
      expect(busyDispatch.json()).toMatchObject({ code: "RESCUER_BUSY" });

      // 2. Dispatching requester to rescue themselves rejects with 400 VALIDATION_ERROR:
      const selfDispatch = await app.inject({
        method: "POST",
        url: `/_admin/sos/requests/${requestId}/dispatch`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { rescuerIds: [REQUESTER_ID] }
      });
      expect(selfDispatch.statusCode).toBe(400);
      expect(selfDispatch.json()).toMatchObject({ code: "VALIDATION_ERROR" });

      // 3. Valid multi-responder dispatch succeeds with 201 and notifies only r1 & r2:
      const dispatch1 = await app.inject({
        method: "POST",
        url: `/_admin/sos/requests/${requestId}/dispatch`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { rescuerIds: [rescuer1Id, rescuer2Id] }
      });
      expect(dispatch1.statusCode).toBe(201);
      const parsed1 = dispatchResponseSchema.parse(dispatch1.json());
      expect(parsed1.proposals).toHaveLength(2);
      expect(parsed1.proposals.map((p) => p.rescuerId)).toEqual([rescuer1Id, rescuer2Id]);
      expect(parsed1.proposals.every((p) => p.status === "pending")).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(r1Events).toHaveLength(1);
      expect(r1Events[0]?.proposal.rescuerId).toBe(rescuer1Id);
      expect(r1Events[0]?.sosRequest.status).toBe("dispatched");
      expect(r2Events).toHaveLength(1);
      expect(r2Events[0]?.proposal.rescuerId).toBe(rescuer2Id);
      expect(bystanderEvents).toHaveLength(0);
      expect(adminEvents.some((e) => e.sosRequest.id === requestId && e.sosRequest.status === "dispatched")).toBe(
        true
      );

      // 4. Re-dispatching [rescuer1, rescuer3] reuses rescuer1's pending proposal without re-emitting to r1:
      const dispatch2 = await app.inject({
        method: "POST",
        url: `/_admin/sos/requests/${requestId}/dispatch`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { rescuerIds: [rescuer1Id, rescuer3Id] }
      });
      expect(dispatch2.statusCode).toBe(201);
      const parsed2 = dispatchResponseSchema.parse(dispatch2.json());
      expect(parsed2.proposals).toHaveLength(2);
      expect(parsed2.proposals[0]?.id).toBe(parsed1.proposals[0]?.id);

      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(r1Events).toHaveLength(1);

      // 5. Once accepted/completed, further dispatch attempts reject with 409 INVALID_SOS_STATUS:
      await pg.query(`UPDATE "sos_requests" SET "status" = 'accepted' WHERE "id" = $1`, [requestId]);
      const closedDispatch = await app.inject({
        method: "POST",
        url: `/_admin/sos/requests/${requestId}/dispatch`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { rescuerIds: [rescuer3Id] }
      });
      expect(closedDispatch.statusCode).toBe(409);
      expect(closedDispatch.json()).toMatchObject({ code: "INVALID_SOS_STATUS" });
    } finally {
      adminSocket.close();
      r1Socket.close();
      r2Socket.close();
      bystanderSocket.close();
    }
  });
  it("scopes live mission-room subscriptions and delivers committed status once to each participant and admin", async () => {
    const rescuerId = "80000000-0000-4000-8000-000000000008";
    const rescuerSession = "81000000-0000-4000-8000-000000000008";
    const outsiderId = "80000000-0000-4000-8000-000000000009";
    const outsiderSession = "81000000-0000-4000-8000-000000000009";
    const sosId = "90000000-0000-4000-8000-000000000008";
    const missionId = "91000000-0000-4000-8000-000000000008";
    await seedUser({ id: rescuerId, username: "mission_rescuer", sessionId: rescuerSession, isOnMission: true });
    await seedUser({ id: outsiderId, username: "mission_outsider", sessionId: outsiderSession });
    await pg.query(`INSERT INTO "sos_requests" ("id", "requester_id", "severity", "description", "incident_type_id", "location", "status")
      VALUES ($1, $2, 'high', 'A rescuer is responding to an incident.', $3, 'POINT(51.4 35.7)', 'accepted')`,
      [sosId, REQUESTER_ID, INCIDENT_MEDICAL_ID]);
    await pg.query(`INSERT INTO "missions" ("id", "sos_request_id", "rescuer_id", "requester_id")
      VALUES ($1, $2, $3, $4)`, [missionId, sosId, rescuerId, REQUESTER_ID]);
    await pg.query(`INSERT INTO "mission_status_history" ("mission_id", "to_status", "changed_by")
      VALUES ($1, 'pending', $2)`, [missionId, rescuerId]);
    const tokenFor = (id: string, session: string) => signAccessToken({
      userId: id, role: "user", sessionId: session, deviceId: `dev-${id.slice(-6)}`
    }, JWT_SECRET);
    const connect = (token: string) => new Promise<ClientSocket>((resolve, reject) => {
      const sock = createClientSocket(serverUrl, { auth: { token }, transports: ["websocket"], reconnection: false });
      sock.once("connect", () => resolve(sock));
      sock.once("connect_error", reject);
    });
    const admin = await connect(adminToken);
    const requester = await connect(requesterToken);
    const rescuer = await connect(await tokenFor(rescuerId, rescuerSession));
    const outsider = await connect(await tokenFor(outsiderId, outsiderSession));
    const subscribe = (socket: ClientSocket, id: string) => new Promise<{ ok: boolean; code?: string }>((resolve, reject) => {
      socket.timeout(2000).emit(MISSION_SUBSCRIBE_EVENT, { missionId: id }, (error: Error | null, result: { ok: boolean; code?: string }) => {
        if (error) reject(error); else resolve(result);
      });
    });
    try {
      expect(await subscribe(outsider, missionId)).toEqual({ ok: false, code: "MISSION_UNAVAILABLE" });
      expect(await subscribe(requester, missionId)).toEqual({ ok: true });
      expect(await subscribe(rescuer, missionId)).toEqual({ ok: true });
      expect(await subscribe(admin, missionId)).toEqual({ ok: true });
      const positions = { admin: [] as unknown[], requester: [] as unknown[], rescuer: [] as unknown[], outsider: [] as unknown[] };
      admin.on(MISSION_LOCATION_EVENT, (event) => positions.admin.push(event));
      requester.on(MISSION_LOCATION_EVENT, (event) => positions.requester.push(event));
      rescuer.on(MISSION_LOCATION_EVENT, (event) => positions.rescuer.push(event));
      outsider.on(MISSION_LOCATION_EVENT, (event) => positions.outsider.push(event));
      const publish = (socket: ClientSocket, id: string, device: string) => new Promise<{ ok: boolean; code?: string }>((resolve, reject) => {
        socket.timeout(3000).emit(MISSION_LOCATION_PUBLISH_EVENT, { missionId: id,
          location: { lat: 35.73, lon: 51.43, accuracy: 14, timestamp: new Date().toISOString(), priorityDeviceId: device }
        }, (error: Error | null, result: { ok: boolean; code?: string }) => {
          if (error) reject(error); else resolve(result);
        });
      });
      expect(await publish(outsider, missionId, "dev-000009")).toMatchObject({ ok: false, code: "MISSION_UNAVAILABLE" });
      expect(await publish(admin, missionId, "dev-000001")).toMatchObject({ ok: true });
      expect(await publish(requester, missionId, "dev-000001")).toMatchObject({ ok: true });
      expect(await publish(rescuer, missionId, "dev-000008")).toMatchObject({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 60));
      for (const recipient of [positions.admin, positions.requester, positions.rescuer]) {
        expect(recipient.map((event) => missionLocationEventSchema.parse(event))
          .sort((a, b) => a.role.localeCompare(b.role))).toMatchObject([
          { missionId, userId: ADMIN_ID, role: "admin" },
          { missionId, userId: REQUESTER_ID, role: "requester" },
          { missionId, userId: rescuerId, role: "rescuer" }
        ]);
      }
      expect(positions.outsider).toEqual([]);
      // The ordinary live-share event is not an implicit mission-sharing opt-in.
      await new Promise<void>((resolve, reject) => {
        rescuer.timeout(3000).emit("location:update", { lat: 35.74, lon: 51.44,
          timestamp: new Date().toISOString(), priorityDeviceId: "dev-000008" },
        (error: Error | null, ack: { ok: boolean }) => {
          if (error) reject(error);
          else if (!ack.ok) reject(new Error("Generic location update rejected"));
          else resolve();
        });
      });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(positions.admin).toHaveLength(3);
      expect(positions.requester).toHaveLength(3);
      expect(positions.rescuer).toHaveLength(3);

      const listMissions = async () => app.inject({ method: "GET", url: `/_admin/sos/requests/${sosId}/missions`,
        headers: { authorization: `Bearer ${adminToken}` } });
      expect((await listMissions()).json().map((mission: { id: string }) => mission.id)).toEqual([missionId]);
      const deniedList = await app.inject({ method: "GET", url: `/_admin/sos/requests/${sosId}/missions`,
        headers: { authorization: `Bearer ${requesterToken}` } });
      expect(deniedList.statusCode).not.toBe(200);
      const received = { admin: [] as unknown[], requester: [] as unknown[], rescuer: [] as unknown[], outsider: [] as unknown[] };
      admin.on(MISSION_STATUS_UPDATED_EVENT, (event) => received.admin.push(event));
      requester.on(MISSION_STATUS_UPDATED_EVENT, (event) => received.requester.push(event));
      rescuer.on(MISSION_STATUS_UPDATED_EVENT, (event) => received.rescuer.push(event));
      outsider.on(MISSION_STATUS_UPDATED_EVENT, (event) => received.outsider.push(event));
      const response = await app.inject({ method: "PATCH", url: `/_user/missions/${missionId}/status`,
        headers: { authorization: `Bearer ${await tokenFor(rescuerId, rescuerSession)}` }, payload: { status: "on_the_way" }
      });
      expect(response.statusCode).toBe(200);
      const payload = { missionId, status: "on_the_way", by: rescuerId, at: response.json().updatedAt };
      await new Promise((resolve) => setTimeout(resolve, 60));
      for (const recipient of [received.admin, received.requester, received.rescuer]) {
        expect(recipient.map((event) => missionStatusUpdatedEventSchema.parse(event))).toEqual([payload]);
      }
      expect(received.outsider).toEqual([]);
      await pg.query(`UPDATE "missions" SET "status" = 'completed' WHERE "id" = $1`, [missionId]);
      expect(await publish(rescuer, missionId, "dev-000008")).toMatchObject({ ok: false, code: "MISSION_UNAVAILABLE" });
      expect((await listMissions()).json()).toEqual([]);
      const historyUrl = `/_user/sos/missions/${missionId}/timeline`;
      const adminHistoryUrl = `/_admin/sos/missions/${missionId}/timeline`;
      for (const [bearer, url] of [[requesterToken, historyUrl],
        [await tokenFor(rescuerId, rescuerSession), historyUrl], [adminToken, adminHistoryUrl]]) {
        const response = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${bearer}` } });
        expect(response.statusCode).toBe(200);
        expect(response.headers["cache-control"]).toBe("no-store");
        expect(response.json().map((entry: { toStatus: string }) => entry.toStatus)).toEqual(["pending", "on_the_way"]);
      }
      for (const [bearer, url] of [[await tokenFor(outsiderId, outsiderSession), historyUrl],
        [requesterToken, adminHistoryUrl]]) {
        const response = await app.inject({ method: "GET", url, headers: { authorization: `Bearer ${bearer}` } });
        expect(response.statusCode).not.toBe(200);
      }
      const allMissions = await app.inject({ method: "GET", url: `/_admin/sos/requests/${sosId}/missions?includeTerminal=true`,
        headers: { authorization: `Bearer ${adminToken}` } });
      expect(allMissions.json().map((row: { id: string }) => row.id)).toEqual([missionId]);
      expect(positions.admin).toHaveLength(3);

    } finally {
      admin.close(); requester.close(); rescuer.close(); outsider.close();
    }
  });

  it("validates requester reasons, atomically cancels an unaccepted SOS and withdraws its offers", async () => {
    const sosId = "92000000-0000-4000-8000-000000000001";
    const rescuerId = "92000000-0000-4000-8000-000000000002";
    const reasonId = "92000000-0000-4000-8000-000000000003";
    const wrongReason = "92000000-0000-4000-8000-000000000004";
    const otherReason = "92000000-0000-4000-8000-000000000005";
    await seedUser({ id: rescuerId, username: "offer_rescuer" });
    await pg.query(`INSERT INTO "cancellation_reasons" ("id", "type", "key", "label", "label_fa", "requires_custom_text")
      VALUES ($1, 'requester', 'need_resolved', 'Resolved', 'رفع شد', false),
             ($2, 'rescuer', 'physical_inability', 'Unable', 'عدم توانایی', false),
             ($3, 'requester', 'other', 'Other', 'سایر', true)`, [reasonId, wrongReason, otherReason]);
    await pg.query(`INSERT INTO "sos_requests" ("id", "requester_id", "severity", "description", "incident_type_id", "location", "status")
      VALUES ($1, $2, 'high', 'A rescuer is needed at this location.', $3, 'POINT(51.4 35.7)', 'dispatched')`,
      [sosId, REQUESTER_ID, INCIDENT_MEDICAL_ID]);
    await pg.query(`INSERT INTO "mission_proposals" ("sos_request_id", "rescuer_id") VALUES ($1, $2)`, [sosId, rescuerId]);
    const url = `/_user/sos/requests/${sosId}/cancel`;
    const send = (token: string, reason: string, customReason?: string) => app.inject({ method: "POST", url,
      headers: { authorization: `Bearer ${token}` }, payload: { cancellationReasonId: reason, ...(customReason ? { customReason } : {}) }
    });
    const [reasons] = await Promise.all([app.inject({ method: "GET", url: "/_user/sos/cancellation-reasons?type=requester",
      headers: { authorization: `Bearer ${requesterToken}` } }), app.ready()]);
    expect(reasons.statusCode).toBe(200);
    expect(reasons.json().map((reason: { id: string }) => reason.id)).toEqual([reasonId, otherReason]);
    expect((await send(adminToken, reasonId)).statusCode).toBe(404);
    expect((await send(requesterToken, wrongReason)).statusCode).toBe(400);
    expect((await send(requesterToken, otherReason)).statusCode).toBe(400);
    expect((await send(requesterToken, reasonId, "An unwanted explanation")).statusCode).toBe(400);
    const pending = await pg.query<{ status: string }>(`SELECT status FROM "mission_proposals" WHERE "sos_request_id" = $1`, [sosId]);
    expect(pending.rows[0]?.status).toBe("pending");
    const cancelled = await send(requesterToken, reasonId);
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.body).toBe("");
    const stored = await pg.query<{ status: string; cancellation_reason_id: string; cancelled_at: Date | null }>(
      `SELECT status, cancellation_reason_id, cancelled_at FROM "sos_requests" WHERE "id" = $1`, [sosId]);
    expect(stored.rows[0]?.status).toBe("cancelled_by_requester");
    expect(stored.rows[0]?.cancellation_reason_id).toBe(reasonId);
    expect(stored.rows[0]?.cancelled_at).not.toBeNull();
    const expired = await pg.query<{ status: string }>(`SELECT status FROM "mission_proposals" WHERE "sos_request_id" = $1`, [sosId]);
    expect(expired.rows[0]?.status).toBe("expired");
    expect((await send(requesterToken, reasonId)).statusCode).toBe(200);
  });

  it("cancels every active mission of an accepted SOS, releases responders and emits one event per mission after commit", async () => {
    const sosId = "93000000-0000-4000-8000-000000000001";
    const rescuerId = "93000000-0000-4000-8000-000000000002";
    const secondId = "93000000-0000-4000-8000-000000000004";
    const sessionId = "93000000-0000-4000-8000-000000000005";
    const missionId = "93000000-0000-4000-8000-000000000006";
    const secondMissionId = "93000000-0000-4000-8000-000000000007";
    const reasonId = "93000000-0000-4000-8000-000000000003";
    await seedUser({ id: rescuerId, username: "active_rescuer", isOnMission: true, sessionId });
    await seedUser({ id: secondId, username: "second_active_rescuer", isOnMission: true });
    await pg.query(`INSERT INTO "cancellation_reasons" ("id", "type", "key", "label") VALUES ($1, 'requester', 'resolved', 'Resolved')`, [reasonId]);
    await pg.query(`INSERT INTO "sos_requests" ("id", "requester_id", "severity", "description", "incident_type_id", "location", "status")
      VALUES ($1, $2, 'high', 'An active rescue mission is underway.', $3, 'POINT(51.4 35.7)', 'accepted')`, [sosId, REQUESTER_ID, INCIDENT_MEDICAL_ID]);
    await pg.query(`INSERT INTO "missions" (id,sos_request_id,rescuer_id,requester_id,status) VALUES
      ($1,$3,$4,$5,'on_the_way'),($2,$3,$6,$5,'pending')`,
      [missionId, secondMissionId, sosId, rescuerId, REQUESTER_ID, secondId]);
    const otherSosId = "93000000-0000-4000-8000-000000000008";
    await pg.query(`INSERT INTO sos_requests (id,requester_id,severity,description,incident_type_id,location,status)
      VALUES ($1,$2,'high','Another requester still needs this responder.', $3,'POINT(51.4 35.7)','accepted')`,
      [otherSosId, ADMIN_ID, INCIDENT_MEDICAL_ID]);
    await pg.query(`INSERT INTO missions (sos_request_id,rescuer_id,requester_id) VALUES ($1,$2,$3)`,
      [otherSosId, rescuerId, ADMIN_ID]);
    const token = await signAccessToken({ userId: rescuerId, role: "user", sessionId,
      deviceId: `dev-${rescuerId.slice(-6)}` }, JWT_SECRET);
    const rescuer = createClientSocket(serverUrl, { auth: { token }, transports: ["websocket"], reconnection: false });
    const admin = createClientSocket(serverUrl, { auth: { token: adminToken }, transports: ["websocket"], reconnection: false });
    const rescuerEvents: unknown[] = [];
    const adminEvents: unknown[] = [];
    rescuer.on(MISSION_CANCELLED_BY_REQUESTER_EVENT, (event) => rescuerEvents.push(event));
    admin.on(MISSION_CANCELLED_BY_REQUESTER_EVENT, (event) => adminEvents.push(event));
    await Promise.all([rescuer, admin].map((sock) => new Promise<void>((resolve, reject) => {
      sock.once("connect", () => resolve()); sock.once("connect_error", reject);
    })));
    try {
      const send = () => app.inject({ method: "POST", url: `/_user/sos/requests/${sosId}/cancel`,
        headers: { authorization: `Bearer ${requesterToken}` }, payload: { cancellationReasonId: reasonId } });
      expect((await send()).statusCode).toBe(200);
      const stored = await pg.query<{ status: string; cancellation_reason_id: string }>(
        `SELECT status,cancellation_reason_id FROM sos_requests WHERE id=$1`, [sosId]);
      expect(stored.rows[0]).toEqual({ status: "cancelled_by_requester", cancellation_reason_id: reasonId });
      const missionRows = await pg.query<{ status: string; cancelled_by: string }>(
        `SELECT status,cancelled_by FROM missions WHERE sos_request_id=$1 ORDER BY id`, [sosId]);
      expect(missionRows.rows).toEqual([
        { status: "cancelled_by_requester", cancelled_by: "requester" },
        { status: "cancelled_by_requester", cancelled_by: "requester" }
      ]);
      expect((await pg.query<{ count: number }>(`SELECT count(*) FROM mission_status_history WHERE mission_id=ANY($1::uuid[])`,
        [[missionId, secondMissionId]])).rows[0]?.count).toBe(2);
      const freed = await pg.query<{ is_on_mission: boolean }>(`SELECT is_on_mission FROM users
        WHERE id=ANY($1::uuid[]) ORDER BY id`, [[rescuerId, secondId]]);
      expect(freed.rows.map((row) => row.is_on_mission)).toEqual([true, false]);
      expect((await pg.query<{ status: string }>(`SELECT status FROM sos_requests WHERE id=$1`,
        [otherSosId])).rows[0]?.status).toBe("accepted");
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(rescuerEvents.map((event) => requesterCancellationEventSchema.parse(event).missionId)).toEqual([missionId]);
      expect(adminEvents.map((event) => requesterCancellationEventSchema.parse(event).missionId).sort())
        .toEqual([missionId, secondMissionId]);
      const requestDetail = await app.inject({ method: "GET", url: `/_user/sos/requests/${sosId}`,
        headers: { authorization: `Bearer ${requesterToken}` } });
      expect(requestDetail.json()).toMatchObject({ cancelledBy: "requester", cancellationReasonId: reasonId,
        cancellationReason: { id: reasonId, key: "resolved", label: "Resolved", customText: null } });
      expect(requestDetail.json().cancelledAt).toBeTruthy();
      const adminDetail = await app.inject({ method: "GET", url: `/_admin/sos/requests/${sosId}`,
        headers: { authorization: `Bearer ${adminToken}` } });
      expect(adminDetail.json().cancellationReason).toEqual(requestDetail.json().cancellationReason);
      const missionDetail = await app.inject({ method: "GET", url: `/_user/sos/missions/${missionId}`,
        headers: { authorization: `Bearer ${requesterToken}` } });
      expect(missionDetail.json()).toMatchObject({ cancelledBy: "requester", cancelledAt: expect.any(String),
        cancellationReason: { id: reasonId, key: "resolved", customText: null } });
      const history = await app.inject({ method: "GET", url: `/_user/sos/missions/${missionId}/timeline`,
        headers: { authorization: `Bearer ${requesterToken}` } });
      expect(history.statusCode).toBe(200);
      expect(history.json()).toMatchObject([{
        missionId, fromStatus: "on_the_way", toStatus: "cancelled_by_requester", changedBy: REQUESTER_ID
      }]);
      const adminHistory = await app.inject({ method: "GET", url: `/_admin/sos/missions/${secondMissionId}/timeline`,
        headers: { authorization: `Bearer ${adminToken}` } });
      expect(adminHistory.json()).toMatchObject([{ missionId: secondMissionId, toStatus: "cancelled_by_requester" }]);
      const filtered = await app.inject({ method: "GET",
        url: `/_user/sos/missions?role=requester&sosRequestId=${sosId}`, headers: { authorization: `Bearer ${requesterToken}` } });
      expect(filtered.json()).toMatchObject({ total: 2 });
      const foreign = await app.inject({ method: "GET",
        url: `/_user/sos/missions?role=requester&sosRequestId=${otherSosId}`,
        headers: { authorization: `Bearer ${requesterToken}` } });
      expect(foreign.json()).toMatchObject({ total: 0, items: [] });
      const terminal = await app.inject({ method: "GET", url: `/_admin/sos/requests/${sosId}/missions?includeTerminal=true`,
        headers: { authorization: `Bearer ${adminToken}` } });
      expect(terminal.json().map((mission: { status: string }) => mission.status)).toEqual([
        "cancelled_by_requester", "cancelled_by_requester"
      ]);
      expect((await send()).statusCode).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 40));
      expect(adminEvents).toHaveLength(2);
    } finally { rescuer.close(); admin.close(); }
  });

  it("keeps requester SOS history owner-scoped with stable pagination and indistinguishable foreign IDs", async () => {
    const first = "97000000-0000-4000-8000-000000000001";
    const second = "97000000-0000-4000-8000-000000000002";
    const foreign = "97000000-0000-4000-8000-000000000003";
    for (const [id, owner, date] of [
      [first, REQUESTER_ID, "2026-10-21T08:00:00Z"],
      [second, REQUESTER_ID, "2026-10-22T08:00:00Z"],
      [foreign, ADMIN_ID, "2026-10-23T08:00:00Z"]
    ]) await pg.query(`INSERT INTO sos_requests (id,requester_id,severity,description,incident_type_id,location,created_at)
      VALUES ($1,$2,'medium','A person needs help at the ridge.', $3,'POINT(51.4 35.7)',$4)`,
      [id, owner, INCIDENT_MEDICAL_ID, date]);
    const headers = { authorization: `Bearer ${requesterToken}` };
    const list = await app.inject({ method: "GET", url: "/_user/sos/requests?role=requester&limit=1", headers });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ total: 2, totalPages: 2, items: [{ id: second }] });
    const page2 = await app.inject({ method: "GET", url: "/_user/sos/requests?role=requester&limit=1&page=2", headers });
    expect(page2.json()).toMatchObject({ total: 2, items: [{ id: first }] });
    expect((await app.inject({ method: "GET", url: `/_user/sos/requests/${first}`, headers })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: `/_user/sos/requests/${foreign}`, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/_user/sos/requests?role=rescuer", headers })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: "/_user/sos/requests?limit=999", headers })).statusCode).toBe(400);
    const indexes = await pg.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes
      WHERE tablename='sos_requests' AND indexname='sos_requests_requester_created_at_idx'`);
    expect(indexes.rows).toHaveLength(1);
  });

  it("atomically cancels rescuer missions, releases the responder, keeps location admin-only, flags repeated/Other reasons and limits bursts", async () => {
    const rescuerId = "94000000-0000-4000-8000-000000000001";
    const sessionId = "94000000-0000-4000-8000-000000000002";
    const reasonId = "94000000-0000-4000-8000-000000000003";
    const otherId = "94000000-0000-4000-8000-000000000004";
    await seedUser({ id: rescuerId, username: "cancel_rescuer", sessionId, isOnMission: true, lat: 35.7, lon: 51.4 });
    await pg.query(`INSERT INTO "cancellation_reasons" (id,type,key,label,requires_custom_text) VALUES
      ($1,'rescuer','physical_inability','Unable to reach',false),($2,'rescuer','other','Other',true)`, [reasonId, otherId]);
    const token = await signAccessToken({ userId: rescuerId, role: "user", sessionId,
      deviceId: `dev-${rescuerId.slice(-6)}` }, JWT_SECRET);
    const admin = createClientSocket(serverUrl, { auth: { token: adminToken }, transports: ["websocket"], reconnection: false });
    const requester = createClientSocket(serverUrl, { auth: { token: requesterToken }, transports: ["websocket"], reconnection: false });
    const adminEvents: unknown[] = [];
    const requesterEvents: unknown[] = [];
    admin.on(MISSION_CANCELLED_BY_RESCUER_EVENT, (event) => adminEvents.push(event));
    requester.on(MISSION_CANCELLED_BY_RESCUER_EVENT, (event) => requesterEvents.push(event));
    await Promise.all([admin, requester].map((sock) => new Promise<void>((resolve, reject) => {
      if (sock.connected) return resolve();
      sock.once("connect", () => resolve()); sock.once("connect_error", reject);
    })));
    async function missionFor(n: number) {
      const sosId = `95000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      const missionId = `96000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
      await pg.query(`INSERT INTO "sos_requests" (id,requester_id,severity,description,incident_type_id,location,status)
        VALUES ($1,$2,'high','A rescue mission is in progress.', $3,'POINT(51.4 35.7)','accepted')`,
        [sosId, REQUESTER_ID, INCIDENT_MEDICAL_ID]);
      await pg.query(`INSERT INTO "missions" (id,sos_request_id,rescuer_id,requester_id)
        VALUES ($1,$2,$3,$4)`, [missionId, sosId, rescuerId, REQUESTER_ID]);
      await pg.query(`UPDATE users SET is_on_mission=true WHERE id=$1`, [rescuerId]);
      return { sosId, missionId };
    }
    try {
      const first = await missionFor(1);
      const cancel = (id: string, reason: string, customReason?: string) => app.inject({
        method: "POST", url: `/_user/missions/${id}/cancel`, headers: { authorization: `Bearer ${token}` },
        payload: { cancellationReasonId: reason, ...(customReason ? { customReason } : {}) }
      });
      expect((await cancel(first.missionId, reasonId)).statusCode).toBe(200);
      expect((await pg.query<{ status: string; cancelled_by: string }>(`SELECT status, cancelled_by FROM missions WHERE id=$1`,
        [first.missionId])).rows[0]).toEqual({ status: "cancelled_by_rescuer", cancelled_by: "rescuer" });
      expect((await pg.query<{ status: string }>(`SELECT status FROM sos_requests WHERE id=$1`, [first.sosId])).rows[0]?.status)
        .toBe("cancelled_by_rescuer");
      expect((await pg.query<{ is_on_mission: boolean }>(`SELECT is_on_mission FROM users WHERE id=$1`,
        [rescuerId])).rows[0]?.is_on_mission).toBe(false);
      expect((await pg.query<{ to_status: string }>(`SELECT to_status FROM mission_status_history WHERE mission_id=$1`,
        [first.missionId])).rows).toEqual([{ to_status: "cancelled_by_rescuer" }]);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(adminEvents).toHaveLength(1);
      expect(requesterEvents).toHaveLength(1);
      expect(rescuerCancellationEventSchema.parse(adminEvents[0])).toMatchObject({ missionId: first.missionId,
        rescuerLocation: { lat: 35.7, lon: 51.4 }, reviewRequired: false });
      expect(rescuerCancellationEventSchema.parse(requesterEvents[0])).not.toHaveProperty("rescuerLocation");
      const second = await missionFor(2);
      expect((await cancel(second.missionId, otherId, "My situation makes rescue unsafe.")).statusCode).toBe(200);
      const rescuerDetail = await app.inject({ method: "GET", url: `/_user/sos/missions/${second.missionId}`,
        headers: { authorization: `Bearer ${requesterToken}` } });
      expect(rescuerDetail.json()).toMatchObject({ cancelledBy: "rescuer", cancelledAt: expect.any(String),
        cancellationReason: { id: otherId, key: "other", customText: "My situation makes rescue unsafe." } });
      const sosAfterRescuer = await app.inject({ method: "GET", url: `/_user/sos/requests/${second.sosId}`,
        headers: { authorization: `Bearer ${requesterToken}` } });
      expect(sosAfterRescuer.json()).toMatchObject({ cancelledBy: "rescuer", cancellationReason: null,
        cancelledAt: null }); // A replacement-needed SOS does not own the rescuer's mission reason.
      const third = await missionFor(3);
      expect((await cancel(third.missionId, reasonId)).statusCode).toBe(200);
      const flags = await pg.query<{ type: string; mission_id: string }>(`SELECT type,mission_id FROM admin_alerts ORDER BY type`);
      expect(flags.rows).toEqual([
        { type: "rescuer_cancel_review", mission_id: third.missionId },
        { type: "rescuer_other_reason_approval", mission_id: second.missionId }
      ]);
      expect((await cancel(third.missionId, reasonId)).statusCode).toBe(429);
      await new Promise((resolve) => setTimeout(resolve, 60));
      expect(adminEvents).toHaveLength(3);
      expect(requesterEvents).toHaveLength(3);
      expect(rescuerCancellationEventSchema.parse(adminEvents[2]).reviewRequired).toBe(true);
    } finally { admin.close(); requester.close(); }
  });

});
