import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import type {
  AdminActorRecord,
  AdminUserDetailRecord,
  AdminUserListResult,
  AdminUserRecord,
  AdminUserStore
} from "../db/admin-user-store";
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
const defaultCreatedUser: AdminUserRecord = {
  id: randomUUID(),
  username: "new_responder",
  role: "user",
  isActive: true,
  mustCompleteSecurityQuestions: true,
  avgRating: null,
  createdAt
};
const defaultUsersPage: AdminUserListResult = {
  items: [defaultCreatedUser],
  total: 1,
  page: 1,
  limit: 20,
  totalPages: 1
};
const defaultUserDetail: AdminUserDetailRecord = {
  ...defaultCreatedUser,
  devices: [],
  missions: []
};
const activeAdmin: AdminActorRecord = { role: "admin", isActive: true, isSuspended: false };
const validBody = { username: "new_responder", password: "CorrectHorseBattery9" };
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeStore(options: {
  actor?: AdminActorRecord | null;
  sessionActive?: boolean;
  listResult?: AdminUserListResult;
  userDetail?: AdminUserDetailRecord | null;
  createdUser?: AdminUserRecord | null;
  statusUser?: AdminUserRecord | null;
} = {}) {
  const actor = options.actor === undefined ? activeAdmin : options.actor;
  const listResult = options.listResult === undefined ? defaultUsersPage : options.listResult;
  const userDetail = options.userDetail === undefined ? defaultUserDetail : options.userDetail;
  const createdUser = options.createdUser === undefined ? defaultCreatedUser : options.createdUser;
  const statusUser = options.statusUser === undefined ? { ...defaultCreatedUser, isActive: false } : options.statusUser;
  const findAdminActorById = vi.fn<AdminUserStore["findAdminActorById"]>(async () => actor);
  const hasActiveSession = vi.fn<AdminUserStore["hasActiveSession"]>(async () => options.sessionActive ?? true);
  const listUsers = vi.fn<AdminUserStore["listUsers"]>(async () => listResult);
  const getUserDetails = vi.fn<AdminUserStore["getUserDetails"]>(async () => userDetail);
  const createAdminCreatedUser = vi.fn<AdminUserStore["createAdminCreatedUser"]>(async () => createdUser);
  const updateUserActiveStatus = vi.fn<AdminUserStore["updateUserActiveStatus"]>(async () => statusUser);
  return {
    store: { findAdminActorById, hasActiveSession, listUsers, getUserDetails, createAdminCreatedUser, updateUserActiveStatus },
    findAdminActorById,
    hasActiveSession,
    listUsers,
    getUserDetails,
    createAdminCreatedUser,
    updateUserActiveStatus
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

describe("GET /_admin/users", () => {
  it("validates filters and pagination, then returns a no-store profile page", async () => {
    const result: AdminUserListResult = {
      items: [defaultCreatedUser],
      total: 6,
      page: 2,
      limit: 5,
      totalPages: 2
    };
    const mocks = makeStore({ listResult: result });
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "GET",
      url: "/_admin/users?q=%20responder%20&isActive=false&hasCategory=false&page=2&limit=5",
      headers: { authorization: `Bearer ${await adminToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      items: [{
        id: defaultCreatedUser.id,
        username: defaultCreatedUser.username,
        role: "user",
        mustCompleteSecurityQuestions: true,
        isActive: true,
        avgRating: null,
        createdAt: createdAt.toISOString()
      }],
      total: 6,
      page: 2,
      limit: 5,
      totalPages: 2
    });
    expect(mocks.hasActiveSession).toHaveBeenCalledWith({
      userId: adminIdentity.userId,
      sessionId: adminIdentity.sessionId,
      deviceId: adminIdentity.deviceId
    });
    expect(mocks.listUsers).toHaveBeenCalledWith({
      q: "responder",
      isActive: false,
      hasCategory: false,
      page: 2,
      limit: 5
    });
  });

  it("rejects invalid query parameters and non-admin requests before listing", async () => {
    const mocks = makeStore();
    const { app } = await makeApp(mocks.store);
    const invalidQuery = await app.inject({
      method: "GET",
      url: "/_admin/users?isActive=perhaps",
      headers: { authorization: `Bearer ${await adminToken()}` }
    });
    const guestRequest = await app.inject({ method: "GET", url: "/_admin/users" });

    expect(invalidQuery.statusCode).toBe(400);
    expect(invalidQuery.json().code).toBe("VALIDATION_ERROR");
    expect(guestRequest.statusCode).toBe(401);
    expect(guestRequest.json().code).toBe("UNAUTHORIZED");
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });
});

describe("admin access session revocation", () => {
  it("rejects a still-signed access token after its persisted session was revoked", async () => {
    const mocks = makeStore({ sessionActive: false });
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "GET",
      url: "/_admin/users",
      headers: { authorization: `Bearer ${await adminToken()}` }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("INVALID_ACCESS_TOKEN");
    expect(mocks.hasActiveSession).toHaveBeenCalledWith({
      userId: adminIdentity.userId,
      sessionId: adminIdentity.sessionId,
      deviceId: adminIdentity.deviceId
    });
    expect(mocks.listUsers).not.toHaveBeenCalled();
  });
});

describe("GET /_admin/users/:id", () => {
  const targetId = randomUUID();

  it("returns a user's profile, devices, and missions", async () => {
    const sessionId = randomUUID();
    const deviceUuid = "71e5295a-9381-4bc5-844c-3cf0f52df30e";
    const detail: AdminUserDetailRecord = {
      ...defaultCreatedUser,
      id: targetId,
      devices: [{
        id: sessionId,
        deviceId: deviceUuid,
        deviceName: "Firefox on Linux",
        ip: "192.0.2.4",
        isCurrentDevice: false,
        lastActiveAt: createdAt,
        isOnline: true
      }],
      missions: [{
        id: randomUUID(),
        sosRequestId: randomUUID(),
        rescuerId: targetId,
        requesterId: randomUUID(),
        status: "pending",
        cancelledBy: null,
        cancellationReasonId: null,
        cancellationCustomText: null,
        cancelledAt: null,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString()
      }]
    };
    const mocks = makeStore({ userDetail: detail });
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "GET",
      url: `/_admin/users/${targetId}`,
      headers: { authorization: `Bearer ${await adminToken()}` }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      id: targetId,
      username: "new_responder",
      role: "user",
      mustCompleteSecurityQuestions: true,
      isActive: true,
      avgRating: null,
      createdAt: createdAt.toISOString(),
      devices: [{
        id: sessionId,
        deviceId: deviceUuid,
        deviceName: "Firefox on Linux",
        ip: "192.0.2.4",
        isCurrentDevice: false,
        lastActiveAt: createdAt.toISOString(),
        isOnline: true
      }],
      missions: detail.missions
    });
    expect(mocks.getUserDetails).toHaveBeenCalledWith(targetId, adminIdentity.sessionId);
  });

  it("rejects invalid IDs and returns 404 for users that do not exist", async () => {
    const mocks = makeStore({ userDetail: null });
    const { app } = await makeApp(mocks.store);
    const invalidId = await app.inject({
      method: "GET",
      url: "/_admin/users/not-a-uuid",
      headers: { authorization: `Bearer ${await adminToken()}` }
    });
    const missingUser = await app.inject({
      method: "GET",
      url: `/_admin/users/${randomUUID()}`,
      headers: { authorization: `Bearer ${await adminToken()}` }
    });

    expect(invalidId.statusCode).toBe(400);
    expect(invalidId.json().code).toBe("VALIDATION_ERROR");
    expect(missingUser.statusCode).toBe(404);
    expect(missingUser.json().code).toBe("USER_NOT_FOUND");
    expect(mocks.getUserDetails).toHaveBeenCalledOnce();
  });
});

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

describe("PATCH /_admin/users/:id/status", () => {
  const targetId = randomUUID();

  it("changes the target user's active state and returns the updated profile without hashing anything", async () => {
    const updatedUser = { ...defaultCreatedUser, id: targetId, isActive: false };
    const mocks = makeStore({ statusUser: updatedUser });
    const { app, hashPassword } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "PATCH",
      url: `/_admin/users/${targetId}/status`,
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: { isActive: false }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      id: targetId,
      username: "new_responder",
      role: "user",
      mustCompleteSecurityQuestions: true,
      isActive: false,
      avgRating: null,
      createdAt: createdAt.toISOString()
    });
    expect(mocks.findAdminActorById).toHaveBeenCalledWith(userId);
    expect(mocks.updateUserActiveStatus).toHaveBeenCalledWith({
      adminId: userId,
      userId: targetId,
      isActive: false
    });
    expect(hashPassword).not.toHaveBeenCalled();
  });

  it.each([
    [{ role: "admin", isActive: false, isSuspended: false }, "ACCOUNT_INACTIVE"],
    [{ role: "admin", isActive: true, isSuspended: true }, "ACCOUNT_SUSPENDED"],
    [{ role: "user", isActive: true, isSuspended: false }, "ADMIN_REQUIRED"],
    [null, "ADMIN_REQUIRED"]
  ] as const)("refuses to update status when the current admin account is not authorized", async (actor, code) => {
    const mocks = makeStore({ actor });
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "PATCH",
      url: `/_admin/users/${targetId}/status`,
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: { isActive: false }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().code).toBe(code);
    expect(mocks.updateUserActiveStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["invalid target ID", "/_admin/users/not-a-uuid/status", { isActive: false }],
    ["invalid status body", `/_admin/users/${targetId}/status`, { isActive: "false" }],
    ["unexpected body field", `/_admin/users/${targetId}/status`, { isActive: false, role: "admin" }]
  ])("rejects %s with validation error", async (_name, url, payload) => {
    const mocks = makeStore();
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "PATCH",
      url,
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
    expect(mocks.updateUserActiveStatus).not.toHaveBeenCalled();
  });

  it("returns 404 for a missing user and does not write status or audit data", async () => {
    const mocks = makeStore({ statusUser: null });
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "PATCH",
      url: `/_admin/users/${targetId}/status`,
      headers: { authorization: `Bearer ${await adminToken()}` },
      payload: { isActive: true }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("USER_NOT_FOUND");
    expect(mocks.updateUserActiveStatus).toHaveBeenCalledWith({
      adminId: userId,
      userId: targetId,
      isActive: true
    });
  });
});
