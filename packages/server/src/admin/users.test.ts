import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import type { AdminActorRecord, AdminCreatedUserRecord, AdminUserStore } from "../db/admin-user-store";
import { registerAdminUserRoutes } from "./users";
import { signAccessToken, signRefreshToken } from "../security/tokens";

const jwtSecret = "a".repeat(48);
const userId = randomUUID();
const adminIdentity = {
  userId,
  role: "admin" as const,
  deviceId: randomUUID(),
  sessionId: randomUUID()
};
const ordinaryUserIdentity = { ...adminIdentity, role: "user" as const };
const createdAt = new Date("2026-10-18T12:00:00.000Z");
const defaultCreatedUser: AdminCreatedUserRecord = {
  id: randomUUID(),
  username: "new_responder",
  role: "user",
  isActive: true,
  mustCompleteSecurityQuestions: true,
  avgRating: null,
  createdAt
};
const activeAdmin: AdminActorRecord = { role: "admin", isActive: true, isSuspended: false };
const validBody = { username: "new_responder", password: "CorrectHorseBattery9" };
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeStore(options: {
  actor?: AdminActorRecord | null;
  createdUser?: AdminCreatedUserRecord | null;
} = {}) {
  const actor = options.actor === undefined ? activeAdmin : options.actor;
  const createdUser = options.createdUser === undefined ? defaultCreatedUser : options.createdUser;
  const findAdminActorById = vi.fn<AdminUserStore["findAdminActorById"]>(async () => actor);
  const createAdminCreatedUser = vi.fn<AdminUserStore["createAdminCreatedUser"]>(async () => createdUser);
  return {
    store: { findAdminActorById, createAdminCreatedUser },
    findAdminActorById,
    createAdminCreatedUser
  };
}

async function makeApp(
  store: AdminUserStore,
  hashPassword = vi.fn(async (password: string) => `argon2id:${password}`)
) {
  const app = Fastify({ logger: false });
  await registerAdminUserRoutes(app, { store, jwtSecret, hashPassword });
  apps.push(app);
  return { app, hashPassword };
}

async function adminToken() {
  return signAccessToken(adminIdentity, jwtSecret);
}

async function userToken() {
  return signAccessToken(ordinaryUserIdentity, jwtSecret);
}

async function expiredAdminToken() {
  const issuedAt = Math.floor(Date.now() / 1000) - 60;
  return new SignJWT({
    role: "admin",
    deviceId: adminIdentity.deviceId,
    sessionId: adminIdentity.sessionId,
    tokenUse: "access"
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setJti(randomUUID())
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 30)
    .sign(new TextEncoder().encode(jwtSecret));
}

describe("POST /_admin/users", () => {
  it("creates a user without answers and requires security-question completion", async () => {
    const mocks = makeStore();
    const { app, hashPassword } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "POST",
      url: "/_admin/users",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: validBody
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      id: defaultCreatedUser.id,
      username: "new_responder",
      role: "user",
      mustCompleteSecurityQuestions: true,
      isActive: true,
      avgRating: null,
      createdAt: createdAt.toISOString()
    });
    expect(hashPassword).toHaveBeenCalledWith(validBody.password);
    expect(mocks.findAdminActorById).toHaveBeenCalledWith(userId);
    expect(mocks.createAdminCreatedUser).toHaveBeenCalledWith({
      username: validBody.username,
      passwordHash: `argon2id:${validBody.password}`
    });
  });

  it("honors an explicitly inactive initial state", async () => {
    const inactiveUser = { ...defaultCreatedUser, isActive: false };
    const mocks = makeStore({ createdUser: inactiveUser });
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "POST",
      url: "/_admin/users",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: { ...validBody, isActive: false }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json().isActive).toBe(false);
    expect(mocks.createAdminCreatedUser).toHaveBeenCalledWith({
      username: validBody.username,
      passwordHash: `argon2id:${validBody.password}`,
      isActive: false
    });
  });

  it.each([
    ["missing", undefined],
    ["malformed bearer scheme", "Basic not-a-bearer-token"],
    ["malformed token", "Bearer invalid-token"],
    ["invalid signature", "invalid-signature"],
    ["expired access token", "expired"],
    ["wrong token use", "refresh"]
  ])("rejects %s authorization with 401", async (_name, authorization) => {
    const mocks = makeStore();
    const { app } = await makeApp(mocks.store);
    let header = authorization;
    if (authorization === "invalid-signature") {
      header = `Bearer ${await signAccessToken(adminIdentity, "c".repeat(48))}`;
    } else if (authorization === "expired") {
      header = `Bearer ${await expiredAdminToken()}`;
    } else if (authorization === "refresh") {
      header = `Bearer ${await signRefreshToken(adminIdentity, jwtSecret)}`;
    }
    const response = await app.inject({
      method: "POST",
      url: "/_admin/users",
      ...(header === undefined ? {} : { headers: { authorization: header } }),
      payload: validBody
    });

    expect(response.statusCode).toBe(401);
    expect(mocks.findAdminActorById).not.toHaveBeenCalled();
    expect(mocks.createAdminCreatedUser).not.toHaveBeenCalled();
  });

  it("rejects a signed access token with an invalid user identifier before a database lookup", async () => {
    const mocks = makeStore();
    const { app } = await makeApp(mocks.store);
    const token = await signAccessToken({ ...adminIdentity, userId: "not-a-uuid" }, jwtSecret);
    const response = await app.inject({
      method: "POST",
      url: "/_admin/users",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("INVALID_ACCESS_TOKEN");
    expect(mocks.findAdminActorById).not.toHaveBeenCalled();
  });

  it("denies a valid non-admin access token", async () => {
    const mocks = makeStore();
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "POST",
      url: "/_admin/users",
      headers: { authorization: `Bearer ${await userToken()}` },
      payload: validBody
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe("ADMIN_REQUIRED");
    expect(mocks.findAdminActorById).not.toHaveBeenCalled();
    expect(mocks.createAdminCreatedUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ role: "admin", isActive: false, isSuspended: false }, "ACCOUNT_INACTIVE"],
    [{ role: "admin", isActive: true, isSuspended: true }, "ACCOUNT_SUSPENDED"],
    [{ role: "user", isActive: true, isSuspended: false }, "ADMIN_REQUIRED"],
    [null, "ADMIN_REQUIRED"]
  ] as const)("rejects a no-longer-authorized admin account", async (actor, code) => {
    const mocks = makeStore({ actor });
    const hashPassword = vi.fn(async (password: string) => `argon2id:${password}`);
    const { app } = await makeApp(mocks.store, hashPassword);
    const response = await app.inject({
      method: "POST",
      url: "/_admin/users",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: validBody
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe(code);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(mocks.createAdminCreatedUser).not.toHaveBeenCalled();
  });

  it("rejects unexpected security-answer fields rather than storing them", async () => {
    const mocks = makeStore();
    const hashPassword = vi.fn(async (password: string) => `argon2id:${password}`);
    const { app } = await makeApp(mocks.store, hashPassword);
    const response = await app.inject({
      method: "POST",
      url: "/_admin/users",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: { ...validBody, securityQuestions: [] }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
    expect(hashPassword).not.toHaveBeenCalled();
    expect(mocks.createAdminCreatedUser).not.toHaveBeenCalled();
  });

  it("returns a conflict when another request already claimed the username", async () => {
    const mocks = makeStore({ createdUser: null });
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "POST",
      url: "/_admin/users",
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: validBody
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("USERNAME_TAKEN");
  });
});
