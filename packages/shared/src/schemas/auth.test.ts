import { describe, expect, it } from "vitest";
import {
  forgotPasswordVerifySchema,
  loginResponseSchema,
  loginSchema,
  refreshResponseSchema,
  registerSchema
} from "./auth";
import { apiRoutes } from "../api";

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
    answer: ` answer ${index + 1} `
  }))
};

describe("auth schemas", () => {
  it("accepts registration with five unique questions and trims answers", () => {
    const result = registerSchema.parse(validRegistration);
    expect(result.securityQuestions).toHaveLength(5);
    expect(result.securityQuestions[0]?.answer).toBe("answer 1");
  });

  it("rejects duplicate security-question IDs", () => {
    const duplicateQuestions = validRegistration.securityQuestions.map((item) => ({ ...item }));
    duplicateQuestions[4] = { ...duplicateQuestions[4]!, questionId: questionIds[0]! };

    expect(registerSchema.safeParse({ ...validRegistration, securityQuestions: duplicateQuestions }).success).toBe(false);
  });

  it("enforces the documented password policy and confirmation", () => {
    expect(registerSchema.safeParse({ ...validRegistration, password: "onlyletters", confirmPassword: "onlyletters" }).success).toBe(false);
    expect(registerSchema.safeParse({ ...validRegistration, confirmPassword: "different123" }).success).toBe(false);
  });

  it("keeps login validation separate from new-password policy", () => {
    expect(loginSchema.safeParse({ username: "rescue_user1", password: "legacy" }).success).toBe(true);
    expect(loginSchema.safeParse({ username: "RescueUser", password: "legacy" }).success).toBe(false);
  });

  it("requires exactly three unique answers in the forgot-password verification step", () => {
    const valid = {
      username: "rescue_user1",
      answers: questionIds.slice(0, 3).map((questionId) => ({ questionId, answer: "answer" }))
    };
    expect(forgotPasswordVerifySchema.safeParse(valid).success).toBe(true);
    expect(forgotPasswordVerifySchema.safeParse({
      ...valid,
      answers: [valid.answers[0], valid.answers[0], valid.answers[2]]
    }).success).toBe(false);
  });

  it("supports HttpOnly-cookie web sessions and secure-storage native token bodies", () => {
    const loginWithoutBodyToken = {
      accessToken: "access-token",
      user: {
        id: questionIds[0],
        username: "rescue_user1",
        role: "user",
        mustCompleteSecurityQuestions: false
      }
    };
    expect(loginResponseSchema.safeParse(loginWithoutBodyToken).success).toBe(true);
    expect(loginResponseSchema.safeParse({ ...loginWithoutBodyToken, refreshToken: "refresh-token" }).success).toBe(true);
    expect(refreshResponseSchema.safeParse({ accessToken: "access-token" }).success).toBe(true);
    expect(refreshResponseSchema.safeParse({ accessToken: "access-token", refreshToken: "refresh-token" }).success).toBe(true);
    expect(apiRoutes.auth.refresh.schema.body?.safeParse(undefined).success).toBe(true);
    expect(apiRoutes.auth.refresh.schema.body?.safeParse({ refreshToken: "refresh-token" }).success).toBe(true);
    expect(apiRoutes.auth.logout.schema.body?.safeParse(undefined).success).toBe(true);
    expect(apiRoutes.auth.logout.schema.body?.safeParse({ refreshToken: "refresh-token" }).success).toBe(true);
  });
});
