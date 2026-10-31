import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import type { FastifyInstance, InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  allApiRoutes,
  apiRoutes,
  type ApiRouteDefinition
} from "@borobiya/shared/api";
import { SOS_PHOTO_FIELD_NAME } from "@borobiya/shared";
import { createFastifyApp } from "./app";
import { implementedOperationIds } from "./plugins/swagger";
import { parseServerEnv } from "./config/env";
import * as schema from "./db/schema";
import type { Database } from "./db/client";
import { DrizzleAdminUserStore } from "./db/admin-user-store";
import { DrizzleCategoryStore } from "./db/category-store";
import { DrizzleUserDeviceStore } from "./db/device-store";
import { DrizzleIncidentTypeStore } from "./db/incident-type-store";
import { DrizzleLocationHistoryStore } from "./db/location-history-store";
import { DrizzleLocationShareStore } from "./db/location-share-store";
import { DrizzleUserLoginStore } from "./db/login-store";
import { DrizzleUserRecoveryStore } from "./db/recovery-store";
import { DrizzleUserRegistrationStore } from "./db/registration-store";
import { DrizzleUserSecurityQuestionsStore } from "./db/security-questions-store";
import { DrizzleSosDispatchStore } from "./db/sos-dispatch-store";
import { DrizzleMissionProgressStore } from "./db/mission-progress-store";
import { DrizzleSyncStore } from "./db/sync-store";
import { DrizzleSosCancellationStore } from "./db/sos-cancellation-store";
import { DrizzleSosPhotoStore } from "./db/sos-photo-store";
import { DrizzleSosRequestStore } from "./db/sos-request-store";
import { DrizzleUserSearchStore } from "./db/user-search-store";
import { createPhotoStorage } from "./sos/photo-storage";
import { signedPhotoPath } from "./sos/photo-access";

const JWT_SECRET = "all-apis-contract-secret-with-at-least-48-bytes-0123456789";
const JWT_REFRESH_SECRET = "all-apis-refresh-secret-with-at-least-48-bytes-0123456789";

const PNG_FIXTURE = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x01, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82
]);

function fastTestHash(secret: string): Promise<string> {
  return Promise.resolve(`test-hash:${secret}`);
}

function fastTestVerify(hash: string, secret: string): Promise<boolean> {
  return Promise.resolve(hash === `test-hash:${secret}`);
}

function buildMultipartPhotoBody(fieldName: string, bytes: Uint8Array) {
  const boundary = "borobiya-contract-audit-boundary";
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${fieldName}"; filename="evidence.png"\r\nContent-Type: image/png\r\n\r\n`,
      "utf8"
    ),
    Buffer.from(bytes),
    Buffer.from(`\r\n--${boundary}--\r\n`, "utf8")
  ]);
  return {
    payload,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` }
  };
}

describe("All implemented HTTP API contracts end-to-end against migrated PGlite", () => {
  let pg: PGlite;
  let db: Database;
  let uploadDir: string;
  let app: FastifyInstance;

  beforeAll(async () => {
    uploadDir = mkdtempSync(join(tmpdir(), "borobiya-api-contracts-"));
    pg = new PGlite({ extensions: { pg_trgm } });

    const journal = JSON.parse(
      readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8")
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
      CREATE FUNCTION st_dwithin(a text, b text, radius double precision)
        RETURNS boolean LANGUAGE sql IMMUTABLE STRICT AS $$
          SELECT st_distance(a, b) <= radius;
        $$;
    `);

    for (const { tag } of journal.entries) {
      const raw = readFileSync(new URL(`../drizzle/${tag}.sql`, import.meta.url), "utf8");
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

    // Seed 5 security questions + an active admin account whose must_complete_security_questions = true
    // AND non-integer avg_rating = 4.7 so both admin onboarding exemption on /_user/* AND PostgreSQL numeric->number serialization are tested live!
    for (let i = 1; i <= 5; i += 1) {
      await pg.query(
        `INSERT INTO "security_questions" ("id", "text") VALUES ($1, $2)`,
        [`50000000-0000-4000-8000-00000000000${i}`, `Seeded recovery question #${i}?`]
      );
    }
    await pg.query(
      `INSERT INTO "users" (
        "id", "username", "password_hash", "role", "is_active", "is_suspended",
        "must_complete_security_questions", "avg_rating"
      ) VALUES ($1, $2, $3, 'admin', true, false, true, 4.7)`,
      [
        "10000000-0000-4000-8000-000000000001",
        "ops_admin",
        "test-hash:AdminPass123"
      ]
    );

    db = drizzle(pg, { schema }) as unknown as Database;
    const config = parseServerEnv({
      NODE_ENV: "test",
      PORT: "3000",
      DATABASE_URL: "postgresql://borobiya:test@localhost:5432/borobiya_test",
      JWT_SECRET,
      JWT_REFRESH_SECRET,
      CORS_ORIGINS: "http://localhost:5173",
      UPLOAD_DIR: uploadDir,
      RATE_LIMIT_MAX: "1000",
      RATE_LIMIT_WINDOW_MS: "60000"
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
      syncStore: new DrizzleSyncStore(db),
      sosCancellationStore: new DrizzleSosCancellationStore(db),
      photoStore: new DrizzleSosPhotoStore(db),
      photoStorage: createPhotoStorage(uploadDir),
      hashPassword: fastTestHash,
      verifyPassword: fastTestVerify,
      verifySecurityAnswer: fastTestVerify
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pg.close();
    rmSync(uploadDir, { recursive: true, force: true });
  });

  it("exercises every single implemented API operation end-to-end and validates every response against its shared Zod schema", async () => {
    const verifiedOperationIds = new Set<string>();

    async function callContract<T = unknown>(
      route: ApiRouteDefinition,
      expectedStatus: number,
      injectOptions: Omit<InjectOptions, "method"> & { url: string }
    ): Promise<T> {
      const response = await app.inject({
        method: route.method,
        ...injectOptions
      });
      expect(
        response.statusCode,
        `${route.meta.operationId} (${route.method} ${injectOptions.url}) answered ${response.statusCode}: ${response.body}`
      ).toBe(expectedStatus);

      const responseSchema = route.schema.responses[expectedStatus];
      expect(
        responseSchema,
        `${route.meta.operationId} missing response schema for status ${expectedStatus}`
      ).toBeDefined();

      const body = response.body.length > 0 ? response.json() : undefined;
      const parsed = responseSchema!.parse(body) as T;
      verifiedOperationIds.add(route.meta.operationId);
      return parsed;
    }

    // 1. Public health + seeded security questions
    const health = await callContract<{ status: string }>(apiRoutes.public.health, 200, {
      url: apiRoutes.public.health.url
    });
    expect(health.status).toBe("ok");

    const questions = await callContract<Array<{ id: string; text: string }>>(
      apiRoutes.public.securityQuestions,
      200,
      { url: apiRoutes.public.securityQuestions.url }
    );
    expect(questions.length).toBeGreaterThanOrEqual(5);
    const fiveQuestions = questions.slice(0, 5);

    // 2. Auth register -> login (native) -> refresh -> forgot-password (request/verify/reset) -> re-login
    const answersByQuestionId = new Map(
      fiveQuestions.map((q, idx) => [q.id, `AnswerValue_${idx + 1}`])
    );

    const registered = await callContract<{ user: { id: string; username: string } }>(
      apiRoutes.auth.register,
      201,
      {
        url: apiRoutes.auth.register.url,
        payload: {
          username: "field_requester",
          password: "SafePassword1",
          confirmPassword: "SafePassword1",
          securityQuestions: fiveQuestions.map((q) => ({
            questionId: q.id,
            answer: answersByQuestionId.get(q.id)!
          }))
        }
      }
    );
    expect(registered.user.username).toBe("field_requester");

    const nativeLogin = await callContract<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; role: string };
    }>(apiRoutes.auth.login, 200, {
      url: apiRoutes.auth.login.url,
      payload: {
        username: "field_requester",
        password: "SafePassword1",
        deviceName: "Field Android Handset"
      }
    });

    const refreshed = await callContract<{ accessToken: string; refreshToken: string }>(
      apiRoutes.auth.refresh,
      200,
      {
        url: apiRoutes.auth.refresh.url,
        payload: { refreshToken: nativeLogin.refreshToken }
      }
    );
    expect(refreshed.accessToken).not.toBe("");

    const loggedOut = await callContract<{ ok: boolean }>(apiRoutes.auth.logout, 200, {
      url: apiRoutes.auth.logout.url,
      payload: { refreshToken: refreshed.refreshToken }
    });
    expect(loggedOut.ok).toBe(true);

    const challenge = await callContract<{ questionIds: string[]; questions: string[] }>(
      apiRoutes.auth.forgotPasswordRequest,
      200,
      {
        url: apiRoutes.auth.forgotPasswordRequest.url,
        payload: { username: "field_requester" }
      }
    );
    expect(challenge.questionIds).toHaveLength(3);

    const verifiedChallenge = await callContract<{ resetToken: string }>(
      apiRoutes.auth.forgotPasswordVerify,
      200,
      {
        url: apiRoutes.auth.forgotPasswordVerify.url,
        payload: {
          username: "field_requester",
          answers: challenge.questionIds.map((qId) => ({
            questionId: qId,
            answer: answersByQuestionId.get(qId)!
          }))
        }
      }
    );

    const resetDone = await callContract<{ ok: boolean }>(apiRoutes.auth.forgotPasswordReset, 200, {
      url: apiRoutes.auth.forgotPasswordReset.url,
      payload: {
        resetToken: verifiedChallenge.resetToken,
        newPassword: "NewPassword99",
        confirmPassword: "NewPassword99"
      }
    });
    expect(resetDone.ok).toBe(true);

    const requesterSession = await callContract<{
      accessToken: string;
      refreshToken: string;
      user: { id: string };
    }>(apiRoutes.auth.login, 200, {
      url: apiRoutes.auth.login.url,
      payload: {
        username: "field_requester",
        password: "NewPassword99",
        deviceName: "Survivor Phone"
      }
    });
    const requesterHeaders = { authorization: `Bearer ${requesterSession.accessToken}` };

    // 3. Admin login + admin exemption on GET /_user/me & numeric avgRating coercion check!
    const adminSession = await callContract<{
      accessToken: string;
      refreshToken: string;
      user: { id: string; role: string; mustCompleteSecurityQuestions: boolean };
    }>(apiRoutes.auth.login, 200, {
      url: apiRoutes.auth.login.url,
      payload: { username: "ops_admin", password: "AdminPass123", deviceName: "Dispatch Workstation" }
    });
    expect(adminSession.user.mustCompleteSecurityQuestions).toBe(true);
    const adminHeaders = { authorization: `Bearer ${adminSession.accessToken}` };

    const adminMe = await callContract<{ id: string; role: string; avgRating: number | null }>(
      apiRoutes.user.me,
      200,
      {
        url: apiRoutes.user.me.url,
        headers: adminHeaders
      }
    );
    expect(adminMe.role).toBe("admin");
    expect(adminMe.avgRating).toBe(4.7);
    expect(typeof adminMe.avgRating).toBe("number");

    // 4. Admin creates an onboarding-incomplete responder -> blocks /_user/me with 403 -> completes onboarding -> 200!
    const createdResponder = await callContract<{ id: string; username: string }>(
      apiRoutes.admin.createUser,
      201,
      {
        url: apiRoutes.admin.createUser.url,
        headers: adminHeaders,
        payload: {
          username: "mountain_rescuer",
          password: "RescuerPass1"
        }
      }
    );
    await pg.query(`UPDATE "users" SET "avg_rating" = 4.9 WHERE "id" = $1`, [createdResponder.id]);

    const responderSession = await callContract<{
      accessToken: string;
      refreshToken: string;
      user: { id: string };
    }>(apiRoutes.auth.login, 200, {
      url: apiRoutes.auth.login.url,
      payload: {
        username: "mountain_rescuer",
        password: "RescuerPass1",
        deviceName: "Rescuer Garmin Phone"
      }
    });
    const responderHeaders = { authorization: `Bearer ${responderSession.accessToken}` };

    await callContract(apiRoutes.user.me, 403, {
      url: apiRoutes.user.me.url,
      headers: responderHeaders
    });

    await callContract(apiRoutes.user.completeSecurityQuestions, 200, {
      url: apiRoutes.user.completeSecurityQuestions.url,
      headers: responderHeaders,
      payload: {
        securityQuestions: fiveQuestions.map((q) => ({
          questionId: q.id,
          answer: answersByQuestionId.get(q.id)!
        }))
      }
    });

    const responderMe = await callContract<{ id: string; avgRating: number | null }>(
      apiRoutes.user.me,
      200,
      {
        url: apiRoutes.user.me.url,
        headers: responderHeaders
      }
    );
    expect(responderMe.avgRating).toBe(4.9);

    const responderDevices = await callContract<Array<{ id: string; deviceId: string; isCurrentDevice: boolean }>>(
      apiRoutes.user.devices,
      200,
      {
        url: apiRoutes.user.devices.url,
        headers: responderHeaders
      }
    );
    expect(responderDevices).toHaveLength(1);
    const responderDeviceId = responderDevices[0]!.deviceId;

    const requesterDevices = await callContract<Array<{ deviceId: string }>>(
      apiRoutes.user.devices,
      200,
      {
        url: apiRoutes.user.devices.url,
        headers: requesterHeaders
      }
    );
    const requesterDeviceId = requesterDevices[0]!.deviceId;

    // 5. Admin incidents + categories + category membership assignment/removal + public incident types
    const createdIncident = await callContract<{ id: string; slug: string }>(
      apiRoutes.admin.createIncidentType,
      201,
      {
        url: apiRoutes.admin.createIncidentType.url,
        headers: adminHeaders,
        payload: {
          name: "Mountain Avalanche",
          icon: "mdi-image-filter-hdr",
          color: "#0284c7",
          description: "High-altitude snow slide rescue"
        }
      }
    );

    const updatedIncident = await callContract<{ id: string; description: string | null }>(
      apiRoutes.admin.updateIncidentType,
      200,
      {
        url: apiRoutes.admin.updateIncidentType.url.replace(":id", createdIncident.id),
        headers: adminHeaders,
        payload: { description: "Updated alpine rescue specialty" }
      }
    );
    expect(updatedIncident.description).toBe("Updated alpine rescue specialty");

    const adminIncidents = await callContract<Array<{ id: string }>>(
      apiRoutes.admin.listIncidentTypes,
      200,
      {
        url: apiRoutes.admin.listIncidentTypes.url,
        headers: adminHeaders
      }
    );
    expect(adminIncidents).toHaveLength(1);

    const publicIncidents = await callContract<Array<{ id: string }>>(
      apiRoutes.public.incidentTypes,
      200,
      { url: apiRoutes.public.incidentTypes.url }
    );
    expect(publicIncidents).toHaveLength(1);

    const createdCategory = await callContract<{ id: string; name: string }>(
      apiRoutes.admin.createCategory,
      201,
      {
        url: apiRoutes.admin.createCategory.url,
        headers: adminHeaders,
        payload: {
          name: "Alpine Search Team",
          description: "Certified mountain rescuers",
          incidentTypeIds: [createdIncident.id]
        }
      }
    );

    await callContract(apiRoutes.admin.updateCategory, 200, {
      url: apiRoutes.admin.updateCategory.url.replace(":id", createdCategory.id),
      headers: adminHeaders,
      payload: { name: "Alpine Rescue Team" }
    });

    await callContract(apiRoutes.admin.assignCategoryUsers, 200, {
      url: apiRoutes.admin.assignCategoryUsers.url.replace(":id", createdCategory.id),
      headers: adminHeaders,
      payload: { userIds: [createdResponder.id, requesterSession.user.id] }
    });

    await callContract(apiRoutes.admin.removeCategoryUser, 200, {
      url: apiRoutes.admin.removeCategoryUser.url
        .replace(":id", createdCategory.id)
        .replace(":userId", requesterSession.user.id),
      headers: adminHeaders
    });

    const categoriesList = await callContract<Array<{ id: string; members?: Array<{ id: string }> }>>(
      apiRoutes.admin.listCategories,
      200,
      {
        url: apiRoutes.admin.listCategories.url,
        headers: adminHeaders
      }
    );
    expect(categoriesList[0]?.members?.map((m) => m.id)).toEqual([createdResponder.id]);

    // 6. Admin user list/detail/status toggle
    const adminUsersList = await callContract<{ items: Array<{ id: string; avgRating: number | null }> }>(
      apiRoutes.admin.listUsers,
      200,
      {
        url: `${apiRoutes.admin.listUsers.url}?hasCategory=true`,
        headers: adminHeaders
      }
    );
    expect(adminUsersList.items.map((u) => u.id)).toEqual([createdResponder.id]);
    expect(adminUsersList.items[0]?.avgRating).toBe(4.9);

    const adminUserDetail = await callContract<{ id: string; devices: unknown[] }>(
      apiRoutes.admin.getUser,
      200,
      {
        url: apiRoutes.admin.getUser.url.replace(":id", createdResponder.id),
        headers: adminHeaders
      }
    );
    expect(adminUserDetail.devices).toHaveLength(1);

    await callContract(apiRoutes.admin.updateUserStatus, 200, {
      url: apiRoutes.admin.updateUserStatus.url.replace(":id", createdResponder.id),
      headers: adminHeaders,
      payload: { isActive: true }
    });

    // 7. Responder + requester GPS fixes via REST fallback + filtered user search + live/history shares
    const fixTimestamp = new Date().toISOString();
    await callContract(apiRoutes.location.updateLocation, 200, {
      url: apiRoutes.location.updateLocation.url,
      headers: responderHeaders,
      payload: {
        lat: 35.8012,
        lon: 51.4285,
        accuracy: 7,
        timestamp: fixTimestamp,
        priorityDeviceId: responderDeviceId
      }
    });

    await callContract(apiRoutes.location.updateLocation, 200, {
      url: apiRoutes.location.updateLocation.url,
      headers: requesterHeaders,
      payload: {
        lat: 35.7995,
        lon: 51.4251,
        accuracy: 9,
        timestamp: fixTimestamp,
        priorityDeviceId: requesterDeviceId
      }
    });

    // Injection does not open a Socket.IO transport. Explicitly record the presence that
    // a connected socket would write; login/refresh alone must no longer count as online.
    await new DrizzleUserSecurityQuestionsStore(db).touchSessionPresence({
      userId: createdResponder.id, sessionId: responderDevices[0]!.id,
      deviceId: responderDeviceId, isOnline: true
    });

    const searchResponse = await callContract<{
      items: Array<{ id: string; category: string | null; avgRating: number | null; distance: number | null }>;
      total: number;
    }>(apiRoutes.user.search, 200, {
      url: `${apiRoutes.user.search.url}?q=mountain&category=${createdCategory.id}&incidentType=${createdIncident.id}&minRating=4.5&online=true&lat=35.8&lon=51.425&sort=distance`,
      headers: requesterHeaders
    });
    expect(searchResponse.total).toBe(1);
    expect(searchResponse.items[0]?.id).toBe(createdResponder.id);
    expect(searchResponse.items[0]?.category).toBe("Alpine Rescue Team");
    expect(searchResponse.items[0]?.avgRating).toBe(4.9);

    // Term-free directory browsing stays paginated, indexed, and caller-scoped. A bounded
    // radius excludes positionless/far accounts *before* the count, not after pagination.
    const browse = await callContract<{ items: Array<{ username: string }>; total: number }>(apiRoutes.user.search, 200, {
      url: `${apiRoutes.user.search.url}?sort=username&category=${createdCategory.id}&page=1&limit=20`,
      headers: requesterHeaders
    });
    expect(browse.items.map((item) => item.username)).toContain("mountain_rescuer");
    expect(browse.items.every((item) => item.username !== requesterSession.user.id)).toBe(true);
    const near = await callContract<{ total: number }>(apiRoutes.user.search, 200, {
      url: `${apiRoutes.user.search.url}?q=mountain&radiusKm=1&lat=35.8&lon=51.425`, headers: requesterHeaders
    });
    const far = await callContract<{ total: number }>(apiRoutes.user.search, 200, {
      url: `${apiRoutes.user.search.url}?q=mountain&radiusKm=0.1&lat=35.8&lon=51.425`, headers: requesterHeaders
    });
    expect(near.total).toBe(1);
    expect(far.total).toBe(0);
    expect((await pg.query<{ indexname: string }>(`SELECT indexname FROM pg_indexes WHERE indexname = 'idx_users_username_trgm'`)).rows)
      .toEqual([{ indexname: "idx_users_username_trgm" }]);

    // Admin with mustCompleteSecurityQuestions = true can ALSO query /_user/users/search for category member picker!
    const adminSearch = await callContract<{ total: number }>(apiRoutes.user.search, 200, {
      url: `${apiRoutes.user.search.url}?q=mountain`,
      headers: adminHeaders
    });
    expect(adminSearch.total).toBe(1);

    const liveShareCreated = await callContract<{ createdShareIds: string[] }>(
      apiRoutes.location.createShare,
      201,
      {
        url: apiRoutes.location.createShare.url,
        headers: requesterHeaders,
        payload: {
          targetUserIds: [createdResponder.id],
          mode: "timed",
          durationMinutes: 60,
          note: "Approaching ridge camp"
        }
      }
    );
    const liveShareId = liveShareCreated.createdShareIds[0]!;

    const liveSharesListed = await callContract<{ owned: Array<{ id: string }> }>(
      apiRoutes.location.listShares,
      200,
      {
        url: apiRoutes.location.listShares.url,
        headers: requesterHeaders
      }
    );
    expect(liveSharesListed.owned.map((s) => s.id)).toContain(liveShareId);

    await callContract(apiRoutes.location.revokeShare, 200, {
      url: apiRoutes.location.revokeShare.url.replace(":shareId", liveShareId),
      headers: requesterHeaders
    });

    const historyFrom = new Date(Date.now() - 60 * 60_000).toISOString();
    const historyTo = new Date(Date.now() + 60 * 60_000).toISOString();

    const ownHistory = await callContract<{ totalPoints: number }>(
      apiRoutes.location.getHistory,
      200,
      {
        url: `${apiRoutes.location.getHistory.url}?from=${encodeURIComponent(historyFrom)}&to=${encodeURIComponent(historyTo)}`,
        headers: requesterHeaders
      }
    );
    expect(ownHistory.totalPoints).toBe(1);

    const historyGrantCreated = await callContract<{ createdShareIds: string[] }>(
      apiRoutes.location.createHistoryShare,
      201,
      {
        url: apiRoutes.location.createHistoryShare.url,
        headers: requesterHeaders,
        payload: {
          targetUserIds: [createdResponder.id],
          from: historyFrom,
          to: historyTo,
          maxPoints: 250
        }
      }
    );
    const historyShareId = historyGrantCreated.createdShareIds[0]!;

    const historySharesListed = await callContract<{ sharedWithMe: Array<{ id: string }> }>(
      apiRoutes.location.listHistoryShares,
      200,
      {
        url: apiRoutes.location.listHistoryShares.url,
        headers: responderHeaders
      }
    );
    expect(historySharesListed.sharedWithMe.map((s) => s.id)).toEqual([historyShareId]);

    const sharedTrack = await callContract<{ totalPoints: number }>(
      apiRoutes.location.getSharedHistory,
      200,
      {
        url: apiRoutes.location.getSharedHistory.url.replace(":shareId", historyShareId),
        headers: responderHeaders
      }
    );
    expect(sharedTrack.totalPoints).toBe(1);

    await callContract(apiRoutes.location.revokeHistoryShare, 200, {
      url: apiRoutes.location.revokeHistoryShare.url.replace(":shareId", historyShareId),
      headers: requesterHeaders
    });

    // 8. SOS creation + multipart photo upload + admin SOS list/detail/nearest-responders/dispatch
    const createdSos = await callContract<{ requestId: string; status: string }>(
      apiRoutes.sos.createRequest,
      201,
      {
        url: apiRoutes.sos.createRequest.url,
        headers: requesterHeaders,
        payload: {
          severity: "high",
          description: "Two climbers trapped under snowdrift on northern ridge.",
          incidentTypeId: createdIncident.id,
          location: { lat: 35.8005, lon: 51.427, accuracy: 8, isManual: false }
        }
      }
    );
    expect(createdSos.status).toBe("pending");
    const requesterHistory = await callContract<{ items: Array<{ id: string }> }>(apiRoutes.sos.listRequests, 200, {
      url: `${apiRoutes.sos.listRequests.url}?role=requester`, headers: requesterHeaders
    });
    expect(requesterHistory.items.map(({ id }) => id)).toContain(createdSos.requestId);
    expect((await callContract<{ id: string }>(apiRoutes.sos.getRequest, 200, {
      url: apiRoutes.sos.getRequest.url.replace(":id", createdSos.requestId), headers: requesterHeaders
    })).id).toBe(createdSos.requestId);
    expect((await app.inject({ method: "GET", url: apiRoutes.sos.getRequest.url.replace(":id", createdSos.requestId),
      headers: responderHeaders })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: `${apiRoutes.sos.listRequests.url}?role=rescuer`,
      headers: responderHeaders })).statusCode).toBe(400);


    const multipart = buildMultipartPhotoBody(SOS_PHOTO_FIELD_NAME, PNG_FIXTURE);
    const uploadedPhoto = await callContract<{ photoUrl: string }>(
      apiRoutes.sos.uploadRequestPhoto,
      200,
      {
        url: apiRoutes.sos.uploadRequestPhoto.url.replace(":id", createdSos.requestId),
        headers: { ...requesterHeaders, ...multipart.headers },
        payload: multipart.payload
      }
    );
    expect(uploadedPhoto.photoUrl).toMatch(/^\/uploads\/.+\.png$/);

    const requesterPhotoAccess = await callContract<{ url: string; expiresAt: string }>(
      apiRoutes.sos.getPhotoAccess, 200, {
        url: apiRoutes.sos.getPhotoAccess.url.replace(":id", createdSos.requestId),
        headers: requesterHeaders
      }
    );
    expect(requesterPhotoAccess.url).toContain(uploadedPhoto.photoUrl);
    expect(Date.parse(requesterPhotoAccess.expiresAt)).toBeGreaterThan(Date.now());
    const binaryResponse = await app.inject({ method: "GET", url: requesterPhotoAccess.url });
    expect(binaryResponse.statusCode).toBe(200);
    expect(binaryResponse.headers["content-type"]).toMatch(/^image\/png/);
    expect(binaryResponse.rawPayload).toEqual(Buffer.from(PNG_FIXTURE));
    expect(binaryResponse.headers["cache-control"]).toBe("no-store");
    apiRoutes.public.readSosPhoto.schema.responses[200].parse(binaryResponse.rawPayload.toString("binary"));
    verifiedOperationIds.add(apiRoutes.public.readSosPhoto.meta.operationId);

    const deniedPhoto = await app.inject({
      method: "GET", url: apiRoutes.sos.getPhotoAccess.url.replace(":id", createdSos.requestId),
      headers: responderHeaders
    });
    expect(deniedPhoto.statusCode).toBe(404);
    const tamperedPhoto = await app.inject({ method: "GET", url: `${requesterPhotoAccess.url}x` });
    expect(tamperedPhoto.statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: uploadedPhoto.photoUrl })).statusCode).toBe(404);
    const expiredUrl = signedPhotoPath(JWT_SECRET, createdSos.requestId, uploadedPhoto.photoUrl, Date.now() - 61_000);
    expect(expiredUrl).not.toBeNull();
    expect((await app.inject({ method: "GET", url: expiredUrl! })).statusCode).toBe(404);
    const adminPhotoAccess = await callContract<{ url: string }>(apiRoutes.sos.getPhotoAccess, 200, {
      url: apiRoutes.sos.getPhotoAccess.url.replace(":id", createdSos.requestId),
      headers: adminHeaders
    });
    expect((await app.inject({ method: "GET", url: adminPhotoAccess.url })).statusCode).toBe(200);

    const sosQueue = await callContract<{ items: Array<{ id: string; photoUrl: string | null }> }>(
      apiRoutes.admin.listSosRequests,
      200,
      {
        url: apiRoutes.admin.listSosRequests.url,
        headers: adminHeaders
      }
    );
    expect(sosQueue.items[0]?.id).toBe(createdSos.requestId);
    expect(sosQueue.items[0]?.photoUrl).toBe(uploadedPhoto.photoUrl);

    const sosDetail = await callContract<{ id: string; status: string }>(
      apiRoutes.admin.getSosRequest,
      200,
      {
        url: apiRoutes.admin.getSosRequest.url.replace(":id", createdSos.requestId),
        headers: adminHeaders
      }
    );
    expect(sosDetail.status).toBe("pending");

    const nearest = await callContract<{
      responders: Array<{ userId: string; avgRating: number | null; categoryName: string }>;
    }>(apiRoutes.admin.getNearestResponders, 200, {
      url: apiRoutes.admin.getNearestResponders.url.replace(":id", createdSos.requestId),
      headers: adminHeaders
    });
    expect(nearest.responders).toHaveLength(1);
    expect(nearest.responders[0]?.userId).toBe(createdResponder.id);
    expect(nearest.responders[0]?.avgRating).toBe(4.9);

    const emptyInbox = await callContract<{ total: number }>(apiRoutes.sos.listProposals, 200, {
      url: apiRoutes.sos.listProposals.url,
      headers: responderHeaders
    });
    expect(emptyInbox.total).toBe(0);

    const dispatched = await callContract<{ proposals: Array<{ rescuerId: string; status: string }> }>(
      apiRoutes.admin.dispatchSosRequest,
      201,
      {
        url: apiRoutes.admin.dispatchSosRequest.url.replace(":id", createdSos.requestId),
        headers: adminHeaders,
        payload: { rescuerIds: [createdResponder.id] }
      }
    );
    expect(dispatched.proposals).toHaveLength(1);
    expect(dispatched.proposals[0]?.rescuerId).toBe(createdResponder.id);

    const inbox = await callContract<{ items: Array<{ id: string; rescuerId: string; status: string }>; total: number; totalPages: number }>(
      apiRoutes.sos.listProposals, 200, { url: apiRoutes.sos.listProposals.url, headers: responderHeaders }
    );
    expect(inbox.total).toBe(1);
    expect(inbox.totalPages).toBe(1);
    expect(inbox.items).toMatchObject([{ rescuerId: createdResponder.id, status: "pending" }]);
    const requesterInbox = await callContract<{ total: number }>(apiRoutes.sos.listProposals, 200, {
      url: apiRoutes.sos.listProposals.url, headers: requesterHeaders
    });
    expect(requesterInbox.total).toBe(0);
    const outOfRangeInbox = await callContract<{ items: unknown[]; total: number }>(apiRoutes.sos.listProposals, 200, {
      url: `${apiRoutes.sos.listProposals.url}?page=3&limit=1`, headers: responderHeaders
    });
    expect(outOfRangeInbox).toMatchObject({ items: [], total: 1 });
    expect((await app.inject({ method: "GET", url: `${apiRoutes.sos.listProposals.url}?limit=9999`, headers: responderHeaders })).statusCode).toBe(400);

    const rescuerPhotoAccess = await callContract<{ url: string }>(apiRoutes.sos.getPhotoAccess, 200, {
      url: apiRoutes.sos.getPhotoAccess.url.replace(":id", createdSos.requestId),
      headers: responderHeaders
    });
    expect((await app.inject({ method: "GET", url: rescuerPhotoAccess.url })).rawPayload)
      .toEqual(Buffer.from(PNG_FIXTURE));
    const proposalUrl = apiRoutes.sos.declineProposal.url.replace(":id", inbox.items[0]!.id);
    expect((await app.inject({ method: "POST", url: proposalUrl, headers: requesterHeaders, payload: {} })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: proposalUrl, headers: responderHeaders, payload: { reason: "   " } })).statusCode).toBe(400);
    expect((await app.inject({ method: "POST", url: proposalUrl, headers: responderHeaders, payload: { reason: "x".repeat(501) } })).statusCode).toBe(400);
    await callContract(apiRoutes.sos.declineProposal, 200, {
      url: proposalUrl, headers: responderHeaders, payload: { reason: "  Unsafe approach  " }
    });
    const declinedRow = await pg.query<{ status: string; decline_reason: string | null }>(
      `SELECT "status", "decline_reason" FROM "mission_proposals" WHERE "id" = $1`, [inbox.items[0]!.id]
    );
    expect(declinedRow.rows).toEqual([{ status: "declined", decline_reason: "Unsafe approach" }]);
    await callContract(apiRoutes.sos.declineProposal, 200, { url: proposalUrl, headers: responderHeaders });
    expect((await pg.query<{ decline_reason: string | null }>(
      `SELECT "decline_reason" FROM "mission_proposals" WHERE "id" = $1`, [inbox.items[0]!.id]
    )).rows[0]?.decline_reason).toBe("Unsafe approach");
    expect((await app.inject({
      method: "GET", url: apiRoutes.sos.getPhotoAccess.url.replace(":id", createdSos.requestId),
      headers: responderHeaders
    })).statusCode).toBe(404);
    const afterDeclineInbox = await callContract<{ total: number }>(apiRoutes.sos.listProposals, 200, {
      url: apiRoutes.sos.listProposals.url, headers: responderHeaders
    });
    expect(afterDeclineInbox.total).toBe(0);

    // Accept is caller-scoped, repeatable only for the accepted proposal, and atomic
    // even when two outstanding SOS proposals race for the same rescuer.
    const declinedProposal = await pg.query<{ id: string }>(
      `SELECT "id" FROM "mission_proposals" WHERE "sos_request_id" = $1`, [createdSos.requestId]
    );
    const declinedUrl = apiRoutes.sos.acceptProposal.url.replace(":id", declinedProposal.rows[0]!.id);
    expect((await app.inject({ method: "POST", url: declinedUrl, headers: requesterHeaders })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: declinedUrl, headers: responderHeaders })).statusCode).toBe(409);
    expect((await app.inject({ method: "POST", url: declinedUrl })).statusCode).toBe(401);
    expect((await app.inject({ method: "POST", url: apiRoutes.sos.acceptProposal.url.replace(":id", "invalid"), headers: responderHeaders })).statusCode).toBe(404);

    const competing: Array<{ sosId: string; proposalId: string }> = [];
    for (let index = 0; index < 2; index += 1) {
      const sos = await callContract<{ requestId: string }>(apiRoutes.sos.createRequest, 201, {
        url: apiRoutes.sos.createRequest.url, headers: requesterHeaders,
        payload: {
          severity: "high", description: `Emergency number ${index + 1}: stranded walker needs help.`,
          incidentTypeId: createdIncident.id,
          location: { lat: 35.8005, lon: 51.427, isManual: false }
        }
      });
      await callContract(apiRoutes.admin.dispatchSosRequest, 201, {
        url: apiRoutes.admin.dispatchSosRequest.url.replace(":id", sos.requestId),
        headers: adminHeaders, payload: { rescuerIds: [createdResponder.id] }
      });
      const rows = await pg.query<{ id: string }>(
        `SELECT "id" FROM "mission_proposals" WHERE "sos_request_id" = $1`, [sos.requestId]
      );
      competing.push({ sosId: sos.requestId, proposalId: rows.rows[0]!.id });
    }
    const firstUrl = apiRoutes.sos.acceptProposal.url.replace(":id", competing[0]!.proposalId);
    await pg.query(`UPDATE "users" SET "is_on_mission" = true WHERE "id" = $1`, [createdResponder.id]);
    expect((await callContract<{ code: string }>(apiRoutes.sos.acceptProposal, 400, {
      url: firstUrl, headers: responderHeaders
    })).code).toBe("RESCUER_ON_MISSION");
    expect((await pg.query(`SELECT "id" FROM "missions" WHERE "rescuer_id" = $1`, [createdResponder.id])).rows).toHaveLength(0);
    await pg.query(`UPDATE "users" SET "is_on_mission" = false WHERE "id" = $1`, [createdResponder.id]);
    const accepted = await callContract<{ missionId: string }>(apiRoutes.sos.acceptProposal, 200, {
      url: firstUrl, headers: responderHeaders
    });
    expect((await callContract<{ missionId: string }>(apiRoutes.sos.acceptProposal, 200, {
      url: firstUrl, headers: responderHeaders
    })).missionId).toBe(accepted.missionId);
    expect((await callContract<{ code: string }>(apiRoutes.sos.declineProposal, 409, {
      url: apiRoutes.sos.declineProposal.url.replace(":id", competing[0]!.proposalId), headers: responderHeaders
    })).code).toBe("PROPOSAL_UNAVAILABLE");
    const otherUrl = apiRoutes.sos.acceptProposal.url.replace(":id", competing[1]!.proposalId);
    expect((await callContract<{ code: string }>(apiRoutes.sos.acceptProposal, 409, {
      url: otherUrl, headers: responderHeaders
    })).code).toBe("PROPOSAL_UNAVAILABLE");
    const missionRows = await pg.query<{ id: string; sos_request_id: string; requester_id: string; status: string }>(
      `SELECT "id", "sos_request_id", "requester_id", "status" FROM "missions" WHERE "rescuer_id" = $1`, [createdResponder.id]
    );
    expect(missionRows.rows).toMatchObject([{ id: accepted.missionId, sos_request_id: competing[0]!.sosId, status: "pending" }]);
    const history = await pg.query<{ from_status: string | null; to_status: string; changed_by: string }>(
      `SELECT "from_status", "to_status", "changed_by" FROM "mission_status_history" WHERE "mission_id" = $1`, [accepted.missionId]
    );
    expect(history.rows).toEqual([{ from_status: null, to_status: "pending", changed_by: createdResponder.id }]);
    const proposalStates = await pg.query<{ status: string }>(
      `SELECT "status" FROM "mission_proposals" WHERE "id" = ANY($1::uuid[]) ORDER BY "status"`,
      [competing.map((entry) => entry.proposalId)]
    );
    expect(proposalStates.rows.map((row) => row.status)).toEqual(["accepted", "declined"]);
    const busyState = await pg.query<{ is_on_mission: boolean }>(`SELECT "is_on_mission" FROM "users" WHERE "id" = $1`, [createdResponder.id]);
    expect(busyState.rows[0]?.is_on_mission).toBe(true);
    const ownMissions = await callContract<{ items: Array<{ id: string }>; total: number }>(apiRoutes.sos.listMissions, 200, {
      url: `${apiRoutes.sos.listMissions.url}?role=rescuer`, headers: responderHeaders
    });
    expect(ownMissions.items[0]?.id).toBe(accepted.missionId);
    expect(ownMissions.total).toBe(1);
    const adminMissions = await callContract<Array<{ id: string; sosRequestId: string }>>(
      apiRoutes.admin.listSosMissions, 200, {
        url: apiRoutes.admin.listSosMissions.url.replace(":id", competing[0]!.sosId),
        headers: adminHeaders
      }
    );
    expect(adminMissions).toMatchObject([{ id: accepted.missionId, sosRequestId: competing[0]!.sosId }]);
    expect((await app.inject({ method: "GET",
      url: apiRoutes.admin.listSosMissions.url.replace(":id", competing[0]!.sosId),
      headers: requesterHeaders })).statusCode).not.toBe(200);

    expect((await callContract<{ id: string }>(apiRoutes.sos.getMission, 200, {
      url: apiRoutes.sos.getMission.url.replace(":id", accepted.missionId), headers: requesterHeaders
    })).id).toBe(accepted.missionId);
    expect((await app.inject({ method: "GET", url: apiRoutes.sos.getMission.url.replace(":id", accepted.missionId),
      headers: responderHeaders })).statusCode).toBe(200);
    const sync = await callContract<{ events: Array<{ missionId: string; toStatus: string }>; missions: Array<{ id: string }>;
      nextCursor: string | null; location: null }>(apiRoutes.sos.sync, 200, {
      url: `${apiRoutes.sos.sync.url}?since=${encodeURIComponent(new Date(Date.now() - 3_600_000).toISOString())}`,
      headers: requesterHeaders
    });
    expect(sync.events).toContainEqual(expect.objectContaining({ missionId: accepted.missionId, toStatus: "pending" }));
    expect(sync.missions.map((row) => row.id)).toContain(accepted.missionId);
    expect(sync.location).toBeNull();
    expect((await app.inject({ method: "GET", url: `${apiRoutes.sos.sync.url}?since=invalid`,
      headers: requesterHeaders })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", url: `${apiRoutes.sos.sync.url}?since=${encodeURIComponent(new Date().toISOString())}`,
      headers: adminHeaders })).statusCode).toBe(403);
    const presenceUrl = apiRoutes.sos.getMissionPresence.url.replace(":id", accepted.missionId);
    const presence = await callContract<{ missionId: string; requester: { online: boolean }; rescuer: { online: boolean } }>(
      apiRoutes.sos.getMissionPresence, 200, { url: presenceUrl, headers: requesterHeaders });
    expect(presence).toMatchObject({ missionId: accepted.missionId,
      requester: { online: false }, rescuer: { online: true } });
    expect((await app.inject({ method: "GET", url: presenceUrl, headers: adminHeaders })).statusCode).toBe(200);
    expect((await callContract<{ code: string }>(apiRoutes.sos.getMissionPresence, 404, {
      url: apiRoutes.sos.getMissionPresence.url.replace(":id", "00000000-0000-4000-8000-000000000099"),
      headers: requesterHeaders })).code).toBe("MISSION_NOT_FOUND");
    // A crashed server can leave is_online=true; the TTL still refuses a stale socket.
    await pg.query(`UPDATE user_sessions SET last_active_at = now() - interval '6 minutes'
      WHERE id = $1`, [responderDevices[0]!.id]);
    const stale = await app.inject({ method: "GET", url: presenceUrl, headers: requesterHeaders });
    expect(stale.statusCode).toBe(200);
    expect(stale.json().rescuer.online).toBe(false);
    await new DrizzleUserSecurityQuestionsStore(db).touchSessionPresence({
      userId: createdResponder.id, sessionId: responderDevices[0]!.id,
      deviceId: responderDeviceId, isOnline: true
    });
    const userTimelineUrl = apiRoutes.sos.getMissionTimeline.url.replace(":id", accepted.missionId);
    const adminTimelineUrl = apiRoutes.admin.getMissionTimeline.url.replace(":id", accepted.missionId);
    const requesterTimeline = await callContract<Array<{ toStatus: string }>>(apiRoutes.sos.getMissionTimeline, 200,
      { url: userTimelineUrl, headers: requesterHeaders });
    expect(requesterTimeline.map((entry) => entry.toStatus)).toEqual(["pending"]);
    const adminTimeline = await callContract<Array<{ toStatus: string }>>(apiRoutes.admin.getMissionTimeline, 200,
      { url: adminTimelineUrl, headers: adminHeaders });
    expect(adminTimeline).toEqual(requesterTimeline);
    expect((await app.inject({ method: "GET", url: adminTimelineUrl, headers: requesterHeaders })).statusCode).toBe(403);
    const navUrl = apiRoutes.sos.getMissionNavigationTarget.url.replace(":id", accepted.missionId);
    const nav = await callContract<{ missionId: string; incident: { lat: number; lon: number } }>(
      apiRoutes.sos.getMissionNavigationTarget, 200, { url: navUrl, headers: responderHeaders }
    );
    expect(nav.missionId).toBe(accepted.missionId);
    expect(nav.incident.lat).toBeGreaterThan(-90);
    expect(nav.incident.lon).toBeGreaterThan(-180);
    expect((await app.inject({ method: "GET", url: navUrl, headers: requesterHeaders })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: navUrl, headers: adminHeaders })).statusCode).toBe(404);
    const statusUrl = apiRoutes.sos.updateMissionStatus.url.replace(":id", accepted.missionId);
    expect((await callContract<{ code: string }>(apiRoutes.sos.updateMissionStatus, 409, {
      url: statusUrl, headers: responderHeaders, payload: { status: "arrived" }
    })).code).toBe("INVALID_MISSION_TRANSITION");
    const progressed = await callContract<{ status: string }>(apiRoutes.sos.updateMissionStatus, 200, {
      url: statusUrl, headers: responderHeaders, payload: { status: "on_the_way" }
    });
    expect(progressed.status).toBe("on_the_way");
    expect((await pg.query<{ from_status: string; to_status: string }>(
      `SELECT "from_status", "to_status" FROM "mission_status_history" WHERE "mission_id" = $1 AND "to_status" = 'on_the_way'`,
      [accepted.missionId]
    )).rows).toEqual([{ from_status: "pending", to_status: "on_the_way" }]);
    const rateUrl = apiRoutes.sos.rateMission.url.replace(":id", accepted.missionId);
    expect((await callContract<{ code: string }>(apiRoutes.sos.rateMission, 409, {
      url: rateUrl, headers: requesterHeaders, payload: { rating: 5 }
    })).code).toBe("MISSION_NOT_COMPLETED");
    expect((await callContract<{ code: string }>(apiRoutes.sos.rateMission, 404, {
      url: rateUrl, headers: responderHeaders, payload: { rating: 5 }
    })).code).toBe("MISSION_NOT_FOUND");
    expect((await callContract<{ code: string }>(apiRoutes.sos.rateMission, 404, {
      url: rateUrl, headers: adminHeaders, payload: { rating: 5 }
    })).code).toBe("MISSION_NOT_FOUND");
    expect((await callContract<{ code: string }>(apiRoutes.sos.rateMission, 400, {
      url: rateUrl, headers: requesterHeaders, payload: { rating: 0 }
    })).code).toBe("VALIDATION_ERROR");
    expect((await callContract<{ code: string }>(apiRoutes.sos.rateMission, 400, {
      url: rateUrl, headers: requesterHeaders, payload: { rating: 5, comment: "x".repeat(501) }
    })).code).toBe("VALIDATION_ERROR");
    expect((await callContract<{ code: string }>(apiRoutes.sos.rateMission, 404, {
      url: apiRoutes.sos.rateMission.url.replace(":id", "00000000-0000-4000-8000-000000000099"),
      headers: requesterHeaders, payload: { rating: 5 }
    })).code).toBe("MISSION_NOT_FOUND");
    // An independent completed request exercises the writer without changing the
    // active request subsequently used to audit rescuer cancellation and replacement.
    const ratedRequestId = "99000000-0000-4000-8000-000000000004";
    const ratedMissionId = "99000000-0000-4000-8000-000000000003";
    await pg.query(`INSERT INTO sos_requests (id,requester_id,severity,description,incident_type_id,location,status)
      SELECT $1,requester_id,severity,description,incident_type_id,location,'completed'
      FROM sos_requests WHERE id=$2`, [ratedRequestId, competing[0]!.sosId]);
    await pg.query(`INSERT INTO missions (id,sos_request_id,requester_id,rescuer_id,status)
      SELECT $1,$2,requester_id,rescuer_id,'completed' FROM missions WHERE id=$3`,
    [ratedMissionId, ratedRequestId, accepted.missionId]);
    const completedRateUrl = apiRoutes.sos.rateMission.url.replace(":id", ratedMissionId);
    await callContract(apiRoutes.sos.rateMission, 200, {
      url: completedRateUrl, headers: requesterHeaders, payload: { rating: 4, comment: "  Thank you!  " }
    });
    expect((await pg.query<{ rating: number; comment: string | null }>(
      `SELECT rating,comment FROM mission_ratings WHERE mission_id=$1`, [ratedMissionId]
    )).rows).toEqual([{ rating: 4, comment: "Thank you!" }]);
    expect(Number((await pg.query<{ avg_rating: string | null }>(
      `SELECT avg_rating FROM users WHERE id=$1`, [createdResponder.id]
    )).rows[0]?.avg_rating)).toBe(4);
    expect((await callContract<{ code: string }>(apiRoutes.sos.rateMission, 409, {
      url: completedRateUrl, headers: requesterHeaders, payload: { rating: 1 }
    })).code).toBe("MISSION_ALREADY_RATED");
    expect((await pg.query<{ rating: number }>(
      `SELECT rating FROM mission_ratings WHERE mission_id=$1`, [ratedMissionId]
    )).rows).toEqual([{ rating: 4 }]);
    expect((await callContract<{ rating: number | null }>(apiRoutes.sos.getMission, 200, {
      url: apiRoutes.sos.getMission.url.replace(":id", ratedMissionId), headers: requesterHeaders
    })).rating).toBe(4);
    const inboxAfterAccept = await callContract<{ total: number }>(apiRoutes.sos.listProposals, 200, {
      url: apiRoutes.sos.listProposals.url, headers: responderHeaders
    });
    expect(inboxAfterAccept.total).toBe(0);
    // A rescuer unable to continue is released atomically, before a later dispatch.
    const rescuerCancelReasonId = "99000000-0000-4000-8000-000000000002";
    await pg.query(`INSERT INTO "cancellation_reasons" ("id", "type", "key", "label")
      VALUES ($1, 'rescuer', 'physical_inability', 'Unable to reach')`, [rescuerCancelReasonId]);
    await callContract(apiRoutes.sos.cancelMission, 200, {
      url: apiRoutes.sos.cancelMission.url.replace(":id", accepted.missionId),
      headers: responderHeaders, payload: { cancellationReasonId: rescuerCancelReasonId }
    });
    expect((await app.inject({ method: "GET", url: navUrl, headers: responderHeaders })).statusCode).toBe(404);
    expect((await pg.query<{ status: string }>(`SELECT status FROM missions WHERE id=$1`, [accepted.missionId]))
      .rows[0]?.status).toBe("cancelled_by_rescuer");
    expect((await app.inject({ method: "GET", url: userTimelineUrl, headers: requesterHeaders })).json()
      .map((entry: { toStatus: string }) => entry.toStatus)).toEqual([
        "pending", "on_the_way", "cancelled_by_rescuer"
      ]);
    expect((await app.inject({ method: "GET",
      url: `${apiRoutes.admin.listSosMissions.url.replace(":id", competing[0]!.sosId)}?includeTerminal=true`,
      headers: adminHeaders })).json()).toMatchObject([{ status: "cancelled_by_rescuer" }]);
    // A later re-dispatch reopens the declined proposal, never its old decision id.
    const redispatched = await callContract<{ proposals: Array<{ id: string }> }>(apiRoutes.admin.dispatchSosRequest, 201, {
      url: apiRoutes.admin.dispatchSosRequest.url.replace(":id", createdSos.requestId),
      headers: adminHeaders, payload: { rescuerIds: [createdResponder.id] }
    });
    const freshId = redispatched.proposals[0]!.id;
    expect(freshId).not.toBe(inbox.items[0]!.id);
    expect((await pg.query<{ id: string; status: string; decline_reason: string | null }>(
      `SELECT "id", "status", "decline_reason" FROM "mission_proposals" WHERE "sos_request_id" = $1`, [createdSos.requestId]
    )).rows).toEqual([{ id: freshId, status: "pending", decline_reason: null }]);
    // The old decision URL is not a capability for the new dispatch generation.
    expect((await app.inject({ method: "POST", url: proposalUrl, headers: responderHeaders })).statusCode).toBe(404);
    expect((await app.inject({ method: "POST", url: apiRoutes.sos.acceptProposal.url.replace(":id", inbox.items[0]!.id),
      headers: responderHeaders })).statusCode).toBe(404);
    expect((await pg.query<{ status: string }>(`SELECT "status" FROM "mission_proposals" WHERE "id" = $1`, [freshId]))
      .rows[0]?.status).toBe("pending");

    // A replacement must invalidate even still-signed old URLs (the database pointer is authoritative).
    await pg.query(`UPDATE "sos_requests" SET "photo_url" = NULL WHERE "id" = $1`, [createdSos.requestId]);
    expect((await app.inject({ method: "GET", url: requesterPhotoAccess.url })).statusCode).toBe(404);

    // Cancellation catalog and requester cancellation must be exercised against the same
    // shared runtime schemas, not merely appear in Swagger's status map.
    const cancelReasonId = "99000000-0000-4000-8000-000000000001";
    await pg.query(`INSERT INTO "cancellation_reasons" ("id", "type", "key", "label", "label_fa")
      VALUES ($1, 'requester', 'need_resolved', 'Resolved', 'رفع شد')`, [cancelReasonId]);
    const cancellationReasons = await callContract<Array<{ id: string }>>(apiRoutes.sos.listCancellationReasons, 200, {
      url: `${apiRoutes.sos.listCancellationReasons.url}?type=requester`, headers: requesterHeaders
    });
    expect(cancellationReasons.map(({ id }) => id)).toContain(cancelReasonId);
    await callContract(apiRoutes.sos.cancelRequest, 200, {
      url: apiRoutes.sos.cancelRequest.url.replace(":id", competing[1]!.sosId),
      headers: requesterHeaders, payload: { cancellationReasonId: cancelReasonId }
    });
    expect((await pg.query<{ status: string }>(`SELECT status FROM "sos_requests" WHERE id=$1`, [competing[1]!.sosId])).rows[0]?.status)
      .toBe("cancelled_by_requester");

    // An accepted request is also cancellable, but only together with its mission and busy flag.
    const activeCancelId = "99000000-0000-4000-8000-000000000010";
    await pg.query(`INSERT INTO sos_requests (id, requester_id, severity, description, incident_type_id, location, status)
      VALUES ($1,$2,'high','The requester no longer needs help.', $3,'POINT(51.4 35.7)','accepted')`,
      [activeCancelId, requesterSession.user.id, createdIncident.id]);
    await pg.query(`INSERT INTO missions (sos_request_id,rescuer_id,requester_id)
      VALUES ($1,$2,$3)`, [activeCancelId, createdResponder.id, requesterSession.user.id]);
    await pg.query(`UPDATE users SET is_on_mission=true WHERE id=$1`, [createdResponder.id]);
    await callContract(apiRoutes.sos.cancelRequest, 200, {
      url: apiRoutes.sos.cancelRequest.url.replace(":id", activeCancelId), headers: requesterHeaders,
      payload: { cancellationReasonId: cancelReasonId }
    });
    expect((await pg.query<{ status: string }>(`SELECT status FROM missions WHERE sos_request_id=$1`, [activeCancelId]))
      .rows[0]?.status).toBe("cancelled_by_requester");
    expect((await pg.query<{ is_on_mission: boolean }>(`SELECT is_on_mission FROM users WHERE id=$1`,
      [createdResponder.id])).rows[0]?.is_on_mission).toBe(false);

    // Cursor traversal remains complete when more than 100 durable steps share a timestamp.
    // The cursor is scoped to this account, and paging never exposes GPS coordinates.
    const pageSince = new Date(Date.now() - 1000).toISOString();
    await pg.query(`INSERT INTO mission_status_history (mission_id, to_status, changed_by, created_at)
      SELECT $1, 'pending', $2, now() FROM generate_series(1, 101)`, [accepted.missionId, createdResponder.id]);
    const firstPage = await app.inject({ method: "GET", headers: requesterHeaders,
      url: `${apiRoutes.sos.sync.url}?since=${encodeURIComponent(pageSince)}` });
    expect(firstPage.statusCode).toBe(200);
    expect(firstPage.json().events).toHaveLength(100);
    expect(firstPage.json().nextCursor).toBeTruthy();
    const secondPage = await app.inject({ method: "GET", headers: requesterHeaders,
      url: `${apiRoutes.sos.sync.url}?since=${encodeURIComponent(pageSince)}&cursor=${firstPage.json().nextCursor}` });
    expect(secondPage.statusCode).toBe(200);
    expect(secondPage.json().events.length).toBeGreaterThan(0);
    expect(secondPage.json().nextCursor).toBeNull();
    const allIds = [...firstPage.json().events, ...secondPage.json().events].map((step: { id: string }) => step.id);
    expect(new Set(allIds).size).toBe(allIds.length);
    expect(secondPage.json().location).toBeNull();
    expect((await app.inject({ method: "GET", headers: requesterHeaders,
      url: `${apiRoutes.sos.sync.url}?since=${encodeURIComponent(pageSince)}&cursor=00000000-0000-4000-8000-000000000099` })).statusCode).toBe(400);
    expect((await app.inject({ method: "GET", headers: requesterHeaders,
      url: `${apiRoutes.sos.sync.url}?since=${encodeURIComponent(new Date(Date.now() - 31 * 86400_000).toISOString())}` })).statusCode).toBe(400);

    // Terminate a second login after the mission/sharing checks so revocation cannot change their setup.
    // This runs the real Drizzle write against migrated PGlite, not an injected store stub.
    const remoteLogin = await callContract<{ accessToken: string }>(apiRoutes.auth.login, 200, {
      url: apiRoutes.auth.login.url,
      payload: { username: "field_requester", password: "NewPassword99", deviceName: "Other browser" }
    });
    const sessionsBefore = await callContract<Array<{ id: string; isCurrentDevice: boolean }>>(
      apiRoutes.user.devices, 200, { url: apiRoutes.user.devices.url, headers: requesterHeaders }
    );
    const currentSession = sessionsBefore.find(row => row.isCurrentDevice)!;
    const remoteSession = sessionsBefore.find(row => !row.isCurrentDevice)!;
    const targetPath = (id: string) => apiRoutes.user.revokeDevice.makeFullPath({ sessionId: id });
    expect((await app.inject({ method: "DELETE", url: targetPath(currentSession.id), headers: requesterHeaders })).statusCode).toBe(403);
    expect((await app.inject({ method: "DELETE", url: targetPath(responderDevices[0]!.id), headers: requesterHeaders })).statusCode).toBe(404);
    await callContract(apiRoutes.user.revokeDevice, 200, {
      url: targetPath(remoteSession.id), headers: requesterHeaders
    });
    expect((await app.inject({ method: "GET", url: apiRoutes.user.me.url,
      headers: { authorization: `Bearer ${remoteLogin.accessToken}` } })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: targetPath(remoteSession.id), headers: requesterHeaders })).statusCode).toBe(404);
    const sessionsAfter = await callContract<Array<{ id: string }>>(
      apiRoutes.user.devices, 200, { url: apiRoutes.user.devices.url, headers: requesterHeaders }
    );
    expect(sessionsAfter.map(row => row.id)).not.toContain(remoteSession.id);

    // Exhaustiveness proof: EVERY implemented API operation in @borobiya/shared was exercised & schema-validated!
    expect(verifiedOperationIds).toEqual(implementedOperationIds);

    // Contract-only operations must all respond 404 when called with valid auth credentials.
    for (const route of allApiRoutes) {
      if (implementedOperationIds.has(route.meta.operationId)) continue;
      const sampleUrl = route.url
        .replace(":id", "00000000-0000-4000-8000-000000000099")
        .replace(":theme", "light");
      const headers =
        route.meta.access === "admin"
          ? adminHeaders
          : route.meta.access === "authenticated"
            ? requesterHeaders
            : undefined;
      const res = await app.inject({
        method: route.method,
        url: sampleUrl,
        headers
      });
      expect(
        res.statusCode,
        `Contract-only ${route.meta.operationId} (${route.method} ${sampleUrl}) must return 404`
      ).toBe(404);
    }
  });
});
