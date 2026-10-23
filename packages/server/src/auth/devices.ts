import { apiRoutes } from "@borobiya/shared/api";
import { MAX_USER_DEVICE_LIST_ITEMS } from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserDeviceRecord, UserDeviceStore } from "../db/device-store";
import type { AuthenticatedUserContext } from "./user-security-questions";

export interface UserDevicesRouteDependencies {
  store: UserDeviceStore;
}

function errorResponse(code: string, message: string) {
  return { error: true as const, code, message, issues: [] };
}

function sendError(reply: FastifyReply, statusCode: number, code: string, message: string) {
  return reply.code(statusCode).header("cache-control", "no-store").send(errorResponse(code, message));
}

/** Maps a persisted session row onto the shared `UserDevice` contract. */
export function devicePayload(device: UserDeviceRecord) {
  return {
    id: device.id,
    deviceId: device.deviceId,
    deviceName: device.deviceName,
    ip: device.ip,
    isCurrentDevice: device.isCurrentDevice,
    lastActiveAt: device.lastActiveAt.toISOString(),
    isOnline: device.isOnline
  };
}

/**
 * Active Devices table (T2.3.2, spec §7.3): every session of the caller's account that still holds a
 * refresh token, newest activity first, capped at `MAX_USER_DEVICE_LIST_ITEMS`.
 *
 * `devices.length > 1` is the exact condition the client uses to require the priority-device
 * selection (T2.3.3), which is why the list is deliberately live sessions rather than login history.
 * `ip` is the address seen at the last credential exchange (login or refresh rotation), while
 * `isOnline` and `lastActiveAt` reflect real-time Socket.IO session presence (`attachRealtime`).
 */
export async function registerUserDevicesRoute(
  app: FastifyInstance,
  dependencies: UserDevicesRouteDependencies
): Promise<void> {
  const route = apiRoutes.user.devices;

  app.get(route.url, async (request: FastifyRequest, reply) => {
    // The `/_user` hook normally fills this in; an empty context means the route was registered
    // ahead of that hook, which must fail closed instead of leaking another account's devices.
    const user: AuthenticatedUserContext | null = request.authenticatedUser;
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const devices = await dependencies.store.listDevices({
      userId: user.userId,
      currentSessionId: user.sessionId,
      limit: MAX_USER_DEVICE_LIST_ITEMS
    });

    return reply.code(200).header("cache-control", "no-store").send(devices.map(devicePayload));
  });
}
