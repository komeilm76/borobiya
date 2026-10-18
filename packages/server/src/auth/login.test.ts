import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { jwtVerify } from "jose";
import type { UserRegistrationStore } from "../db/registration-store";
import type { LoginSessionInput, LoginUserRecord, UserLoginStore } from "../db/login-store";
import { createFastifyApp } from "../app";
import { parseServerEnv } from "../config/env";
import { DUMMY_LOGIN_PASSWORD_HASH, type PasswordVerifier } from "./login";
import { hashPassword } from "../security/password";
import { hashRefreshToken, REFRESH_TOKEN_TTL_SECONDS } from "../security/tokens";

const testConfig = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173"
});

const baseUser: LoginUserRecord = {
  id: "00000000-0000-4000-8000-000000000099",
  username: "rescue_user1",
  passwordHash: "stored-argon2-hash",
  role: "user",
  isActive: true,
  isSuspended: false,
  mustCompleteSecurityQuestions: false
};

const loginPayload = { username: "rescue_user1", password: "safePass123" };
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeLoginStore(options: { user?: LoginUserRecord | null } = {}) {
  const calls = {
    usernames: [] as string[],
    sessions: [] as LoginSessionInput[]
  };
  const configuredUser = options.user === undefined ? baseUser : options.user;
  const store: UserLoginStore = {
    async findUserByUsername(username) {
      calls.usernames.push(username);
      return configuredUser ? { ...configuredUser, username } : null;
    },
    async createSession(session) {
      calls.sessions.push(session);
    },
    async findSessionByRefreshTokenHash() { return null; },
    async rotateRefreshToken() { return false; },
    async revokeSession() { return false; },
    async revokeSessionByRefreshTokenHash() { return false; }
  };
  return { store, calls };
}

const registrationStore: UserRegistrationStore = {
  async usernameExists() { return false; },
  async securityQuestionsExist() { return true; },
  async createUserWithAnswers() { return null; }
};

async function makeApp(store: UserLoginStore, verifyPassword?: PasswordVerifier): Promise<FastifyInstance> {
  const app = await createFastifyApp(testConfig, {
    registrationStore,
    loginStore: store,
    verifyPassword
  });
  apps.push(app);
  return app;
}

function cookieToken(response: Awaited<ReturnType<FastifyInstance["inject"]>>): string {
  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (typeof cookie !== "string") throw new Error("Expected a refresh-token cookie.");
  const match = /^refreshToken=([^;]+)/.exec(cookie);
  if (!match?.[1]) throw new Error("Refresh-token cookie value was missing.");
  return decodeURIComponent(match[1]);
}

describe("POST /_auth/login", () => {
  it("issues short/long-lived JWTs, persists a refresh-token hash, and keeps web refresh tokens in an HttpOnly cookie", async () => {
    const { store, calls } = makeLoginStore();
    const app = await makeApp(store, async (hash, password) => hash === "stored-argon2-hash" && password === loginPayload.password);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/login",
      headers: { origin: "http://localhost:5173", "user-agent": "Borobiya Web Test" },
      payload: loginPayload
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.user).toEqual({
      id: baseUser.id,
      username: loginPayload.username,
      role: "user",
      mustCompleteSecurityQuestions: false
    });
    expect(body.accessToken).toEqual(expect.any(String));
    expect(body).not.toHaveProperty("refreshToken");
    expect(response.headers["cache-control"]).toBe("no-store");

    const access = await jwtVerify(body.accessToken, new TextEncoder().encode(testConfig.jwtSecret));
    expect(access.payload).toMatchObject({
      sub: baseUser.id,
      role: "user",
      tokenUse: "access"
    });
    expect(access.payload.exp! - access.payload.iat!).toBe(15 * 60);

    const refreshToken = cookieToken(response);
    const refresh = await jwtVerify(refreshToken, new TextEncoder().encode(testConfig.jwtRefreshSecret));
    expect(refresh.payload).toMatchObject({
      sub: baseUser.id,
      role: "user",
      tokenUse: "refresh"
    });
    expect(refresh.payload.exp! - refresh.payload.iat!).toBe(REFRESH_TOKEN_TTL_SECONDS);

    const cookie = response.headers["set-cookie"] as string;
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(calls.sessions).toHaveLength(1);
    expect(calls.sessions[0]).toMatchObject({
      userId: baseUser.id,
      deviceName: "Borobiya Web Test",
      ip: expect.any(String),
      isOnline: true
    });
    expect(calls.sessions[0]?.refreshTokenHash).toBe(hashRefreshToken(refreshToken));
    expect(refresh.payload.sessionId).toBe(calls.sessions[0]?.id);
    expect(refresh.payload.jti).not.toBe(calls.sessions[0]?.id);
    expect(refresh.payload.deviceId).toBe(calls.sessions[0]?.deviceId);
  });

  it("verifies stored Argon2id password hashes using the production verifier", async () => {
    const passwordHash = await hashPassword(loginPayload.password);
    const { store, calls } = makeLoginStore({ user: { ...baseUser, passwordHash } });
    const app = await makeApp(store);

    const response = await app.inject({ method: "POST", url: "/_auth/login", payload: loginPayload });

    expect(response.statusCode).toBe(200);
    expect(calls.sessions).toHaveLength(1);
  });

  it("returns the refresh token in the response body for native clients without Origin", async () => {
    const { store } = makeLoginStore();
    const app = await makeApp(store, async () => true);

    const response = await app.inject({ method: "POST", url: "/_auth/login", payload: loginPayload });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      user: { id: baseUser.id, username: loginPayload.username }
    });
    expect(response.headers["set-cookie"]).toBeUndefined();
  });

  it("returns the same INVALID_CREDENTIALS error for unknown users and wrong passwords", async () => {
    const wrongPasswordStore = makeLoginStore();
    const wrongPasswordApp = await makeApp(wrongPasswordStore.store, async () => false);
    const wrongPassword = await wrongPasswordApp.inject({ method: "POST", url: "/_auth/login", payload: loginPayload });

    const unknownUserStore = makeLoginStore({ user: null });
    const unknownUserApp = await makeApp(unknownUserStore.store, async (hash) => {
      expect(hash).toBe(DUMMY_LOGIN_PASSWORD_HASH);
      return false;
    });
    const unknownUser = await unknownUserApp.inject({ method: "POST", url: "/_auth/login", payload: loginPayload });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(wrongPassword.json()).toEqual(unknownUser.json());
    expect(wrongPassword.json()).toMatchObject({ error: true, code: "INVALID_CREDENTIALS" });
    expect(wrongPasswordStore.calls.sessions).toEqual([]);
    expect(unknownUserStore.calls.sessions).toEqual([]);
  });

  it("uses the configured Argon2id dummy hash for missing accounts", async () => {
    const { store } = makeLoginStore({ user: null });
    const app = await makeApp(store);

    const response = await app.inject({ method: "POST", url: "/_auth/login", payload: loginPayload });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "INVALID_CREDENTIALS" });
  });

  it.each([
    ["inactive", { ...baseUser, isActive: false }, "ACCOUNT_INACTIVE"],
    ["suspended", { ...baseUser, isSuspended: true }, "ACCOUNT_SUSPENDED"]
  ] as const)("does not create a session for %s accounts", async (_state, user, code) => {
    const { store, calls } = makeLoginStore({ user });
    const app = await makeApp(store, async () => true);

    const response = await app.inject({ method: "POST", url: "/_auth/login", payload: loginPayload });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: true, code });
    expect(calls.sessions).toEqual([]);
  });

  it("returns the required-security-questions flag while issuing a session to complete onboarding", async () => {
    const { store, calls } = makeLoginStore({ user: { ...baseUser, mustCompleteSecurityQuestions: true } });
    const app = await makeApp(store, async () => true);

    const response = await app.inject({ method: "POST", url: "/_auth/login", payload: loginPayload });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ user: { mustCompleteSecurityQuestions: true } });
    expect(calls.sessions).toHaveLength(1);
  });

  it("rejects authenticated and invalid requests before touching the login store", async () => {
    const { store, calls } = makeLoginStore();
    const verifierCalls: string[] = [];
    const app = await makeApp(store, async (_hash, password) => {
      verifierCalls.push(password);
      return true;
    });

    const authenticated = await app.inject({
      method: "POST",
      url: "/_auth/login",
      headers: { authorization: "Bearer current-access-token" },
      payload: loginPayload
    });
    const invalid = await app.inject({
      method: "POST",
      url: "/_auth/login",
      payload: { username: "ab", password: "x", unexpected: true }
    });

    expect(authenticated.statusCode).toBe(403);
    expect(authenticated.json()).toMatchObject({ code: "ALREADY_AUTHENTICATED" });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(calls.usernames).toEqual([]);
    expect(verifierCalls).toEqual([]);
  });

  it("limits attempts to five per IP and username", async () => {
    const { store } = makeLoginStore();
    const app = await makeApp(store, async () => true);
    const responses = await Promise.all(Array.from({ length: 6 }, () =>
      app.inject({ method: "POST", url: "/_auth/login", payload: loginPayload })
    ));

    expect(responses.slice(0, 5).map(({ statusCode }) => statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(responses[5]?.statusCode).toBe(429);
    expect(responses[5]?.json()).toMatchObject({ code: "RATE_LIMITED" });

    const anotherUsername = await app.inject({
      method: "POST",
      url: "/_auth/login",
      payload: { ...loginPayload, username: "rescue_user2" }
    });
    expect(anotherUsername.statusCode).toBe(200);
  });
});
