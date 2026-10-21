import { apiRoutes } from "@borobiya/shared/api";
import { locationUpdateSchema } from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { LocationShareStore } from "../db/location-share-store";
import type { LocationHistoryStore } from "../db/location-history-store";

/** A device clock ahead of the server by more than this is treated as unusable. */
export const MAX_FUTURE_TIMESTAMP_SKEW_MS = 5 * 60_000;

export interface PeerLocationUpdate {
  userId: string;
  lat: number;
  lon: number;
  accuracy: number | null;
  timestamp: string;
}

export type LiveUpdateResult =
  | {
      status: "accepted";
      /** Users whose active share accepted this device; each maps to a `user:{id}` room. */
      peers: string[];
      fix: Omit<PeerLocationUpdate, "userId">;
    }
  | { status: "rejected"; code: "VALIDATION_ERROR" | "INVALID_TIMESTAMP" | "WRONG_DEVICE"; message: string; issues: unknown[] };

export interface LiveLocationServiceDependencies {
  shareStore: Pick<LocationShareStore, "listActiveOutgoingShares">;
  historyStore: Pick<LocationHistoryStore, "recordFix">;
  /** Injectable clock for tests. */
  now?: () => Date;
}

export interface LiveLocationService {
  /**
   * Validates one `location:update` payload, applies the multi-device priority rule,
   * persists the fix, and returns the recipients that should receive it.
   */
  applyUpdate(input: { userId: string; deviceId: string; payload: unknown }): Promise<LiveUpdateResult>;
}

function rejected(
  code: "VALIDATION_ERROR" | "INVALID_TIMESTAMP" | "WRONG_DEVICE",
  message: string,
  issues: unknown[] = []
): LiveUpdateResult {
  return { status: "rejected", code, message, issues };
}

export function createLiveLocationService(
  dependencies: LiveLocationServiceDependencies
): LiveLocationService {
  const now = dependencies.now ?? (() => new Date());

  return {
    async applyUpdate({ userId, deviceId, payload }) {
      const parsed = locationUpdateSchema.safeParse(payload);
      if (!parsed.success) {
        return rejected(
          "VALIDATION_ERROR",
          "A location update needs coordinates, an observation time, and the reporting device.",
          parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
        );
      }

      const { lat, lon, accuracy, timestamp, priorityDeviceId } = parsed.data;
      // The payload names the device that is broadcasting. It must be the device the caller is
      // actually authenticated as, so the fallback cannot claim to be somebody else's phone.
      if (priorityDeviceId !== deviceId) {
        return rejected(
          "WRONG_DEVICE",
          "The reporting device does not match this session."
        );
      }

      const observedAt = new Date(timestamp);
      if (observedAt.getTime() > now().getTime() + MAX_FUTURE_TIMESTAMP_SKEW_MS) {
        return rejected(
          "INVALID_TIMESTAMP",
          "The reported observation time is too far in the future."
        );
      }

      const shares = await dependencies.shareStore.listActiveOutgoingShares(userId);
      const accepted = shares.filter(
        (share) => share.priorityDeviceId === null || share.priorityDeviceId === deviceId
      );
      if (shares.length > 0 && accepted.length === 0) {
        // T2.3.4: an account that pinned a priority device ignores GPS from every other
        // device, so a stale laptop tab cannot overwrite the phone that is actually sharing.
        return rejected(
          "WRONG_DEVICE",
          "This account broadcasts its location from another selected device."
        );
      }

      await dependencies.historyStore.recordFix({
        userId,
        lat,
        lon,
        accuracy: accuracy ?? null,
        timestamp: observedAt
      });

      return {
        status: "accepted",
        peers: [...new Set(accepted.map((share) => share.targetUserId))],
        fix: { lat, lon, accuracy: accuracy ?? null, timestamp: observedAt.toISOString() }
      };
    }
  };
}

function bearerToken(request: FastifyRequest): string | undefined {
  const authorization = request.headers.authorization;
  if (authorization === undefined) return undefined;
  return /^Bearer\s+([^\s]+)$/i.exec(authorization.trim())?.[1];
}

/**
 * `POST /_user/location/update` is the deprecated REST fallback for clients that cannot hold a
 * WebSocket. It runs the same validation, priority-device rule, and persistence as the socket and
 * fans the result out to connected peers, so a fallback fix is never silently local-only.
 */
export async function registerLocationUpdateRoute(
  app: FastifyInstance,
  dependencies: {
    service: LiveLocationService;
    /** Optional realtime fan-out so a fallback fix also reaches connected peers. */
    broadcast?: (peerIds: string[], update: PeerLocationUpdate) => void;
  }
): Promise<void> {
  const route = apiRoutes.location.updateLocation;

  app.post(route.url, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) {
      return reply.code(401).header("cache-control", "no-store").send({
        error: true as const,
        code: "UNAUTHORIZED",
        message: "A valid access token is required.",
        issues: []
      });
    }

    const result = await dependencies.service.applyUpdate({
      userId: user.userId,
      deviceId: user.deviceId,
      payload: request.body
    });
    if (result.status === "rejected") {
      const statusCode = result.code === "VALIDATION_ERROR" ? 400 : result.code === "WRONG_DEVICE" ? 409 : 400;
      return reply.code(statusCode).header("cache-control", "no-store").send({
        error: true as const,
        code: result.code,
        message: result.message,
        issues: result.issues
      });
    }

    dependencies.broadcast?.(result.peers, { userId: user.userId, ...result.fix });
    return reply.code(200).header("cache-control", "no-store").send();
  });
}
