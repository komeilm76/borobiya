import { apiRoutes } from "@borobiya/shared/api";
import { createAdminUserSchema } from "@borobiya/shared";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { AdminUserStore } from "../db/admin-user-store";
import { hashPassword as argon2HashPassword } from "../security/password";
import { verifyAccessToken } from "../security/tokens";
import type { PasswordHasher } from "../auth/register";

export interface AdminUsersRouteDependencies {
  store: AdminUserStore;
  jwtSecret: string;
  hashPassword?: PasswordHasher;
}

function errorResponse(code: string, message: string, issues: unknown[] = []) {
  return { error: true as const, code, message, issues };
}

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (authorization === undefined) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

export async function registerAdminUserRoutes(
  app: FastifyInstance,
  dependencies: AdminUsersRouteDependencies
): Promise<void> {
  const hashPassword = dependencies.hashPassword ?? argon2HashPassword;
  const route = apiRoutes.admin.createUser;

  app.post(route.url, async (request, reply) => {
    const token = bearerToken(request);
    if (!token) {
      return reply.code(401).send(errorResponse(
        request.headers.authorization === undefined ? "UNAUTHORIZED" : "INVALID_ACCESS_TOKEN",
        "A valid admin access token is required."
      ));
    }

    const identity = await verifyAccessToken(token, dependencies.jwtSecret);
    if (!identity) {
      return reply.code(401).send(errorResponse("INVALID_ACCESS_TOKEN", "A valid admin access token is required."));
    }
    if (identity.role !== "admin") {
      return reply.code(403).send(errorResponse("ADMIN_REQUIRED", "Administrator access is required."));
    }

    // Confirm the current account state so a disabled, suspended, or demoted admin cannot keep
    // using an otherwise unexpired access token for this privileged operation.
    const admin = await dependencies.store.findAdminActorById(identity.userId);
    if (!admin || admin.role !== "admin") {
      return reply.code(403).send(errorResponse("ADMIN_REQUIRED", "Administrator access is required."));
    }
    if (!admin.isActive) {
      return reply.code(403).send(errorResponse("ACCOUNT_INACTIVE", "This admin account is inactive."));
    }
    if (admin.isSuspended) {
      return reply.code(403).send(errorResponse("ACCOUNT_SUSPENDED", "This admin account is suspended."));
    }

    const parsed = createAdminUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(errorResponse(
        "VALIDATION_ERROR",
        "Request body validation failed.",
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      ));
    }

    const passwordHash = await hashPassword(parsed.data.password);
    const user = await dependencies.store.createAdminCreatedUser({
      username: parsed.data.username,
      passwordHash,
      ...(parsed.data.isActive === undefined ? {} : { isActive: parsed.data.isActive })
    });
    if (!user) {
      return reply.code(409).send(errorResponse("USERNAME_TAKEN", "That username is already in use."));
    }

    return reply
      .code(201)
      .header("cache-control", "no-store")
      .send({
        id: user.id,
        username: user.username,
        role: user.role,
        mustCompleteSecurityQuestions: user.mustCompleteSecurityQuestions,
        isActive: user.isActive,
        avgRating: user.avgRating,
        createdAt: user.createdAt.toISOString()
      });
  });
}
