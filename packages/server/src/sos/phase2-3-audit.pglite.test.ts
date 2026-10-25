import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { io as createClientSocket, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sosNewRequestEventSchema, type SosNewRequestEvent } from "@borobiya/shared";
import { createFastifyApp } from "../app";
import { parseServerEnv } from "../config/env";
import { DrizzleAdminUserStore } from "../db/admin-user-store";
import { DrizzleCategoryStore } from "../db/category-store";
import type { Database } from "../db/client";
import { DrizzleUserDeviceStore } from "../db/device-store";
import { DrizzleIncidentTypeStore } from "../db/incident-type-store";
import { DrizzleLocationHistoryStore } from "../db/location-history-store";
import { DrizzleLocationShareStore } from "../db/location-share-store";
import { DrizzleUserLoginStore } from "../db/login-store";
import { DrizzleUserRecoveryStore } from "../db/recovery-store";
import { DrizzleUserRegistrationStore } from "../db/registration-store";
import * as schema from "../db/schema";
import { DrizzleUserSecurityQuestionsStore } from "../db/security-questions-store";
import { DrizzleSosDispatchStore } from "../db/sos-dispatch-store";
import { DrizzleSosPhotoStore } from "../db/sos-photo-store";
import { DrizzleSosRequestStore } from "../db/sos-request-store";
import { DrizzleUserSearchStore } from "../db/user-search-store";
import { LOCATION_UPDATE_EVENT, SOS_NEW_REQUEST_EVENT } from "../realtime/socket";
import { signAccessToken } from "../security/tokens";
import { createPhotoStorage } from "../sos/photo-storage";

const JWT_SECRET = "phase2_3_audit_jwt_secret_minimum_32_characters_long_ok";
const JWT_REFRESH_SECRET = "phase2_3_audit_refresh_secret_minimum_32_chars_long_ok";

const FRESH_ADMIN_ID = "a1000000-0000-4000-8000-000000000001";
const FRESH_ADMIN_SESSION = "a1100000-0000-4000-8000-000000000001";
const UNFINISHED_USER_ID = "a2000000-0000-4000-8000-000000000002";
const UNFINISHED_USER_SESSION = "a2100000-0000-4000-8000-000000000002";
const REQUESTER_ID = "a3000000-0000-4000-8000-000000000003";
const REQUESTER_SESSION = "a3100000-0000-4000-8000-000000000003";
const RESCUER_A_ID = "a4000000-0000-4000-8000-000000000004";
const RESCUER_A_SESSION = "a4100000-0000-4000-8000-000000000004";
const RESCUER_B_ID = "a5000000-0000-4000-8000-000000000005";
const RESCUER_B_SESSION = "a5100000-0000-4000-8000-000000000005";
const INCIDENT_ID = "a6000000-0000-4000-8000-000000000006";
const CATEGORY_ID = "a7000000-0000-4000-8000-000000000007";

describe("Phase 2 & 3 cross-cutting server + realtime regression suite (PGlite)", () => {
  let pg: PGlite;
  let db: Database;
  let app: FastifyInstance;
  let serverUrl: string;
  let uploadDir: string;

  beforeAll(async () => {
    uploadDir = mkdtempSync(join(tmpdir(), "borobiya-p23-audit-"));
    pg = new PGlite({ extensions: { pg_trgm } });

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
      DATABASE_URL: "postgresql://borobiya:borobiya@127.0.0.1:5432/borobiya",
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
    serverUrl = await app.listen({ host: "127.0.0.1", port: 0 });
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
        "location_shares",
        "location_history",
        "admin_audit_log",
        "user_sessions",
        "users"
      RESTART IDENTITY CASCADE;
    `);

    await pg.query(
      `INSERT INTO "incident_types" ("id", "name", "slug") VALUES ($1, 'امداد کوهستان', 'mountain')`,
      [INCIDENT_ID]
    );
    await pg.query(
      `INSERT INTO "categories" ("id", "name") VALUES ($1, 'تیم کوهستان')`,
      [CATEGORY_ID]
    );
    await pg.query(
      `INSERT INTO "category_incident_types" ("category_id", "incident_type_id") VALUES ($1, $2)`,
      [CATEGORY_ID, INCIDENT_ID]
    );

    // Fresh CLI-seeded admin: role='admin' AND must_complete_security_questions=true (default schema column)
    await pg.query(
      `INSERT INTO "users" ("id", "username", "password_hash", "role", "must_complete_security_questions")
       VALUES ($1, 'fresh_cli_admin', 'hash', 'admin', true)`,
      [FRESH_ADMIN_ID]
    );
    await pg.query(
      `INSERT INTO "user_sessions" ("id", "user_id", "device_id", "refresh_token_hash", "is_online")
       VALUES ($1, $2, 'dev-admin', 'hash-admin', true)`,
      [FRESH_ADMIN_SESSION, FRESH_ADMIN_ID]
    );

    // Unfinished regular user: role='user' AND must_complete_security_questions=true -> must still be blocked
    await pg.query(
      `INSERT INTO "users" ("id", "username", "password_hash", "role", "must_complete_security_questions")
       VALUES ($1, 'unfinished_citizen', 'hash', 'user', true)`,
      [UNFINISHED_USER_ID]
    );
    await pg.query(
      `INSERT INTO "user_sessions" ("id", "user_id", "device_id", "refresh_token_hash", "is_online")
       VALUES ($1, $2, 'dev-unfinished', 'hash-unfinished', true)`,
      [UNFINISHED_USER_SESSION, UNFINISHED_USER_ID]
    );

    // Active citizen + two responders
    await pg.query(
      `INSERT INTO "users" ("id", "username", "password_hash", "role", "must_complete_security_questions", "last_location")
       VALUES
         ($1, 'citizen_one', 'hash', 'user', false, ST_SetSRID(ST_MakePoint(51.338, 35.700), 4326)::geography),
         ($2, 'responder_one', 'hash', 'user', false, ST_SetSRID(ST_MakePoint(51.339, 35.701), 4326)::geography),
         ($3, 'responder_two', 'hash', 'user', false, ST_SetSRID(ST_MakePoint(51.340, 35.702), 4326)::geography)`,
      [REQUESTER_ID, RESCUER_A_ID, RESCUER_B_ID]
    );
    await pg.query(
      `INSERT INTO "user_sessions" ("id", "user_id", "device_id", "refresh_token_hash", "is_online", "last_active_at")
       VALUES
         ($1, $2, 'dev-citizen', 'hash-citizen', true, '2026-10-23T08:00:00.000Z'),
         ($3, $4, 'dev-rescuer-a', 'hash-rescuer-a', false, '2026-10-23T08:00:00.000Z'),
         ($5, $6, 'dev-rescuer-b', 'hash-rescuer-b', true, '2026-10-23T08:00:00.000Z')`,
      [
        REQUESTER_SESSION,
        REQUESTER_ID,
        RESCUER_A_SESSION,
        RESCUER_A_ID,
        RESCUER_B_SESSION,
        RESCUER_B_ID
      ]
    );
    await pg.query(
      `INSERT INTO "category_users" ("category_id", "user_id") VALUES ($1, $2), ($1, $3)`,
      [CATEGORY_ID, RESCUER_A_ID, RESCUER_B_ID]
    );
  });

  it("allows freshly provisioned admins with mustCompleteSecurityQuestions=true to connect to Socket.IO and receive sos:new-request while still blocking unfinished users", async () => {
    const freshAdminToken = await signAccessToken(
      { userId: FRESH_ADMIN_ID, role: "admin", sessionId: FRESH_ADMIN_SESSION, deviceId: "dev-admin" },
      JWT_SECRET
    );
    const unfinishedUserToken = await signAccessToken(
      {
        userId: UNFINISHED_USER_ID,
        role: "user",
        sessionId: UNFINISHED_USER_SESSION,
        deviceId: "dev-unfinished"
      },
      JWT_SECRET
    );
    const citizenToken = await signAccessToken(
      { userId: REQUESTER_ID, role: "user", sessionId: REQUESTER_SESSION, deviceId: "dev-citizen" },
      JWT_SECRET
    );

    // 1. Unfinished regular user is strictly rejected with SECURITY_QUESTIONS_REQUIRED
    const rejectedError = await new Promise<Error & { data?: { code?: string } }>((resolve, reject) => {
      const sock = createClientSocket(serverUrl, {
        auth: { token: unfinishedUserToken },
        transports: ["websocket"],
        reconnection: false
      });
      sock.once("connect", () => {
        sock.close();
        reject(new Error("Expected unfinished user handshake to fail"));
      });
      sock.once("connect_error", (err) => {
        sock.close();
        resolve(err as Error & { data?: { code?: string } });
      });
    });
    expect(rejectedError.data?.code).toBe("SECURITY_QUESTIONS_REQUIRED");

    // 2. Fresh CLI-seeded admin connects cleanly and receives live sos:new-request
    const adminSocket = await new Promise<ClientSocket>((resolve, reject) => {
      const sock = createClientSocket(serverUrl, {
        auth: { token: freshAdminToken },
        transports: ["websocket"],
        reconnection: false
      });
      sock.once("connect", () => resolve(sock));
      sock.once("connect_error", reject);
    });

    const receivedAlerts: SosNewRequestEvent[] = [];
    adminSocket.on(SOS_NEW_REQUEST_EVENT, (payload) => {
      receivedAlerts.push(sosNewRequestEventSchema.parse(payload));
    });

    try {
      const res = await app.inject({
        method: "POST",
        url: "/_user/sos/requests",
        headers: { authorization: `Bearer ${citizenToken}` },
        payload: {
          severity: "high",
          description: "سقوط کوهنورد در مسیر ایستگاه پنجم توچال",
          incidentTypeId: INCIDENT_ID,
          location: { lat: 35.7, lon: 51.338, accuracy: 8, isManual: false }
        }
      });
      expect(res.statusCode).toBe(201);

      await new Promise((r) => setTimeout(r, 60));
      expect(receivedAlerts).toHaveLength(1);
      expect(receivedAlerts[0]?.sosRequest.severity).toBe("high");
    } finally {
      adminSocket.close();
    }
  });

  it("drives real-time session presence (is_online + last_active_at) across multi-tab connect, GPS updates, user search, and final-tab disconnect", async () => {
    const citizenToken = await signAccessToken(
      { userId: REQUESTER_ID, role: "user", sessionId: REQUESTER_SESSION, deviceId: "dev-citizen" },
      JWT_SECRET
    );
    const rescuerAToken = await signAccessToken(
      { userId: RESCUER_A_ID, role: "user", sessionId: RESCUER_A_SESSION, deviceId: "dev-rescuer-a" },
      JWT_SECRET
    );
    const adminToken = await signAccessToken(
      { userId: FRESH_ADMIN_ID, role: "admin", sessionId: FRESH_ADMIN_SESSION, deviceId: "dev-admin" },
      JWT_SECRET
    );

    // Initially responder_one is offline (`is_online = false`), so `online=true` excludes them:
    const initialSearch = await app.inject({
      method: "GET",
      url: "/_user/users/search?q=responder_one&online=true",
      headers: { authorization: `Bearer ${citizenToken}` }
    });
    expect(initialSearch.statusCode).toBe(200);
    expect(initialSearch.json().items).toHaveLength(0);

    // Open two simultaneous tabs on responder_one's session:
    const openTab = () =>
      new Promise<ClientSocket>((resolve, reject) => {
        const sock = createClientSocket(serverUrl, {
          auth: { token: rescuerAToken },
          transports: ["websocket"],
          reconnection: false
        });
        sock.once("connect", () => resolve(sock));
        sock.once("connect_error", reject);
      });

    const tab1 = await openTab();
    const tab2 = await openTab();

    try {
      await new Promise((r) => setTimeout(r, 60));

      // Both user search `online=true` AND nearest responder `lastActiveAt` reflect live socket activity:
      const liveSearch = await app.inject({
        method: "GET",
        url: "/_user/users/search?q=responder_one&online=true",
        headers: { authorization: `Bearer ${citizenToken}` }
      });
      expect(liveSearch.statusCode).toBe(200);
      expect(liveSearch.json().items).toHaveLength(1);
      expect(liveSearch.json().items[0]).toMatchObject({ username: "responder_one", isOnline: true });

      // Emit a live GPS fix on tab1 and verify ack succeeds + refreshes `last_active_at`:
      const ack = await new Promise<{ ok: boolean }>((resolve) => {
        tab1.emit(
          LOCATION_UPDATE_EVENT,
          {
            priorityDeviceId: "dev-rescuer-a",
            lat: 35.7005,
            lon: 51.3385,
            accuracy: 6,
            timestamp: new Date().toISOString()
          },
          resolve
        );
      });
      expect(ack.ok).toBe(true);

      const createSos = await app.inject({
        method: "POST",
        url: "/_user/sos/requests",
        headers: { authorization: `Bearer ${citizenToken}` },
        payload: {
          severity: "medium",
          description: "نیاز به راهنمایی و کمک امدادگر کوهستان در مسیر",
          incidentTypeId: INCIDENT_ID,
          location: { lat: 35.7, lon: 51.338, accuracy: 10, isManual: false }
        }
      });
      const { requestId } = createSos.json() as { requestId: string };

      const nearestRes = await app.inject({
        method: "GET",
        url: `/_admin/sos/requests/${requestId}/nearest`,
        headers: { authorization: `Bearer ${adminToken}` }
      });
      expect(nearestRes.statusCode).toBe(200);
      const nearestFirst = nearestRes.json().responders[0];
      expect(nearestFirst.username).toBe("responder_one");
      expect(Date.parse(nearestFirst.lastActiveAt)).toBeGreaterThan(
        Date.parse("2026-10-23T08:00:00.000Z")
      );

      // Closing tab2 alone keeps session online because tab1 is still open on the same session:
      tab2.close();
      await new Promise((r) => setTimeout(r, 80));
      const stillOnlineSearch = await app.inject({
        method: "GET",
        url: "/_user/users/search?q=responder_one&online=true",
        headers: { authorization: `Bearer ${citizenToken}` }
      });
      expect(stillOnlineSearch.json().items).toHaveLength(1);

      // Closing tab1 (the last open socket on that session) flips `is_online` back to false:
      tab1.close();
      await new Promise((r) => setTimeout(r, 80));
      const offlineSearch = await app.inject({
        method: "GET",
        url: "/_user/users/search?q=responder_one&online=true",
        headers: { authorization: `Bearer ${citizenToken}` }
      });
      expect(offlineSearch.json().items).toHaveLength(0);
    } finally {
      tab1.close();
      tab2.close();
    }
  });

  it("serializes concurrent overlapping multi-rescuer dispatches in opposite order without deadlock", async () => {
    const citizenToken = await signAccessToken(
      { userId: REQUESTER_ID, role: "user", sessionId: REQUESTER_SESSION, deviceId: "dev-citizen" },
      JWT_SECRET
    );
    const adminToken = await signAccessToken(
      { userId: FRESH_ADMIN_ID, role: "admin", sessionId: FRESH_ADMIN_SESSION, deviceId: "dev-admin" },
      JWT_SECRET
    );

    const sosRes = await app.inject({
      method: "POST",
      url: "/_user/sos/requests",
      headers: { authorization: `Bearer ${citizenToken}` },
      payload: {
        severity: "high",
        description: "حادثه هم‌زمان برای تست قفل ترتیبی امدادگران",
        incidentTypeId: INCIDENT_ID,
        location: { lat: 35.7, lon: 51.338, accuracy: 5, isManual: false }
      }
    });
    const { requestId } = sosRes.json() as { requestId: string };

    const [d1, d2] = await Promise.all([
      app.inject({
        method: "POST",
        url: `/_admin/sos/requests/${requestId}/dispatch`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { rescuerIds: [RESCUER_B_ID, RESCUER_A_ID] }
      }),
      app.inject({
        method: "POST",
        url: `/_admin/sos/requests/${requestId}/dispatch`,
        headers: { authorization: `Bearer ${adminToken}` },
        payload: { rescuerIds: [RESCUER_A_ID, RESCUER_B_ID] }
      })
    ]);

    expect(d1.statusCode).toBe(201);
    expect(d2.statusCode).toBe(201);
  });
});
