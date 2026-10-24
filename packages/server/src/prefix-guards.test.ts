import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AdminUserStore } from "./db/admin-user-store";
import type { UserSecurityQuestionsStore } from "./db/security-questions-store";
import { parseServerEnv } from "./config/env";
import { createFastifyApp } from "./app";
import { signAccessToken } from "./security/tokens";

const secret = "a".repeat(48);
const userId = randomUUID();
const adminId = randomUUID();
const deviceId = randomUUID();
const sessionId = randomUUID();
const config = parseServerEnv({ NODE_ENV: "test", DATABASE_URL: "postgresql://test:test@localhost:5432/borobiya_test",
  JWT_SECRET: secret, JWT_REFRESH_SECRET: "b".repeat(48), CORS_ORIGINS: "http://localhost:5173",
  RATE_LIMIT_MAX: "1000" });
const apps: FastifyInstance[] = [];
const account = { id: userId, username: "ordinary_user", role: "user" as const,
  isActive: true, isSuspended: false, mustCompleteSecurityQuestions: false, avgRating: null, createdAt: new Date() };

async function makeApp() {
  const findUserById = vi.fn(async (id: string) => id === userId ? account : null);
  const hasUserSession = vi.fn(async () => true);
  const securityQuestionsStore = { findUserById, hasActiveSession: hasUserSession } as unknown as UserSecurityQuestionsStore;
  const findAdminActorById = vi.fn(async () => ({ role: "admin", isActive: true, isSuspended: false }));
  const hasAdminSession = vi.fn(async () => true);
  const listUsers = vi.fn(async () => ({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 }));
  const adminUserStore = { findAdminActorById, hasActiveSession: hasAdminSession, listUsers } as unknown as AdminUserStore;
  const app = await createFastifyApp(config, { securityQuestionsStore, adminUserStore });
  apps.push(app);
  return { app, findUserById, hasUserSession, findAdminActorById, hasAdminSession, listUsers };
}
afterEach(async () => { await Promise.all(apps.splice(0).map((app) => app.close())); });
const userToken = () => signAccessToken({ userId, role: "user", deviceId, sessionId }, secret);
const adminToken = () => signAccessToken({ userId: adminId, role: "admin", deviceId, sessionId }, secret);

/** T4.5.2: exercise the mounted app so prefix and route registration actually participate. */
describe("HTTP prefix guards", () => {
  it("rejects already-authenticated guest mutations before parsing bodies or doing database work", async () => {
    const { app, findUserById, findAdminActorById } = await makeApp();
    const authorization = `Bearer ${await userToken()}`;
    for (const url of ["/_auth/register", "/_auth/login", "/_auth/refresh", "/_auth/logout",
      "/_auth/forgot-password/request", "/_auth/forgot-password/verify", "/_auth/forgot-password/reset"]) {
      const response = await app.inject({ method: "POST", url, headers: { authorization }, payload: { bogus: true } });
      expect(response.statusCode, url).toBe(403);
      expect(response.json(), url).toMatchObject({ error: true, code: "ALREADY_AUTHENTICATED" });
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect(findUserById).not.toHaveBeenCalled();
    expect(findAdminActorById).not.toHaveBeenCalled();
  });

  it("refuses an ordinary user's bearer on all three admin prefixes before any admin query", async () => {
    const { app, findAdminActorById, hasAdminSession, listUsers } = await makeApp();
    const authorization = `Bearer ${await userToken()}`;
    for (const url of ["/_admin/users", "/_admin/incidents", "/_admin/categories", "/_admin/sos/requests"]) {
      const response = await app.inject({ method: "GET", url, headers: { authorization } });
      expect(response.statusCode, url).toBe(403);
      expect(response.json(), url).toMatchObject({ error: true, code: "ADMIN_REQUIRED" });
      expect(response.headers["cache-control"]).toBe("no-store");
    }
    expect(findAdminActorById).not.toHaveBeenCalled();
    expect(hasAdminSession).not.toHaveBeenCalled();
    expect(listUsers).not.toHaveBeenCalled();
  });

  it("allows a real user on /_user, enforces admin session on /_admin, and never exposes DELETE users", async () => {
    const { app, findUserById, hasUserSession, findAdminActorById, hasAdminSession, listUsers } = await makeApp();
    const userAuthorization = `Bearer ${await userToken()}`;
    const anonymous = await app.inject({ method: "GET", url: "/_user/me" });
    expect(anonymous.statusCode).toBe(401);
    expect(anonymous.json()).toMatchObject({ code: "UNAUTHORIZED" });
    const profile = await app.inject({ method: "GET", url: "/_user/me", headers: { authorization: userAuthorization } });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toMatchObject({ id: userId, username: "ordinary_user" });
    expect(findUserById).toHaveBeenCalledWith(userId);
    expect(hasUserSession).toHaveBeenCalledOnce();

    const adminAuthorization = `Bearer ${await adminToken()}`;
    const adminList = await app.inject({ method: "GET", url: "/_admin/users", headers: { authorization: adminAuthorization } });
    expect(adminList.statusCode).toBe(200);
    expect(adminList.json()).toMatchObject({ items: [], total: 0 });
    expect(findAdminActorById).toHaveBeenCalledWith(adminId);
    expect(hasAdminSession).toHaveBeenCalledOnce();
    expect(listUsers).toHaveBeenCalledOnce();
    for (const authorization of [userAuthorization, adminAuthorization]) {
      const deletion = await app.inject({ method: "DELETE", url: `/_admin/users/${userId}`, headers: { authorization } });
      expect(deletion.statusCode).toBe(404);
      expect(deletion.headers["cache-control"]).toBe("no-store");
    }
    expect(listUsers).toHaveBeenCalledOnce();
    const swagger = await app.inject({ method: "GET", url: "/docs/json" });
    expect(swagger.json().paths["/_admin/users/{id}"]).not.toHaveProperty("delete");
    expect((await app.inject({ method: "GET", url: "/_userish/me", headers: { authorization: userAuthorization } })).statusCode).toBe(404);
  });
});
