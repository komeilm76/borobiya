import { apiRoutes } from "@borobiya/shared/api";
import { registerSchema, type RegisterInput } from "@borobiya/shared";
import type { FastifyInstance } from "fastify";
import { hashPassword as argon2HashPassword } from "../security/password";
import type { RegistrationAnswerHash, UserRegistrationStore } from "../db/registration-store";

export type PasswordHasher = (password: string) => Promise<string>;

export interface RegisterRouteDependencies {
  store: UserRegistrationStore;
  hashPassword?: PasswordHasher;
}

export function normalizeSecurityAnswer(answer: string): string {
  return answer.trim().toLowerCase();
}

function errorResponse(code: string, message: string, issues: unknown[] = []) {
  return { error: true as const, code, message, issues };
}

function isRegistrationInput(value: unknown): value is { username?: unknown } {
  return typeof value === "object" && value !== null;
}

export async function registerAuthRoutes(
  app: FastifyInstance,
  dependencies: RegisterRouteDependencies
): Promise<void> {
  const route = apiRoutes.auth.register;
  const hashPassword = dependencies.hashPassword ?? argon2HashPassword;

  app.post(route.url, {
    config: {
      rateLimit: {
        max: 5,
        timeWindow: 15 * 60 * 1000,
        hook: "preHandler",
        keyGenerator: (request) => {
          const body = isRegistrationInput(request.body)
            ? request.body as { username?: unknown }
            : undefined;
          const username = typeof body?.username === "string" ? body.username.toLowerCase() : "<invalid>";
          return `${request.ip}:${username}`;
        }
      }
    }
  }, async (request, reply) => {
    // Run after route-specific rate limiting so credentials cannot bypass the signup quota.
    // This guest-only endpoint fails closed whenever an Authorization header is supplied.
    if (request.headers.authorization !== undefined) {
      return reply.code(403).send(errorResponse(
        "ALREADY_AUTHENTICATED",
        "Log out before creating another account."
      ));
    }

    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send(errorResponse(
        "VALIDATION_ERROR",
        "Request body validation failed.",
        parsed.error.issues.map(({ code, message, path }) => ({ code, message, path }))
      ));
    }

    const input: RegisterInput = parsed.data;
    if (await dependencies.store.usernameExists(input.username)) {
      return reply.code(409).send(errorResponse("USERNAME_TAKEN", "That username is already in use."));
    }

    const questionIds = input.securityQuestions.map(({ questionId }) => questionId);
    if (!(await dependencies.store.securityQuestionsExist(questionIds))) {
      return reply.code(400).send(errorResponse(
        "VALIDATION_ERROR",
        "Choose five security questions from the available list.",
        [{ code: "invalid_question", message: "One or more question IDs are unavailable.", path: ["securityQuestions"] }]
      ));
    }

    // Hash sequentially so a single registration does not hold six Argon2 memory blocks at once.
    const passwordHash = await hashPassword(input.password);
    const answers: RegistrationAnswerHash[] = [];
    for (const { questionId, answer } of input.securityQuestions) {
      answers.push({ questionId, answerHash: await hashPassword(normalizeSecurityAnswer(answer)) });
    }

    const user = await dependencies.store.createUserWithAnswers({
      username: input.username,
      passwordHash,
      answers
    });
    if (!user) {
      // The username may have been claimed after the preflight check.
      return reply.code(409).send(errorResponse("USERNAME_TAKEN", "That username is already in use."));
    }

    return reply.code(201).send({
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt.toISOString()
      }
    });
  });
}
