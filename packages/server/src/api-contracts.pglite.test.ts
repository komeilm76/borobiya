import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
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
import { DrizzleSosPhotoStore } from "./db/sos-photo-store";
import { DrizzleSosRequestStore } from "./db/sos-request-store";
import { DrizzleUserSearchStore } from "./db/user-search-store";
import { createPhotoStorage } from "./sos/photo-storage";

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
    pg = new PGlite();

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

    const responderDevices = await callContract<Array<{ deviceId: string; isCurrentDevice: boolean }>>(
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
