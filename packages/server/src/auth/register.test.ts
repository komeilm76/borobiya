import { afterEach, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import type { UserRegistrationStore } from "../db/registration-store";
import { createFastifyApp } from "../app";
import { parseServerEnv } from "../config/env";

const questionIds = [
  "00000000-0000-4000-8000-000000000001",
  "00000000-0000-4000-8000-000000000002",
  "00000000-0000-4000-8000-000000000003",
  "00000000-0000-4000-8000-000000000004",
  "00000000-0000-4000-8000-000000000005"
];

const validRegistration = {
  username: "rescue_user1",
  password: "safePass123",
  confirmPassword: "safePass123",
  securityQuestions: questionIds.map((questionId, index) => ({
    questionId,
    answer: ` Answer ${index + 1} `
  }))
};

const testConfig = parseServerEnv({
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://borobiya:test-password@localhost:5432/borobiya_test",
  JWT_SECRET: "a".repeat(48),
  JWT_REFRESH_SECRET: "b".repeat(48),
  CORS_ORIGINS: "http://localhost:5173"
});

const apps: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function makeStore(options: { usernameTaken?: boolean; questionsExist?: boolean; insertionConflicts?: boolean } = {}) {
  const calls = {
    usernameLookups: [] as string[],
    questionLookups: [] as string[][],
    createdUsers: [] as Array<Parameters<UserRegistrationStore["createUserWithAnswers"]>[0]>
  };

  const store: UserRegistrationStore = {
    async usernameExists(username) {
      calls.usernameLookups.push(username);
      return options.usernameTaken ?? false;
    },
    async securityQuestionsExist(ids) {
      calls.questionLookups.push([...ids]);
      return options.questionsExist ?? true;
    },
    async createUserWithAnswers(input) {
      calls.createdUsers.push(input);
      if (options.insertionConflicts) return null;
      return {
        id: "00000000-0000-4000-8000-000000000099",
        username: input.username,
        createdAt: new Date("2026-10-18T00:00:00.000Z")
      };
    }
  };

  return { store, calls };
}

async function makeApp(
  store: UserRegistrationStore,
  hashPassword: (password: string) => Promise<string>
): Promise<FastifyInstance> {
  const app = await createFastifyApp(testConfig, { registrationStore: store, hashPassword });
  apps.push(app);
  return app;
}

describe("POST /_auth/register", () => {
  it("stores an Argon2-hashed password and normalized, hashed answers atomically", async () => {
    const { store, calls } = makeStore();
    const hashedInputs: string[] = [];
    const app = await makeApp(store, async (value) => {
      hashedInputs.push(value);
      return `encoded-hash-${hashedInputs.length}`;
    });

    const response = await app.inject({ method: "POST", url: "/_auth/register", payload: validRegistration });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({
      user: {
        id: "00000000-0000-4000-8000-000000000099",
        username: "rescue_user1",
        createdAt: "2026-10-18T00:00:00.000Z"
      }
    });
    expect(hashedInputs).toEqual([
      "safePass123",
      "answer 1",
      "answer 2",
      "answer 3",
      "answer 4",
      "answer 5"
    ]);
    expect(calls.createdUsers).toEqual([{
      username: "rescue_user1",
      passwordHash: "encoded-hash-1",
      answers: questionIds.map((questionId, index) => ({
        questionId,
        answerHash: `encoded-hash-${index + 2}`
      }))
    }]);
    expect(response.body).not.toContain(validRegistration.password);
    for (const { answer } of validRegistration.securityQuestions) {
      expect(response.body).not.toContain(answer.trim());
    }
  });

  it("rejects an Authorization header with ALREADY_AUTHENTICATED before database work", async () => {
    const { store, calls } = makeStore();
    const hashedInputs: string[] = [];
    const app = await makeApp(store, async (value) => {
      hashedInputs.push(value);
      return "unused-hash";
    });

    const response = await app.inject({
      method: "POST",
      url: "/_auth/register",
      headers: { authorization: "Bearer existing-token" },
      payload: validRegistration
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ error: true, code: "ALREADY_AUTHENTICATED" });
    expect(calls.usernameLookups).toEqual([]);
    expect(hashedInputs).toEqual([]);
  });

  it("rejects duplicate question selections before querying persistence or hashing", async () => {
    const { store, calls } = makeStore();
    const hashedInputs: string[] = [];
    const app = await makeApp(store, async (value) => {
      hashedInputs.push(value);
      return "unused-hash";
    });
    const duplicateQuestions = {
      ...validRegistration,
      securityQuestions: validRegistration.securityQuestions.map((answer, index) => ({
        ...answer,
        questionId: index === 4 ? questionIds[0]! : answer.questionId
      }))
    };

    const response = await app.inject({ method: "POST", url: "/_auth/register", payload: duplicateQuestions });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: true, code: "VALIDATION_ERROR" });
    expect(calls.usernameLookups).toEqual([]);
    expect(calls.createdUsers).toEqual([]);
    expect(hashedInputs).toEqual([]);
  });

  it("returns validation errors for unavailable question IDs before hashing", async () => {
    const { store, calls } = makeStore({ questionsExist: false });
    const hashedInputs: string[] = [];
    const app = await makeApp(store, async (value) => {
      hashedInputs.push(value);
      return "unused-hash";
    });

    const response = await app.inject({ method: "POST", url: "/_auth/register", payload: validRegistration });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: true, code: "VALIDATION_ERROR" });
    expect(calls.createdUsers).toEqual([]);
    expect(hashedInputs).toEqual([]);
  });

  it("returns 409 for existing usernames without spending time hashing credentials", async () => {
    const { store, calls } = makeStore({ usernameTaken: true });
    const hashedInputs: string[] = [];
    const app = await makeApp(store, async (value) => {
      hashedInputs.push(value);
      return "unused-hash";
    });

    const response = await app.inject({ method: "POST", url: "/_auth/register", payload: validRegistration });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: true, code: "USERNAME_TAKEN" });
    expect(calls.questionLookups).toEqual([]);
    expect(hashedInputs).toEqual([]);
  });

  it("handles a username collision at insert time without creating partial answers", async () => {
    const { store, calls } = makeStore({ insertionConflicts: true });
    const app = await makeApp(store, async (value) => `encoded-${value}`);

    const response = await app.inject({ method: "POST", url: "/_auth/register", payload: validRegistration });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: true, code: "USERNAME_TAKEN" });
    expect(calls.createdUsers).toHaveLength(1);
  });

  it("limits registration to five attempts per IP and username in 15 minutes", async () => {
    const { store } = makeStore();
    const app = await makeApp(store, async (value) => `encoded-${value}`);

    const responses = await Promise.all(Array.from({ length: 6 }, () =>
      app.inject({ method: "POST", url: "/_auth/register", payload: validRegistration })
    ));

    expect(responses.slice(0, 5).map(({ statusCode }) => statusCode)).toEqual([201, 201, 201, 201, 201]);
    expect(responses[5]?.statusCode).toBe(429);
    expect(responses[5]?.json()).toMatchObject({ error: true, code: "RATE_LIMITED" });

    const otherUsername = await app.inject({
      method: "POST",
      url: "/_auth/register",
      payload: { ...validRegistration, username: "rescue_user2" }
    });
    expect(otherUsername.statusCode).toBe(201);
  });
});
