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
const photoReadParamsSchema = z.strictObject({ id: z.string().regex(/^[0-9a-f-]+\.(?:jpg|png|webp)$/) });
const photoReadQuerySchema = z.strictObject({
  requestId: z.uuid(),
  expires: z.coerce.number().int(),
  signature: z.string()
});
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
      access: "public",
      // See `ApiRouteMeta.rateLimitExempt`: a probe that can be throttled is a probe that reports a
      // busy-but-healthy instance as down.
      rateLimitExempt: true
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
  readSosPhoto: defineRoute({
    method: "GET",
    url: "/uploads/:id",
    schema: {
      params: photoReadParamsSchema,
      query: photoReadQuerySchema,
      responses: { 200: z.string().describe("Binary image bytes (JPEG, PNG or WebP)"), 404: errorSchema }
    },
    meta: {
      operationId: "publicReadSosPhoto",
      summary: "Read an SOS photo using a short-lived signed URL",
      description: "A signed URL is issued only to the requester, admin, or a rescuer with a pending/accepted proposal. The response is binary image bytes, not JSON.",
      tags: ["sos"],
      access: "public",
      responseContentType: "application/octet-stream"
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
