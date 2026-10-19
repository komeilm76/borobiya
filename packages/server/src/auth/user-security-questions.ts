import { apiRoutes } from "@borobiya/shared/api";
import { completeSecurityQuestionsSchema } from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { SecurityQuestionAnswerHash, UserSecurityQuestionsStore } from "../db/security-questions-store";
import { hashPassword as argon2HashPassword } from "../security/password";
import { verifyAccessToken, type SessionTokenIdentity } from "../security/tokens";
import { normalizeSecurityAnswer, type PasswordHasher } from "./register";

export interface AuthenticatedUserContext extends SessionTokenIdentity {
  username: string;
  isActive: boolean;
  isSuspended: boolean;
  mustCompleteSecurityQuestions: boolean;
  avgRating: number | null;
  createdAt: Date;
}

declare module "fastify" {
  interface FastifyRequest {
    authenticatedUser: AuthenticatedUserContext | null;
  }
}

export interface UserSecurityQuestionsRouteDependencies {
  store: UserSecurityQuestionsStore;
  jwtSecret: string;
  hashPassword?: PasswordHasher;
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

function userPath(request: FastifyRequest): string {
  return request.url.split("?", 1)[0] ?? "";
}

function bearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;
  if (authorization === undefined) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

function sendUnauthorized(reply: FastifyReply, code: string) {
  return sendError(reply, 401, code, "A valid access token is required.");
}

function validationError(reply: FastifyReply, issues: unknown[]) {
  return sendError(reply, 400, "VALIDATION_ERROR", "Request body validation failed.", issues);
}

export async function registerUserSecurityQuestionsRoute(
  app: FastifyInstance,
  dependencies: UserSecurityQuestionsRouteDependencies
): Promise<void> {
  const route = apiRoutes.user.completeSecurityQuestions;
  const hashPassword = dependencies.hashPassword ?? argon2HashPassword;

  app.decorateRequest("authenticatedUser", null);
  app.addHook("preHandler", async (request, reply) => {
    const path = userPath(request);
    if (path !== "/_user" && !path.startsWith("/_user/")) return;

    const token = bearerToken(request);
    if (!token) {
      return sendUnauthorized(reply, request.headers.authorization === undefined ? "UNAUTHORIZED" : "INVALID_ACCESS_TOKEN");
    }

    const identity = await verifyAccessToken(token, dependencies.jwtSecret);
    if (!identity) return sendUnauthorized(reply, "INVALID_ACCESS_TOKEN");

    const user = await dependencies.store.findUserById(identity.userId);
    if (!user) return sendUnauthorized(reply, "UNAUTHORIZED");
    if (user.role !== identity.role) {
      return sendError(reply, 403, "FORBIDDEN", "The access token no longer matches this account.");
    }
    if (!user.isActive) {
      return sendError(reply, 403, "ACCOUNT_INACTIVE", "This account is inactive. Contact an administrator.");
    }
    if (user.isSuspended) {
      return sendError(reply, 403, "ACCOUNT_SUSPENDED", "This account is suspended. Contact an administrator.");
    }
    if (!(await dependencies.store.hasActiveSession({
      userId: identity.userId,
      sessionId: identity.sessionId,
      deviceId: identity.deviceId
    }))) {
      return sendUnauthorized(reply, "INVALID_ACCESS_TOKEN");
    }

    request.authenticatedUser = {
      ...identity,
      username: user.username,
      isActive: user.isActive,
      isSuspended: user.isSuspended,
      mustCompleteSecurityQuestions: user.mustCompleteSecurityQuestions,
      avgRating: user.avgRating,
      createdAt: user.createdAt
    };

    if (user.mustCompleteSecurityQuestions && (request.method !== route.method || path !== route.url)) {
      return sendError(
        reply,
        403,
        "SECURITY_QUESTIONS_REQUIRED",
        "Complete your security questions before using other user features."
      );
    }
  });

  app.get(apiRoutes.user.me.url, async (request, reply) => {
    const user = request.authenticatedUser;
    if (!user) return sendUnauthorized(reply, "UNAUTHORIZED");

    return reply.header("cache-control", "no-store").send({
      id: user.userId,
      username: user.username,
      role: user.role,
      mustCompleteSecurityQuestions: user.mustCompleteSecurityQuestions,
      isActive: user.isActive,
      avgRating: user.avgRating,
      createdAt: user.createdAt.toISOString()
    });
  });

  app.post(route.url, async (request, reply) => {
    const authenticatedUser = request.authenticatedUser;
    if (!authenticatedUser) return sendUnauthorized(reply, "UNAUTHORIZED");
    if (!authenticatedUser.mustCompleteSecurityQuestions) {
      return sendError(
        reply,
        409,
        "SECURITY_QUESTIONS_ALREADY_COMPLETED",
        "Security questions have already been completed for this account."
      );
    }

    const parsed = completeSecurityQuestionsSchema.safeParse(request.body);
    if (!parsed.success) {
      return validationError(
        reply,
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      );
    }

    const questionIds = parsed.data.securityQuestions.map(({ questionId }) => questionId);
    if (!(await dependencies.store.securityQuestionsExist(questionIds))) {
      return validationError(reply, [{
        code: "invalid_question",
        message: "Choose five security questions from the available list.",
        path: ["securityQuestions"]
      }]);
    }

    const answers: SecurityQuestionAnswerHash[] = [];
    for (const { questionId, answer } of parsed.data.securityQuestions) {
      answers.push({
        questionId,
        answerHash: await hashPassword(normalizeSecurityAnswer(answer))
      });
    }

    const completed = await dependencies.store.completeSecurityQuestions({
      userId: authenticatedUser.userId,
      answers
    });
    if (!completed) {
      return sendError(
        reply,
        409,
        "SECURITY_QUESTIONS_ALREADY_COMPLETED",
        "Security questions have already been completed for this account."
      );
    }

    return reply.code(200).header("cache-control", "no-store").send({ ok: true });
  });
}
