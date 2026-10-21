import { z } from "zod";
import { idSchema, usernameSchema } from "./common";
import { authUserSchema, registeredUserSchema } from "./user";

export const passwordSchema = z
  .string()
  .min(8)
  .max(1024)
  .regex(/^(?=.*\p{L})(?=.*\p{Nd}).+$/u, "Password must contain at least one letter and one decimal digit.");
export type Password = z.infer<typeof passwordSchema>;

export const securityQuestionAnswerSchema = z.strictObject({
  questionId: idSchema,
  answer: z.string().trim().min(1).max(200)
});
export type SecurityQuestionAnswer = z.infer<typeof securityQuestionAnswerSchema>;

function uniqueSecurityAnswersSchema(count: number) {
  return z.array(securityQuestionAnswerSchema).length(count).superRefine((answers, context) => {
    const seen = new Set<string>();

    answers.forEach((answer, index) => {
      if (seen.has(answer.questionId)) {
        context.addIssue({
          code: "custom",
          path: [index, "questionId"],
          message: "Security question IDs must be unique."
        });
      }
      seen.add(answer.questionId);
    });
  });
}

export const fiveSecurityAnswersSchema = uniqueSecurityAnswersSchema(5);
export type FiveSecurityAnswers = z.infer<typeof fiveSecurityAnswersSchema>;

export const threeSecurityAnswersSchema = uniqueSecurityAnswersSchema(3);
export type ThreeSecurityAnswers = z.infer<typeof threeSecurityAnswersSchema>;

export const securityQuestionSchema = z.strictObject({
  id: idSchema,
  text: z.string().trim().min(1)
});
export type SecurityQuestion = z.infer<typeof securityQuestionSchema>;

export const securityQuestionsResponseSchema = z.array(securityQuestionSchema);
export type SecurityQuestionsResponse = z.infer<typeof securityQuestionsResponseSchema>;

export const loginSchema = z.strictObject({
  username: usernameSchema,
  // Login checks the stored credential; bound it to the largest password accepted at creation/reset.
  password: z.string().min(1).max(1024)
});
export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.strictObject({
  username: usernameSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  securityQuestions: fiveSecurityAnswersSchema
}).superRefine((input, context) => {
  if (input.password !== input.confirmPassword) {
    context.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "Passwords do not match."
    });
  }
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const forgotPasswordRequestSchema = z.strictObject({
  username: usernameSchema
});
export type ForgotPasswordRequestInput = z.infer<typeof forgotPasswordRequestSchema>;

export const forgotPasswordVerifySchema = z.strictObject({
  username: usernameSchema,
  answers: threeSecurityAnswersSchema
});
export type ForgotPasswordVerifyInput = z.infer<typeof forgotPasswordVerifySchema>;

export const forgotPasswordResetSchema = z.strictObject({
  resetToken: z.string().min(1),
  newPassword: passwordSchema,
  confirmPassword: z.string()
}).superRefine((input, context) => {
  if (input.newPassword !== input.confirmPassword) {
    context.addIssue({
      code: "custom",
      path: ["confirmPassword"],
      message: "Passwords do not match."
    });
  }
});
export type ForgotPasswordResetInput = z.infer<typeof forgotPasswordResetSchema>;

export const completeSecurityQuestionsSchema = z.strictObject({
  securityQuestions: fiveSecurityAnswersSchema
});
export type CompleteSecurityQuestionsInput = z.infer<typeof completeSecurityQuestionsSchema>;

export const completeSecurityQuestionsResponseSchema = z.strictObject({
  ok: z.literal(true)
});
export type CompleteSecurityQuestionsResponse = z.infer<typeof completeSecurityQuestionsResponseSchema>;

export const refreshBodySchema = z.strictObject({
  refreshToken: z.string().min(1).optional()
});
export type RefreshBody = z.infer<typeof refreshBodySchema>;

export const refreshResponseSchema = z.strictObject({
  accessToken: z.string().min(1),
  // Web clients receive this token only through an HttpOnly cookie; native clients may use the body.
  refreshToken: z.string().min(1).optional()
});
export type RefreshResponse = z.infer<typeof refreshResponseSchema>;

export const logoutResponseSchema = z.strictObject({
  ok: z.literal(true)
});
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export const loginResponseSchema = z.strictObject({
  accessToken: z.string().min(1),
  // Web clients receive this token only through an HttpOnly cookie; native clients may use the body.
  refreshToken: z.string().min(1).optional(),
  user: authUserSchema
});
export type LoginResponse = z.infer<typeof loginResponseSchema>;

export const registerResponseSchema = z.strictObject({
  user: registeredUserSchema
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;

export const forgotPasswordQuestionsResponseSchema = z.strictObject({
  questionIds: z.array(idSchema).length(3),
  questions: z.array(z.string().trim().min(1)).length(3)
}).superRefine((response, context) => {
  if (new Set(response.questionIds).size !== response.questionIds.length) {
    context.addIssue({
      code: "custom",
      path: ["questionIds"],
      message: "Question IDs must be unique."
    });
  }
});
export type ForgotPasswordQuestionsResponse = z.infer<typeof forgotPasswordQuestionsResponseSchema>;

export const resetPasswordResponseSchema = z.strictObject({
  ok: z.literal(true)
});
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
