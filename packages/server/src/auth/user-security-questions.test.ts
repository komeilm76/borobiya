import { afterEach, describe, expect, it, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import type {
  SecurityQuestionAnswerHash,
  SecurityQuestionsUserRecord,
  UserSecurityQuestionsStore
} from "../db/security-questions-store";
import { signAccessToken, signRefreshToken } from "../security/tokens";
import { registerUserSecurityQuestionsRoute } from "./user-security-questions";

const jwtSecret = "a".repeat(48);
const identity = {
  userId: "00000000-0000-4000-8000-000000000099",
  role: "user" as const,
  deviceId: "00000000-0000-4000-8000-000000000088",
  sessionId: "00000000-0000-4000-8000-000000000077"
};
const questionIds = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
  "10000000-0000-4000-8000-000000000003",
  "10000000-0000-4000-8000-000000000004",
  "10000000-0000-4000-8000-000000000005"
];
const incompleteUser: SecurityQuestionsUserRecord = {
  id: identity.userId,
  username: "rescue_user1",
  role: "user",
  isActive: true,
  isSuspended: false,
  mustCompleteSecurityQuestions: true,
  avgRating: null,
  createdAt: new Date("2026-10-18T00:00:00.000Z")
};
const validBody = {
  securityQuestions: questionIds.map((questionId, index) => ({
    questionId,
    answer: `  ANSWER ${index + 1}  `
  }))
};
const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeStore(options: {
  user?: SecurityQuestionsUserRecord | null;
  sessionActive?: boolean;
  questionsExist?: boolean;
  completionSucceeds?: boolean;
} = {}) {
  const user = options.user === undefined ? incompleteUser : options.user;
  let mustCompleteSecurityQuestions = user?.mustCompleteSecurityQuestions ?? false;
  const calls = {
    userLookups: [] as string[],
    questionLookups: [] as string[][],
    completions: [] as Array<{ userId: string; answers: readonly SecurityQuestionAnswerHash[] }>,
    persistedAnswers: [] as SecurityQuestionAnswerHash[]
  };
  const findUserById = vi.fn<UserSecurityQuestionsStore["findUserById"]>(async (id) => {
    calls.userLookups.push(id);
    return user ? { ...user, mustCompleteSecurityQuestions } : null;
  });
  const hasActiveSession = vi.fn<UserSecurityQuestionsStore["hasActiveSession"]>(async () => options.sessionActive ?? true);
  const securityQuestionsExist = vi.fn<UserSecurityQuestionsStore["securityQuestionsExist"]>(async (ids) => {
    calls.questionLookups.push([...ids]);
    return options.questionsExist ?? true;
  });
  const completeSecurityQuestions = vi.fn<UserSecurityQuestionsStore["completeSecurityQuestions"]>(async (input) => {
    calls.completions.push(input);
    if (!user || !mustCompleteSecurityQuestions || options.completionSucceeds === false) return false;
    mustCompleteSecurityQuestions = false;
    calls.persistedAnswers = input.answers.map((answer) => ({ ...answer }));
    return true;
  });
  return {
    store: { findUserById, hasActiveSession, securityQuestionsExist, completeSecurityQuestions },
    calls,
    findUserById,
    hasActiveSession,
    securityQuestionsExist,
    completeSecurityQuestions
  };
}

async function makeApp(
  store: UserSecurityQuestionsStore,
  hashPassword = vi.fn(async (answer: string) => `argon2id:${answer}`)
) {
  const app = Fastify({ logger: false });
  await registerUserSecurityQuestionsRoute(app, { store, jwtSecret, hashPassword });
  await app.get("/_user/protected", async (request) => ({
    userId: request.authenticatedUser?.userId,
    mustCompleteSecurityQuestions: request.authenticatedUser?.mustCompleteSecurityQuestions
  }));
  await app.get("/_user/complete-security-questions", async () => ({ allowed: true }));
  apps.push(app);
  return { app, hashPassword };
}

async function accessToken() {
  return signAccessToken(identity, jwtSecret);
}

describe("POST /_user/complete-security-questions and user onboarding guard", () => {
  it("stores five normalized Argon2id hashes and clears the completion flag", async () => {
    const mocks = makeStore();
    const { app, hashPassword } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      headers: { authorization: `Bearer ${await accessToken()}` },
      payload: validBody
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
    expect(mocks.hasActiveSession).toHaveBeenCalledWith({
      userId: identity.userId,
      sessionId: identity.sessionId,
      deviceId: identity.deviceId
    });
    expect(hashPassword).toHaveBeenCalledTimes(5);
    expect(hashPassword).toHaveBeenNthCalledWith(1, "answer 1");
    expect(mocks.securityQuestionsExist).toHaveBeenCalledWith(questionIds);
    expect(mocks.completeSecurityQuestions).toHaveBeenCalledWith({
      userId: identity.userId,
      answers: questionIds.map((questionId, index) => ({
        questionId,
        answerHash: `argon2id:answer ${index + 1}`
      }))
    });
    expect(mocks.calls.persistedAnswers.every(({ answerHash }) => answerHash.startsWith("argon2id:"))).toBe(true);
  });

  it("blocks other _user routes until completion, then allows them", async () => {
    const mocks = makeStore();
    const { app } = await makeApp(mocks.store);
    const token = await accessToken();
    const before = await app.inject({
      method: "GET",
      url: "/_user/protected",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(before.statusCode).toBe(403);
    expect(before.headers["cache-control"]).toBe("no-store");
    expect(before.json().code).toBe("SECURITY_QUESTIONS_REQUIRED");
    const incompleteProfile = await app.inject({
      method: "GET",
      url: "/_user/me",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(incompleteProfile.statusCode).toBe(403);
    expect(incompleteProfile.json().code).toBe("SECURITY_QUESTIONS_REQUIRED");
    const wrongMethod = await app.inject({
      method: "GET",
      url: "/_user/complete-security-questions",
      headers: { authorization: `Bearer ${token}` }
    });
    expect(wrongMethod.statusCode).toBe(403);
    expect(wrongMethod.json().code).toBe("SECURITY_QUESTIONS_REQUIRED");

    const completed = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody
    });
    const after = await app.inject({
      method: "GET",
      url: "/_user/protected",
      headers: { authorization: `Bearer ${token}` }
    });
    const profile = await app.inject({
      method: "GET",
      url: "/_user/me",
      headers: { authorization: `Bearer ${token}` }
    });

    expect(completed.statusCode).toBe(200);
    expect(after.statusCode).toBe(200);
    expect(after.json()).toEqual({ userId: identity.userId, mustCompleteSecurityQuestions: false });
    expect(profile.statusCode).toBe(200);
    expect(profile.json()).toEqual({
      id: identity.userId,
      username: "rescue_user1",
      role: "user",
      mustCompleteSecurityQuestions: false,
      isActive: true,
      avgRating: null,
      categories: [],
      createdAt: "2026-10-18T00:00:00.000Z"
    });
  });

  it.each([
    ["missing", undefined, "UNAUTHORIZED"],
    ["malformed", "Bearer not-a-jwt", "INVALID_ACCESS_TOKEN"],
    ["wrong token use", "refresh", "INVALID_ACCESS_TOKEN"]
  ])("requires a valid access token (%s)", async (_case, authorization, code) => {
    const mocks = makeStore();
    const { app } = await makeApp(mocks.store);
    const header = authorization === "refresh"
      ? `Bearer ${await signRefreshToken(identity, jwtSecret)}`
      : authorization;
    const response = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      ...(header === undefined ? {} : { headers: { authorization: header } }),
      payload: validBody
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe(code);
    expect(mocks.findUserById).not.toHaveBeenCalled();
    expect(mocks.hasActiveSession).not.toHaveBeenCalled();
    expect(mocks.completeSecurityQuestions).not.toHaveBeenCalled();
  });

  it.each([
    [{ ...incompleteUser, role: "admin" }, "FORBIDDEN"],
    [{ ...incompleteUser, isActive: false }, "ACCOUNT_INACTIVE"],
    [{ ...incompleteUser, isSuspended: true }, "ACCOUNT_SUSPENDED"],
    [null, "UNAUTHORIZED"]
  ] as const)("rejects accounts that are no longer authorized", async (user, code) => {
    const mocks = makeStore({ user });
    const { app, hashPassword } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      headers: { authorization: `Bearer ${await accessToken()}` },
      payload: validBody
    });

    expect(response.statusCode).toBe(user ? 403 : 401);
    expect(response.json().code).toBe(code);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(mocks.completeSecurityQuestions).not.toHaveBeenCalled();
  });

  it("rejects access tokens whose persisted session was revoked by logout, reset, or deactivation", async () => {
    const activeUser = { ...incompleteUser, mustCompleteSecurityQuestions: false };
    const mocks = makeStore({ user: activeUser, sessionActive: false });
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "GET",
      url: "/_user/protected",
      headers: { authorization: `Bearer ${await accessToken()}` }
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().code).toBe("INVALID_ACCESS_TOKEN");
    expect(mocks.hasActiveSession).toHaveBeenCalledWith({
      userId: identity.userId,
      sessionId: identity.sessionId,
      deviceId: identity.deviceId
    });
  });

  it("rejects malformed bodies and unavailable question IDs before hashing", async () => {
    const mocks = makeStore({ questionsExist: false });
    const { app, hashPassword } = await makeApp(mocks.store);
    const token = await accessToken();
    const malformed = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      headers: { authorization: `Bearer ${token}` },
      payload: { securityQuestions: [validBody.securityQuestions[0]] }
    });
    const unavailable = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      headers: { authorization: `Bearer ${token}` },
      payload: validBody
    });

    expect(malformed.statusCode).toBe(400);
    expect(unavailable.statusCode).toBe(400);
    expect(unavailable.json().issues).toMatchObject([{ path: ["securityQuestions"] }]);
    expect(hashPassword).not.toHaveBeenCalled();
    expect(mocks.completeSecurityQuestions).not.toHaveBeenCalled();
  });

  it("does not overwrite questions for an already-completed account", async () => {
    const mocks = makeStore({ user: { ...incompleteUser, mustCompleteSecurityQuestions: false } });
    const { app, hashPassword } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      headers: { authorization: `Bearer ${await accessToken()}` },
      payload: validBody
    });

    expect(response.statusCode).toBe(409);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.json().code).toBe("SECURITY_QUESTIONS_ALREADY_COMPLETED");
    expect(hashPassword).not.toHaveBeenCalled();
    expect(mocks.completeSecurityQuestions).not.toHaveBeenCalled();
  });

  it("returns a conflict if a concurrent request completed onboarding first", async () => {
    const mocks = makeStore({ completionSucceeds: false });
    const { app } = await makeApp(mocks.store);
    const response = await app.inject({
      method: "POST",
      url: "/_user/complete-security-questions",
      headers: { authorization: `Bearer ${await accessToken()}` },
      payload: validBody
    });

    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("SECURITY_QUESTIONS_ALREADY_COMPLETED");
    expect(mocks.completeSecurityQuestions).toHaveBeenCalledOnce();
  });
});
