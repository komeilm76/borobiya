import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import { DrizzleAdminUserStore } from "../db/admin-user-store";
import { DrizzleAdminOperationsStore } from "../db/admin-operations-store";
import { createFastifyApp } from "../app";
import { parseServerEnv } from "../config/env";
import { signAccessToken } from "../security/tokens";

const config = parseServerEnv({
  NODE_ENV: "test", DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: "a".repeat(48), JWT_REFRESH_SECRET: "b".repeat(48), CORS_ORIGINS: "http://localhost:5173"
});
let pg: PGlite;
let db: Database;
let app: FastifyInstance;
let adminId: string;
let userId: string;
let suspendedId: string;
let adminToken: string;
let userToken: string;
let adminSessionId: string;
const deviceId = randomUUID();

beforeAll(async () => {
  pg = new PGlite({ extensions: { pg_trgm } });
  await pg.exec(`CREATE DOMAIN geography AS text;
    CREATE FUNCTION st_makepoint(lon double precision, lat double precision)
      RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT format('POINT(%s %s)', lon, lat) $$;
    CREATE FUNCTION st_setsrid(geom text, srid integer)
      RETURNS geography LANGUAGE sql IMMUTABLE AS $$ SELECT geom::geography $$;`);
  const journal = JSON.parse(readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8")) as
    { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    const raw = readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8");
    for (const statement of raw.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean)) {
      if (/\bpostgis\b|\bUSING\s+gist\s*\(/i.test(statement)) continue;
      await pg.exec(statement.replace(/(?<!")geography\(Point,4326\)(?!")/g, "geography"));
    }
  }
  db = drizzle(pg, { schema }) as unknown as Database;
  const accounts = await db.insert(schema.users).values([
    { username: "operations_admin", role: "admin", passwordHash: "hash" },
    { username: "operations_user", passwordHash: "hash" },
    { username: "operations_suspended", passwordHash: "hash", isSuspended: true }
  ]).returning({ id: schema.users.id });
  adminId = accounts[0]!.id;
  userId = accounts[1]!.id;
  suspendedId = accounts[2]!.id;
  const sessions = await db.insert(schema.userSessions).values([
    { userId: adminId, deviceId, refreshTokenHash: "admin-hash", isOnline: true },
    { userId, deviceId, refreshTokenHash: "user-hash", isOnline: true },
    { userId, deviceId: randomUUID(), refreshTokenHash: "user-other-hash", isOnline: true },
    { userId: suspendedId, deviceId, refreshTokenHash: "suspended-hash", isOnline: true }
  ]).returning({ id: schema.userSessions.id });
  adminSessionId = sessions[0]!.id;
  adminToken = await signAccessToken({ userId: adminId, sessionId: adminSessionId, deviceId, role: "admin" }, config.jwtSecret);
  userToken = await signAccessToken({ userId, sessionId: sessions[1]!.id, deviceId, role: "user" }, config.jwtSecret);
  app = await createFastifyApp(config, {
    adminUserStore: new DrizzleAdminUserStore(db), adminOperationsStore: new DrizzleAdminOperationsStore(db)
  });
  await app.ready();
});

afterAll(async () => { await app?.close(); await pg?.close(); });

const auth = () => ({ authorization: `Bearer ${adminToken}` });
const reason = { type: "rescuer", key: "local_weather", label: "Weather", labelFa: "آب و هوا",
  requiresCustomText: false, isActive: false };

describe("admin operations with real PostgreSQL (PGlite)", () => {
  it("guards all four endpoints, including revoked admin sessions and non-admin identities", async () => {
    const paths = [
      { method: "PATCH" as const, url: `/_admin/users/${suspendedId}/unsuspend` },
      { method: "GET" as const, url: "/_admin/stats" },
      { method: "GET" as const, url: "/_admin/cancellation-reasons" },
      { method: "POST" as const, url: "/_admin/cancellation-reasons", payload: reason }
    ];
    for (const path of paths) {
      expect((await app.inject(path)).statusCode).toBe(401);
      expect((await app.inject({ ...path, headers: { authorization: `Bearer ${userToken}` } })).statusCode).toBe(403);
    }
    await db.update(schema.userSessions).set({ refreshTokenHash: null }).where(eq(schema.userSessions.id, adminSessionId));
    for (const path of paths) {
      expect((await app.inject({ ...path, headers: auth() })).statusCode).toBe(401);
    }
    await db.update(schema.userSessions).set({ refreshTokenHash: "admin-hash" })
      .where(eq(schema.userSessions.id, adminSessionId));
  });

  it("unsuspends only a matching user, revokes old sessions, and audits a change just once", async () => {
    expect((await app.inject({ method: "PATCH", url: "/_admin/users/not-a-uuid/unsuspend", headers: auth() })).statusCode).toBe(400);
    expect((await app.inject({ method: "PATCH", url: `/_admin/users/${randomUUID()}/unsuspend`, headers: auth() })).statusCode).toBe(404);
    const url = `/_admin/users/${suspendedId}/unsuspend`;
    const first = await app.inject({ method: "PATCH", url, headers: auth() });
    expect(first.statusCode).toBe(200);
    expect(first.body).toBe("");
    expect((await db.select().from(schema.users).where(eq(schema.users.id, suspendedId)))[0]?.isSuspended).toBe(false);
    expect((await db.select().from(schema.userSessions).where(eq(schema.userSessions.userId, suspendedId)))[0])
      .toMatchObject({ refreshTokenHash: null, isOnline: false });
    expect((await app.inject({ method: "PATCH", url, headers: auth() })).statusCode).toBe(200);
    const audit = await db.select().from(schema.adminAuditLog).where(eq(schema.adminAuditLog.action, "user_unsuspended"));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ adminId, targetId: suspendedId });
  });

  it("creates an inactive reason transactionally, rejects duplicate type/key, and lists active and inactive", async () => {
    const path = "/_admin/cancellation-reasons";
    const before = await app.inject({ method: "GET", url: path, headers: auth() });
    expect(before.statusCode).toBe(200);
    expect(Array.isArray(before.json())).toBe(true);
    expect((await app.inject({ method: "POST", url: path, headers: auth(), payload: { ...reason, key: "BAD" } })).statusCode).toBe(400);
    const created = await app.inject({ method: "POST", url: path, headers: auth(), payload: reason });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject(reason);
    expect(created.json().id).toBeTruthy();
    expect((await app.inject({ method: "POST", url: path, headers: auth(), payload: reason })).statusCode).toBe(409);
    const sameKeyOtherType = await app.inject({ method: "POST", url: path, headers: auth(),
      payload: { ...reason, type: "requester" } });
    expect(sameKeyOtherType.statusCode).toBe(201);
    const listed = await app.inject({ method: "GET", url: path, headers: auth() });
    expect(listed.json()).toEqual(expect.arrayContaining([expect.objectContaining({ ...reason }),
      expect.objectContaining({ type: "requester", key: reason.key })]));
    const audit = await db.select().from(schema.adminAuditLog)
      .where(eq(schema.adminAuditLog.action, "cancellation_reason_created"));
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ adminId, targetId: created.json().id, meta: { type: reason.type, key: reason.key } });
  });

  it("groups SOS by status and counts active missions plus distinct fresh, active online users", async () => {
    const [incident] = await db.insert(schema.incidentTypes).values({ name: "Fire", slug: "operations_fire" }).returning();
    const [pending, completed] = await db.insert(schema.sosRequests).values([
      { requesterId: userId, incidentTypeId: incident!.id, severity: "high", description: "An emergency situation", location: "POINT(0 0)", status: "pending" },
      { requesterId: userId, incidentTypeId: incident!.id, severity: "low", description: "An emergency situation", location: "POINT(0 0)", status: "completed" }
    ]).returning();
    await db.insert(schema.missions).values([
      { sosRequestId: pending!.id, requesterId: userId, rescuerId: suspendedId, status: "on_the_way" },
      { sosRequestId: completed!.id, requesterId: userId, rescuerId: suspendedId, status: "completed" }
    ]);
    await db.update(schema.userSessions).set({ lastActiveAt: new Date(Date.now() - 120_000) })
      .where(eq(schema.userSessions.userId, userId));
    const response = await app.inject({ method: "GET", url: "/_admin/stats", headers: auth() });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ counts: { pending: 1, completed: 1, dispatched: 0 },
      activeMissions: 1, onlineUsers: 1 });
    await db.update(schema.userSessions).set({ lastActiveAt: new Date() }).where(eq(schema.userSessions.userId, userId));
    const fresh = await app.inject({ method: "GET", url: "/_admin/stats", headers: auth() });
    expect(fresh.json().onlineUsers).toBe(2); // two sessions for this user still count once
  });
});
