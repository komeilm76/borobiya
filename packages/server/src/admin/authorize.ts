import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminUserStore } from "../db/admin-user-store";
import { verifyAccessToken, type SessionTokenIdentity } from "../security/tokens";

/**
 * The authorization every `/_admin` route shares, extracted from `./users` when `./incidents` needed the
 * same checks. Kept as one function on purpose: a privileged endpoint that re-implements this in miniature
 * is how an expired-session admin ends up accepted by one route and rejected by its neighbour.
 *
 * Only the two lookups it actually performs are required of the store, so a new admin surface does not
 * have to carry a user-admin store to get authorization.
 */
export interface AdminAuthorizerDependencies {
  store: Pick<AdminUserStore, "findAdminActorById" | "hasActiveSession">;
  jwtSecret: string;
}

export const ADMIN_UNAUTHORIZED_MESSAGE = "A valid admin access token is required.";

export function errorResponse(code: string, message: string, issues: unknown[] = []) {
  return { error: true as const, code, message, issues };
}

export function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (authorization === undefined) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

/** Returns the verified identity, or `null` after writing the failure reply — callers must return early. */
export async function authorizeAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
  dependencies: AdminAuthorizerDependencies
): Promise<SessionTokenIdentity | null> {
  const token = bearerToken(request);
  if (!token) {
    reply.code(401).send(errorResponse(
      request.headers.authorization === undefined ? "UNAUTHORIZED" : "INVALID_ACCESS_TOKEN",
      ADMIN_UNAUTHORIZED_MESSAGE
    ));
    return null;
  }

  const identity = await verifyAccessToken(token, dependencies.jwtSecret);
  if (!identity) {
    reply.code(401).send(errorResponse("INVALID_ACCESS_TOKEN", ADMIN_UNAUTHORIZED_MESSAGE));
    return null;
  }
  if (identity.role !== "admin") {
    reply.code(403).send(errorResponse("ADMIN_REQUIRED", "Administrator access is required."));
    return null;
  }

  // Recheck the current account so an inactive, suspended, or demoted admin cannot keep
  // using an otherwise unexpired access token for privileged operations.
  const admin = await dependencies.store.findAdminActorById(identity.userId);
  if (!admin || admin.role !== "admin") {
    reply.code(403).send(errorResponse("ADMIN_REQUIRED", "Administrator access is required."));
    return null;
  }
  if (!admin.isActive) {
    reply.code(403).send(errorResponse("ACCOUNT_INACTIVE", "This admin account is inactive."));
    return null;
  }
  if (admin.isSuspended) {
    reply.code(403).send(errorResponse("ACCOUNT_SUSPENDED", "This admin account is suspended."));
    return null;
  }
  if (!(await dependencies.store.hasActiveSession({
    userId: identity.userId,
    sessionId: identity.sessionId,
    deviceId: identity.deviceId
  }))) {
    reply.code(401).send(errorResponse("INVALID_ACCESS_TOKEN", ADMIN_UNAUTHORIZED_MESSAGE));
    return null;
  }

  return identity;
}

/** Type helper for a route module that only needs authorization plus its own store. */
export type AdminRouteRegistration = (app: FastifyInstance) => void;
