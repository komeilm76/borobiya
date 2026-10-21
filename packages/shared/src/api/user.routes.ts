import {
  completeSecurityQuestionsResponseSchema,
  completeSecurityQuestionsSchema
} from "../schemas/auth";
import { errorSchema } from "../schemas/common";
import {
  devicesSchema,
  updateUserProfileSchema,
  userProfileSchema
} from "../schemas/user";
import { userSearchResponseSchema, userSearchSchema } from "../schemas/search";
import { defineRoute } from "./define-route";

export const userRoutes = {
  me: defineRoute({
    method: "GET",
    url: "/_user/me",
    schema: { responses: { 200: userProfileSchema, 401: errorSchema, 403: errorSchema } },
    meta: {
      operationId: "userGetMe",
      summary: "Get the authenticated user's profile",
      tags: ["user"],
      access: "authenticated"
    }
  }),
  updateMe: defineRoute({
    method: "PATCH",
    url: "/_user/me",
    schema: {
      body: updateUserProfileSchema,
      responses: { 200: userProfileSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "userUpdateMe",
      summary: "Update the authenticated user's editable profile fields",
      tags: ["user"],
      access: "authenticated"
    }
  }),
  devices: defineRoute({
    method: "GET",
    url: "/_user/devices",
    schema: { responses: { 200: devicesSchema, 401: errorSchema, 403: errorSchema } },
    meta: {
      operationId: "userListDevices",
      summary: "List devices associated with the authenticated account",
      tags: ["user"],
      access: "authenticated"
    }
  }),
  completeSecurityQuestions: defineRoute({
    method: "POST",
    url: "/_user/complete-security-questions",
    schema: {
      body: completeSecurityQuestionsSchema,
      responses: {
        200: completeSecurityQuestionsResponseSchema,
        400: errorSchema,
        401: errorSchema,
        403: errorSchema,
        409: errorSchema
      }
    },
    meta: {
      operationId: "userCompleteSecurityQuestions",
      summary: "Complete the required security questions for an account",
      tags: ["user", "auth"],
      access: "authenticated"
    }
  }),
  search: defineRoute({
    method: "GET",
    url: "/_user/users/search",
    schema: {
      query: userSearchSchema,
      responses: { 200: userSearchResponseSchema, 400: errorSchema, 401: errorSchema, 403: errorSchema }
    },
    meta: {
      operationId: "userSearch",
      summary: "Search users with optional category, rating, online, and distance filters",
      tags: ["user", "search"],
      access: "authenticated"
    }
  })
} as const;
