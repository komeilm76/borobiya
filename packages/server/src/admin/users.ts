import { apiRoutes } from "@borobiya/shared/api";
import {
  adminUserListQuerySchema,
  createAdminUserSchema,
  idParamsSchema,
  toggleActiveSchema
} from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AdminUserDetailRecord, AdminUserRecord, AdminUserStore } from "../db/admin-user-store";
import { hashPassword as argon2HashPassword } from "../security/password";
import type { SessionTokenIdentity } from "../security/tokens";
import type { PasswordHasher } from "../auth/register";
import { authorizeAdmin, errorResponse } from "./authorize";
import { disconnectUserSockets, type SocketDisconnector } from "../realtime/socket";

export interface AdminUsersRouteDependencies {
  store: AdminUserStore;
  jwtSecret: string;
  hashPassword?: PasswordHasher;
  io?: SocketDisconnector;
}

// The bearer-token, current-account, and unrevoked-session checks live in ./authorize so every privileged
// surface answers them the same way. Two copies is how one admin route ends up accepting a token the
// other rejects.



function profilePayload(user: AdminUserRecord) {
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    mustCompleteSecurityQuestions: user.mustCompleteSecurityQuestions,
    isActive: user.isActive,
    avgRating: user.avgRating,
    createdAt: user.createdAt.toISOString()
  };
}

function detailPayload(user: AdminUserDetailRecord) {
  return {
    ...profilePayload(user),
    devices: user.devices.map((device) => ({
      ...device,
      lastActiveAt: device.lastActiveAt.toISOString()
    })),
    missions: user.missions
  };
}

export async function registerAdminUserRoutes(
  app: FastifyInstance,
  dependencies: AdminUsersRouteDependencies
): Promise<void> {
  const hashPassword = dependencies.hashPassword ?? argon2HashPassword;
  const listRoute = apiRoutes.admin.listUsers;
  const detailRoute = apiRoutes.admin.getUser;
  const createRoute = apiRoutes.admin.createUser;
  const statusRoute = apiRoutes.admin.updateUserStatus;

  app.get(listRoute.url, async (request, reply) => {
    const identity = await authorizeAdmin(request, reply, dependencies);
    if (!identity) return;

    const parsed = adminUserListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.code(400).send(errorResponse(
        "VALIDATION_ERROR",
        "Query validation failed.",
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      ));
    }

    const result = await dependencies.store.listUsers(parsed.data);
    return reply
      .code(200)
      .header("cache-control", "no-store")
      .send({
        items: result.items.map(profilePayload),
        total: result.total,
        page: result.page,
        limit: result.limit,
        totalPages: result.totalPages
      });
  });

  app.get(detailRoute.url, async (request, reply) => {
    const identity = await authorizeAdmin(request, reply, dependencies);
    if (!identity) return;

    const parsedParams = idParamsSchema.safeParse(request.params);
    if (!parsedParams.success) {
      return reply.code(400).send(errorResponse(
        "VALIDATION_ERROR",
        "Path parameter validation failed.",
        parsedParams.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      ));
    }

    const user = await dependencies.store.getUserDetails(parsedParams.data.id, identity.sessionId);
    if (!user) {
      return reply.code(404).send(errorResponse("USER_NOT_FOUND", "The requested user does not exist."));
    }

    return reply
      .code(200)
      .header("cache-control", "no-store")
      .send(detailPayload(user));
  });

  app.post(createRoute.url, async (request, reply) => {
    const identity = await authorizeAdmin(request, reply, dependencies);
    if (!identity) return;

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
      .send(profilePayload(user));
  });

  app.patch(statusRoute.url, async (request, reply) => {
    const identity = await authorizeAdmin(request, reply, dependencies);
    if (!identity) return;

    const parsedParams = idParamsSchema.safeParse(request.params);
    const parsedBody = toggleActiveSchema.safeParse(request.body);
    if (!parsedParams.success || !parsedBody.success) {
      const issues = [
        ...(!parsedParams.success ? parsedParams.error.issues : []),
        ...(!parsedBody.success ? parsedBody.error.issues : [])
      ].map(({ code, message, path }) => ({ code, message, path }));
      return reply.code(400).send(errorResponse("VALIDATION_ERROR", "Request validation failed.", issues));
    }

    const user = await dependencies.store.updateUserActiveStatus({
      adminId: identity.userId,
      userId: parsedParams.data.id,
      isActive: parsedBody.data.isActive
    });
    if (!user) {
      return reply.code(404).send(errorResponse("USER_NOT_FOUND", "The requested user does not exist."));
    }
    if (!user.isActive) {
      disconnectUserSockets(dependencies.io, user.id);
    }

    return reply
      .code(200)
      .header("cache-control", "no-store")
      .send(profilePayload(user));
  });
}
