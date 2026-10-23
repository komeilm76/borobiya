import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { allApiRoutes, apiRoutes, type ApiRouteDefinition } from "@borobiya/shared/api";
import type { SecurityQuestion } from "@borobiya/shared";
import type { UserRecoveryStore } from "./db/recovery-store";
import type { SecurityQuestionsUserRecord, UserSecurityQuestionsStore } from "./db/security-questions-store";
import { createFastifyApp, type FastifyAppDependencies } from "./app";
import { JOB_TICK_INTERVAL_MS } from "./location/jobs";
import type { LocationHistoryStore } from "./db/location-history-store";
import type { LocationShareStore, RetiredLocationShare } from "./db/location-share-store";
import { describeOpenApiRuntimeStatus } from "./plugins/swagger";
import { SHARE_ENDED_EVENT } from "./realtime/socket";
import { parseServerEnv } from "./config/env";

const serverConfig = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173,http://localhost:3000"
});

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function makeApp(
  overrides: Partial<typeof serverConfig> = {},
  dependencies: FastifyAppDependencies = {}
) {
  const app = await createFastifyApp({ ...serverConfig, ...overrides }, dependencies);
  apps.push(app);
  return app;
}

function makeRecoveryStore(questions: SecurityQuestion[]): UserRecoveryStore {
  return {
    async findAccountByUsername() { return null; },
    async listSecurityQuestions() { return questions.map(({ id, text }) => ({ questionId: id, text })); },
    async saveRecoveryChallenge() { return null; },
    async findActiveRecoveryChallenge() { return null; },
    async issuePasswordResetToken() { return false; },
    async isPasswordResetTokenValid() { return false; },
    async resetPasswordWithToken() { return false; }
  };
}

describe("Fastify server skeleton", () => {
  it("registers the admin catalog routes, so they answer 401 rather than the contract-only 404", async () => {
    // The whole point of T3.1.2/T3.1.3 landing: these URLs used to fall through to the 404 that unregistered
    // descriptors return. A 401 here is proof the handler is mounted and its authorization runs.
    const app = await makeApp();

    const cases = [
      { method: "GET" as const, url: "/_admin/incidents" },
      { method: "POST" as const, url: "/_admin/incidents", payload: { name: "Fire" } },
      { method: "PATCH" as const, url: "/_admin/incidents/00000000-0000-4000-8000-000000000001", payload: { color: null } },
      { method: "GET" as const, url: "/_admin/categories" },
      { method: "POST" as const, url: "/_admin/categories", payload: { name: "Mountain", incidentTypeIds: [] } },
      { method: "PATCH" as const, url: "/_admin/categories/00000000-0000-4000-8000-000000000001", payload: { name: "Alpine" } },
      { method: "POST" as const, url: "/_admin/categories/00000000-0000-4000-8000-000000000001/users", payload: { userIds: ["00000000-0000-4000-8000-000000000002"] } },
      { method: "DELETE" as const, url: "/_admin/categories/00000000-0000-4000-8000-000000000001/users/00000000-0000-4000-8000-000000000002" }
    ];

    for (const route of cases) {
      const response = await app.inject(route as never);
      expect(response.statusCode, `${route.method} ${route.url}`).toBe(401);
    }

    const document = await app.inject({ method: "GET", url: "/docs/json" });
    const paths = document.json().paths as Record<string, Record<string, Record<string, unknown>>>;
    const implemented = [
      ["/_admin/incidents", "get"],
      ["/_admin/incidents", "post"],
      ["/_admin/incidents/{id}", "patch"],
      ["/_admin/categories", "get"],
      ["/_admin/categories", "post"],
      ["/_admin/categories/{id}", "patch"],
      ["/_admin/categories/{id}/users", "post"],
      ["/_admin/categories/{id}/users/{userId}", "delete"]
    ] as const;
    for (const [path, method] of implemented) {
      expect(paths[path]?.[method]?.["x-borobiya-runtime-status"], `${method} ${path}`).toBe("implemented");
    }
    // The slug collision the unique index makes reachable has to be in the document, or a client cannot
    // be written against it.
    expect(paths["/_admin/incidents"]?.post?.responses, "create gained 409").toHaveProperty("409");
    expect(paths["/_admin/incidents/{id}"]?.patch?.responses, "rename gained 409").toHaveProperty("409");
  });

  it("registers the SOS creation route, so it answers 401 rather than the contract-only 404", async () => {
    // T3.2.2 mounted a real handler at `POST /_user/sos/requests`. The store below refuses to run
    // without a session, so reaching 401 instead of 404 is the proof the route exists and that the
    // `/_user` hook — the only thing standing between an anonymous caller and the SOS table — is in
    // front of it.
    const app = await makeApp({}, {
      sosRequestStore: {
        async createRequest() {
          throw new Error("the session guard must reject before anything is filed");
        }
      }
    });

    const anonymousUpload = await app.inject({
      method: "POST",
      url: "/_user/sos/requests/00000000-0000-4000-8000-000000000001/photo",
      headers: { "content-type": "multipart/form-data; boundary=borobiya-app-test" },
      payload: Buffer.from("--borobiya-app-test--\r\n", "utf8")
    });
    // Mounted behind the same guard, and a multipart body is not *read* before that guard answers: the
    // plugin's content-type parser only claims the stream, so an unauthenticated caller cannot make the
    // server buffer 5 MB of anything.
    expect(anonymousUpload.statusCode).toBe(401);

    // The same, with a body far past the 5 MB the parser would refuse: still 401, not 413. That is the
    // ordering stated as a test — an unauthenticated caller cannot make this server collect a photo,
    // only to be told at the end that it had no business uploading one.
    const oversizedAnonymousUpload = await app.inject({
      method: "POST",
      url: "/_user/sos/requests/00000000-0000-4000-8000-000000000001/photo",
      headers: { "content-type": "multipart/form-data; boundary=borobiya-app-test" },
      payload: Buffer.concat([
        Buffer.from("--borobiya-app-test\r\nContent-Disposition: form-data; name=\"photo\"; filename=\"a\"\r\n\r\n", "utf8"),
        Buffer.alloc(6 * 1024 * 1024, 0x20),
        Buffer.from("\r\n--borobiya-app-test--\r\n", "utf8")
      ])
    });
    expect(oversizedAnonymousUpload.statusCode).toBe(401);

    const response = await app.inject({
      method: "POST",
      url: "/_user/sos/requests",
      payload: {
        severity: "high",
        description: "Roof collapse, two people unaccounted for inside.",
        incidentTypeId: "00000000-0000-4000-8000-000000000001",
        location: { lat: 35.7, lon: 51.4, isManual: false }
      }
    });
    expect(response.statusCode).toBe(401);

    const document = await app.inject({ method: "GET", url: "/docs/json" });
    const createRequest = (document.json().paths as Record<string, Record<string, Record<string, unknown>>>)[
      "/_user/sos/requests"
    ]?.post;
    expect(createRequest?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(createRequest?.["x-borobiya-access"]).toBe("authenticated");
    expect(createRequest?.["security"]).toEqual([{ bearerAuth: [] }]);
    expect(createRequest?.["responses"]).toMatchObject({
      201: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      429: expect.any(Object)
    });
    // The map pin is the field the generated client must be able to write, and its absence would
    // mean the contract the SOS screen is built against still describes a lat/lon pair it cannot set.
    expect(createRequest?.["requestBody"]).toHaveProperty(
      "content.application/json.schema.properties.location.properties.isManual"
    );
    expect(createRequest?.["requestBody"]).toHaveProperty("content.application/json.schema.properties.incidentTypeId");

    const uploadPhoto = (document.json().paths as Record<string, Record<string, Record<string, unknown>>>)[
      "/_user/sos/requests/{id}/photo"
    ]?.post;
    expect(uploadPhoto?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(uploadPhoto?.["x-borobiya-access"]).toBe("authenticated");
    // 413 is the size refusal `docs/SECURITY.md` §9 implies and the route answers; a generated client
    // needs it in the document to type the "compress it first" branch.
    expect(uploadPhoto?.["responses"]).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      413: expect.any(Object),
      429: expect.any(Object)
    });
    // The read half is still a promise: no `GET /uploads/{id}` operation exists in the document.
    expect(document.json().paths).not.toHaveProperty("/uploads/{id}");
  });

  it("serves the public health endpoint with security headers", async () => {
    const app = await makeApp();
    const response = await app.inject({ method: "GET", url: "/_public/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok", version: expect.any(String) });
    expect(response.json().uptime).toEqual(expect.any(Number));
    expect(response.headers["x-frame-options"]).toBe("DENY");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("catches up on expired shares once the API owns the maintenance timers", async () => {
    const retired: RetiredLocationShare[] = [
      { id: randomUUID(), ownerId: randomUUID(), targetUserId: randomUUID() }
    ];
    const expireOverdueShares = vi.fn(async (_input: { now: Date }) => retired);
    const repairStaleSharePins = vi.fn(async () => 0);
    const pruneOlderThan = vi.fn(async () => 0);
    const app = await makeApp({}, {
      locationShareStore: { expireOverdueShares, repairStaleSharePins } as unknown as LocationShareStore,
      locationHistoryStore: { pruneOlderThan } as unknown as LocationHistoryStore,
      startMaintenanceJobs: true
    });

    // `inject` implies `ready`, which is what triggers the startup pass.
    expect((await app.inject({ method: "GET", url: "/_public/health" })).statusCode).toBe(200);
    await vi.waitFor(() => expect(expireOverdueShares).toHaveBeenCalledTimes(1));
    expect(repairStaleSharePins).toHaveBeenCalledTimes(1);
    expect(pruneOlderThan).toHaveBeenCalledTimes(1);
    expect(expireOverdueShares.mock.calls[0]?.[0]).toEqual({ now: expect.any(Date) });
  });

  it("delivers location:share-ended over Socket.IO to the recipient room only on revoke and expiry", async () => {
    const ownerId = randomUUID();
    const recipientId = randomUUID();
    const bystanderId = randomUUID();
    const revokedShareId = randomUUID();
    const expiredShareId = randomUUID();
    const accounts = new Map<string, SecurityQuestionsUserRecord>([
      [ownerId, { id: ownerId, username: "owner_one", role: "user", isActive: true, isSuspended: false, mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date() }],
      [recipientId, { id: recipientId, username: "recipient_one", role: "user", isActive: true, isSuspended: false, mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date() }],
      [bystanderId, { id: bystanderId, username: "bystander_one", role: "user", isActive: true, isSuspended: false, mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date() }]
    ]);
    const securityQuestionsStore: UserSecurityQuestionsStore = {
      async findUserById(id) { return accounts.get(id) ?? null; },
      async hasActiveSession() { return true; },
      async securityQuestionsExist() { return true; },
      async completeSecurityQuestions() { return true; }
    };

    let releaseExpirySweep!: () => void;
    const expiryGate = new Promise<void>((resolve) => {
      releaseExpirySweep = resolve;
    });
    const locationShareStore = {
      async revokeShare(input: { ownerId: string; shareId: string }) {
        return {
          status: "revoked" as const,
          share: { id: input.shareId, ownerId: input.ownerId, targetUserId: recipientId }
        };
      },
      async expireOverdueShares() {
        await expiryGate;
        return [{ id: expiredShareId, ownerId, targetUserId: recipientId }];
      },
      async repairStaleSharePins() { return 0; }
    } as unknown as LocationShareStore;

    const app = await makeApp({}, {
      securityQuestionsStore,
      locationShareStore,
      locationHistoryStore: { pruneOlderThan: async () => 0 } as unknown as LocationHistoryStore,
      startMaintenanceJobs: true
    });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });

    const signAccess = async (sub: string) => {
      const issuedAt = Math.floor(Date.now() / 1000);
      return new SignJWT({
        role: "user",
        deviceId: randomUUID(),
        sessionId: randomUUID(),
        tokenUse: "access"
      })
        .setProtectedHeader({ alg: "HS256", typ: "JWT" })
        .setSubject(sub)
        .setIssuedAt(issuedAt)
        .setExpirationTime(issuedAt + 900)
        .sign(new TextEncoder().encode(serverConfig.jwtSecret));
    };

    const sockets: ClientSocket[] = [];
    const openClient = async (sub: string) => {
      const token = await signAccess(sub);
      const events: unknown[] = [];
      const client = ioClient(address, {
        path: "/socket.io",
        transports: ["websocket"],
        auth: { token },
        reconnection: false
      });
      sockets.push(client);
      client.on(SHARE_ENDED_EVENT, (payload: unknown) => {
        events.push(payload);
      });
      await new Promise<void>((resolve, reject) => {
        client.once("connect", () => resolve());
        client.once("connect_error", reject);
      });
      return events;
    };

    try {
      const recipientEvents = await openClient(recipientId);
      const bystanderEvents = await openClient(bystanderId);
      const ownerToken = await signAccess(ownerId);

      const response = await app.inject({
        method: "DELETE",
        url: `/_user/location/share/${revokedShareId}`,
        headers: { authorization: `Bearer ${ownerToken}` }
      });
      expect(response.statusCode).toBe(200);
      await vi.waitFor(() =>
        expect(recipientEvents).toContainEqual({
          shareId: revokedShareId,
          userId: ownerId,
          reason: "revoked"
        })
      );

      releaseExpirySweep();
      await vi.waitFor(() =>
        expect(recipientEvents).toEqual([
          { shareId: revokedShareId, userId: ownerId, reason: "revoked" },
          { shareId: expiredShareId, userId: ownerId, reason: "expired" }
        ])
      );
      expect(bystanderEvents).toEqual([]);
    } finally {
      for (const client of sockets) client.close();
    }
  });

  it("starts no maintenance interval for apps that do not own the timers", async () => {
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const expireOverdueShares = vi.fn(async (_input: { now: Date }) => []);

    const app = await makeApp({}, {
      locationShareStore: { expireOverdueShares } as unknown as LocationShareStore,
      locationHistoryStore: { pruneOlderThan: async () => 0 } as unknown as LocationHistoryStore
    });
    await app.inject({ method: "GET", url: "/_public/health" });
    await app.close();

    expect(expireOverdueShares).not.toHaveBeenCalled();
    const scheduledDelays = setIntervalSpy.mock.calls.map((call) => (call as unknown as unknown[])[1]);
    expect(scheduledDelays).not.toContain(JOB_TICK_INTERVAL_MS);
    setIntervalSpy.mockRestore();
  });

  it("serves the public security-question catalog for registration and onboarding", async () => {
    const questions = [
      { id: "10000000-0000-4000-8000-000000000001", text: "Question one?" },
      { id: "10000000-0000-4000-8000-000000000002", text: "Question two?" }
    ];
    const app = await makeApp({}, { recoveryStore: makeRecoveryStore(questions) });
    const response = await app.inject({ method: "GET", url: "/_public/security-questions" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(questions);
    expect(response.headers["cache-control"]).toBe("public, max-age=3600");
  });

  // The API's caching default is a hook rather than 39 handler lines, so these pin the responses no
  // handler produced or deliberately annotated — including the one cache that must survive.
  it("sends no-store on a rate-limited rejection that no handler produced", async () => {
    const app = await makeApp({ rateLimitMax: 1 }, { recoveryStore: makeRecoveryStore([]) });

    expect((await app.inject({ method: "GET", url: "/_public/security-questions" })).statusCode).toBe(200);
    const limited = await app.inject({ method: "GET", url: "/_public/security-questions" });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers["cache-control"]).toBe("no-store");
  });

  it("sends no-store on the responses no handler answered", async () => {
    const app = await makeApp();

    // An unknown path at all: Fastify's own 404, which never enters a route file that could set a header.
    const missing = await app.inject({ method: "GET", url: "/not-a-route" });
    expect(missing.statusCode).toBe(404);
    expect(missing.headers["cache-control"]).toBe("no-store");

    // An unknown path under `/_user`, rejected by the group's auth hook before routing: a response a
    // proxy must not hold on to, since it says nothing about whether the caller may reach that path later.
    const rejected = await app.inject({ method: "GET", url: "/_user/not-a-route" });
    expect(rejected.statusCode).toBe(401);
    expect(rejected.headers["cache-control"]).toBe("no-store");
  });

  it("keeps the health probe reachable past the global request limit", async () => {
    // The point of the exemption: an instance under load must still answer its own liveness check, and
    // the limiter must still be live for the routes it does protect — otherwise this test would pass on
    // a plugin that never registered at all.
    const app = await makeApp({ rateLimitMax: 1 }, { recoveryStore: makeRecoveryStore([]) });

    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect((await app.inject({ method: "GET", url: "/_public/health" })).statusCode).toBe(200);
    }
    // And the throttle is live for the routes it does protect, so this is an exemption rather than a
    // limiter that never registered.
    expect((await app.inject({ method: "GET", url: "/_public/security-questions" })).statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/_public/security-questions" })).statusCode).toBe(429);
  });

  it("serves Swagger UI and documents shared contracts without fake runtime routes", async () => {
    const app = await makeApp();
    const ui = await app.inject({ method: "GET", url: "/docs" });
    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(ui.statusCode).toBe(200);
    expect(ui.headers["content-type"]).toContain("text/html");
    expect(ui.body).toContain("swagger-ui-bundle.js");
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/json");

    const document = response.json();
    const paths = document.paths as Record<string, Record<string, Record<string, unknown>>>;
    const operationCount = Object.values(paths).reduce((count, pathItem) => count + Object.keys(pathItem).length, 0);
    const refresh = paths["/_auth/refresh"]?.post;
    const registration = paths["/_auth/register"]?.post;
    const login = paths["/_auth/login"]?.post;
    const logout = paths["/_auth/logout"]?.post;
    const forgotRequest = paths["/_auth/forgot-password/request"]?.post;
    const forgotVerify = paths["/_auth/forgot-password/verify"]?.post;
    const forgotReset = paths["/_auth/forgot-password/reset"]?.post;
    const adminListUsers = paths["/_admin/users"]?.get;
    const adminGetUser = paths["/_admin/users/{id}"]?.get;
    expect(paths["/_admin/users/{id}"]).not.toHaveProperty("delete");
    const adminCreateUser = paths["/_admin/users"]?.post;
    const adminUpdateUserStatus = paths["/_admin/users/{id}/status"]?.patch;
    const completeSecurityQuestions = paths["/_user/complete-security-questions"]?.post;
    const publicSecurityQuestions = paths["/_public/security-questions"]?.get;
    const refreshParameters = refresh?.parameters as Array<Record<string, unknown>>;
    const userProfile = paths["/_user/me"]?.get;
    const revokeShare = paths["/_user/location/share/{shareId}"]?.delete;
    const createShare = paths["/_user/location/share"]?.post;
    const sharePath = paths["/_user/location/share/{shareId}"]?.delete;
    const listShares = paths["/_user/location/shares"]?.get;
    const createHistoryShare = paths["/_user/location/history/share"]?.post;
    const ownHistory = paths["/_user/location/history"]?.get;
    const sharedHistory = paths["/_user/location/history/shared/{shareId}"]?.get;
    const historyShareList = paths["/_user/location/history/shares"]?.get;
    const revokeHistoryShare = paths["/_user/location/history/share/{shareId}"]?.delete;
    const listDevices = paths["/_user/devices"]?.get;
    const userSearch = paths["/_user/users/search"]?.get;
    const restLocationUpdate = paths["/_user/location/update"]?.post;
    const mapStyle = paths["/_public/map/styles/{theme}.json"]?.get;
    const mapStyleParameters = mapStyle?.parameters as Array<Record<string, unknown>>;
    const uploadPhoto = paths["/_user/sos/requests/{id}/photo"]?.post;

    expect(document.openapi).toBe("3.0.3");
    expect(document.servers).toEqual([{ url: "/" }]);
    expect(operationCount).toBe(allApiRoutes.length);
    expect(document.info.description).toContain("contract-only");
    expect(paths["/_public/health"]?.get?.["x-borobiya-runtime-status"]).toBe("implemented");
    // Health is the one route the global throttle deliberately skips, so the generator must not
    // advertise an error the runtime cannot answer there — while every other operation keeps the
    // implicit 429 the throttle really does produce.
    expect(Object.keys(paths["/_public/health"]?.get?.responses ?? {})).toEqual(["200"]);
    expect(paths["/_public/security-questions"]?.get?.responses).toHaveProperty("429");
    expect(registration?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(registration?.responses).toMatchObject({
      201: expect.any(Object),
      400: expect.any(Object),
      403: expect.any(Object),
      409: expect.any(Object),
      429: expect.any(Object)
    });
    expect(login?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(login?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      429: expect.any(Object)
    });
    expect(refresh?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(refresh?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 401: expect.any(Object), 403: expect.any(Object) });
    expect(refresh?.requestBody).toMatchObject({ required: false });
    expect(logout?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(logout?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 401: expect.any(Object), 403: expect.any(Object) });
    expect(forgotRequest?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(forgotRequest?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 403: expect.any(Object), 429: expect.any(Object), 503: expect.any(Object) });
    expect(forgotVerify?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(forgotVerify?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 403: expect.any(Object), 429: expect.any(Object) });
    expect(forgotReset?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(forgotReset?.responses).toMatchObject({ 200: expect.any(Object), 400: expect.any(Object), 403: expect.any(Object), 429: expect.any(Object) });
    expect(adminListUsers?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(adminListUsers?.["x-borobiya-access"]).toBe("admin");
    expect(adminListUsers?.security).toEqual([{ bearerAuth: [] }]);
    expect(adminListUsers?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      429: expect.any(Object)
    });
    expect(adminListUsers?.parameters).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "q", in: "query", required: false }),
      expect.objectContaining({ name: "isActive", in: "query", required: false }),
      expect.objectContaining({ name: "hasCategory", in: "query", required: false }),
      expect.objectContaining({ name: "page", in: "query", required: false }),
      expect.objectContaining({ name: "limit", in: "query", required: false })
    ]));
    expect(adminGetUser?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(adminGetUser?.["x-borobiya-access"]).toBe("admin");
    expect(adminGetUser?.security).toEqual([{ bearerAuth: [] }]);
    expect(adminGetUser?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      404: expect.any(Object),
      429: expect.any(Object)
    });
    expect(adminGetUser?.responses).toHaveProperty("200.content.application/json.schema.properties.devices");
    expect(adminGetUser?.responses).toHaveProperty("200.content.application/json.schema.properties.missions");
    expect(adminCreateUser?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(adminCreateUser?.["x-borobiya-access"]).toBe("admin");
    expect(adminCreateUser?.security).toEqual([{ bearerAuth: [] }]);
    expect(adminCreateUser?.responses).toMatchObject({
      201: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      409: expect.any(Object),
      429: expect.any(Object)
    });
    expect(adminCreateUser?.requestBody).toMatchObject({
      required: true,
      content: {
        "application/json": {
          schema: {
            type: "object",
            additionalProperties: false,
            required: ["username", "password"],
            properties: {
              username: expect.any(Object),
              password: expect.any(Object),
              isActive: expect.any(Object)
            }
          }
        }
      }
    });
    expect(adminCreateUser?.requestBody).not.toHaveProperty("content.application/json.schema.properties.securityQuestions");
    expect(adminUpdateUserStatus?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(adminUpdateUserStatus?.["x-borobiya-access"]).toBe("admin");
    expect(adminUpdateUserStatus?.security).toEqual([{ bearerAuth: [] }]);
    expect(adminUpdateUserStatus?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      404: expect.any(Object),
      429: expect.any(Object)
    });
    expect(adminUpdateUserStatus?.parameters).toContainEqual(expect.objectContaining({
      name: "id",
      in: "path",
      required: true,
      schema: expect.objectContaining({ type: "string", format: "uuid" })
    }));
    expect(adminUpdateUserStatus?.requestBody).toHaveProperty("content.application/json.schema.properties.isActive");
    const adminCreateSuccessResponse = adminCreateUser?.responses as {
      201?: { content?: { "application/json"?: { schema?: unknown } } };
    };
    expect(adminCreateSuccessResponse?.[201]?.content?.["application/json"]?.schema).toMatchObject({
      type: "object",
      properties: {
        id: expect.any(Object),
        username: expect.any(Object),
        role: expect.any(Object),
        mustCompleteSecurityQuestions: expect.any(Object),
        isActive: expect.any(Object),
        avgRating: expect.any(Object),
        createdAt: expect.any(Object)
      }
    });
    expect(completeSecurityQuestions?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(completeSecurityQuestions?.["x-borobiya-access"]).toBe("authenticated");
    expect(completeSecurityQuestions?.security).toEqual([{ bearerAuth: [] }]);
    expect(completeSecurityQuestions?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      409: expect.any(Object),
      429: expect.any(Object)
    });
    expect(completeSecurityQuestions?.requestBody).toHaveProperty("content.application/json.schema.properties.securityQuestions");
    expect(userProfile?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(userProfile?.["x-borobiya-access"]).toBe("authenticated");
    expect(userProfile?.security).toEqual([{ bearerAuth: [] }]);
    expect(userProfile?.responses).toMatchObject({
      200: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      429: expect.any(Object)
    });
    expect(publicSecurityQuestions?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(publicSecurityQuestions?.responses).toHaveProperty("200");
    expect(createShare?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(sharePath?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(restLocationUpdate?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(restLocationUpdate?.deprecated).toBe(true);
    expect(listShares?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(listDevices?.["x-borobiya-runtime-status"]).toBe("implemented");
    // The share picker reads accounts, so search is live too — with the filters it refuses declared.
    expect(userSearch?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(userSearch?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object)
    });
    expect(userSearch?.description ?? "").not.toBe("");
    expect(listDevices?.["x-borobiya-access"]).toBe("authenticated");
    expect(listDevices?.security).toEqual([{ bearerAuth: [] }]);
    expect(listDevices?.responses).toMatchObject({ 200: expect.any(Object), 401: expect.any(Object), 403: expect.any(Object) });
    // The Active Devices row carries the device identity the priority-device rule pins (T2.3.3).
    expect(listDevices?.responses).toHaveProperty("200.content.application/json.schema.items.properties.deviceId");
    expect(listShares?.responses).toMatchObject({ 200: expect.any(Object), 401: expect.any(Object), 403: expect.any(Object) });
    expect(sharePath?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      404: expect.any(Object)
    });
    expect(createShare?.["x-borobiya-access"]).toBe("authenticated");
    expect(createShare?.responses).toMatchObject({
      201: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      409: expect.any(Object),
      429: expect.any(Object)
    });
    // The 409 is the multi-device prompt (T2.3.3): declared in the contract, or a generated client
    // cannot type the response the share dialog has to branch on.
    expect(createShare?.responses).toHaveProperty("409");
    expect(createHistoryShare?.["x-borobiya-runtime-status"]).toBe("implemented");
    expect(createHistoryShare?.responses).toMatchObject({
      201: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      429: expect.any(Object)
    });
    // T2.2.4 is what makes a grant usable, so every half of the history path declares its runtime status:
    // a "contract-only" here would mean the player had nothing to read.
    for (const [name, operation] of [
      ["locationGetHistory", ownHistory],
      ["locationGetSharedHistory", sharedHistory],
      ["locationListHistoryShares", historyShareList],
      ["locationRevokeHistoryShare", revokeHistoryShare]
    ] as const) {
      expect(operation?.["x-borobiya-runtime-status"], name).toBe("implemented");
    }
    expect(sharedHistory?.responses).toMatchObject({
      200: expect.any(Object),
      400: expect.any(Object),
      401: expect.any(Object),
      403: expect.any(Object),
      404: expect.any(Object)
    });
    // A sampled view must not look like the whole record: both reads report how many rows the window holds.
    expect(ownHistory?.responses).toHaveProperty("200.content.application/json.schema.properties.totalPoints");
    expect(sharedHistory?.responses).toHaveProperty("200.content.application/json.schema.properties.totalPoints");
    // The receiver's list is the only way to learn a grant id, and it names the owner without a position.
    expect(historyShareList?.responses).toHaveProperty(
      "200.content.application/json.schema.properties.sharedWithMe.items.properties.owner"
    );
    expect(revokeHistoryShare?.responses).toHaveProperty("200", {
      description: "Successful response with no response body."
    });
    expect(refreshParameters).toContainEqual({
      name: "refreshToken",
      in: "cookie",
      required: false,
      schema: { type: "string", minLength: 1 }
    });
    expect(userProfile?.security).toEqual([{ bearerAuth: [] }]);
    expect(mapStyleParameters).toContainEqual({
      name: "theme",
      in: "path",
      required: true,
      schema: { type: "string", enum: ["light", "dark"] }
    });
    expect(uploadPhoto?.requestBody).toHaveProperty("content.multipart/form-data");
    expect(revokeShare?.responses).toHaveProperty("200", {
      description: "Successful response with no response body."
    });

    const missingRefreshToken = await app.inject({ method: "POST", url: "/_auth/refresh" });
    expect(missingRefreshToken.statusCode).toBe(401);
    expect(missingRefreshToken.json()).toMatchObject({ code: "INVALID_REFRESH" });

    const missingAdminToken = await app.inject({ method: "POST", url: "/_admin/users", payload: {} });
    expect(missingAdminToken.statusCode).toBe(401);
    expect(missingAdminToken.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const missingAdminListToken = await app.inject({ method: "GET", url: "/_admin/users" });
    const missingAdminDetailToken = await app.inject({
      method: "GET",
      url: "/_admin/users/00000000-0000-4000-8000-000000000001"
    });
    expect(missingAdminListToken.statusCode).toBe(401);
    expect(missingAdminListToken.json()).toMatchObject({ code: "UNAUTHORIZED" });
    expect(missingAdminDetailToken.statusCode).toBe(401);
    expect(missingAdminDetailToken.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const missingAdminStatusToken = await app.inject({
      method: "PATCH",
      url: "/_admin/users/00000000-0000-4000-8000-000000000001/status",
      payload: { isActive: false }
    });
    expect(missingAdminStatusToken.statusCode).toBe(401);
    expect(missingAdminStatusToken.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const missingUserToken = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      payload: {}
    });
    expect(missingUserToken.statusCode).toBe(401);
    expect(missingUserToken.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const missingUserProfileToken = await app.inject({ method: "GET", url: "/_user/me" });
    expect(missingUserProfileToken.statusCode).toBe(401);
    expect(missingUserProfileToken.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const missingDevicesToken = await app.inject({ method: "GET", url: "/_user/devices" });
    expect(missingDevicesToken.statusCode).toBe(401);
    expect(missingDevicesToken.json()).toMatchObject({ code: "UNAUTHORIZED" });

    // Every history route is `/_user`-scoped, including the reads: a windowed read of another account's
    // stored positions is the most sensitive path in this feature, so it fails closed on the same hook.
    for (const probe of [
      { method: "GET" as const, url: `/_user/location/history?from=2026-10-14T00:00:00.000Z&to=2026-10-21T00:00:00.000Z` },
      { method: "GET" as const, url: "/_user/users/search?q=field_responder" },
      { method: "GET" as const, url: "/_user/location/history/shares" },
      { method: "GET" as const, url: "/_user/location/history/shared/00000000-0000-4000-8000-000000000001" },
      { method: "DELETE" as const, url: "/_user/location/history/share/00000000-0000-4000-8000-000000000001" }
    ]) {
      const unauthenticated = await app.inject(probe);
      expect(unauthenticated.statusCode, probe.url).toBe(401);
      expect(unauthenticated.json()).toMatchObject({ code: "UNAUTHORIZED" });
    }

    // The `/_user` authorization hook is app-scoped, so newly added Phase 2 user routes
    // must fail closed on the same token/session checks.
    const missingShareToken = await app.inject({
      method: "POST",
      url: "/_user/location/share",
      payload: { targetUserIds: ["00000000-0000-4000-8000-000000000001"], mode: "permanent" }
    });
    expect(missingShareToken.statusCode).toBe(401);
    expect(missingShareToken.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const missingRevokeToken = await app.inject({
      method: "DELETE",
      url: "/_user/location/share/00000000-0000-4000-8000-000000000001"
    });
    expect(missingRevokeToken.statusCode).toBe(401);
    expect(missingRevokeToken.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const missingHistoryShareToken = await app.inject({
      method: "POST",
      url: "/_user/location/history/share",
      payload: {
        targetUserIds: ["00000000-0000-4000-8000-000000000001"],
        from: "2026-10-14T00:00:00.000Z",
        to: "2026-10-21T00:00:00.000Z"
      }
    });
    expect(missingHistoryShareToken.statusCode).toBe(401);
    expect(missingHistoryShareToken.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("does not expose DELETE /_admin/users/:id", async () => {
    const app = await makeApp();
    const response = await app.inject({
      method: "DELETE",
      url: "/_admin/users/00000000-0000-4000-8000-000000000001"
    });

    expect(response.statusCode).toBe(404);
  });

  it("advertises the gateway API prefix while retaining the direct API server", async () => {
    const app = await makeApp({ openApiServerPath: "/api" });
    const response = await app.inject({ method: "GET", url: "/docs/json" });

    expect(response.statusCode).toBe(200);
    expect(response.json().servers).toEqual([{ url: "/api" }, { url: "/" }]);
  });

  it("registers the shared map-style descriptor using Fastify path syntax", async () => {
    const app = await makeApp();
    const route = apiRoutes.public.mapStyle;
    app.get(route.makeExpressPathShape(), async (request) => ({
      theme: (request.params as { theme: string }).theme
    }));

    const response = await app.inject({ method: "GET", url: route.makeFullPath({ theme: "light" }) });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ theme: "light" });
  });

  it("allows only configured browser origins and supports credentials", async () => {
    const app = await makeApp();
    const allowed = await app.inject({
      method: "GET",
      url: "/_public/health",
      headers: { origin: "http://localhost:5173" }
    });
    const denied = await app.inject({
      method: "GET",
      url: "/_public/health",
      headers: { origin: "https://untrusted.example" }
    });
    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/_user/me",
      headers: {
        origin: "http://localhost:5173",
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization"
      }
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(allowed.headers["access-control-allow-credentials"]).toBe("true");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(preflight.headers["access-control-allow-headers"]).toContain("authorization");
  });

  // Probed through `/docs/json` rather than the health check: `/_public/health` is exempt from the
  // throttle (see `ApiRouteMeta.rateLimitExempt`), so a limiter test that used it would stop testing the
  // limiter the moment the exemption landed and still pass on status codes alone.
  it("ignores spoofed forwarded IP headers unless the proxy is trusted", async () => {
    const app = await makeApp({ rateLimitMax: 1 });
    const first = await app.inject({
      method: "GET",
      url: "/docs/json",
      headers: { "x-forwarded-for": "203.0.113.1" }
    });
    const second = await app.inject({
      method: "GET",
      url: "/docs/json",
      headers: { "x-forwarded-for": "203.0.113.2" }
    });

    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(429);
    expect(second.json()).toMatchObject({ error: true, code: "RATE_LIMITED", issues: [] });
  });

  it("uses the forwarded client IP when the immediate proxy is allowlisted", async () => {
    const app = await makeApp({ rateLimitMax: 1, trustedProxyIps: ["127.0.0.1"] });
    const firstClient = await app.inject({
      method: "GET",
      url: "/docs/json",
      headers: { "x-forwarded-for": "203.0.113.1" }
    });
    const secondClient = await app.inject({
      method: "GET",
      url: "/docs/json",
      headers: { "x-forwarded-for": "203.0.113.2" }
    });
    const repeatedClient = await app.inject({
      method: "GET",
      url: "/docs/json",
      headers: { "x-forwarded-for": "203.0.113.1" }
    });

    expect(firstClient.statusCode).toBe(200);
    expect(secondClient.statusCode).toBe(200);
    expect(repeatedClient.statusCode).toBe(429);
  });

  it("keeps Fastify's registered routes, OpenAPI runtime status, and docs/API.md in strict parity", async () => {
    const app = await makeApp();
    await app.ready();

    const specResponse = await app.inject({ method: "GET", url: "/docs/json" });
    expect(specResponse.statusCode).toBe(200);
    const document = specResponse.json() as {
      info: { description: string };
      paths: NonNullable<Parameters<typeof describeOpenApiRuntimeStatus>[0]>;
    };

    // Every single shared route descriptor's `x-borobiya-runtime-status` must match whether a real
    // Fastify handler is mounted on `app` — neither stale `contract-only` flags nor phantom `implemented`
    // entries can slip past this assertion.
    for (const route of allApiRoutes) {
      const typed = route as ApiRouteDefinition & {
        makeOpenApiPathShape: () => string;
        makeExpressPathShape: () => string;
      };
      const openApiPath = typed.makeOpenApiPathShape();
      const operation = document.paths[openApiPath]?.[typed.method.toLowerCase()];
      const mounted = app.hasRoute({
        method: typed.method,
        url: typed.makeExpressPathShape()
      });
      expect(
        operation?.["x-borobiya-runtime-status"],
        `${typed.method} ${typed.url} (${typed.meta.operationId})`
      ).toBe(mounted ? "implemented" : "contract-only");
    }

    expect(document.info.description).toBe(describeOpenApiRuntimeStatus(document.paths));
    expect(document.info.description).toContain("POST /_user/sos/requests");
    expect(document.info.description).toContain("POST /_user/sos/requests/{id}/photo");
    expect(document.info.description).not.toContain("SOS and mission operations are contract-only");

    const apiMarkdown = readFileSync(new URL("../../../docs/API.md", import.meta.url), "utf8");
    const tldrLine = apiMarkdown.split("\n").find((line) => line.startsWith("> TL;DR:")) ?? "";
    const stepFourLine = apiMarkdown.split("\n").find((line) => line.startsWith("4. The Swagger plugin")) ?? "";
    for (const summaryLine of [tldrLine, stepFourLine]) {
      expect(summaryLine).toContain(`POST ${apiRoutes.sos.createRequest.url}`);
      expect(summaryLine).toContain(`POST ${apiRoutes.sos.uploadRequestPhoto.url}`);
      expect(summaryLine).toContain(`GET ${apiRoutes.admin.listSosRequests.url}`);
      expect(summaryLine).toContain(`GET ${apiRoutes.admin.getSosRequest.url}`);
      expect(summaryLine).toContain(`GET ${apiRoutes.admin.getNearestResponders.url}`);
      expect(summaryLine).toContain(`POST ${apiRoutes.admin.dispatchSosRequest.url}`);
    }
    expect(apiMarkdown).not.toContain("SOS, mission, and the remaining search operations");
    expect(apiMarkdown).not.toContain("and the upload endpoint remain contract-only");
    expect(apiMarkdown).toContain(SHARE_ENDED_EVENT);
    expect(apiMarkdown).toContain("sos:new-request");
    expect(apiMarkdown).toContain("sos:proposal-received");
  });
});
