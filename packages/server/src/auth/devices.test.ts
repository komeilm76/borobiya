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
  user?: AuthenticatedUserContext | null;
  requireToken?: boolean;
} = {}) {
  const listDevices = vi.fn<UserDeviceStore["listDevices"]>(options.listDevices ?? (async () => [deviceRecord()]));
  const store: UserDeviceStore = { listDevices };
  const app = Fastify({ logger: false });
  app.decorateRequest("authenticatedUser", null);
  app.addHook("preHandler", async (request, reply) => {
    if (options.requireToken !== false && request.headers.authorization !== "Bearer test-token") {
      return reply.code(401).send({ error: true, code: "UNAUTHORIZED", message: "Missing token.", issues: [] });
    }
    request.authenticatedUser = options.user === undefined ? sessionUser() : options.user;
  });
  await registerUserDevicesRoute(app, { store });
  apps.push(app);
  return { app, listDevices };
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
