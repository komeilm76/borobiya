import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { MAX_USER_DEVICE_LIST_ITEMS, devicesSchema } from "@borobiya/shared";
import { apiRoutes } from "@borobiya/shared/api";
import { registerUserDevicesRoute } from "./devices";
import type { AuthenticatedUserContext } from "./user-security-questions";
import type { UserDeviceRecord, UserDeviceStore } from "../db/device-store";

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

const userId = randomUUID();
const sessionId = randomUUID();
const deviceId = randomUUID();

function sessionUser(overrides: Partial<AuthenticatedUserContext> = {}): AuthenticatedUserContext {
  return {
    userId,
    role: "user",
    deviceId,
    sessionId,
    username: "rescue_user",
    isActive: true,
    isSuspended: false,
    mustCompleteSecurityQuestions: false,
    avgRating: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function deviceRecord(overrides: Partial<UserDeviceRecord> = {}): UserDeviceRecord {
  return {
    id: sessionId,
    deviceId,
    deviceName: "Chrome on Windows",
    ip: "172.30.0.42",
    lastActiveAt: new Date("2026-10-21T09:00:00.000Z"),
    isOnline: true,
    isCurrentDevice: true,
    ...overrides
  };
}

async function makeApp(options: {
  listDevices?: UserDeviceStore["listDevices"];
  revokeOtherSession?: UserDeviceStore["revokeOtherSession"];
  user?: AuthenticatedUserContext | null;
  requireToken?: boolean;
  io?: Parameters<typeof registerUserDevicesRoute>[1]["io"];
} = {}) {
  const listDevices = vi.fn<UserDeviceStore["listDevices"]>(options.listDevices ?? (async () => [deviceRecord()]));
  const revokeOtherSession = vi.fn<UserDeviceStore["revokeOtherSession"]>(options.revokeOtherSession ?? (async () => true));
  const store: UserDeviceStore = { listDevices, revokeOtherSession };
  const app = Fastify({ logger: false });
  app.decorateRequest("authenticatedUser", null);
  app.addHook("preHandler", async (request, reply) => {
    if (options.requireToken !== false && request.headers.authorization !== "Bearer test-token") {
      return reply.code(401).send({ error: true, code: "UNAUTHORIZED", message: "Missing token.", issues: [] });
    }
    request.authenticatedUser = options.user === undefined ? sessionUser() : options.user;
  });
  await registerUserDevicesRoute(app, { store, io: options.io });
  apps.push(app);
  return { app, listDevices, revokeOtherSession };
}

describe("GET /_user/devices", () => {
  it("lists the account's live sessions against the shared device contract", async () => {
    const other = deviceRecord({
      id: randomUUID(),
      deviceId: randomUUID(),
      deviceName: "Firefox on Linux",
      ip: "172.30.0.9",
      lastActiveAt: new Date("2026-10-20T18:30:00.000Z"),
      isCurrentDevice: false
    });
    const { app, listDevices } = await makeApp({ listDevices: async () => [deviceRecord(), other] });

    const response = await app.inject({
      method: "GET",
      url: apiRoutes.user.devices.url,
      headers: { authorization: "Bearer test-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    // The shared response schema is the contract the settings page is generated from.
    expect(() => devicesSchema.parse(response.json())).not.toThrow();
    expect(response.json()).toEqual([
      {
        id: sessionId,
        deviceId,
        deviceName: "Chrome on Windows",
        ip: "172.30.0.42",
        isCurrentDevice: true,
        lastActiveAt: "2026-10-21T09:00:00.000Z",
        isOnline: true
      },
      {
        id: other.id,
        deviceId: other.deviceId,
        deviceName: "Firefox on Linux",
        ip: "172.30.0.9",
        isCurrentDevice: false,
        lastActiveAt: "2026-10-20T18:30:00.000Z",
        isOnline: true
      }
    ]);
    expect(listDevices).toHaveBeenCalledWith({ userId, currentSessionId: sessionId, limit: MAX_USER_DEVICE_LIST_ITEMS });
  });

  it("answers with an empty list when the store has no live session to report", async () => {
    const { app, listDevices } = await makeApp({ listDevices: async () => [] });

    const response = await app.inject({
      method: "GET",
      url: apiRoutes.user.devices.url,
      headers: { authorization: "Bearer test-token" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    expect(listDevices).toHaveBeenCalledTimes(1);
  });

  it("fails closed without a verified identity instead of reading the table", async () => {
    const { app, listDevices } = await makeApp({ user: null });

    const response = await app.inject({
      method: "GET",
      url: apiRoutes.user.devices.url,
      headers: { authorization: "Bearer test-token" }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("UNAUTHORIZED");
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(listDevices).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated request before the store is touched", async () => {
    const { app, listDevices } = await makeApp();

    const response = await app.inject({ method: "GET", url: apiRoutes.user.devices.url });

    expect(response.statusCode).toBe(401);
    expect(listDevices).not.toHaveBeenCalled();
  });
});


describe("DELETE /_user/devices/:sessionId", () => {
  const path = (id: string) => apiRoutes.user.revokeDevice.makeFullPath({ sessionId: id });
  const otherSession = randomUUID();

  it("rejects unauthorized, missing context, malformed and current-session targets without a write", async () => {
    const { app, revokeOtherSession } = await makeApp();
    expect((await app.inject({ method: "DELETE", url: path(otherSession) })).statusCode).toBe(401);
    expect((await app.inject({ method: "DELETE", url: "/_user/devices/not-a-uuid", headers: { authorization: "Bearer test-token" } })).statusCode).toBe(400);
    const current = await app.inject({ method: "DELETE", url: path(sessionId), headers: { authorization: "Bearer test-token" } });
    expect(current.statusCode).toBe(403);
    expect(current.json().code).toBe("CURRENT_SESSION");
    expect(revokeOtherSession).not.toHaveBeenCalled();
    const empty = await makeApp({ user: null });
    expect((await empty.app.inject({ method: "DELETE", url: path(otherSession), headers: { authorization: "Bearer test-token" } })).statusCode).toBe(401);
  });

  it("disconnects only a successfully revoked session's realtime sockets", async () => {
    const disconnectSockets = vi.fn();
    const inRoom = vi.fn(() => ({ disconnectSockets }));
    const { app } = await makeApp({ io: { in: inRoom } as unknown as Parameters<typeof registerUserDevicesRoute>[1]["io"],
      revokeOtherSession: async input => input.sessionId === otherSession });
    const headers = { authorization: "Bearer test-token" };
    await app.inject({ method: "DELETE", url: path(randomUUID()), headers });
    expect(inRoom).not.toHaveBeenCalled();
    await app.inject({ method: "DELETE", url: path(otherSession), headers });
    expect(inRoom).toHaveBeenCalledWith(`session:${otherSession}`);
    expect(disconnectSockets).toHaveBeenCalledWith(true);
  });

  it("revokes only an owned other session and gives unknown / foreign sessions the same response", async () => {
    const { app, revokeOtherSession } = await makeApp({ revokeOtherSession: async (input) => input.sessionId === otherSession });
    const headers = { authorization: "Bearer test-token" };
    const ok = await app.inject({ method: "DELETE", url: path(otherSession), headers });
    expect(ok.statusCode).toBe(200);
    expect(ok.json()).toEqual({ ok: true });
    expect(ok.headers["cache-control"]).toBe("no-store");
    expect(revokeOtherSession).toHaveBeenCalledWith({ userId, sessionId: otherSession, currentSessionId: sessionId });
    const unknown = await app.inject({ method: "DELETE", url: path(randomUUID()), headers });
    expect(unknown.statusCode).toBe(404);
    expect(unknown.json().code).toBe("DEVICE_NOT_FOUND");
  });
});
