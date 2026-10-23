import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { io as createClientSocket, type Socket as ClientSocket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sosNewRequestEventSchema, type SosNewRequestEvent } from "@borobiya/shared";
import { createFastifyApp } from "../app";
import { parseServerEnv } from "../config/env";
import * as schema from "../db/schema";
import type { Database } from "../db/client";
import { DrizzleSosPhotoStore } from "../db/sos-photo-store";
import { DrizzleSosRequestStore } from "../db/sos-request-store";
import { SOS_NEW_REQUEST_EVENT } from "../realtime/socket";
import { signAccessToken } from "../security/tokens";
import { createPhotoStorage } from "../sos/photo-storage";

const JWT_SECRET = "t3-2-5-test-secret-with-at-least-thirty-two-bytes!";
const JWT_REFRESH_SECRET = "t3-2-5-refresh-secret-at-least-thirty-two-bytes!";
const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN_SESSION_ID = "11111111-1111-4111-8111-111111111112";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const USER_SESSION_ID = "22222222-2222-4222-8222-222222222223";
const PEER_USER_ID = "33333333-3333-4333-8333-333333333333";
const PEER_SESSION_ID = "33333333-3333-4333-8333-333333333334";
const INCIDENT_TYPE_ID = "44444444-4444-4444-8444-444444444444";

// Valid minimal 1x1 PNG (67 bytes) passing header + IEND trailer validation.
const VALID_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082",
  "hex"
);

function buildMultipartPhotoBody(pngBytes: Buffer, boundary = "----BorobiyaTestBoundary") {
  const preamble = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="photo"; filename="scene.png"\r\nContent-Type: image/png\r\n\r\n`,
    "utf8"
  );
  const trailer = Buffer.from(`\r\n--${boundary}--\r\n`, "utf8");
  return {
    contentType: `multipart/form-data; boundary=${boundary}`,
    payload: Buffer.concat([preamble, pngBytes, trailer])
  };
}

describe("T3.2.5 realtime sos:new-request broadcast + admin SOS read endpoints (PGlite)", () => {
  let pg: PGlite;
  let db: Database;
  let uploadDir: string;
  let serverUrl: string;
  let app: FastifyInstance;
  let adminSocket: ClientSocket;
  let peerUserSocket: ClientSocket;
  let adminToken: string;
  let requesterToken: string;
  let peerUserToken: string;

  beforeAll(async () => {
    uploadDir = mkdtempSync(join(tmpdir(), "borobiya-t325-"));
    pg = new PGlite();
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

      CREATE TABLE users (
        id uuid PRIMARY KEY,
        username varchar(64) NOT NULL UNIQUE
      );
      CREATE TABLE incident_types (
        id uuid PRIMARY KEY,
        name varchar(100) NOT NULL,
        slug varchar(64) NOT NULL UNIQUE,
        icon varchar(64),
        color varchar(32),
        description text,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE cancellation_reasons (
        id uuid PRIMARY KEY
      );
      CREATE TABLE sos_requests (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        severity varchar(16) NOT NULL,
        description text NOT NULL,
        incident_type_id uuid NOT NULL REFERENCES incident_types(id),
        location geography NOT NULL,
        accuracy double precision,
        is_manual boolean NOT NULL,
        photo_url text,
        status varchar(32) NOT NULL DEFAULT 'pending',
        cancellation_reason_id uuid REFERENCES cancellation_reasons(id),
        cancellation_custom_text text,
        cancelled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now()
      );
    `);

    await pg.query(
      `INSERT INTO users (id, username) VALUES ($1, 'dispatch_admin'), ($2, 'survivor_one'), ($3, 'regular_peer')`,
      [ADMIN_ID, USER_ID, PEER_USER_ID]
    );
    await pg.query(
      `INSERT INTO incident_types (id, name, slug, color) VALUES ($1, 'آوار و زلزله', 'collapse', '#dc2626')`,
      [INCIDENT_TYPE_ID]
    );

    db = drizzle(pg, { schema }) as unknown as Database;

    adminToken = await signAccessToken(
      { userId: ADMIN_ID, role: "admin", deviceId: "admin-browser", sessionId: ADMIN_SESSION_ID },
      JWT_SECRET
    );
    requesterToken = await signAccessToken(
      { userId: USER_ID, role: "user", deviceId: "survivor-phone", sessionId: USER_SESSION_ID },
      JWT_SECRET
    );
    peerUserToken = await signAccessToken(
      { userId: PEER_USER_ID, role: "user", deviceId: "peer-phone", sessionId: PEER_SESSION_ID },
      JWT_SECRET
    );

    const accounts = new Map([
      [
        ADMIN_ID,
        {
          id: ADMIN_ID,
          username: "dispatch_admin",
          displayName: "مدیر امداد",
          role: "admin" as const,
          isActive: true,
          isSuspended: false,
          suspendedUntil: null,
          mustCompleteSecurityQuestions: false,
          avgRating: null,
          createdAt: new Date("2026-10-20T00:00:00.000Z")
        }
      ],
      [
        USER_ID,
        {
          id: USER_ID,
          username: "survivor_one",
          displayName: "امدادخواه اول",
          role: "user" as const,
          isActive: true,
          isSuspended: false,
          suspendedUntil: null,
          mustCompleteSecurityQuestions: false,
          avgRating: null,
          createdAt: new Date("2026-10-20T00:00:00.000Z")
        }
      ],
      [
        PEER_USER_ID,
        {
          id: PEER_USER_ID,
          username: "regular_peer",
          displayName: "کاربر عادی",
          role: "user" as const,
          isActive: true,
          isSuspended: false,
          suspendedUntil: null,
          mustCompleteSecurityQuestions: false,
          avgRating: null,
          createdAt: new Date("2026-10-20T00:00:00.000Z")
        }
      ]
    ]);
    const liveSessions = new Map([
      [ADMIN_SESSION_ID, { userId: ADMIN_ID, deviceId: "admin-browser" }],
      [USER_SESSION_ID, { userId: USER_ID, deviceId: "survivor-phone" }],
      [PEER_SESSION_ID, { userId: PEER_USER_ID, deviceId: "peer-phone" }]
    ]);

    const config = parseServerEnv({
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
      JWT_SECRET,
      JWT_REFRESH_SECRET,
      CORS_ORIGINS: "http://localhost:5173,http://localhost:3000"
    });

    app = await createFastifyApp(config, {
      sosRequestStore: new DrizzleSosRequestStore(db),
      photoStore: new DrizzleSosPhotoStore(db),
      photoStorage: createPhotoStorage(uploadDir),
      securityQuestionsStore: {
        async findUserById(id: string) {
          return accounts.get(id) ?? null;
        },
        async hasActiveSession(input: { userId: string; sessionId: string; deviceId: string }) {
          const found = liveSessions.get(input.sessionId);
          return Boolean(found && found.userId === input.userId && found.deviceId === input.deviceId);
        },
        async securityQuestionsExist() {
          return true;
        },
        async completeSecurityQuestions() {
          return false;
        }
      },
      adminUserStore: {
        async findAdminActorById(id: string) {
          return accounts.get(id) ?? null;
        },
        async hasActiveSession(input: { userId: string; sessionId: string; deviceId: string }) {
          const found = liveSessions.get(input.sessionId);
          return Boolean(found && found.userId === input.userId && found.deviceId === input.deviceId);
        },
        async listUsers() {
          return { items: [], total: 0, page: 1, limit: 20, totalPages: 0 };
        },
        async getUserDetails() {
          return null;
        },
        async createAdminCreatedUser() {
          return null;
        },
        async updateUserActiveStatus() {
          return null;
        }
      }
    });

    serverUrl = await app.listen({ host: "127.0.0.1", port: 0 });

    adminSocket = createClientSocket(serverUrl, {
      auth: { token: adminToken },
      transports: ["websocket"],
      forceNew: true
    });
    peerUserSocket = createClientSocket(serverUrl, {
      auth: { token: peerUserToken },
      transports: ["websocket"],
      forceNew: true
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        adminSocket.once("connect", () => resolve());
        adminSocket.once("connect_error", reject);
      }),
      new Promise<void>((resolve, reject) => {
        peerUserSocket.once("connect", () => resolve());
        peerUserSocket.once("connect_error", reject);
      })
    ]);
  });

  afterAll(async () => {
    adminSocket?.close();
    peerUserSocket?.close();
    await app?.close();
    await pg?.close();
    if (uploadDir) rmSync(uploadDir, { recursive: true, force: true });
  });

  it("emits sos:new-request exclusively to the admin room on creation and photo attach, and serves admin reads", async () => {
    const adminEvents: SosNewRequestEvent[] = [];
    const peerEvents: unknown[] = [];

    adminSocket.on(SOS_NEW_REQUEST_EVENT, (payload: unknown) => {
      adminEvents.push(sosNewRequestEventSchema.parse(payload));
    });
    peerUserSocket.on(SOS_NEW_REQUEST_EVENT, (payload: unknown) => {
      peerEvents.push(payload);
    });

    const nextAdminEvent = () =>
      new Promise<SosNewRequestEvent>((resolve) => {
        adminSocket.once(SOS_NEW_REQUEST_EVENT, (payload: unknown) => {
          resolve(sosNewRequestEventSchema.parse(payload));
        });
      });

    const createdEventPromise = nextAdminEvent();
    const createRes = await app.inject({
      method: "POST",
      url: "/_user/sos/requests",
      headers: { authorization: `Bearer ${requesterToken}` },
      payload: {
        severity: "high",
        description: "ساختمان سه‌طبقه ریزش کرده و دو نفر زیر آوار هستند",
        incidentTypeId: INCIDENT_TYPE_ID,
        location: {
          lat: 35.6997,
          lon: 51.3379,
          accuracy: 12.5,
          isManual: false
        }
      }
    });

    expect(createRes.statusCode).toBe(201);
    const createdBody = createRes.json() as { requestId: string; status: string };
    const firstBroadcast = await createdEventPromise;

    expect(firstBroadcast.sosRequest).toMatchObject({
      id: createdBody.requestId,
      requesterId: USER_ID,
      severity: "high",
      incidentTypeId: INCIDENT_TYPE_ID,
      location: {
        lat: 35.6997,
        lon: 51.3379,
        accuracy: 12.5,
        isManual: false
      },
      photoUrl: null,
      status: "pending"
    });

    // Attach photo evidence -> emits updated sosRequest with photoUrl to admin room.
    const photoEventPromise = nextAdminEvent();
    const multipart = buildMultipartPhotoBody(VALID_PNG);
    const photoRes = await app.inject({
      method: "POST",
      url: `/_user/sos/requests/${createdBody.requestId}/photo`,
      headers: {
        authorization: `Bearer ${requesterToken}`,
        "content-type": multipart.contentType
      },
      payload: multipart.payload
    });

    expect(photoRes.statusCode).toBe(200);
    const { photoUrl } = photoRes.json() as { photoUrl: string };
    const secondBroadcast = await photoEventPromise;
    expect(secondBroadcast.sosRequest.id).toBe(createdBody.requestId);
    expect(secondBroadcast.sosRequest.photoUrl).toBe(photoUrl);

    // Wait briefly so any leaked broadcast to non-admin room would have arrived.
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(peerEvents).toHaveLength(0);
    expect(adminEvents).toHaveLength(2);

    // Admin list & detail reads match persisted row + PostGIS coordinates.
    const listRes = await app.inject({
      method: "GET",
      url: "/_admin/sos/requests?status=pending&page=1&limit=10",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(listRes.statusCode).toBe(200);
    expect(listRes.headers["cache-control"]).toBe("no-store");
    expect(listRes.json()).toMatchObject({
      total: 1,
      page: 1,
      limit: 10,
      totalPages: 1,
      items: [
        {
          id: createdBody.requestId,
          photoUrl,
          location: { lat: 35.6997, lon: 51.3379, accuracy: 12.5, isManual: false }
        }
      ]
    });

    const detailRes = await app.inject({
      method: "GET",
      url: `/_admin/sos/requests/${createdBody.requestId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().photoUrl).toBe(photoUrl);

    const missingRes = await app.inject({
      method: "GET",
      url: "/_admin/sos/requests/99999999-9999-4999-8999-999999999999",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(missingRes.statusCode).toBe(404);
    expect(missingRes.json().code).toBe("SOS_REQUEST_NOT_FOUND");

    const forbiddenRes = await app.inject({
      method: "GET",
      url: "/_admin/sos/requests",
      headers: { authorization: `Bearer ${peerUserToken}` }
    });
    expect(forbiddenRes.statusCode).toBe(403);
    expect(forbiddenRes.json().code).toBe("ADMIN_REQUIRED");
  });
});
