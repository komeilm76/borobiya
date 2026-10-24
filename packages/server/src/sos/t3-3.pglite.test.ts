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
  missionStatusUpdatedEventSchema,
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
import { DrizzleSosPhotoStore } from "../db/sos-photo-store";
import { DrizzleSosRequestStore } from "../db/sos-request-store";
import { DrizzleUserDeviceStore } from "../db/device-store";
import { DrizzleUserSearchStore } from "../db/user-search-store";
import { SOS_NEW_REQUEST_EVENT, SOS_PROPOSAL_RECEIVED_EVENT, MISSION_SUBSCRIBE_EVENT, MISSION_STATUS_UPDATED_EVENT } from "../realtime/socket";
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
    } finally {
      admin.close(); requester.close(); rescuer.close(); outsider.close();
    }
  });

});
