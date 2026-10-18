import { randomInt } from "node:crypto";
import { apiRoutes } from "@borobiya/shared/api";
import {
  forgotPasswordRequestSchema,
  forgotPasswordResetSchema,
  forgotPasswordVerifySchema
} from "@borobiya/shared";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { UserRecoveryStore } from "../db/recovery-store";
import {
  DUMMY_ARGON2ID_HASH,
  hashPassword as argon2HashPassword,
  verifyPassword as argon2VerifyPassword
} from "../security/password";
import {
  createPasswordResetToken,
  hashPasswordResetToken,
  PASSWORD_RESET_TOKEN_TTL_SECONDS
} from "../security/password-reset-token";
import { normalizeSecurityAnswer, type PasswordHasher } from "./register";

export type SecurityAnswerVerifier = (hash: string, answer: string) => Promise<boolean>;

export interface ForgotPasswordRouteDependencies {
  store: UserRecoveryStore;
  hashPassword?: PasswordHasher;
  verifyAnswer?: SecurityAnswerVerifier;
}

const RECOVERY_RATE_LIMIT_MAX = 5;
const RECOVERY_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_CHALLENGE_TTL_MS = 10 * 60 * 1000;

function errorResponse(code: string, message: string, issues: unknown[] = []) {
  return { error: true as const, code, message, issues };
}

function isAuthenticated(request: FastifyRequest): boolean {
  return request.headers.authorization !== undefined;
}

function usernameRateLimitKey(request: FastifyRequest): string {
  const body = typeof request.body === "object" && request.body !== null
    ? request.body as { username?: unknown }
    : undefined;
  const username = typeof body?.username === "string" ? body.username.toLowerCase() : "<invalid>";
  return `${request.ip}:${username}`;
}

function usernameRateLimit() {
  return {
    max: RECOVERY_RATE_LIMIT_MAX,
    timeWindow: RECOVERY_RATE_LIMIT_WINDOW_MS,
    hook: "preHandler" as const,
    keyGenerator: usernameRateLimitKey
  };
}

function resetRateLimit() {
  return {
    max: RECOVERY_RATE_LIMIT_MAX,
    timeWindow: RECOVERY_RATE_LIMIT_WINDOW_MS,
    hook: "preHandler" as const,
    keyGenerator: (request: FastifyRequest) => request.ip
  };
}

function sampleThree<T>(values: readonly T[]): T[] {
  const shuffled = [...values];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
  }
  return shuffled.slice(0, 3);
}

function validationError(reply: FastifyReply, issues: unknown[]) {
  return reply
    .code(400)
    .header("cache-control", "no-store")
    .send(errorResponse("VALIDATION_ERROR", "Request body validation failed.", issues));
}

function recoveryUnavailable(reply: FastifyReply) {
  return reply
    .code(503)
    .header("cache-control", "no-store")
    .send(errorResponse("RECOVERY_UNAVAILABLE", "Password recovery is temporarily unavailable."));
}

export async function registerForgotPasswordRoutes(
  app: FastifyInstance,
  dependencies: ForgotPasswordRouteDependencies
): Promise<void> {
  const hashPassword = dependencies.hashPassword ?? argon2HashPassword;
  const verifyAnswer = dependencies.verifyAnswer ?? argon2VerifyPassword;

  app.post(apiRoutes.auth.forgotPasswordRequest.url, {
    config: { rateLimit: usernameRateLimit() }
  }, async (request, reply) => {
    if (isAuthenticated(request)) {
      return reply.code(403).send(errorResponse("ALREADY_AUTHENTICATED", "Use password recovery as a guest."));
    }

    const parsed = forgotPasswordRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues.map(({ code, message, path }) => ({ code, message, path })));
    }

    const account = await dependencies.store.findAccountByUsername(parsed.data.username);
    const catalog = account?.answers.length === 5
      ? account.answers.map(({ questionId, text }) => ({ questionId, text }))
      : await dependencies.store.listSecurityQuestions();
    if (catalog.length < 3) return recoveryUnavailable(reply);

    const questions = sampleThree(catalog);
    if (account?.answers.length === 5) {
      const now = new Date();
      const challengeId = await dependencies.store.saveRecoveryChallenge({
        userId: account.id,
        questionIds: questions.map(({ questionId }) => questionId),
        createdAt: now,
        expiresAt: new Date(now.getTime() + RECOVERY_CHALLENGE_TTL_MS)
      });
      if (!challengeId) return recoveryUnavailable(reply);
    }

    return reply
      .code(200)
      .header("cache-control", "no-store")
      .send({
        questionIds: questions.map(({ questionId }) => questionId),
        questions: questions.map(({ text }) => text)
      });
  });

  app.post(apiRoutes.auth.forgotPasswordVerify.url, {
    config: { rateLimit: usernameRateLimit() }
  }, async (request, reply) => {
    if (isAuthenticated(request)) {
      return reply.code(403).send(errorResponse("ALREADY_AUTHENTICATED", "Use password recovery as a guest."));
    }

    const parsed = forgotPasswordVerifySchema.safeParse(request.body);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues.map(({ code, message, path }) => ({ code, message, path })));
    }

    const account = await dependencies.store.findAccountByUsername(parsed.data.username);
    const challenge = account
      ? await dependencies.store.findActiveRecoveryChallenge(account.id, new Date())
      : null;
    const submittedQuestionIds = parsed.data.answers.map(({ questionId }) => questionId);
    const challengeQuestionIds = new Set(challenge?.questionIds ?? []);
    const matchesChallenge =
      challenge !== null &&
      challenge.questionIds.length === parsed.data.answers.length &&
      challengeQuestionIds.size === parsed.data.answers.length &&
      submittedQuestionIds.every((questionId) => challengeQuestionIds.has(questionId));

    let answersMatch = matchesChallenge && account !== null;
    // Always execute three Argon2 verifications, even for missing accounts/challenges or bad question IDs.
    for (const submitted of parsed.data.answers) {
      const storedAnswer = matchesChallenge
        ? account?.answers.find(({ questionId }) => questionId === submitted.questionId)
        : undefined;
      let answerIsCorrect = false;
      try {
        answerIsCorrect = await verifyAnswer(
          storedAnswer?.answerHash ?? DUMMY_ARGON2ID_HASH,
          normalizeSecurityAnswer(submitted.answer)
        );
      } catch {
        // A malformed stored hash fails closed without making later answer checks skip their work.
        answerIsCorrect = false;
      }
      if (!storedAnswer || !answerIsCorrect) answersMatch = false;
    }

    if (!account || !challenge || !matchesChallenge || !answersMatch) {
      return reply.code(400).header("cache-control", "no-store").send(errorResponse(
        "WRONG_ANSWERS",
        "We could not verify those answers for this account."
      ));
    }

    const tokenNow = new Date();
    const resetToken = createPasswordResetToken();
    const issued = await dependencies.store.issuePasswordResetToken({
      userId: account.id,
      challengeId: challenge.id,
      tokenHash: hashPasswordResetToken(resetToken),
      now: tokenNow,
      expiresAt: new Date(tokenNow.getTime() + PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000)
    });
    if (!issued) {
      return reply.code(400).header("cache-control", "no-store").send(errorResponse(
        "WRONG_ANSWERS",
        "We could not verify those answers for this account."
      ));
    }

    return reply.code(200).header("cache-control", "no-store").send({ resetToken });
  });

  app.post(apiRoutes.auth.forgotPasswordReset.url, {
    config: { rateLimit: resetRateLimit() }
  }, async (request, reply) => {
    if (isAuthenticated(request)) {
      return reply.code(403).send(errorResponse("ALREADY_AUTHENTICATED", "Use password recovery as a guest."));
    }

    const parsed = forgotPasswordResetSchema.safeParse(request.body);
    if (!parsed.success) {
      return validationError(reply, parsed.error.issues.map(({ code, message, path }) => ({ code, message, path })));
    }

    const tokenHash = hashPasswordResetToken(parsed.data.resetToken);
    const validationTime = new Date();
    if (!(await dependencies.store.isPasswordResetTokenValid(tokenHash, validationTime))) {
      return reply.code(400).header("cache-control", "no-store").send(errorResponse(
        "INVALID_RESET_TOKEN",
        "The reset token is invalid, expired, or already used."
      ));
    }

    const passwordHash = await hashPassword(parsed.data.newPassword);
    const reset = await dependencies.store.resetPasswordWithToken({
      tokenHash,
      passwordHash,
      now: new Date()
    });
    if (!reset) {
      return reply.code(400).header("cache-control", "no-store").send(errorResponse(
        "INVALID_RESET_TOKEN",
        "The reset token is invalid, expired, or already used."
      ));
    }

    return reply.code(200).header("cache-control", "no-store").send({ ok: true });
  });
}
