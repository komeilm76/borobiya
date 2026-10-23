import { apiRoutes, sharePathParamsSchema } from "@borobiya/shared/api";
import {
  createLocationShareSchema,
  MAX_LOCATION_SHARE_LIST_ITEMS,
  MAX_USER_DEVICE_LIST_ITEMS
} from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { LocationShareRecord, LocationShareStore, ShareTargetAssessment } from "../db/location-share-store";
import type { UserDeviceStore } from "../db/device-store";
import type { AuthenticatedUserContext } from "../auth/user-security-questions";

const MINUTE_MS = 60_000;

export interface LocationSharesRouteDependencies {
  store: LocationShareStore;
  /** Live sessions of the caller, i.e. the `activeDevices` set spec §7.3 counts. */
  devices: Pick<UserDeviceStore, "listDevices">;
}

function errorResponse(code: string, message: string, issues: unknown[] = []) {
  return { error: true as const, code, message, issues };
}

function sendError(
  reply: FastifyReply,
  statusCode: number,
  code: string,
  message: string,
  issues: unknown[] = []
) {
  return reply
    .code(statusCode)
    .header("cache-control", "no-store")
    .send(errorResponse(code, message, issues));
}

/**
 * One 400 VALIDATION_ERROR payload per unusable recipient, keyed by the index it appeared at in the
 * request. Shared with history-share creation so both endpoints refuse the same targets the same way.
 *
 * `path` is a body path (`["targetUserIds", index]`), the same shape the schema's own issues use in
 * this response — a client that already knows how to point at a rejected field can therefore point at
 * the rejected array element and name the person, which is the difference between "check your input"
 * and " Ali was not available" on a 30-recipient request.
 */
export function shareRecipientIssues(
  assessment: ShareTargetAssessment,
  targetUserIds: readonly string[]
) {
  const indexById = new Map(targetUserIds.map((id, index) => [id, index]));
  return [
    ...assessment.self.map((id) => ({
      code: "self_target",
      message: "You cannot share your location with your own account.",
      path: ["targetUserIds", indexById.get(id) ?? 0]
    })),
    ...assessment.missing.map((id) => ({
      code: "unknown_target",
      message: "One or more recipients do not exist.",
      path: ["targetUserIds", indexById.get(id) ?? 0]
    })),
    ...assessment.unavailable.map((id) => ({
      code: "unavailable_target",
      message: "One or more recipients are inactive or suspended.",
      path: ["targetUserIds", indexById.get(id) ?? 0]
    }))
  ];
}

/** Maps a persisted row onto the shared `LocationShare` contract. */
export function sharePayload(share: LocationShareRecord) {
  return {
    id: share.id,
    ownerId: share.ownerId,
    targetUserId: share.targetUserId,
    mode: share.mode,
    expiresAt: share.expiresAt ? share.expiresAt.toISOString() : null,
    isRevoked: share.isRevoked,
    priorityDeviceId: share.priorityDeviceId,
    note: share.note,
    createdAt: share.createdAt.toISOString()
  };
}

function currentUserIdentity(request: FastifyRequest): AuthenticatedUserContext | null {
  const user = request.authenticatedUser;
  if (!user) return null;
  return user;
}

/**
 * Which device may broadcast to the shares of one request (spec §7.3).
 *
 * The rule is deliberately per-request rather than account-wide: a share row pins one device, so an
 * account with a phone and a laptop can have the car-nav share follow the phone and the dispatch
 * share follow the laptop. `location:update` (T2.3.4) then accepts a fix only for the shares whose
 * pin matches the connection's own session device.
 */
export type PriorityDeviceResolution =
  | { status: "pinned"; deviceId: string }
  /** More than one live device and the caller named none — the client must ask the user. */
  | { status: "required"; deviceIds: string[] }
  /** The named device is not a live session of this account (logged out, revoked, or invented). */
  | { status: "unknown"; deviceId: string };

/**
 * Counts distinct device identities, not sessions: a client that keeps one stable device id across
 * logins (spec §7.3 / T2.3.6) would otherwise look like several devices and be asked to choose
 * between two identical options.
 */
export function resolvePriorityDevice(input: {
  requested: string | undefined;
  devices: readonly { deviceId: string }[];
  currentDeviceId: string;
}): PriorityDeviceResolution {
  const devices = [...new Set(input.devices.map((device) => device.deviceId))];
  if (devices.length === 0) {
    // Unreachable through the `/_user` hook (it requires a live session). The fallback may only ever
    // pin the caller's own device, so a store disagreement cannot widen who is allowed to broadcast.
    if (input.requested !== undefined && input.requested !== input.currentDeviceId) {
      return { status: "unknown", deviceId: input.requested };
    }
    return { status: "pinned", deviceId: input.currentDeviceId };
  }
  if (input.requested === undefined) {
    if (devices.length > 1) {
      return { status: "required", deviceIds: devices };
    }
    // Exactly one live device, so the server pins it and a single-device account is never prompted.
    return { status: "pinned", deviceId: devices[0]! };
  }
  return devices.includes(input.requested)
    ? { status: "pinned", deviceId: input.requested }
    : { status: "unknown", deviceId: input.requested };
}

/**
 * Live-location share creation (T2.1.2) with the multi-device priority rule (T2.3.3).
 *
 * TODO: Privacy v2 — the receiver of a share may read the owner's live position for the
 * whole share window; allowlists/blocklists and finer windows remain out of scope (spec §7.4).
 */
export async function registerLocationShareRoutes(
  app: FastifyInstance,
  dependencies: LocationSharesRouteDependencies
): Promise<void> {
  const createRoute = apiRoutes.location.createShare;
  const revokeRoute = apiRoutes.location.revokeShare;
  const listRoute = apiRoutes.location.listShares;

  app.post(createRoute.url, async (request, reply) => {
    const user = currentUserIdentity(request);
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const parsed = createLocationShareSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Request body validation failed.",
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    const { targetUserIds, mode, durationMinutes, note } = parsed.data;
    const assessment = await dependencies.store.assessShareTargets({
      ownerId: user.userId,
      targetUserIds
    });
    const issues = shareRecipientIssues(assessment, targetUserIds);
    // Reject the whole request instead of partially sharing so the caller always learns
    // which recipients were refused.
    if (issues.length > 0) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Location sharing requires active recipients that are not your own account.",
        issues
      );
    }

    // Resolved after recipient validation (both are the caller's to fix) and before any write, so a
    // multi-device account never ends up with shares that no device is allowed to feed.
    const devices = await dependencies.devices.listDevices({
      userId: user.userId,
      currentSessionId: user.sessionId,
      limit: MAX_USER_DEVICE_LIST_ITEMS
    });
    const priority = resolvePriorityDevice({
      requested: parsed.data.priorityDeviceId,
      devices,
      currentDeviceId: user.deviceId
    });
    if (priority.status === "required") {
      return sendError(
        reply,
        409,
        "PRIORITY_DEVICE_REQUIRED",
        "This account is active on multiple devices. Choose which one broadcasts your location.",
        [{ code: "multiple_active_devices", deviceIds: priority.deviceIds, path: ["priorityDeviceId"] }]
      );
    }
    if (priority.status === "unknown") {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Request body validation failed.",
        [{
          code: "unknown_priority_device",
          message: "That device is not a live session of this account. Refresh the device list and choose again.",
          path: ["priorityDeviceId"]
        }]
      );
    }

    const expiresAt = mode === "timed"
      ? new Date(Date.now() + (durationMinutes ?? 0) * MINUTE_MS)
      : null;

    const result = await dependencies.store.createShares({
      ownerId: user.userId,
      targetUserIds: assessment.eligible,
      mode,
      expiresAt,
      note: note ?? null,
      priorityDeviceId: priority.deviceId
    });

    return reply
      .code(201)
      .header("cache-control", "no-store")
      .send({
        shares: result.shares.map(sharePayload),
        createdShareIds: result.createdShareIds,
        reusedShareIds: result.reusedShareIds
      });
  });

  // TODO (T2.1.5 follow-up): the Socket.IO fan-out exists now, but there is no share-state event
  // yet, so a revoked share's marker clears on the receiver's next list refresh rather than at once.
  app.delete(revokeRoute.url, async (request, reply) => {
    const user = currentUserIdentity(request);
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const parsedParams = sharePathParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return sendError(
        reply,
        400,
        "VALIDATION_ERROR",
        "Path parameter validation failed.",
        parsedParams.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    const outcome = await dependencies.store.revokeShare({
      ownerId: user.userId,
      shareId: parsedParams.data.shareId
    });
    if (outcome === "not-found") {
      return sendError(
        reply,
        404,
        "SHARE_NOT_FOUND",
        "No share with that id belongs to this account."
      );
    }

    // An already-revoked id repeats the successful outcome so a retried revoke stays idempotent.
    return reply.code(200).header("cache-control", "no-store").send();
  });

  app.get(listRoute.url, async (request, reply) => {
    const user = currentUserIdentity(request);
    if (!user) {
      return sendError(reply, 401, "UNAUTHORIZED", "A valid access token is required.");
    }

    const { owned, sharedWithMe } = await dependencies.store.listActiveShares({
      userId: user.userId,
      limit: MAX_LOCATION_SHARE_LIST_ITEMS
    });

    return reply.code(200).header("cache-control", "no-store").send({
      // `targetUsername` rides along so an outgoing row reads as a person; see `ownedLocationShareSchema`
      // for why the read tolerates not knowing the name.
      owned: owned.map((share) => ({ ...sharePayload(share), targetUsername: share.targetUsername })),
      sharedWithMe: sharedWithMe.map((share) => ({
        ...sharePayload(share),
        owner: {
          id: share.owner.id,
          username: share.owner.username,
          lastLocation: share.owner.lastLocation
        }
      }))
    });
  });
}
