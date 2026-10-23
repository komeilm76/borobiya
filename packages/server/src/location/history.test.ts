import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type {
  LocationHistoryShareRecord,
  LocationHistoryStore,
  OwnedLocationHistoryShareRecord,
  LocationHistoryWindowResult
} from "../db/location-history-store";
import type { LocationShareStore, ShareTargetAssessment } from "../db/location-share-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import { historyReadPoints, historyShareRangeDays, registerLocationHistoryShareRoutes } from "./history";

const ownerId = randomUUID();
const targetId = randomUUID();
const shareId = randomUUID();
const DAY_MS = 24 * 60 * 60_000;
const FROM = "2026-10-14T00:00:00.000Z";
const TO = "2026-10-21T00:00:00.000Z";

const apps: FastifyInstance[] = [];

function grant(overrides: Partial<LocationHistoryShareRecord> = {}): LocationHistoryShareRecord {
  return {
    id: shareId,
    ownerId,
    targetUserId: targetId,
    fromTime: new Date(FROM),
    toTime: new Date(TO),
    maxPoints: null,
    createdAt: new Date("2026-10-21T09:00:00.000Z"),
    ...overrides
  };
}

/** An owned grant as the list reads it: the same row plus the target label the list joins in. */
function ownedGrant(overrides: Partial<OwnedLocationHistoryShareRecord> = {}): OwnedLocationHistoryShareRecord {
  return { ...grant(overrides), targetUsername: "satellite", ...overrides };
}

const DEFAULT_READ_POINTS = 1_000;

function windowResult(overrides: Partial<LocationHistoryWindowResult> = {}): LocationHistoryWindowResult {
  return {
    points: [
      { lat: 35.6997, lon: 51.3379, accuracy: 12, timestamp: new Date("2026-10-15T08:00:00.000Z") },
      { lat: 35.7001, lon: 51.3382, accuracy: null, timestamp: new Date("2026-10-15T09:00:00.000Z") }
    ],
    totalPoints: 8_412,
    ...overrides
  };
}

async function makeApp(
  options: {
    maxShareDays?: number;
    defaultReadPoints?: number;
    createHistoryShares?: LocationHistoryStore["createHistoryShares"];
    assessShareTargets?: () => Promise<ShareTargetAssessment>;
    readHistoryWindow?: LocationHistoryStore["readHistoryWindow"];
    readSharedHistoryWindow?: LocationHistoryStore["readSharedHistoryWindow"];
    findHistoryShare?: LocationHistoryStore["findHistoryShare"];
    deleteHistoryShare?: LocationHistoryStore["deleteHistoryShare"];
    listHistoryShares?: LocationHistoryStore["listHistoryShares"];
  } = {}
) {
  const createHistoryShares = vi.fn<LocationHistoryStore["createHistoryShares"]>(
    options.createHistoryShares ?? (async () => ({ shares: [grant()], createdShareIds: [shareId], reusedShareIds: [] }))
  );
  const assessShareTargets = vi.fn<() => Promise<ShareTargetAssessment>>(
    options.assessShareTargets ?? (async () => ({ eligible: [targetId], self: [], missing: [], unavailable: [] }))
  );

  const user: AuthenticatedUserContext = {
    userId: ownerId,
    role: "user",
    deviceId: randomUUID(),
    sessionId: randomUUID(),
    username: "field_responder",
    isActive: true,
    isSuspended: false,
    mustCompleteSecurityQuestions: false,
    avgRating: null,
    createdAt: new Date("2026-10-21T09:00:00.000Z")
  } as AuthenticatedUserContext;

  const readHistoryWindow = vi.fn<LocationHistoryStore["readHistoryWindow"]>(
    options.readHistoryWindow ?? (async () => windowResult())
  );
  const findHistoryShare = vi.fn<LocationHistoryStore["findHistoryShare"]>(
    options.findHistoryShare ?? (async () => grant())
  );
  const readSharedHistoryWindow = vi.fn<LocationHistoryStore["readSharedHistoryWindow"]>(
    options.readSharedHistoryWindow ?? (async ({ shareId, targetUserId, defaultReadPoints }) => {
      // Test double only. The real store locks this grant and reads history in one transaction.
      const row = await findHistoryShare(shareId);
      if (!row || row.targetUserId !== targetUserId) return null;
      return readHistoryWindow({
        userId: row.ownerId, fromTime: row.fromTime, toTime: row.toTime,
        maxPoints: row.maxPoints ?? defaultReadPoints
      });
    })
  );
  const deleteHistoryShare = vi.fn<LocationHistoryStore["deleteHistoryShare"]>(
    options.deleteHistoryShare ?? (async () => true)
  );
  const listHistoryShares = vi.fn<LocationHistoryStore["listHistoryShares"]>(
    options.listHistoryShares ?? (async () => ({ owned: [ownedGrant()], sharedWithMe: [] }))
  );

  const app = Fastify({ logger: false });
  app.decorateRequest("authenticatedUser", null);
  app.addHook("preHandler", async (request, reply) => {
    if (request.headers.authorization !== "Bearer test-token") {
      return reply.code(401).send({ error: true, code: "UNAUTHORIZED", message: "Missing token.", issues: [] });
    }
    request.authenticatedUser = user;
  });
  // Recipient classification is shared with live shares, so the fake has to satisfy that store too.
  await registerLocationHistoryShareRoutes(app, {
    store: {
      createHistoryShares,
      readHistoryWindow,
      readSharedHistoryWindow,
      findHistoryShare,
      deleteHistoryShare,
      listHistoryShares
    } as unknown as LocationHistoryStore,
    shares: { assessShareTargets } as unknown as LocationShareStore,
    maxShareDays: options.maxShareDays ?? 30,
    defaultReadPoints: options.defaultReadPoints ?? DEFAULT_READ_POINTS
  });
  apps.push(app);
  return {
    app,
    createHistoryShares,
    assessShareTargets,
    readHistoryWindow,
    readSharedHistoryWindow,
    findHistoryShare,
    deleteHistoryShare,
    listHistoryShares
  };
}

function call(app: FastifyInstance, method: "GET" | "DELETE", url: string) {
  return app.inject({ method, url, headers: { authorization: "Bearer test-token" } });
}

function post(app: FastifyInstance, payload: Record<string, unknown>) {
  return app.inject({
    method: "POST",
    url: "/_user/location/history/share",
    headers: { authorization: "Bearer test-token" },
    payload
  });
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("historyShareRangeDays", () => {
  it("measures the span in days for the configuration bound", () => {
    expect(historyShareRangeDays(FROM, TO)).toBe(7);
    expect(historyShareRangeDays(TO, FROM)).toBe(-7);
  });
});

describe("POST /_user/location/history/share", () => {
  it("creates one grant per recipient and returns the batch payload", async () => {
    const { app, createHistoryShares } = await makeApp();

    const response = await post(app, { targetUserIds: [targetId], from: FROM, to: TO, maxPoints: 500 });

    expect(response.statusCode).toBe(201);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json()).toEqual({
      shares: [
        {
          id: shareId,
          ownerId,
          targetUserId: targetId,
          from: FROM,
          to: TO,
          maxPoints: null,
          createdAt: "2026-10-21T09:00:00.000Z"
        }
      ],
      createdShareIds: [shareId],
      reusedShareIds: []
    });
    expect(createHistoryShares).toHaveBeenCalledWith({
      ownerId,
      targetUserIds: [targetId],
      fromTime: new Date(FROM),
      toTime: new Date(TO),
      maxPoints: 500
    });
  });

  it("reports an omitted maxPoints as no preference rather than zero", async () => {
    const { app, createHistoryShares } = await makeApp();

    await post(app, { targetUserIds: [targetId], from: FROM, to: TO });

    expect(createHistoryShares.mock.calls[0]![0].maxPoints).toBeNull();
  });

  it("requires an authenticated session before any lookup", async () => {
    const { app, assessShareTargets, createHistoryShares } = await makeApp();

    const response = await app.inject({
      method: "POST",
      url: "/_user/location/history/share",
      payload: { targetUserIds: [targetId], from: FROM, to: TO }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    expect(assessShareTargets).not.toHaveBeenCalled();
    expect(createHistoryShares).not.toHaveBeenCalled();
  });

  it("refuses a window wider than the configured maximum before touching the database", async () => {
    const { app, assessShareTargets, createHistoryShares } = await makeApp({ maxShareDays: 7 });

    const response = await post(app, {
      targetUserIds: [targetId],
      from: FROM,
      to: new Date(new Date(FROM).getTime() + 8 * DAY_MS).toISOString()
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "SHARE_RANGE_TOO_LARGE",
      message: "A shared history window must not span more than 7 days.",
      issues: [{ code: "range_too_large", maxShareDays: 7, requestedDays: 8, path: ["to"] }]
    });
    expect(assessShareTargets).not.toHaveBeenCalled();
    expect(createHistoryShares).not.toHaveBeenCalled();
  });

  it("accepts a window of exactly the configured maximum", async () => {
    const { app } = await makeApp({ maxShareDays: 7 });

    const response = await post(app, { targetUserIds: [targetId], from: FROM, to: TO });

    expect(response.statusCode).toBe(201);
  });

  it("rejects the whole batch when any recipient is unusable", async () => {
    const missingId = randomUUID();
    const { app, createHistoryShares } = await makeApp({
      assessShareTargets: async () => ({ eligible: [], self: [targetId], missing: [missingId], unavailable: [] })
    });

    const response = await post(app, { targetUserIds: [targetId, missingId], from: FROM, to: TO });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      code: "VALIDATION_ERROR",
      message: "Location history sharing requires active recipients that are not your own account.",
      issues: [
        { code: "self_target", path: ["targetUserIds", 0] },
        { code: "unknown_target", path: ["targetUserIds", 1] }
      ]
    });
    expect(createHistoryShares).not.toHaveBeenCalled();
  });

  it("rejects an inverted range and an out-of-range sample size from the contract", async () => {
    const { app, assessShareTargets } = await makeApp();

    const inverted = await post(app, { targetUserIds: [targetId], from: TO, to: FROM });
    const oversized = await post(app, { targetUserIds: [targetId], from: FROM, to: TO, maxPoints: 0 });

    expect(inverted.statusCode).toBe(400);
    expect(inverted.json()).toMatchObject({ code: "VALIDATION_ERROR", issues: [{ path: ["to"] }] });
    expect(oversized.statusCode).toBe(400);
    expect(oversized.json()).toMatchObject({ code: "VALIDATION_ERROR", issues: [{ path: ["maxPoints"] }] });
    expect(assessShareTargets).not.toHaveBeenCalled();
  });
});

describe("historyReadPoints", () => {
  it("prefers the target the owner stored on the grant", () => {
    expect(historyReadPoints(5_000, DEFAULT_READ_POINTS)).toBe(5_000);
    expect(historyReadPoints(null, DEFAULT_READ_POINTS)).toBe(DEFAULT_READ_POINTS);
    // A grant may legitimately ask for a single point; 0 is not a value the write path can store.
    expect(historyReadPoints(1, DEFAULT_READ_POINTS)).toBe(1);
  });
});

describe("GET /_user/location/history", () => {
  it("refuses before touching the store when the session is not verified", async () => {
    const { app, readHistoryWindow } = await makeApp();

    const response = await app.inject({ method: "GET", url: `/_user/location/history?from=${FROM}&to=${TO}` });

    expect(response.statusCode).toBe(401);
    expect(readHistoryWindow).not.toHaveBeenCalled();
  });

  it("requires an explicit window instead of assuming a retention default", async () => {
    const { app, readHistoryWindow } = await makeApp();

    const response = await call(app, "GET", "/_user/location/history?from=2026-10-14T00:00:00.000Z");

    expect(response.statusCode).toBe(400);
    expect(response.json().code).toBe("VALIDATION_ERROR");
    expect(readHistoryWindow).not.toHaveBeenCalled();
  });

  it("reads the caller's own window at the configured sampling target", async () => {
    const { app, readHistoryWindow } = await makeApp({ defaultReadPoints: 750 });

    const response = await call(app, "GET", `/_user/location/history?from=${FROM}&to=${TO}`);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(readHistoryWindow).toHaveBeenCalledWith({
      userId: ownerId,
      fromTime: new Date(FROM),
      toTime: new Date(TO),
      maxPoints: 750
    });
    // `accuracy` is absent rather than null when the device did not report one.
    expect(response.json()).toEqual({
      points: [
        { lat: 35.6997, lon: 51.3379, timestamp: "2026-10-15T08:00:00.000Z", accuracy: 12 },
        { lat: 35.7001, lon: 51.3382, timestamp: "2026-10-15T09:00:00.000Z" }
      ],
      totalPoints: 8_412
    });
  });
});

describe("GET /_user/location/history/shared/:shareId", () => {
  it("uses the store's atomic authorized read rather than a separate grant lookup", async () => {
    const { app, readSharedHistoryWindow, findHistoryShare, readHistoryWindow } = await makeApp({
      readSharedHistoryWindow: async () => windowResult()
    });
    const response = await call(app, "GET", `/_user/location/history/shared/${shareId}`);
    expect(response.statusCode).toBe(200);
    expect(readSharedHistoryWindow).toHaveBeenCalledWith({
      shareId, targetUserId: ownerId, defaultReadPoints: DEFAULT_READ_POINTS
    });
    expect(findHistoryShare).not.toHaveBeenCalled();
    expect(readHistoryWindow).not.toHaveBeenCalled();
  });

  it("answers the same 404 for an unknown id and a grant somebody else received", async () => {
    const unknown = await makeApp({ findHistoryShare: async () => null });
    const foreign = await makeApp({ findHistoryShare: async () => grant({ targetUserId: randomUUID() }) });

    const a = await call(unknown.app, "GET", `/_user/location/history/shared/${shareId}`);
    const b = await call(foreign.app, "GET", `/_user/location/history/shared/${shareId}`);

    expect(a.statusCode).toBe(404);
    expect(b.statusCode).toBe(404);
    expect(a.json().code).toBe("SHARE_NOT_FOUND");
    expect(a.json().message).toBe(b.json().message);
    // Neither probe reaches the history table, so the answer cannot leak how much was shared either.
    expect(unknown.readHistoryWindow).not.toHaveBeenCalled();
    expect(foreign.readHistoryWindow).not.toHaveBeenCalled();
  });

  it("reads the owner's rows over the granted window, not the receiver's", async () => {
    // The caller here is the receiver: the grant's `targetUserId` must be the authenticated account,
    // and its `ownerId` is whose rows get read. `makeApp` authenticates as `ownerId`, so the fixture
    // swaps the two rather than the other way round.
    const grantOwner = randomUUID();
    const { app, readHistoryWindow } = await makeApp({
      findHistoryShare: async () => grant({ ownerId: grantOwner, targetUserId: ownerId, maxPoints: 500 })
    });

    const response = await call(app, "GET", `/_user/location/history/shared/${shareId}`);

    expect(response.statusCode).toBe(200);
    expect(readHistoryWindow).toHaveBeenCalledWith({
      userId: grantOwner,
      fromTime: new Date(FROM),
      toTime: new Date(TO),
      maxPoints: 500
    });
  });

  it("falls back to the configured target when the grant stores none", async () => {
    const { app, readHistoryWindow } = await makeApp({
      findHistoryShare: async () => grant({ targetUserId: ownerId, maxPoints: null }),
      defaultReadPoints: 321
    });

    await call(app, "GET", `/_user/location/history/shared/${shareId}`);

    expect(readHistoryWindow.mock.calls[0]![0]).toMatchObject({ maxPoints: 321 });
  });

  it("rejects a non-UUID grant id before any lookup", async () => {
    const { app, findHistoryShare } = await makeApp();

    const response = await call(app, "GET", "/_user/location/history/shared/not-a-uuid");

    expect(response.statusCode).toBe(400);
    expect(findHistoryShare).not.toHaveBeenCalled();
  });
});

describe("GET /_user/location/history/shares", () => {
  it("lists both directions with the owner named only on received grants", async () => {
    const { app, listHistoryShares } = await makeApp({
      listHistoryShares: async () => ({
        owned: [ownedGrant()],
        sharedWithMe: [
          {
            ...grant({ id: randomUUID(), ownerId: targetId, targetUserId: ownerId }),
            owner: { id: targetId, username: "dispatcher" }
          }
        ]
      })
    });

    const response = await call(app, "GET", "/_user/location/history/shares");

    expect(response.statusCode).toBe(200);
    expect(listHistoryShares).toHaveBeenCalledWith({ userId: ownerId, limit: 100 });
    const body = response.json();
    expect(body.owned[0]).not.toHaveProperty("owner");
    expect(body.sharedWithMe[0].owner).toEqual({ id: targetId, username: "dispatcher" });
    expect(body.owned[0]).toMatchObject({ from: FROM, to: TO, maxPoints: null, targetUsername: "satellite" });
  });
});

describe("DELETE /_user/location/history/share/:shareId", () => {
  it("deletes only the caller's own grant and answers 404 otherwise", async () => {
    const { app, deleteHistoryShare } = await makeApp();
    const gone = await makeApp({ deleteHistoryShare: async () => false });

    const response = await call(app, "DELETE", `/_user/location/history/share/${shareId}`);
    const missing = await call(gone.app, "DELETE", `/_user/location/history/share/${shareId}`);

    expect(deleteHistoryShare).toHaveBeenCalledWith({ ownerId: ownerId, shareId });
    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.body).toBe("");
    expect(missing.statusCode).toBe(404);
    expect(missing.json().code).toBe("SHARE_NOT_FOUND");
  });

  it("refuses an unauthenticated delete before touching the store", async () => {
    const { app, deleteHistoryShare } = await makeApp();

    const response = await app.inject({ method: "DELETE", url: `/_user/location/history/share/${shareId}` });

    expect(response.statusCode).toBe(401);
    expect(deleteHistoryShare).not.toHaveBeenCalled();
  });
});
