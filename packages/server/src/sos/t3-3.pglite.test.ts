import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { nearestRespondersResponseSchema } from "@borobiya/shared";
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
import { DrizzleSosPhotoStore } from "../db/sos-photo-store";
import { DrizzleSosRequestStore } from "../db/sos-request-store";
import { DrizzleUserDeviceStore } from "../db/device-store";
import { DrizzleUserSearchStore } from "../db/user-search-store";
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
      photoStore: new DrizzleSosPhotoStore(db),
      photoStorage: createPhotoStorage(uploadDir)
    });
    await app.ready();

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
});
