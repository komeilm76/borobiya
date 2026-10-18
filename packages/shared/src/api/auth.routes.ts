import { z } from "zod";
import {
  forgotPasswordQuestionsResponseSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResetSchema,
  forgotPasswordVerifySchema,
  loginResponseSchema,
  loginSchema,
  logoutResponseSchema,
  refreshBodySchema,
  refreshResponseSchema,
  registerResponseSchema,
  registerSchema,
  resetPasswordResponseSchema,
  securityQuestionsResponseSchema
} from "../schemas/auth";
import { errorSchema } from "../schemas/common";
import { defineRoute } from "./define-route";

const resetTokenResponseSchema = z.strictObject({ resetToken: z.string().min(1) });
const refreshCookiesSchema = z.strictObject({ refreshToken: z.string().min(1).optional() });

export const authRoutes = {
  register: defineRoute({
    method: "POST",
    url: "/_auth/register",
    schema: {
      body: registerSchema,
      responses: { 201: registerResponseSchema, 400: errorSchema, 403: errorSchema, 409: errorSchema }
    },
    meta: {
      operationId: "authRegister",
      summary: "Register a user account",
      description: "Registers a user with five unique security-question answers.",
      tags: ["auth"],
      access: "guest"
    }
  }),
  login: defineRoute({
    method: "POST",
    url: "/_auth/login",
    schema: {
      body: loginSchema,
      responses: {
        200: loginResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        429: errorSchema
      }
    },
    meta: {
      operationId: "authLogin",
      summary: "Authenticate with username and password",
      description: "Web clients receive the refresh token only via an HttpOnly cookie; native clients may receive it in the response body.",
      tags: ["auth"],
      access: "guest"
    }
  }),
  refresh: defineRoute({
    method: "POST",
    url: "/_auth/refresh",
    schema: {
      body: refreshBodySchema.optional(),
      cookies: refreshCookiesSchema,
      responses: { 200: refreshResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "authRefresh",
      summary: "Rotate refresh and access tokens",
      description: "Accepts a refresh token in the request body or cookie. Web clients receive the rotated token via an HttpOnly cookie; native clients may use the response body.",
      tags: ["auth"],
      access: "guest"
    }
  }),
  logout: defineRoute({
    method: "POST",
    url: "/_auth/logout",
    schema: {
      body: refreshBodySchema.optional(),
      cookies: refreshCookiesSchema,
      responses: { 200: logoutResponseSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "authLogout",
      summary: "Invalidate the current refresh token",
      description: "Accepts the refresh token from the HttpOnly cookie or, for native clients, the request body.",
      tags: ["auth"],
      access: "guest"
    }
  }),
  forgotPasswordRequest: defineRoute({
    method: "POST",
    url: "/_auth/forgot-password/request",
    schema: {
      body: forgotPasswordRequestSchema,
      responses: { 200: forgotPasswordQuestionsResponseSchema, 400: errorSchema, 403: errorSchema, 429: errorSchema }
    },
    meta: {
      operationId: "authForgotPasswordRequest",
      summary: "Request security questions for password recovery",
      tags: ["auth"],
      access: "guest"
    }
  }),
  forgotPasswordVerify: defineRoute({
    method: "POST",
    url: "/_auth/forgot-password/verify",
    schema: {
      body: forgotPasswordVerifySchema,
      responses: { 200: resetTokenResponseSchema, 400: errorSchema, 403: errorSchema, 429: errorSchema }
    },
    meta: {
      operationId: "authForgotPasswordVerify",
      summary: "Verify security answers for password recovery",
      tags: ["auth"],
      access: "guest"
    }
  }),
  forgotPasswordReset: defineRoute({
    method: "POST",
    url: "/_auth/forgot-password/reset",
    schema: {
      body: forgotPasswordResetSchema,
      responses: { 200: resetPasswordResponseSchema, 400: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "authForgotPasswordReset",
      summary: "Set a new password with a recovery token",
      tags: ["auth"],
      access: "guest"
    }
  }),
  securityQuestions: defineRoute({
    method: "GET",
    url: "/_auth/security-questions",
    schema: {
      responses: { 200: securityQuestionsResponseSchema, 403: errorSchema }
    },
    meta: {
      operationId: "authSecurityQuestions",
      summary: "List security questions for guest registration",
      tags: ["auth"],
      access: "guest"
    }
  })
} as const;
