import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { UserRegistrationStore } from "../db/registration-store";
import type {
  LoginSessionInput,
  LoginUserRecord,
  UserLoginStore
} from "../db/login-store";
import type {
  RecoveryAccountRecord,
  RecoveryChallengeRecord,
  UserRecoveryStore
} from "../db/recovery-store";
import { createFastifyApp } from "../app";
import { parseServerEnv } from "../config/env";
import { DUMMY_ARGON2ID_HASH, hashPassword as argon2HashPassword } from "../security/password";
import { hashPasswordResetToken, PASSWORD_RESET_TOKEN_TTL_SECONDS } from "../security/password-reset-token";
import type { SecurityAnswerVerifier } from "./forgot-password";

const testConfig = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173"
});

const username = "rescue_user1";
const userId = "00000000-0000-4000-8000-000000000099";
const questionIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005"
];
const questionTexts = [
  "Question one?",
  "Question two?",
  "Question three?",
  "Question four?",
  "Question five?"
];
const answers = questionIds.map((_questionId, index) => `known answer ${index + 1}`);
const account: RecoveryAccountRecord = {
  id: userId,
  answers: questionIds.map((questionId, index) => ({
    questionId,
    text: questionTexts[index]!,
    answerHash: `encoded:${answers[index]}`
  }))
};
const publicQuestions = Array.from({ length: 15 }, (_, index) => ({
  questionId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  text: `Public decoy question ${index + 1}?`
}));

const registrationStore: UserRegistrationStore = {
  async usernameExists() { return false; },
  async securityQuestionsExist() { return true; },
  async createUserWithAnswers() { return null; }
};
const loginStore: UserLoginStore = {
  async findUserByUsername(_name: string): Promise<LoginUserRecord | null> { return null; },
  async createSession(_session: LoginSessionInput): Promise<void> {},
  async findSessionByRefreshTokenHash() { return null; },
  async rotateRefreshToken() { return false; },
  async revokeSession() { return false; },
  async revokeSessionByRefreshTokenHash() { return false; }
};

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeRecoveryStore(options: {
  account?: RecoveryAccountRecord | null;
  noActiveChallenge?: boolean;
} = {}) {
  const configuredAccount = options.account === undefined ? account : options.account;
  const calls = {
    usernames: [] as string[],
    catalogLookups: 0,
    savedChallenges: [] as Array<{ userId: string; questionIds: string[]; createdAt: Date; expiresAt: Date }>,
    challengeLookups: [] as Array<{ userId: string; now: Date }>,
    issuedTokens: [] as Array<{ userId: string; challengeId: string; tokenHash: string; now: Date; expiresAt: Date }>,
    tokenLookups: [] as Array<{ tokenHash: string; now: Date }>,
    resetAttempts: [] as Array<{ tokenHash: string; passwordHash: string; now: Date }>
  };

  let challenge: (RecoveryChallengeRecord & { userId: string; expiresAt: Date; consumed: boolean }) | null = null;
  let resetToken: { userId: string; tokenHash: string; expiresAt: Date } | null = null;
  let changedPasswordHash: string | null = null;
  let revokedSessionCount = 0;
  let challengeSequence = 0;

  const store: UserRecoveryStore = {
    async findAccountByUsername(requestedUsername) {
      calls.usernames.push(requestedUsername);
      if (!configuredAccount || requestedUsername !== username) return null;
      return { ...configuredAccount, answers: configuredAccount.answers.map((answer) => ({ ...answer })) };
    },
    async listSecurityQuestions() {
      calls.catalogLookups += 1;
      return publicQuestions.map((question) => ({ ...question }));
    },
    async saveRecoveryChallenge(input) {
      calls.savedChallenges.push({
        ...input,
        questionIds: [...input.questionIds]
      });
      challengeSequence += 1;
      challenge = {
        id: `challenge-${challengeSequence}`,
        userId: input.userId,
        questionIds: [...input.questionIds],
        expiresAt: input.expiresAt,
        consumed: false
      };
      return challenge.id;
    },
    async findActiveRecoveryChallenge(requestedUserId, now) {
      calls.challengeLookups.push({ userId: requestedUserId, now });
      if (
        options.noActiveChallenge ||
        !challenge ||
        challenge.userId !== requestedUserId ||
        challenge.consumed ||
        challenge.expiresAt <= now
      ) return null;
      return { id: challenge.id, questionIds: [...challenge.questionIds] };
    },
    async issuePasswordResetToken(input) {
      calls.issuedTokens.push({ ...input });
      if (
        !challenge ||
        challenge.id !== input.challengeId ||
        challenge.userId !== input.userId ||
        challenge.consumed ||
        challenge.expiresAt <= input.now
      ) return false;
      challenge.consumed = true;
      resetToken = { userId: input.userId, tokenHash: input.tokenHash, expiresAt: input.expiresAt };
      return true;
    },
    async isPasswordResetTokenValid(tokenHash, now) {
      calls.tokenLookups.push({ tokenHash, now });
      return resetToken?.tokenHash === tokenHash && resetToken.expiresAt > now;
    },
    async resetPasswordWithToken(input) {
      calls.resetAttempts.push({ ...input });
      if (!resetToken || resetToken.tokenHash !== input.tokenHash || resetToken.expiresAt <= input.now) return false;
      resetToken = null;
      changedPasswordHash = input.passwordHash;
      revokedSessionCount += 3;
      if (challenge?.userId === userId) challenge.consumed = true;
      return true;
    }
  };

  return {
    store,
    calls,
    get challenge() { return challenge; },
    get resetToken() { return resetToken; },
    get changedPasswordHash() { return changedPasswordHash; },
    get revokedSessionCount() { return revokedSessionCount; },
    set resetTokenForTest(value: { userId: string; tokenHash: string; expiresAt: Date } | null) { resetToken = value; }
  };
}

async function makeApp(
  store: UserRecoveryStore,
  options: {
    verifyAnswer?: SecurityAnswerVerifier;
    hashPassword?: (password: string) => Promise<string>;
    useProductionVerifier?: boolean;
  } = {}
): Promise<FastifyInstance> {
  const dependencies = {
    registrationStore,
    loginStore,
    recoveryStore: store,
    hashPassword: options.hashPassword ?? (async (password: string) => `new-hash:${password}`),
    ...(!options.useProductionVerifier
      ? { verifySecurityAnswer: options.verifyAnswer ?? (async (hash: string, answer: string) => hash === `encoded:${answer}`) }
      : {})
  };
  const app = await createFastifyApp(testConfig, dependencies);
  apps.push(app);
  return app;
}

function answerPayload(ids: readonly string[]) {
  return {
    username,
    answers: ids.map((questionId) => {
      const index = questionIds.indexOf(questionId);
      return { questionId, answer: `  ${answers[index] ?? "unknown answer"}  ` };
    })
  };
}

async function requestQuestions(app: FastifyInstance) {
  return app.inject({
    method: "POST",
    url: "/_auth/forgot-password/request",
    payload: { username }
  });
}

async function issueResetToken(app: FastifyInstance): Promise<string> {
  const requested = await requestQuestions(app);
  const verified = await app.inject({
    method: "POST",
    url: "/_auth/forgot-password/verify",
    payload: answerPayload(requested.json().questionIds)
  });
  if (verified.statusCode !== 200) throw new Error(`Expected reset token; received ${verified.statusCode}.`);
  return verified.json().resetToken as string;
}

describe("POST /_auth/forgot-password/request", () => {
  it("chooses three unique questions from the account's five and stores a short-lived server-side challenge", async () => {
    const state = makeRecoveryStore();
    const app = await makeApp(state.store);

    const response = await requestQuestions(app);

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const body = response.json();
    expect(body.questionIds).toHaveLength(3);
    expect(new Set(body.questionIds).size).toBe(3);
    expect(body.questionIds.every((id: string) => questionIds.includes(id))).toBe(true);
    expect(body.questions).toEqual(body.questionIds.map((id: string) => questionTexts[questionIds.indexOf(id)]));
    expect(response.body).not.toContain("answerHash");
    expect(response.body).not.toContain("encoded:");
    expect(state.calls.savedChallenges).toHaveLength(1);
    expect(state.calls.savedChallenges[0]).toMatchObject({
      userId,
      questionIds: body.questionIds,
      createdAt: expect.any(Date),
      expiresAt: expect.any(Date)
    });
    expect(state.calls.savedChallenges[0]!.expiresAt.getTime() - state.calls.savedChallenges[0]!.createdAt.getTime())
      .toBe(10 * 60 * 1000);
    expect(state.calls.catalogLookups).toBe(0);
  });

  it("returns decoy questions for unknown accounts without revealing account existence in the status or shape", async () => {
    const state = makeRecoveryStore({ account: null });
    const app = await makeApp(state.store);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/request",
      payload: { username: "missing_user" }
    });

    expect(response.statusCode).toBe(200);
    expect(Object.keys(response.json()).sort()).toEqual(["questionIds", "questions"]);
    expect(response.json().questionIds).toHaveLength(3);
    expect(response.json().questionIds.every((id: string) => publicQuestions.some((question) => question.questionId === id))).toBe(true);
    expect(state.calls.savedChallenges).toEqual([]);
    expect(state.calls.catalogLookups).toBe(1);
  });

  it("fails closed if the seeded question catalog cannot provide three decoy questions", async () => {
    const state = makeRecoveryStore({ account: null });
    const unavailableStore: UserRecoveryStore = {
      ...state.store,
      async listSecurityQuestions() { return []; }
    };
    const app = await makeApp(unavailableStore);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/request",
      payload: { username: "missing_user" }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "RECOVERY_UNAVAILABLE" });
  });

  it("rejects invalid and authenticated requests before looking up an account", async () => {
    const state = makeRecoveryStore();
    const app = await makeApp(state.store);

    const invalid = await app.inject({ method: "POST", url: "/_auth/forgot-password/request", payload: { username: "Bad User" } });
    const authenticated = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/request",
      headers: { authorization: "Bearer access-token" },
      payload: { username }
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(authenticated.statusCode).toBe(403);
    expect(authenticated.json()).toMatchObject({ code: "ALREADY_AUTHENTICATED" });
    expect(state.calls.usernames).toEqual([]);
  });

  it("limits requests to five per 15 minutes for each IP and username", async () => {
    const state = makeRecoveryStore({ account: null });
    const app = await makeApp(state.store);

    const responses = await Promise.all(Array.from({ length: 6 }, () => requestQuestions(app)));

    expect(responses.slice(0, 5).map(({ statusCode }) => statusCode)).toEqual([200, 200, 200, 200, 200]);
    expect(responses[5]?.statusCode).toBe(429);
    expect(responses[5]?.json()).toMatchObject({ code: "RATE_LIMITED" });
    expect(state.calls.catalogLookups).toBe(5);
  });
});

describe("POST /_auth/forgot-password/verify", () => {
  it("verifies all three normalized answers and stores only a hashed, ten-minute reset token", async () => {
    const state = makeRecoveryStore();
    const verifications: Array<{ hash: string; answer: string }> = [];
    const app = await makeApp(state.store, {
      verifyAnswer: async (hash, answer) => {
        verifications.push({ hash, answer });
        return hash === `encoded:${answer}`;
      }
    });
    const requested = await requestQuestions(app);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/verify",
      payload: answerPayload(requested.json().questionIds)
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    const resetToken = response.json().resetToken as string;
    expect(resetToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(response.body).not.toContain(userId);
    expect(response.body).not.toContain("tokenHash");
    expect(verifications).toHaveLength(3);
    expect(verifications.map(({ answer }) => answer)).toEqual(requested.json().questionIds.map((id: string) => answers[questionIds.indexOf(id)]));
    expect(state.calls.issuedTokens).toHaveLength(1);
    const issued = state.calls.issuedTokens[0]!;
    expect(issued.userId).toBe(userId);
    expect(issued.challengeId).toBe(state.challenge?.id);
    expect(issued.tokenHash).toBe(hashPasswordResetToken(resetToken));
    expect(issued.tokenHash).not.toBe(resetToken);
    expect(issued.expiresAt.getTime() - issued.now.getTime()).toBe(PASSWORD_RESET_TOKEN_TTL_SECONDS * 1000);
    expect(state.challenge?.consumed).toBe(true);
  });

  it("verifies Argon2id answer hashes using the same answer normalization as registration", async () => {
    const answerHash = await argon2HashPassword("correct answer");
    const productionAccount: RecoveryAccountRecord = {
      id: userId,
      answers: questionIds.map((questionId, index) => ({
        questionId,
        text: questionTexts[index]!,
        answerHash
      }))
    };
    const state = makeRecoveryStore({ account: productionAccount });
    const app = await makeApp(state.store, {
      useProductionVerifier: true,
      hashPassword: argon2HashPassword
    });
    const requested = await requestQuestions(app);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/verify",
      payload: {
        username,
        answers: requested.json().questionIds.map((questionId: string) => ({ questionId, answer: "  Correct Answer  " }))
      }
    });

    expect(response.statusCode).toBe(200);
    expect(state.calls.issuedTokens).toHaveLength(1);
  });

  it("enforces the server-selected challenge and performs dummy checks for an unknown account", async () => {
    const knownState = makeRecoveryStore();
    const verifications: Array<{ hash: string; answer: string }> = [];
    const knownApp = await makeApp(knownState.store, {
      verifyAnswer: async (hash, answer) => {
        verifications.push({ hash, answer });
        return true;
      }
    });
    const requested = await requestQuestions(knownApp);
    const selectedIds = requested.json().questionIds as string[];
    const alternateIds = questionIds.filter((id) => !selectedIds.includes(id)).slice(0, 2);
    const wrongSet = [...alternateIds, selectedIds[0]!];
    const wrongChallenge = await knownApp.inject({
      method: "POST",
      url: "/_auth/forgot-password/verify",
      payload: answerPayload(wrongSet)
    });

    const unknownState = makeRecoveryStore({ account: null });
    const unknownApp = await makeApp(unknownState.store, {
      verifyAnswer: async (hash, answer) => {
        verifications.push({ hash, answer });
        return true;
      }
    });
    const unknown = await unknownApp.inject({
      method: "POST",
      url: "/_auth/forgot-password/verify",
      payload: {
        username: "missing_user",
        answers: publicQuestions.slice(0, 3).map(({ questionId }) => ({ questionId, answer: "some answer" }))
      }
    });

    expect(wrongChallenge.statusCode).toBe(400);
    expect(unknown.statusCode).toBe(400);
    expect(wrongChallenge.json()).toEqual(unknown.json());
    expect(wrongChallenge.json()).toMatchObject({ code: "WRONG_ANSWERS" });
    expect(knownState.calls.issuedTokens).toEqual([]);
    expect(verifications).toHaveLength(6);
    expect(verifications.slice(0, 3).every(({ hash }) => hash === DUMMY_ARGON2ID_HASH)).toBe(true);
    expect(verifications.slice(3).every(({ hash }) => hash === DUMMY_ARGON2ID_HASH)).toBe(true);
  });

  it("uses the same generic failure for incorrect answers, missing challenges, and unknown usernames", async () => {
    const knownState = makeRecoveryStore();
    const knownApp = await makeApp(knownState.store, { verifyAnswer: async () => false });
    const requested = await requestQuestions(knownApp);
    const wrongAnswers = await knownApp.inject({
      method: "POST",
      url: "/_auth/forgot-password/verify",
      payload: answerPayload(requested.json().questionIds)
    });

    const noChallengeState = makeRecoveryStore({ noActiveChallenge: true });
    const noChallengeApp = await makeApp(noChallengeState.store, { verifyAnswer: async () => false });
    const noChallenge = await noChallengeApp.inject({
      method: "POST",
      url: "/_auth/forgot-password/verify",
      payload: answerPayload(questionIds.slice(0, 3))
    });
    const unknownState = makeRecoveryStore({ account: null });
    const unknownApp = await makeApp(unknownState.store, { verifyAnswer: async () => false });
    const unknown = await unknownApp.inject({
      method: "POST",
      url: "/_auth/forgot-password/verify",
      payload: { username: "missing_user", answers: publicQuestions.slice(0, 3).map(({ questionId }) => ({ questionId, answer: "wrong" })) }
    });

    expect(wrongAnswers.statusCode).toBe(400);
    expect(noChallenge.json()).toEqual(wrongAnswers.json());
    expect(unknown.json()).toEqual(wrongAnswers.json());
    expect(noChallengeState.calls.issuedTokens).toEqual([]);
    expect(unknownState.calls.issuedTokens).toEqual([]);
  });

  it("issues at most one reset token when the same challenge is verified concurrently", async () => {
    const state = makeRecoveryStore();
    const app = await makeApp(state.store);
    const requested = await requestQuestions(app);
    const payload = answerPayload(requested.json().questionIds);

    const responses = await Promise.all([
      app.inject({ method: "POST", url: "/_auth/forgot-password/verify", payload }),
      app.inject({ method: "POST", url: "/_auth/forgot-password/verify", payload })
    ]);

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 400]);
    expect(state.calls.issuedTokens).toHaveLength(1);
    expect(state.calls.issuedTokens[0]?.tokenHash).toBe(state.resetToken?.tokenHash);
  });

  it("rejects invalid bodies and authenticated requests without creating tokens", async () => {
    const state = makeRecoveryStore();
    const app = await makeApp(state.store);
    const payload = answerPayload(questionIds.slice(0, 3));

    const invalid = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/verify",
      payload: { ...payload, answers: [payload.answers[0], payload.answers[0], payload.answers[2]] }
    });
    const authenticated = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/verify",
      headers: { authorization: "Bearer access-token" },
      payload
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(authenticated.statusCode).toBe(403);
    expect(authenticated.json()).toMatchObject({ code: "ALREADY_AUTHENTICATED" });
    expect(state.calls.issuedTokens).toEqual([]);
  });
});

describe("POST /_auth/forgot-password/reset", () => {
  it("consumes a valid token, hashes the new password, revokes sessions, and rejects replay", async () => {
    const state = makeRecoveryStore();
    const app = await makeApp(state.store);
    const token = await issueResetToken(app);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/reset",
      payload: { resetToken: token, newPassword: "changedPass123", confirmPassword: "changedPass123" }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(state.changedPasswordHash).toBe("new-hash:changedPass123");
    expect(state.calls.tokenLookups).toEqual([{ tokenHash: hashPasswordResetToken(token), now: expect.any(Date) }]);
    expect(state.calls.resetAttempts).toMatchObject([{
      tokenHash: hashPasswordResetToken(token),
      passwordHash: "new-hash:changedPass123",
      now: expect.any(Date)
    }]);
    expect(state.revokedSessionCount).toBe(3);
    expect(state.resetToken).toBeNull();

    const replay = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/reset",
      payload: { resetToken: token, newPassword: "otherPass456", confirmPassword: "otherPass456" }
    });
    expect(replay.statusCode).toBe(400);
    expect(replay.json()).toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(state.calls.resetAttempts).toHaveLength(1);
  });

  it("does not hash passwords for invalid, expired, or malformed reset tokens", async () => {
    const state = makeRecoveryStore();
    let hashCalls = 0;
    const app = await makeApp(state.store, {
      hashPassword: async (password) => {
        hashCalls += 1;
        return `new-hash:${password}`;
      }
    });
    const invalid = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/reset",
      payload: { resetToken: "random-invalid-token", newPassword: "changedPass123", confirmPassword: "changedPass123" }
    });
    const expiredToken = "expired-but-well-formed-token";
    state.resetTokenForTest = {
      userId,
      tokenHash: hashPasswordResetToken(expiredToken),
      expiresAt: new Date(Date.now() - 1)
    };
    const expired = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/reset",
      payload: { resetToken: expiredToken, newPassword: "changedPass123", confirmPassword: "changedPass123" }
    });
    const malformed = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/reset",
      payload: { resetToken: "", newPassword: "changedPass123", confirmPassword: "changedPass123" }
    });

    expect(invalid.statusCode).toBe(400);
    expect(invalid.json()).toMatchObject({ code: "INVALID_RESET_TOKEN" });
    expect(expired.statusCode).toBe(400);
    expect(expired.json()).toEqual(invalid.json());
    expect(malformed.statusCode).toBe(400);
    expect(malformed.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(hashCalls).toBe(0);
    expect(state.calls.resetAttempts).toEqual([]);
  });

  it("limits reset attempts to five per IP in 15 minutes", async () => {
    const state = makeRecoveryStore();
    const app = await makeApp(state.store);

    const responses = await Promise.all(Array.from({ length: 6 }, (_, index) => app.inject({
      method: "POST",
      url: "/_auth/forgot-password/reset",
      payload: {
        resetToken: `invalid-token-${index}`,
        newPassword: "changedPass123",
        confirmPassword: "changedPass123"
      }
    })));

    expect(responses.slice(0, 5).map(({ statusCode }) => statusCode)).toEqual([400, 400, 400, 400, 400]);
    expect(responses[5]?.statusCode).toBe(429);
    expect(responses[5]?.json()).toMatchObject({ code: "RATE_LIMITED" });
    expect(state.calls.tokenLookups).toHaveLength(5);
  });

  it("rejects password confirmation and policy errors before token lookup", async () => {
    const state = makeRecoveryStore();
    const app = await makeApp(state.store);
    const token = await issueResetToken(app);
    const mismatch = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/reset",
      payload: { resetToken: token, newPassword: "changedPass123", confirmPassword: "differentPass456" }
    });
    const weak = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/reset",
      payload: { resetToken: token, newPassword: "weak", confirmPassword: "weak" }
    });

    expect(mismatch.statusCode).toBe(400);
    expect(weak.statusCode).toBe(400);
    expect(mismatch.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    expect(weak.json()).toMatchObject({ code: "VALIDATION_ERROR" });
    // The valid token is used for verification above but neither invalid reset request reaches token lookup.
    expect(state.calls.tokenLookups).toEqual([]);
  });

  it("allows only one concurrent password reset to consume a token", async () => {
    const state = makeRecoveryStore();
    const app = await makeApp(state.store);
    const token = await issueResetToken(app);

    const responses = await Promise.all([
      app.inject({
        method: "POST",
        url: "/_auth/forgot-password/reset",
        payload: { resetToken: token, newPassword: "firstPass123", confirmPassword: "firstPass123" }
      }),
      app.inject({
        method: "POST",
        url: "/_auth/forgot-password/reset",
        payload: { resetToken: token, newPassword: "secondPass456", confirmPassword: "secondPass456" }
      })
    ]);

    expect(responses.map(({ statusCode }) => statusCode).sort()).toEqual([200, 400]);
    expect(state.revokedSessionCount).toBe(3);
    expect(state.calls.resetAttempts).toHaveLength(1);
  });

  it("rejects authenticated requests before database work", async () => {
    const state = makeRecoveryStore();
    const app = await makeApp(state.store);

    const response = await app.inject({
      method: "POST",
      url: "/_auth/forgot-password/reset",
      headers: { authorization: "Bearer access-token" },
      payload: { resetToken: "not-used", newPassword: "changedPass123", confirmPassword: "changedPass123" }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: "ALREADY_AUTHENTICATED" });
    expect(state.calls.tokenLookups).toEqual([]);
  });
});
