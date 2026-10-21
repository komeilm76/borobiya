import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { LocationHistoryShareRecord, LocationHistoryStore } from "../db/location-history-store";
import type { LocationShareStore, ShareTargetAssessment } from "../db/location-share-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import { historyShareRangeDays, registerLocationHistoryShareRoutes } from "./history";

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

async function makeApp(
  options: {
    maxShareDays?: number;
    createHistoryShares?: LocationHistoryStore["createHistoryShares"];
    assessShareTargets?: () => Promise<ShareTargetAssessment>;
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
    store: { createHistoryShares } as unknown as LocationHistoryStore,
    shares: { assessShareTargets } as unknown as LocationShareStore,
    maxShareDays: options.maxShareDays ?? 30
  });
  apps.push(app);
  return { app, createHistoryShares, assessShareTargets };
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
        { code: "self_target", path: [0] },
        { code: "unknown_target", path: [1] }
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
