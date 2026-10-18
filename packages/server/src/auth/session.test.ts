import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import type { UserRegistrationStore } from "../db/registration-store";
import type { UserRecoveryStore } from "../db/recovery-store";
import type {
  LoginSessionInput,
  LoginUserRecord,
  RefreshSessionRecord,
  UserLoginStore
} from "../db/login-store";
import { createFastifyApp } from "../app";
import { parseServerEnv } from "../config/env";
import { hashRefreshToken, signRefreshToken, type SessionTokenIdentity } from "../security/tokens";

const testConfig = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173"
});

const identity: SessionTokenIdentity = {
  userId: "00000000-0000-4000-8000-000000000099",
  role: "user",
  deviceId: "00000000-0000-4000-8000-000000000088",
  sessionId: "00000000-0000-4000-8000-000000000077"
};

const baseSession: RefreshSessionRecord = {
  id: identity.sessionId,
  userId: identity.userId,
  deviceId: identity.deviceId,
  refreshTokenHash: "",
  role: "user",
  isActive: true,
  isSuspended: false
};

const registrationStore: UserRegistrationStore = {
  async usernameExists() { return false; },
  async securityQuestionsExist() { return true; },
  async createUserWithAnswers() { return null; }
};
const recoveryStore: UserRecoveryStore = {
  async findAccountByUsername() { return null; },
  async listSecurityQuestions() { return []; },
  async saveRecoveryChallenge() { return null; },
  async findActiveRecoveryChallenge() { return null; },
  async issuePasswordResetToken() { return false; },
  async isPasswordResetTokenValid() { return false; },
  async resetPasswordWithToken() { return false; }
};

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeSessionStore(options: {
  refreshTokenHash?: string | null;
  session?: Partial<RefreshSessionRecord>;
  rotateResult?: boolean;
} = {}) {
  const calls = {
    findHashes: [] as string[],
    rotations: [] as Array<{ sessionId: string; currentTokenHash: string; nextTokenHash: string; lastActiveAt: Date }>,
    revocations: [] as Array<{ sessionId: string; userId: string }>,
    hashRevocations: [] as string[]
  };
  const session = { ...baseSession, ...options.session };
  let currentTokenHash = options.refreshTokenHash ?? null;
  const store: UserLoginStore = {
    async findUserByUsername(_username: string): Promise<LoginUserRecord | null> { return null; },
    async createSession(_input: LoginSessionInput): Promise<void> {},
    async findSessionByRefreshTokenHash(tokenHash) {
      calls.findHashes.push(tokenHash);
      if (currentTokenHash !== tokenHash || currentTokenHash === null) return null;
      return { ...session, refreshTokenHash: currentTokenHash };
    },
    async rotateRefreshToken(input) {
      calls.rotations.push(input);
      if (
        options.rotateResult === false ||
        input.sessionId !== session.id ||
        currentTokenHash !== input.currentTokenHash
      ) return false;
      currentTokenHash = input.nextTokenHash;
      return true;
    },
    async revokeSession(sessionId, userId) {
      calls.revocations.push({ sessionId, userId });
      if (sessionId !== session.id || userId !== session.userId) return false;
      currentTokenHash = null;
      return true;
    },
    async revokeSessionByRefreshTokenHash(tokenHash) {
      calls.hashRevocations.push(tokenHash);
      if (currentTokenHash !== tokenHash || currentTokenHash === null) return false;
      currentTokenHash = null;
      return true;
    }
  };
  return {
    store,
    calls,
    get currentTokenHash() { return currentTokenHash; }
  };
}

async function makeApp(store: UserLoginStore): Promise<FastifyInstance> {
  const app = await createFastifyApp(testConfig, { registrationStore, loginStore: store, recoveryStore });
  apps.push(app);
  return app;
}

async function refreshToken(sessionIdentity: SessionTokenIdentity = identity): Promise<string> {
  return signRefreshToken(sessionIdentity, testConfig.jwtRefreshSecret);
}

function cookieToken(response: Awaited<ReturnType<FastifyInstance["inject"]>>): string {
  const setCookie = response.headers["set-cookie"];
  const cookie = Array.isArray(setCookie) ? setCookie[0] : setCookie;
  if (typeof cookie !== "string") throw new Error("Expected a refresh-token cookie.");
  const match = /^refreshToken=([^;]*)/.exec(cookie);
  if (!match?.[1]) throw new Error("Refresh-token cookie value was missing.");
  return decodeURIComponent(match[1]);
}

describe("POST /_auth/refresh", () => {
  it("rotates the persisted token and returns the replacement only as a browser cookie", async () => {
    const currentToken = await refreshToken();
    const state = makeSessionStore({ refreshTokenHash: hashRefreshToken(currentToken) });
    const app = await makeApp(state.store);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/refresh",
      headers: {
        origin: "http://localhost:5173",
        cookie: `refreshToken=${currentToken}`
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.vary).toBe("Origin");
    expect(response.json()).toMatchObject({ accessToken: expect.any(String) });
    expect(response.json()).not.toHaveProperty("refreshToken");
    const access = await jwtVerify(response.json().accessToken, new TextEncoder().encode(testConfig.jwtSecret));
    expect(access.payload).toMatchObject({ sub: identity.userId, sessionId: identity.sessionId, tokenUse: "access" });

    const nextToken = cookieToken(response);
    expect(nextToken).not.toBe(currentToken);
    const refresh = await jwtVerify(nextToken, new TextEncoder().encode(testConfig.jwtRefreshSecret));
    expect(refresh.payload).toMatchObject({
      sub: identity.userId,
      sessionId: identity.sessionId,
      deviceId: identity.deviceId,
      tokenUse: "refresh"
    });
    expect(refresh.payload.jti).not.toBe(identity.sessionId);
    expect(state.calls.findHashes).toEqual([hashRefreshToken(currentToken)]);
    expect(state.calls.rotations).toHaveLength(1);
    expect(state.calls.rotations[0]).toMatchObject({
      sessionId: identity.sessionId,
      currentTokenHash: hashRefreshToken(currentToken),
      nextTokenHash: hashRefreshToken(nextToken),
      lastActiveAt: expect.any(Date)
    });
    expect(state.currentTokenHash).toBe(hashRefreshToken(nextToken));
    expect(response.headers["set-cookie"]).toContain("HttpOnly");
    expect(response.headers["set-cookie"]).toContain("Secure");
    expect(response.headers["set-cookie"]).toContain("SameSite=Lax");
  });

  it("returns the replacement token in the JSON body for native clients", async () => {
    const currentToken = await refreshToken();
    const state = makeSessionStore({ refreshTokenHash: hashRefreshToken(currentToken) });
    const app = await makeApp(state.store);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/refresh",
      payload: { refreshToken: currentToken }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(state.currentTokenHash).toBe(hashRefreshToken(response.json().refreshToken));
  });

  it("uses a supplied body token before a cookie when both transports are present", async () => {
    const cookieTokenValue = await refreshToken();
    const bodyToken = await refreshToken({ ...identity, sessionId: "00000000-0000-4000-8000-000000000066" });
    const state = makeSessionStore({
      refreshTokenHash: hashRefreshToken(bodyToken),
      session: { id: "00000000-0000-4000-8000-000000000066" }
    });
    const app = await makeApp(state.store);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/refresh",
      headers: { cookie: `refreshToken=${cookieTokenValue}` },
      payload: { refreshToken: bodyToken }
    });

    expect(response.statusCode).toBe(200);
    expect(state.calls.findHashes).toEqual([hashRefreshToken(bodyToken)]);
  });

  it("rejects a missing token, malformed token, expired JWT, or token not persisted for a session", async () => {
    const validToken = await refreshToken();
    const wrongSignatureToken = await signRefreshToken(identity, "c".repeat(48));
    const wrongUseToken = await new SignJWT({
      role: identity.role,
      deviceId: identity.deviceId,
      sessionId: identity.sessionId,
      tokenUse: "access"
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(identity.userId)
      .setJti("00000000-0000-4000-8000-000000000044")
      .setIssuedAt()
      .setExpirationTime("15m")
      .sign(new TextEncoder().encode(testConfig.jwtRefreshSecret));
    const unpersistedState = makeSessionStore({ refreshTokenHash: hashRefreshToken(await refreshToken({
      ...identity,
      sessionId: "00000000-0000-4000-8000-000000000066"
    })) });
    const state = makeSessionStore();
    const app = await makeApp(state.store);

    const missing = await app.inject({ method: "POST", url: "/_auth/refresh" });
    const malformed = await app.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: "not-a-jwt" } });
    const wrongSignature = await app.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: wrongSignatureToken } });
    const wrongUse = await app.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: wrongUseToken } });
    const expiredToken = await new SignJWT({
      role: identity.role,
      deviceId: identity.deviceId,
      sessionId: identity.sessionId,
      tokenUse: "refresh"
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(identity.userId)
      .setJti("00000000-0000-4000-8000-000000000055")
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(new TextEncoder().encode(testConfig.jwtRefreshSecret));
    const expired = await app.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: expiredToken } });
    const unpersistedApp = await makeApp(unpersistedState.store);
    const unpersisted = await unpersistedApp.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: validToken } });

    for (const response of [missing, malformed, wrongSignature, wrongUse, expired, unpersisted]) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ error: true, code: "INVALID_REFRESH" });
    }
    expect(state.calls.findHashes).toEqual([]);
    expect(unpersistedState.calls.findHashes).toEqual([hashRefreshToken(validToken)]);
  });

  it("rejects mismatched session claims, authenticated requests, and invalid bodies", async () => {
    const token = await refreshToken();
    const state = makeSessionStore({
      refreshTokenHash: hashRefreshToken(token),
      session: { id: "00000000-0000-4000-8000-000000000066" }
    });
    const app = await makeApp(state.store);

    const mismatched = await app.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: token } });
    const authenticated = await app.inject({
      method: "POST",
      url: "/_auth/refresh",
      headers: { authorization: "Bearer existing-access-token" },
      payload: { refreshToken: token }
    });
    const invalidBody = await app.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: token, unexpected: true } });

    expect(mismatched.statusCode).toBe(401);
    expect(authenticated.statusCode).toBe(403);
    expect(authenticated.json()).toMatchObject({ code: "ALREADY_AUTHENTICATED" });
    expect(invalidBody.statusCode).toBe(400);
    expect(state.calls.rotations).toEqual([]);
  });

  it.each([
    ["inactive", { isActive: false, isSuspended: false }, "ACCOUNT_INACTIVE"],
    ["suspended", { isActive: true, isSuspended: true }, "ACCOUNT_SUSPENDED"]
  ] as const)("revokes sessions for %s accounts and clears the browser cookie", async (_stateName, accountState, code) => {
    const token = await refreshToken();
    const state = makeSessionStore({
      refreshTokenHash: hashRefreshToken(token),
      session: accountState
    });
    const app = await makeApp(state.store);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/refresh",
      headers: { origin: "http://localhost:5173", cookie: `refreshToken=${token}` }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code });
    expect(state.calls.revocations).toEqual([{ sessionId: identity.sessionId, userId: identity.userId }]);
    expect(state.currentTokenHash).toBeNull();
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");
  });

  it("accepts rollout-era refresh tokens whose jti contains the session ID", async () => {
    const legacyToken = await new SignJWT({
      role: identity.role,
      deviceId: identity.deviceId,
      tokenUse: "refresh"
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(identity.userId)
      .setJti(identity.sessionId)
      .setIssuedAt()
      .setExpirationTime("7d")
      .sign(new TextEncoder().encode(testConfig.jwtRefreshSecret));
    const state = makeSessionStore({ refreshTokenHash: hashRefreshToken(legacyToken) });
    const app = await makeApp(state.store);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/refresh",
      payload: { refreshToken: legacyToken }
    });

    expect(response.statusCode).toBe(200);
    expect(state.calls.rotations).toHaveLength(1);
  });

  it("allows only one concurrent request to rotate a given refresh token", async () => {
    const token = await refreshToken();
    const state = makeSessionStore({ refreshTokenHash: hashRefreshToken(token) });
    const app = await makeApp(state.store);

    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: token } }),
      app.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: token } })
    ]);

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 401]);
  });

  it("does not return rotated tokens when the atomic persisted-hash update loses a race", async () => {
    const token = await refreshToken();
    const state = makeSessionStore({ refreshTokenHash: hashRefreshToken(token), rotateResult: false });
    const app = await makeApp(state.store);

    const response = await app.inject({ method: "POST", url: "/_auth/refresh", payload: { refreshToken: token } });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "INVALID_REFRESH" });
    expect(response.json()).not.toHaveProperty("accessToken");
  });
});

describe("POST /_auth/logout", () => {
  it("revokes the authenticated session and expires the browser refresh cookie", async () => {
    const token = await refreshToken();
    const state = makeSessionStore({ refreshTokenHash: hashRefreshToken(token) });
    const app = await makeApp(state.store);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/logout",
      headers: { origin: "http://localhost:5173", cookie: `refreshToken=${token}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(response.headers["set-cookie"]).toContain("refreshToken=");
    expect(response.headers["set-cookie"]).toContain("Max-Age=0");
    expect(state.calls.revocations).toEqual([{ sessionId: identity.sessionId, userId: identity.userId }]);
    expect(state.currentTokenHash).toBeNull();
  });

  it("is idempotent for missing or invalid tokens and still clears the cookie", async () => {
    const storedToken = await refreshToken();
    const state = makeSessionStore({ refreshTokenHash: hashRefreshToken(storedToken) });
    const app = await makeApp(state.store);

    const missing = await app.inject({ method: "POST", url: "/_auth/logout" });
    const invalid = await app.inject({
      method: "POST",
      url: "/_auth/logout",
      headers: { origin: "http://localhost:5173", cookie: "refreshToken=not-a-jwt" }
    });

    expect(missing.statusCode).toBe(200);
    expect(invalid.statusCode).toBe(200);
    expect(missing.json()).toEqual({ ok: true });
    expect(invalid.json()).toEqual({ ok: true });
    expect(missing.headers["set-cookie"]).toContain("Max-Age=0");
    expect(invalid.headers["set-cookie"]).toContain("Max-Age=0");
    expect(state.calls.revocations).toEqual([]);
    expect(state.calls.hashRevocations).toEqual([hashRefreshToken("not-a-jwt")]);
    expect(state.currentTokenHash).toBe(hashRefreshToken(storedToken));
  });

  it("can clear a persisted session when the signed refresh token has expired", async () => {
    const expiredToken = await new SignJWT({
      role: identity.role,
      deviceId: identity.deviceId,
      sessionId: identity.sessionId,
      tokenUse: "refresh"
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setSubject(identity.userId)
      .setJti("00000000-0000-4000-8000-000000000055")
      .setIssuedAt(1)
      .setExpirationTime(2)
      .sign(new TextEncoder().encode(testConfig.jwtRefreshSecret));
    const state = makeSessionStore({ refreshTokenHash: hashRefreshToken(expiredToken) });
    const app = await makeApp(state.store);

    const response = await app.inject({ method: "POST", url: "/_auth/logout", payload: { refreshToken: expiredToken } });

    expect(response.statusCode).toBe(200);
    expect(state.calls.hashRevocations).toEqual([hashRefreshToken(expiredToken)]);
    expect(state.currentTokenHash).toBeNull();
  });

  it("rejects authenticated and invalid-body requests without revoking a session", async () => {
    const token = await refreshToken();
    const state = makeSessionStore({ refreshTokenHash: hashRefreshToken(token) });
    const app = await makeApp(state.store);

    const authenticated = await app.inject({
      method: "POST",
      url: "/_auth/logout",
      headers: { authorization: "Bearer existing-access-token" },
      payload: { refreshToken: token }
    });
    const invalidBody = await app.inject({
      method: "POST",
      url: "/_auth/logout",
      payload: { refreshToken: token, unexpected: true }
    });

    expect(authenticated.statusCode).toBe(403);
    expect(invalidBody.statusCode).toBe(400);
    expect(state.calls.revocations).toEqual([]);
    expect(state.calls.hashRevocations).toEqual([]);
  });
});
