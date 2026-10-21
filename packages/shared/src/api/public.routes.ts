import { z } from "zod";
import { incidentTypeSchema } from "../schemas/admin";
import { securityQuestionsResponseSchema } from "../schemas/auth";
import { errorSchema } from "../schemas/common";
import { defineRoute } from "./define-route";

const healthResponseSchema = z.strictObject({
  status: z.literal("ok"),
  uptime: z.number().nonnegative().optional(),
  version: z.string().min(1).optional()
});
const mapThemeParamsSchema = z.strictObject({ theme: z.enum(["light", "dark"]) });
const mapStyleResponseSchema = z.record(z.string(), z.unknown());

export const publicRoutes = {
  health: defineRoute({
    method: "GET",
    url: "/_public/health",
    schema: { responses: { 200: healthResponseSchema } },
    meta: {
      operationId: "publicHealth",
      summary: "Check API health",
      tags: ["public"],
      access: "public"
    }
  }),
  securityQuestions: defineRoute({
    method: "GET",
    url: "/_public/security-questions",
    schema: { responses: { 200: securityQuestionsResponseSchema } },
    meta: {
      operationId: "publicSecurityQuestions",
      summary: "List security questions for registration",
      tags: ["public"],
      access: "public"
    }
  }),
  incidentTypes: defineRoute({
    method: "GET",
    url: "/_public/incident-types",
    schema: { responses: { 200: z.array(incidentTypeSchema) } },
    meta: {
      operationId: "publicIncidentTypes",
      summary: "List incident types for the SOS form",
      tags: ["public"],
      access: "public"
    }
  }),
  mapStyle: defineRoute({
    method: "GET",
    url: "/_public/map/styles/{theme}.json",
    schema: {
      params: mapThemeParamsSchema,
      responses: { 200: mapStyleResponseSchema, 404: errorSchema }
    },
    meta: {
      operationId: "publicMapStyle",
      summary: "Get a public map style document",
      tags: ["public", "map"],
      access: "public"
    }
  })
} as const;
