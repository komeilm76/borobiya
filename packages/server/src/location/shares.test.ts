import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import { SignJWT } from "jose";
import { MAX_LOCATION_SHARE_MINUTES, MAX_LOCATION_SHARE_TARGETS } from "@borobiya/shared";
import type { LocationShareRecord, LocationShareStore } from "../db/location-share-store";
import type { SecurityQuestionsUserRecord, UserSecurityQuestionsStore } from "../db/security-questions-store";
import { registerUserSecurityQuestionsRoute } from "../auth/user-security-questions";
import { registerLocationShareRoutes } from "./shares";

const jwtSecret = "a".repeat(48);
const ownerId = randomUUID();
const targetId = randomUUID();
const otherTargetId = randomUUID();
const createdAt = new Date("2026-10-21T09:00:00.000Z");
const listLimit = 100;

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

async function accessToken(overrides: Record<string, unknown> = {}) {
  const issuedAt = Math.floor(Date.now() / 1000);
  return new SignJWT({
    role: "user",
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    tokenUse: "access",
    ...overrides
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(ownerId)
    .setIssuedAt(issuedAt)
    .setExpirationTime(issuedAt + 900)
    .sign(new TextEncoder().encode(jwtSecret));
}

function userRow(overrides: Partial<SecurityQuestionsUserRecord> = {}): SecurityQuestionsUserRecord {
  return {
    id: ownerId,
    username: "field_responder",
    role: "user",
    isActive: true,
    isSuspended: false,
    mustCompleteSecurityQuestions: false,
    avgRating: null,
    createdAt,
    ...overrides
  };
}

function shareRow(overrides: Partial<LocationShareRecord> = {}): LocationShareRecord {
  return {
    id: randomUUID(),
    ownerId,
    targetUserId: targetId,
    mode: "timed",
    expiresAt: new Date("2026-10-21T10:00:00.000Z"),
    isRevoked: false,
    priorityDeviceId: null,
    note: null,
    createdAt,
    ...overrides
  } as LocationShareRecord;
}

function makeSecurityStore(user: SecurityQuestionsUserRecord) {
  const store: UserSecurityQuestionsStore = {
    async findUserById() { return user; },
    async hasActiveSession() { return true; },
    async securityQuestionsExist() { return true; },
    async completeSecurityQuestions() { return true; }
  };
  return store;
}

async function makeApp(options: {
  user?: SecurityQuestionsUserRecord;
  shareStore?: Partial<LocationShareStore>;
} = {}) {
  const assessShareTargets = vi.fn<LocationShareStore["assessShareTargets"]>(async ({ targetUserIds }) => ({
    eligible: [...targetUserIds],
    self: [],
    missing: [],
    unavailable: []
  }));
  const createShares = vi.fn<LocationShareStore["createShares"]>(async (input) => {
    const shares = input.targetUserIds.map((targetUserId) => shareRow({
      targetUserId,
      mode: input.mode,
      expiresAt: input.expiresAt,
      note: input.note
    }));
    return { shares, createdShareIds: shares.map((share) => share.id), reusedShareIds: [] };
  });
  const revokeShare = vi.fn<LocationShareStore["revokeShare"]>(async () => "revoked");
  const listActiveOutgoingShares = vi.fn<LocationShareStore["listActiveOutgoingShares"]>(async () => []);
  const listActiveShares = vi.fn<LocationShareStore["listActiveShares"]>(async () => ({
    owned: [],
    sharedWithMe: []
  }));
  const store: LocationShareStore = {
    assessShareTargets,
    createShares,
    revokeShare,
    listActiveOutgoingShares,
    listActiveShares,
    ...options.shareStore
  };

  const app = Fastify({ logger: false });
  await registerUserSecurityQuestionsRoute(app, {
    store: makeSecurityStore(options.user ?? userRow()),
    jwtSecret
  });
  await registerLocationShareRoutes(app, { store });
  apps.push(app);
  return { app, assessShareTargets, createShares, revokeShare, listActiveShares };
}

async function authorizedHeaders() {
  return { authorization: `Bearer ${await accessToken()}` };
}

describe("POST /_user/location/share", () => {
  it("creates a timed share with a computed expiry", async () => {
    const { app, createShares } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/_user/location/share",
      headers: await authorizedHeaders(),
      payload: { targetUserIds: [targetId], mode: "timed", durationMinutes: 60, note: "  on shift  " }
    });

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    const input = createShares.mock.calls[0]![0];
    expect(input.ownerId).toBe(ownerId);
    expect(input.mode).toBe("timed");
    expect(input.note).toBe("on shift");
    const seconds = (input.expiresAt!.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(59 * 60);
    expect(seconds).toBeLessThanOrEqual(60 * 60 + 5);

    expect(response.json()).toMatchObject({
      shares: [expect.objectContaining({
        id: expect.any(String),
        ownerId,
        targetUserId: targetId,
        mode: "timed",
        isRevoked: false,
        priorityDeviceId: null
      })],
      createdShareIds: [expect.any(String)],
      reusedShareIds: []
    });
  });

  it("creates a permanent share without an expiry and reports reused shares", async () => {
    // The handler passes `expiresAt: null` down; the store override below asserts it.
    const createSharesSpy = vi.fn();
    const reused = shareRow({ mode: "permanent", expiresAt: null });
    const { app } = await makeApp({
      shareStore: {
        createShares: async (input) => {
          createSharesSpy(input);
          return { shares: [reused], createdShareIds: [], reusedShareIds: [reused.id] };
        }
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/_user/location/share",
      headers: await authorizedHeaders(),
      payload: { targetUserIds: [targetId], mode: "permanent" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      shares: [expect.objectContaining({ id: reused.id, mode: "permanent", expiresAt: null })],
      createdShareIds: [],
      reusedShareIds: [reused.id]
    });
    expect(createSharesSpy.mock.calls[0]![0].expiresAt).toBeNull();
    expect(createSharesSpy.mock.calls[0]![0].mode).toBe("permanent");
  });

  it("rejects self, unknown, and inactive recipients without writing anything", async () => {
    const missingId = randomUUID();
    const suspendedId = randomUUID();
    const { app, createShares } = await makeApp({
      shareStore: {
        assessShareTargets: async () => ({
          eligible: [targetId],
          self: [ownerId],
          missing: [missingId],
          unavailable: [suspendedId]
        })
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/_user/location/share",
      headers: await authorizedHeaders(),
      payload: { targetUserIds: [targetId, ownerId, missingId, suspendedId], mode: "permanent" }
    });

    expect(response.statusCode).toBe(400);
    expect(createShares).not.toHaveBeenCalled();
    const body = response.json();
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.issues.map((issue: { code: string }) => issue.code)).toEqual(
      expect.arrayContaining(["self_target", "unknown_target", "unavailable_target"])
    );
  });

  it.each([
    ["a missing timed duration", { targetUserIds: [targetId], mode: "timed" }],
    ["a duration above the maximum", {
      targetUserIds: [targetId],
      mode: "timed",
      durationMinutes: MAX_LOCATION_SHARE_MINUTES + 1
    }],
    ["a duration for a permanent share", { targetUserIds: [targetId], mode: "permanent", durationMinutes: 5 }],
    ["a duplicate recipient", { targetUserIds: [targetId, targetId], mode: "permanent" }],
    ["a non-uuid recipient", { targetUserIds: ["someone"], mode: "permanent" }],
    ["too many recipients", {
      targetUserIds: Array.from({ length: MAX_LOCATION_SHARE_TARGETS + 1 }, () => randomUUID()),
      mode: "permanent"
    }],
    ["an over-long note", { targetUserIds: [targetId], mode: "permanent", note: "x".repeat(501) }]
  ])("rejects %s with a validation error", async (_label, payload) => {
    const { app, createShares } = await makeApp();
    const response = await app.inject({
      method: "POST",
      url: "/_user/location/share",
      headers: await authorizedHeaders(),
      payload
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "VALIDATION_ERROR", issues: [expect.any(Object)] });
    expect(createShares).not.toHaveBeenCalled();
  });

  it("requires a valid access token backed by a completed onboarding", async () => {
    const anonymous = await makeApp();
    const unauthorized = await anonymous.app.inject({
      method: "POST",
      url: "/_user/location/share",
      payload: { targetUserIds: [targetId], mode: "permanent" }
    });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toMatchObject({ code: "UNAUTHORIZED" });

    const onboarding = await makeApp({ user: userRow({ mustCompleteSecurityQuestions: true }) });
    const gated = await onboarding.app.inject({
      method: "POST",
      url: "/_user/location/share",
      headers: await authorizedHeaders(),
      payload: { targetUserIds: [targetId], mode: "permanent" }
    });
    expect(gated.statusCode).toBe(403);
    expect(gated.json()).toMatchObject({ code: "SECURITY_QUESTIONS_REQUIRED" });
    expect(onboarding.createShares).not.toHaveBeenCalled();
  });
});

describe("DELETE /_user/location/share/:shareId", () => {
  it("revokes the caller's share immediately with an empty body", async () => {
    const { app, revokeShare } = await makeApp();
    const response = await app.inject({
      method: "DELETE",
      url: `/_user/location/share/${targetId}`,
      headers: await authorizedHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(revokeShare.mock.calls[0]![0]).toEqual({ ownerId, shareId: targetId });
  });

  it("treats an already-revoked share as a successful repeat revoke", async () => {
    const { app } = await makeApp({ shareStore: { revokeShare: async () => "already-revoked" } });
    const response = await app.inject({
      method: "DELETE",
      url: `/_user/location/share/${targetId}`,
      headers: await authorizedHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
  });

  it("returns 404 for an unknown or foreign share id without leaking ownership", async () => {
    const { app } = await makeApp({ shareStore: { revokeShare: async () => "not-found" } });
    const response = await app.inject({
      method: "DELETE",
      url: `/_user/location/share/${otherTargetId}`,
      headers: await authorizedHeaders()
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "SHARE_NOT_FOUND" });
    expect(response.json().message).not.toContain("another");
  });

  it("validates the path parameter and access token", async () => {
    const { app, revokeShare } = await makeApp();
    const invalid = await app.inject({
      method: "DELETE",
      url: "/_user/location/share/not-a-uuid",
      headers: await authorizedHeaders()
    });
    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR", issues: [expect.any(Object)] });
    expect(revokeShare).not.toHaveBeenCalled();

    const unauthorized = await app.inject({ method: "DELETE", url: `/_user/location/share/${targetId}` });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toMatchObject({ code: "UNAUTHORIZED" });
    expect(revokeShare).not.toHaveBeenCalled();
  });
});

describe("GET /_user/location/shares", () => {
  it("lists active owned and received shares with owner position data", async () => {
    const listActiveShares = vi.fn<LocationShareStore["listActiveShares"]>(async () => ({
      owned: [shareRow({ note: "night shift" })],
      sharedWithMe: [{
        ...shareRow({ id: otherTargetId, ownerId: targetId, mode: "permanent", expiresAt: null }),
        owner: {
          id: targetId,
          username: "dispatch_lead",
          lastLocation: { lat: 35.6997, lon: 51.3379 }
        }
      }]
    }));
    const { app } = await makeApp({
      shareStore: {
        listActiveShares
      }
    });

    const response = await app.inject({
      method: "GET",
      url: "/_user/location/shares",
      headers: await authorizedHeaders()
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(listActiveShares.mock.calls[0]![0]).toEqual({ userId: ownerId, limit: listLimit });
    expect(response.json()).toMatchObject({
      owned: [expect.objectContaining({
        ownerId,
        targetUserId: targetId,
        mode: "timed",
        note: "night shift",
        expiresAt: "2026-10-21T10:00:00.000Z",
        createdAt: "2026-10-21T09:00:00.000Z"
      })],
      sharedWithMe: [expect.objectContaining({
        id: otherTargetId,
        mode: "permanent",
        expiresAt: null,
        owner: {
          id: targetId,
          username: "dispatch_lead",
          lastLocation: { lat: 35.6997, lon: 51.3379 }
        }
      })]
    });
  });

  it("returns empty lists when the account has no active shares and requires a token", async () => {
    const { app } = await makeApp();
    const authorized = await app.inject({
      method: "GET",
      url: "/_user/location/shares",
      headers: await authorizedHeaders()
    });
    expect(authorized.statusCode).toBe(200);
    expect(authorized.json()).toEqual({ owned: [], sharedWithMe: [] });

    const unauthorized = await app.inject({ method: "GET", url: "/_user/location/shares" });
    expect(unauthorized.statusCode).toBe(401);
    expect(unauthorized.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
