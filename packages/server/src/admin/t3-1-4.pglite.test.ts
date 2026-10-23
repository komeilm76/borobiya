import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import type { Database } from "../db/client";
import * as schema from "../db/schema";
import { DrizzleAdminUserStore } from "../db/admin-user-store";
import { DrizzleCategoryStore } from "../db/category-store";
import { DrizzleIncidentTypeStore } from "../db/incident-type-store";
import { DrizzleUserSecurityQuestionsStore } from "../db/security-questions-store";
import { DrizzleUserSearchStore } from "../db/user-search-store";
import { createFastifyApp } from "../app";
import { parseServerEnv } from "../config/env";

/**
 * End-to-end PostgreSQL (`PGlite`) verification for `T3.1.4`:
 * 1. All newly created users start in NO category (`categories: []`, `hasCategory=true` omits them,
 *    `GET /_user/users/search` reports `category: null`).
 * 2. An admin creates categories linked to incident types and assigns a single user to MULTIPLE
 *    categories (`Mountain Rescue` + `Road Rescue`).
 * 3. Every read surface projects those memberships deterministically:
 *    - `GET /_admin/categories` (`members: [{ id, username }]`),
 *    - `GET /_user/me` (`categories: [{ id, name }, ...]`),
 *    - `GET /_admin/users` (`hasCategory=true|false` + `categories`),
 *    - `GET /_admin/users/:id` (`categories`),
 *    - `GET /_public/incident-types`,
 *    - `GET /_user/users/search` (`category` & `incidentType` filters + `'، '`-joined `category`).
 * 4. Removing a member from one category (`DELETE /_admin/categories/:id/users/:userId`) leaves
 *    their remaining category memberships intact everywhere.
 */
const serverConfig = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173"
});

let pg: PGlite;
let db: Database;
let app: FastifyInstance;

let adminId: string;
let adminSessionId: string;
let adminDeviceId: string;

let multiRescuerId: string;
let multiSessionId: string;
let multiDeviceId: string;

let soloRescuerId: string;
let unassignedUserId: string;
let callerSessionId: string;
let callerDeviceId: string;

async function signAccessToken(input: {
  userId: string;
  role: "admin" | "user";
  sessionId: string;
  deviceId: string;
}): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: input.role,
    deviceId: input.deviceId,
    sessionId: input.sessionId,
    tokenUse: "access"
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 900)
    .sign(new TextEncoder().encode(serverConfig.jwtSecret));
}

beforeAll(async () => {
  pg = new PGlite();
  await pg.exec(`
    CREATE DOMAIN geography AS text;
    CREATE FUNCTION st_makepoint(lon double precision, lat double precision)
      RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT format('POINT(%s %s)', lon, lat) $$;
    CREATE FUNCTION st_setsrid(geom text, srid integer)
      RETURNS geography LANGUAGE sql IMMUTABLE AS $$ SELECT geom::geography $$;
    CREATE FUNCTION st_distance(a geography, b geography)
      RETURNS double precision LANGUAGE sql IMMUTABLE AS $$
        SELECT CASE WHEN a IS NULL OR b IS NULL THEN NULL ELSE 1500.0 END
      $$;
  `);

  const journal = JSON.parse(
    readFileSync(new URL("../../drizzle/meta/_journal.json", import.meta.url), "utf8")
  ) as { entries: { tag: string }[] };

  for (const { tag } of journal.entries) {
    const raw = readFileSync(new URL(`../../drizzle/${tag}.sql`, import.meta.url), "utf8");
    const statements = raw
      .split("--> statement-breakpoint")
      .map((part) => part.trim())
      .filter(Boolean);

    for (const statement of statements) {
      if (/\bpostgis\b|\bUSING\s+gist\s*\(/i.test(statement)) continue;
      const adapted = statement.replace(/(?<!")geography\(Point,4326\)(?!")/g, "geography");
      await pg.exec(adapted);
    }
  }

  db = drizzle(pg, { schema }) as unknown as Database;

  const insertedUsers = await db
    .insert(schema.users)
    .values([
      {
        username: "dispatch_admin",
        passwordHash: "hash-admin",
        role: "admin",
        mustCompleteSecurityQuestions: false
      },
      {
        username: "rescuer_dual",
        passwordHash: "hash-dual",
        role: "user",
        mustCompleteSecurityQuestions: false
      },
      {
        username: "rescuer_road_only",
        passwordHash: "hash-road",
        role: "user",
        mustCompleteSecurityQuestions: false
      },
      {
        username: "citizen_plain",
        passwordHash: "hash-plain",
        role: "user",
        mustCompleteSecurityQuestions: false
      }
    ])
    .returning({ id: schema.users.id, username: schema.users.username });

  adminId = insertedUsers[0]!.id;
  multiRescuerId = insertedUsers[1]!.id;
  soloRescuerId = insertedUsers[2]!.id;
  unassignedUserId = insertedUsers[3]!.id;

  adminDeviceId = randomUUID();
  multiDeviceId = randomUUID();
  callerDeviceId = randomUUID();

  const sessions = await db
    .insert(schema.userSessions)
    .values([
      {
        userId: adminId,
        deviceId: adminDeviceId,
        deviceName: "Admin Console",
        refreshTokenHash: "live-admin-hash",
        isOnline: true
      },
      {
        userId: multiRescuerId,
        deviceId: multiDeviceId,
        deviceName: "Rescuer Phone",
        refreshTokenHash: "live-multi-hash",
        isOnline: true
      },
      {
        userId: unassignedUserId,
        deviceId: callerDeviceId,
        deviceName: "Caller Browser",
        refreshTokenHash: "live-caller-hash",
        isOnline: true
      }
    ])
    .returning({ id: schema.userSessions.id });

  adminSessionId = sessions[0]!.id;
  multiSessionId = sessions[1]!.id;
  callerSessionId = sessions[2]!.id;

  app = await createFastifyApp(serverConfig, {
    adminUserStore: new DrizzleAdminUserStore(db),
    categoryStore: new DrizzleCategoryStore(db),
    incidentTypeStore: new DrizzleIncidentTypeStore(db),
    securityQuestionsStore: new DrizzleUserSecurityQuestionsStore(db),
    userSearchStore: new DrizzleUserSearchStore(db)
  });
  await app.ready();
});

afterAll(async () => {
  await app?.close();
  await pg?.close();
});

describe("T3.1.4 category membership lifecycle against real PostgreSQL (PGlite)", () => {
  it("starts every account in zero categories, projects multi-category assignments across all reads, and isolates removals", async () => {
    const adminToken = await signAccessToken({
      userId: adminId,
      role: "admin",
      sessionId: adminSessionId,
      deviceId: adminDeviceId
    });
    const rescuerToken = await signAccessToken({
      userId: multiRescuerId,
      role: "user",
      sessionId: multiSessionId,
      deviceId: multiDeviceId
    });
    const callerToken = await signAccessToken({
      userId: unassignedUserId,
      role: "user",
      sessionId: callerSessionId,
      deviceId: callerDeviceId
    });

    // 1. Every account starts in zero categories across profile, admin list, and search.
    const initialMe = await app.inject({
      method: "GET",
      url: "/_user/me",
      headers: { authorization: `Bearer ${rescuerToken}` }
    });
    expect(initialMe.statusCode).toBe(200);
    expect(initialMe.json().categories).toEqual([]);

    const initialAssigned = await app.inject({
      method: "GET",
      url: "/_admin/users?hasCategory=true",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(initialAssigned.statusCode).toBe(200);
    expect(initialAssigned.json()).toMatchObject({ items: [], total: 0, totalPages: 0 });

    const initialSearch = await app.inject({
      method: "GET",
      url: "/_user/users/search?q=rescuer",
      headers: { authorization: `Bearer ${callerToken}` }
    });
    expect(initialSearch.statusCode).toBe(200);
    expect(initialSearch.json().items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: multiRescuerId, username: "rescuer_dual", category: null }),
        expect.objectContaining({ id: soloRescuerId, username: "rescuer_road_only", category: null })
      ])
    );

    // 2. Admin creates two incident types and two responder categories.
    const alpineTypeRes = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Alpine Avalanche", slug: "alpine-avalanche" }
    });
    const roadTypeRes = await app.inject({
      method: "POST",
      url: "/_admin/incidents",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Road Collision", slug: "road-collision" }
    });
    expect(alpineTypeRes.statusCode).toBe(201);
    expect(roadTypeRes.statusCode).toBe(201);
    const alpineTypeId = alpineTypeRes.json().id as string;
    const roadTypeId = roadTypeRes.json().id as string;

    // Public catalog exposes both incident types without authentication.
    const publicTypes = await app.inject({ method: "GET", url: "/_public/incident-types" });
    expect(publicTypes.statusCode).toBe(200);
    expect(publicTypes.json()).toHaveLength(2);

    const mountainCatRes = await app.inject({
      method: "POST",
      url: "/_admin/categories",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Mountain Rescue", description: "High altitude", incidentTypeIds: [alpineTypeId] }
    });
    const roadCatRes = await app.inject({
      method: "POST",
      url: "/_admin/categories",
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { name: "Road Rescue", description: "Highway response", incidentTypeIds: [roadTypeId] }
    });
    expect(mountainCatRes.statusCode).toBe(201);
    expect(roadCatRes.statusCode).toBe(201);
    const mountainCatId = mountainCatRes.json().id as string;
    const roadCatId = roadCatRes.json().id as string;

    // 3. Assign `rescuer_dual` to BOTH categories and `rescuer_road_only` to `Road Rescue`.
    const assignMountain = await app.inject({
      method: "POST",
      url: `/_admin/categories/${mountainCatId}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [multiRescuerId] }
    });
    const assignRoad = await app.inject({
      method: "POST",
      url: `/_admin/categories/${roadCatId}/users`,
      headers: { authorization: `Bearer ${adminToken}` },
      payload: { userIds: [multiRescuerId, soloRescuerId] }
    });
    expect(assignMountain.statusCode).toBe(200);
    expect(assignRoad.statusCode).toBe(200);

    // 4. Verify projections across every API surface.
    const categoriesList = await app.inject({
      method: "GET",
      url: "/_admin/categories",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(categoriesList.statusCode).toBe(200);
    expect(categoriesList.json()).toEqual([
      expect.objectContaining({
        id: mountainCatId,
        name: "Mountain Rescue",
        members: [{ id: multiRescuerId, username: "rescuer_dual" }]
      }),
      expect.objectContaining({
        id: roadCatId,
        name: "Road Rescue",
        members: [
          { id: multiRescuerId, username: "rescuer_dual" },
          { id: soloRescuerId, username: "rescuer_road_only" }
        ]
      })
    ]);

    const updatedMe = await app.inject({
      method: "GET",
      url: "/_user/me",
      headers: { authorization: `Bearer ${rescuerToken}` }
    });
    expect(updatedMe.statusCode).toBe(200);
    expect(updatedMe.json().categories).toEqual([
      { id: mountainCatId, name: "Mountain Rescue" },
      { id: roadCatId, name: "Road Rescue" }
    ]);

    const assignedUsers = await app.inject({
      method: "GET",
      url: "/_admin/users?hasCategory=true",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(assignedUsers.statusCode).toBe(200);
    expect(assignedUsers.json().total).toBe(2);
    expect(assignedUsers.json().items.map((u: { id: string }) => u.id).sort()).toEqual(
      [multiRescuerId, soloRescuerId].sort()
    );

    const unassignedUsers = await app.inject({
      method: "GET",
      url: "/_admin/users?hasCategory=false",
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(unassignedUsers.statusCode).toBe(200);
    expect(unassignedUsers.json().items.map((u: { id: string }) => u.id).sort()).toEqual(
      [adminId, unassignedUserId].sort()
    );

    const detailRes = await app.inject({
      method: "GET",
      url: `/_admin/users/${multiRescuerId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(detailRes.statusCode).toBe(200);
    expect(detailRes.json().categories).toEqual([
      { id: mountainCatId, name: "Mountain Rescue" },
      { id: roadCatId, name: "Road Rescue" }
    ]);

    const alpineSearch = await app.inject({
      method: "GET",
      url: `/_user/users/search?q=rescuer&incidentType=${alpineTypeId}&lat=35.7&lon=51.4`,
      headers: { authorization: `Bearer ${callerToken}` }
    });
    expect(alpineSearch.statusCode).toBe(200);
    expect(alpineSearch.json()).toMatchObject({
      total: 1,
      items: [
        {
          id: multiRescuerId,
          username: "rescuer_dual",
          category: "Mountain Rescue، Road Rescue"
        }
      ]
    });

    const roadCategorySearch = await app.inject({
      method: "GET",
      url: `/_user/users/search?q=rescuer&category=${roadCatId}`,
      headers: { authorization: `Bearer ${callerToken}` }
    });
    expect(roadCategorySearch.statusCode).toBe(200);
    expect(roadCategorySearch.json().total).toBe(2);

    // 5. Removing `rescuer_dual` from `Mountain Rescue` preserves their `Road Rescue` membership.
    const removeMountain = await app.inject({
      method: "DELETE",
      url: `/_admin/categories/${mountainCatId}/users/${multiRescuerId}`,
      headers: { authorization: `Bearer ${adminToken}` }
    });
    expect(removeMountain.statusCode).toBe(200);

    const afterRemovalMe = await app.inject({
      method: "GET",
      url: "/_user/me",
      headers: { authorization: `Bearer ${rescuerToken}` }
    });
    expect(afterRemovalMe.json().categories).toEqual([{ id: roadCatId, name: "Road Rescue" }]);
  });
});
