import { describe, expect, it } from "vitest";
import { apiRoutes } from "../api";
import { completeSecurityQuestionsSchema, forgotPasswordResetSchema, passwordSchema, registerSchema } from "./auth";
import { coordinatesSchema } from "./common";
import { sosRequestSchema } from "./sos";

const ids = Array.from({ length: 6 }, (_, index) =>
  `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const answers = ids.map((questionId, index) => ({ questionId, answer: `answer ${index + 1}` }));
const register = { username: "rescuer_one", password: "abcde123", confirmPassword: "abcde123",
  securityQuestions: answers.slice(0, 5) };

/** T4.5.1: exercise the route's actual shared body contracts, not a test-only copy of their rules. */
describe("Phase 4 Zod contract boundaries", () => {
  it("registers with exactly five different questions and rejects four, six, blanks, and repeated IDs", () => {
    const routeBody = apiRoutes.auth.register.schema.body;
    expect(routeBody).toBe(registerSchema);
    expect(routeBody.safeParse(register).success).toBe(true);
    for (const securityQuestions of [answers.slice(0, 4), answers, [...answers.slice(0, 4), answers[0]]]) {
      expect(routeBody.safeParse({ ...register, securityQuestions }).success).toBe(false);
    }
    const duplicate = routeBody.safeParse({ ...register, securityQuestions: [
      ...answers.slice(0, 4), answers[0]
    ] });
    if (duplicate.success) throw new Error("duplicate unexpectedly passed");
    expect(duplicate.error.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: ["securityQuestions", 4, "questionId"] })
    ]));
    expect(routeBody.safeParse({ ...register, securityQuestions: [...answers.slice(0, 4),
      { ...answers[4]!, answer: "  " }] }).success).toBe(false);
    expect(completeSecurityQuestionsSchema.safeParse({ securityQuestions: answers.slice(0, 4) }).success).toBe(false);
    expect(completeSecurityQuestionsSchema.safeParse({ securityQuestions: register.securityQuestions }).success).toBe(true);
  });

  it("accepts 8+ characters with Unicode letters and decimal digits, never weaker passwords", () => {
    for (const valid of ["abcdefg1", "گذرواژه۱", "A1".repeat(512)]) {
      expect(passwordSchema.safeParse(valid).success, valid.slice(0, 16)).toBe(true);
      expect(registerSchema.safeParse({ ...register, password: valid, confirmPassword: valid }).success).toBe(true);
      expect(forgotPasswordResetSchema.safeParse({ resetToken: "token", newPassword: valid,
        confirmPassword: valid }).success).toBe(true);
    }
    for (const invalid of ["abcde1", "abcdefgh", "12345678", "a1", "A1".repeat(513)]) {
      expect(passwordSchema.safeParse(invalid).success, invalid.slice(0, 16)).toBe(false);
    }
    expect(registerSchema.safeParse({ ...register, confirmPassword: "different123" }).success).toBe(false);
    expect(forgotPasswordResetSchema.safeParse({ resetToken: "token", newPassword: "abcdefg1",
      confirmPassword: "different123" }).success).toBe(false);
  });

  it("rejects undeclared auth fields and malformed SOS locations at the same route boundary", () => {
    expect(registerSchema.safeParse({ ...register, role: "admin" }).success).toBe(false);
    expect(coordinatesSchema.safeParse({ lat: 35.7, lon: 51.4, userId: ids[0] }).success).toBe(false);
    const sos = { severity: "high", description: "I need urgent help nearby", incidentTypeId: ids[0],
      location: { lat: 35.7, lon: 51.4, isManual: true } };
    expect(apiRoutes.sos.createRequest.schema.body).toBe(sosRequestSchema);
    expect(sosRequestSchema.safeParse(sos).success).toBe(true);
    expect(sosRequestSchema.safeParse({ ...sos, location: { ...sos.location, lon: 181 } }).success).toBe(false);
    expect(sosRequestSchema.safeParse({ ...sos, location: { ...sos.location, lat: Number.NaN } }).success).toBe(false);
    expect(sosRequestSchema.safeParse({ ...sos, status: "accepted" }).success).toBe(false);
  });
});
