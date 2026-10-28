import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { ActiveOutgoingShare, LocationShareStore } from "../db/location-share-store";
import type { LocationFixInput, LocationHistoryStore } from "../db/location-history-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";
import {
  createLiveLocationService,
  MAX_FUTURE_TIMESTAMP_SKEW_MS,
  MAX_LIVE_UPDATE_AGE_MS,
  registerLocationUpdateRoute
} from "./live";

const userId = randomUUID();
const deviceId = "device-owner";
const now = new Date("2026-10-21T09:00:00.000Z");

function makeService(options: {
  shares?: ActiveOutgoingShare[];
  recordFix?: LocationHistoryStore["recordFix"];
} = {}) {
  const recorded: LocationFixInput[] = [];
  const recordFix = options.recordFix ?? (async (input: LocationFixInput) => { recorded.push(input); });
  const shareStore = {
    listActiveOutgoingShares: vi.fn<LocationShareStore["listActiveOutgoingShares"]>(
      async () => options.shares ?? []
    )
  };
  const historyStore = { recordFix: vi.fn(recordFix) };
  return {
    service: createLiveLocationService({
      shareStore: shareStore as unknown as LocationShareStore,
      historyStore: historyStore as unknown as LocationHistoryStore,
      now: () => now
    }),
    listActiveOutgoingShares: shareStore.listActiveOutgoingShares,
    recordFix: historyStore.recordFix,
    recorded
  };
}

function payload(overrides: Record<string, unknown> = {}) {
  return {
    lat: 35.6997,
    lon: 51.3379,
    accuracy: 12,
    timestamp: "2026-10-21T08:59:55.000Z",
    priorityDeviceId: deviceId,
    ...overrides
  };
}

describe("live location service", () => {
  it("persists an accepted fix and reports the peers that may receive it", async () => {
    const targetA = randomUUID();
    const targetB = randomUUID();
    const { service, recorded, listActiveOutgoingShares } = makeService({
      shares: [{ targetUserId: targetA, priorityDeviceId: null }, { targetUserId: targetB, priorityDeviceId: null }]
    });

    const result = await service.applyUpdate({ userId, deviceId, payload: payload() });

    expect(listActiveOutgoingShares).toHaveBeenCalledWith(userId);
    expect(result).toEqual({
      status: "accepted",
      peers: [targetA, targetB],
      fix: { lat: 35.6997, lon: 51.3379, accuracy: 12, timestamp: "2026-10-21T08:59:55.000Z" }
    });
    expect(recorded).toEqual([{
      userId,
      lat: 35.6997,
      lon: 51.3379,
      accuracy: 12,
      timestamp: new Date("2026-10-21T08:59:55.000Z")
    }]);
  });

  it("deduplicates peers when one recipient holds several shares", async () => {
    const target = randomUUID();
    const { service } = makeService({
      shares: [
        { targetUserId: target, priorityDeviceId: null },
        { targetUserId: target, priorityDeviceId: deviceId }
      ]
    });

    const result = await service.applyUpdate({ userId, deviceId, payload: payload() });
    expect(result.status === "accepted" && result.peers).toEqual([target]);
  });

  it("ignores GPS from a device that is not the selected priority device (T2.3.4)", async () => {
    const { service, recordFix } = makeService({
      shares: [{ targetUserId: randomUUID(), priorityDeviceId: "phone-other" }]
    });

    const result = await service.applyUpdate({ userId, deviceId, payload: payload() });

    expect(result).toMatchObject({ status: "rejected", code: "WRONG_DEVICE" });
    expect(recordFix).not.toHaveBeenCalled();
  });

  it("still records a fix when the account has no active share", async () => {
    const { service, recorded } = makeService({ shares: [] });
    const result = await service.applyUpdate({ userId, deviceId, payload: payload() });

    expect(result).toMatchObject({ status: "accepted", peers: [] });
    expect(recorded).toHaveLength(1);
  });

  it("rejects a payload whose reported device is not this session", async () => {
    const { service, recordFix } = makeService();
    const result = await service.applyUpdate({
      userId,
      deviceId,
      payload: payload({ priorityDeviceId: "another-device" })
    });

    expect(result).toMatchObject({ status: "rejected", code: "WRONG_DEVICE" });
    expect(recordFix).not.toHaveBeenCalled();
  });

  it.each([
    ["missing coordinates", { lat: undefined }],
    ["an out-of-range latitude", { lat: 95 }],
    ["a blank priority device", { priorityDeviceId: " " }],
    ["a non-ISO timestamp", { timestamp: "yesterday" }]
  ])("rejects %s with validation issues", async (_label, overrides) => {
    const { service } = makeService();
    const result = await service.applyUpdate({
      userId,
      deviceId,
      payload: { ...payload(), ...overrides }
    });

    expect(result).toMatchObject({ status: "rejected", code: "VALIDATION_ERROR" });
    expect(result.status === "rejected" && result.issues.length).toBeGreaterThan(0);
  });

  it("rejects an observation time far in the future", async () => {
    const { service, recordFix } = makeService();
    const result = await service.applyUpdate({
      userId,
      deviceId,
      payload: payload({ timestamp: new Date(now.getTime() + MAX_FUTURE_TIMESTAMP_SKEW_MS + 1000).toISOString() })
    });

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_TIMESTAMP" });
    expect(recordFix).not.toHaveBeenCalled();
  });

  it("refuses an observation this old instead of dragging the last known position backwards", async () => {
    // `users.last_location` is what SOS dispatch reads when a request has no live stream, so a
    // reconnecting client flushing hours of buffered fixes must not move it to where the device
    // stood yesterday.
    const { service, recordFix, listActiveOutgoingShares } = makeService({
      shares: [{ targetUserId: randomUUID(), priorityDeviceId: null }]
    });
    const result = await service.applyUpdate({
      userId,
      deviceId,
      payload: payload({ timestamp: new Date(now.getTime() - MAX_LIVE_UPDATE_AGE_MS - 1000).toISOString() })
    });

    expect(result).toMatchObject({ status: "rejected", code: "INVALID_TIMESTAMP" });
    expect(recordFix).not.toHaveBeenCalled();
    // Refused before any write, and before the share lookup it never reaches.
    expect(listActiveOutgoingShares).not.toHaveBeenCalled();
  });

  it("accepts a buffered fix from a reconnect inside the staleness bound", async () => {
    const { service, recorded } = makeService();
    const observedAt = new Date(now.getTime() - 6 * 60 * 60_000);

    const result = await service.applyUpdate({
      userId,
      deviceId,
      payload: payload({ timestamp: observedAt.toISOString() })
    });

    expect(result).toMatchObject({ status: "accepted" });
    expect(recorded[0]?.timestamp).toEqual(observedAt);
  });

  it("accepts a small clock skew and omits an absent accuracy", async () => {
    const { service, recorded } = makeService();
    const result = await service.applyUpdate({
      userId,
      deviceId,
      payload: payload({ accuracy: undefined, timestamp: new Date(now.getTime() + 60_000).toISOString() })
    });

    expect(result).toMatchObject({ status: "accepted" });
    expect(recorded[0]).toMatchObject({ accuracy: null });
  });
});

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function sessionUser(overrides: Partial<AuthenticatedUserContext> = {}): AuthenticatedUserContext {
  return {
    userId,
    role: "user",
    deviceId,
    sessionId: randomUUID(),
    username: "field_responder",
    isActive: true,
    isSuspended: false,
    mustCompleteSecurityQuestions: false,
    avgRating: null,
    createdAt: new Date("2026-10-21T09:00:00.000Z"),
    ...overrides
  };
}

async function makeRouteApp(options: {
  service: ReturnType<typeof createLiveLocationService>;
  user?: AuthenticatedUserContext | null;
  broadcast?: (peers: string[], update: unknown) => void;
}) {
  const app = Fastify({ logger: false });
  app.decorateRequest("authenticatedUser", null);
  app.addHook("preHandler", async (request, reply) => {
    if (request.headers.authorization !== "Bearer test-token") {
      return reply.code(401).send({ error: true, code: "UNAUTHORIZED", message: "Missing token.", issues: [] });
    }
    request.authenticatedUser = options.user === undefined ? sessionUser() : options.user;
  });
  await registerLocationUpdateRoute(app, { service: options.service, broadcast: options.broadcast });
  apps.push(app);
  return app;
}

describe("POST /_user/location/update (REST fallback)", () => {
  it("records the fix and fans the update out to peers", async () => {
    const peer = randomUUID();
    const shareStore = { listActiveOutgoingShares: async () => [{ targetUserId: peer, priorityDeviceId: null }] };
    const recorded: unknown[] = [];
    const service = createLiveLocationService({
      shareStore: shareStore as unknown as LocationShareStore,
      historyStore: {
        recordFix: async (input: LocationFixInput) => { recorded.push(input); }
      } as unknown as LocationHistoryStore,
      now: () => now
    });
    const broadcast = vi.fn();
    const app = await makeRouteApp({ service, broadcast });

    const response = await app.inject({
      method: "POST",
      url: "/_user/location/update",
      headers: { authorization: "Bearer test-token" },
      payload: payload()
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("");
    expect(recorded).toHaveLength(1);
    expect(broadcast).toHaveBeenCalledWith([peer], {
      userId,
      lat: 35.6997,
      lon: 51.3379,
      accuracy: 12,
      timestamp: "2026-10-21T08:59:55.000Z"
    });
  });

  it("acknowledges an already-persisted fix even when realtime fan-out throws", async () => {
    const peer = randomUUID();
    const { service, recorded } = makeService({
      shares: [{ targetUserId: peer, priorityDeviceId: null }]
    });
    const broadcast = vi.fn(() => { throw new Error("Socket adapter unavailable"); });
    const app = await makeRouteApp({ service, broadcast });

    const response = await app.inject({
      method: "POST", url: "/_user/location/update",
      headers: { authorization: "Bearer test-token" }, payload: payload()
    });

    expect(recorded).toHaveLength(1); // the write committed before fan-out
    expect(broadcast).toHaveBeenCalledOnce();
    expect(response.statusCode).toBe(200); // a retryable 500 would append the same fix again
    expect(response.body).toBe("");
  });

  it("still reports a failed persistence instead of acknowledging an unwritten fix", async () => {
    const { service } = makeService({
      shares: [{ targetUserId: randomUUID(), priorityDeviceId: null }],
      recordFix: async () => { throw new Error("Database unavailable"); }
    });
    const broadcast = vi.fn();
    const app = await makeRouteApp({ service, broadcast });
    const response = await app.inject({
      method: "POST", url: "/_user/location/update",
      headers: { authorization: "Bearer test-token" }, payload: payload()
    });
    expect(response.statusCode).toBe(500);
    expect(broadcast).not.toHaveBeenCalled();
  });

  it("maps rejections onto documented REST status codes", async () => {
    const cases: [string, Record<string, unknown>, number, string][] = [
      ["out-of-range coordinates", { lat: 95 }, 400, "VALIDATION_ERROR"],
      ["a future observation", { timestamp: new Date(now.getTime() + 10 * 60_000).toISOString() }, 400, "INVALID_TIMESTAMP"],
      ["another session's device", { priorityDeviceId: "laptop-2" }, 409, "WRONG_DEVICE"]
    ];

    for (const [label, overrides, statusCode, code] of cases) {
      const service = createLiveLocationService({
        shareStore: { listActiveOutgoingShares: async () => [] } as unknown as LocationShareStore,
        historyStore: { recordFix: async () => undefined } as unknown as LocationHistoryStore,
        now: () => now
      });
      const applyUpdateSpy = vi.spyOn(service, "applyUpdate");
      const broadcast = vi.fn();
      const app = await makeRouteApp({ service, broadcast });

      const response = await app.inject({
        method: "POST",
        url: "/_user/location/update",
        headers: { authorization: "Bearer test-token" },
        payload: payload(overrides)
      });

      expect(response.statusCode, label).toBe(statusCode);
      expect(response.json()).toMatchObject({ error: true, code });
      expect(applyUpdateSpy).toHaveBeenCalledOnce();
      expect(broadcast).not.toHaveBeenCalled();
    }
  });

  it("requires an authenticated session", async () => {
    const service = createLiveLocationService({
      shareStore: { listActiveOutgoingShares: async () => [] } as unknown as LocationShareStore,
      historyStore: { recordFix: async () => undefined } as unknown as LocationHistoryStore
    });
    const app = await makeRouteApp({ service });
    const response = await app.inject({ method: "POST", url: "/_user/location/update", payload: payload() });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
