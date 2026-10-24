import swagger, { type OpenAPIV3_2, type SwaggerOptions } from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { allApiRoutes, apiErrorResponses, type ApiRouteDefinition } from "@borobiya/shared/api";
import { z, type ZodType } from "zod";
import type { FastifyInstance } from "fastify";

const jsonSchemaOptions = {
  target: "openapi-3.0",
  unrepresentable: "any",
  reused: "inline"
} as const;

export const implementedOperationIds: ReadonlySet<string> = new Set([
  "publicHealth",
  "authRegister",
  "authLogin",
  "authRefresh",
  "authLogout",
  "authForgotPasswordRequest",
  "authForgotPasswordVerify",
  "authForgotPasswordReset",
  "publicSecurityQuestions",
  "publicIncidentTypes",
  "userGetMe",
  "adminListUsers",
  "adminGetUser",
  "adminCreateUser",
  "adminUpdateUserStatus",
  "adminCreateIncidentType",
  "adminListIncidentTypes",
  "adminUpdateIncidentType",
  "adminCreateCategory",
  "adminListCategories",
  "adminUpdateCategory",
  "adminAssignCategoryUsers",
  "adminRemoveCategoryUser",
  "adminListSosRequests",
  "adminGetSosRequest",
  "adminGetNearestResponders",
  "adminDispatchSosRequest",
  "userCompleteSecurityQuestions",
  "userListDevices",
  "userSearch",
  "locationCreateShare",
  "locationCreateHistoryShare",
  "locationGetHistory",
  "locationGetSharedHistory",
  "locationListHistoryShares",
  "locationRevokeHistoryShare",
  "locationRevokeShare",
  "locationListShares",
  "locationUpdateRestFallback",
  "sosCreateRequest",
  "sosUploadRequestPhoto",
  "sosGetPhotoAccess",
  "publicReadSosPhoto",
  "sosListProposals",
  "sosAcceptProposal",
  "sosDeclineProposal",
  "sosUpdateMissionStatus",
  "sosListCancellationReasons",
  "sosCancelRequest",
  "sosListMissions",
  "sosGetMission",
  "sosCancelMission"
]);

interface JsonObjectSchema {
  properties?: Record<string, unknown>;
  required?: string[];
  [key: string]: unknown;
}

interface OpenApiParameter {
  name: string;
  in: "path" | "query" | "header" | "cookie";
  required: boolean;
  schema: Record<string, unknown>;
  description?: string;
}

interface OpenApiResponse {
  description: string;
  content?: Record<string, { schema: unknown }>;
}

interface OpenApiOperation {
  [key: string]: unknown;
}

type OpenApiPaths = Record<string, Record<string, OpenApiOperation>>;

function toJsonSchema(schema: ZodType, io: "input" | "output"): Record<string, unknown> {
  return z.toJSONSchema(schema, { ...jsonSchemaOptions, io }) as Record<string, unknown>;
}

function asObjectSchema(schema: ZodType, io: "input" | "output"): JsonObjectSchema {
  return toJsonSchema(schema, io) as JsonObjectSchema;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalSchema(schema: ZodType): boolean {
  return (
    schema instanceof z.ZodOptional ||
    schema instanceof z.ZodDefault ||
    schema instanceof z.ZodPrefault ||
    schema instanceof z.ZodCatch
  );
}

function isNoContentSchema(statusCode: number, schema: ZodType): boolean {
  return statusCode === 204 || statusCode === 205 || schema instanceof z.ZodVoid;
}

function addObjectParameters(
  parameters: OpenApiParameter[],
  schema: ZodType | undefined,
  location: OpenApiParameter["in"]
): void {
  if (!schema) return;

  // Use normalized/output types for useful query constraints (e.g. coerced numbers),
  // but derive requiredness from the accepted/input schema so defaults stay optional.
  const input = asObjectSchema(schema, "input");
  const output = asObjectSchema(schema, "output");
  const inputProperties = isRecord(input.properties) ? input.properties : {};
  const outputProperties = isRecord(output.properties) ? output.properties : {};
  const requiredProperties = new Set(Array.isArray(input.required) ? input.required : []);
  const names = new Set([...Object.keys(inputProperties), ...Object.keys(outputProperties)]);

  for (const name of names) {
    const inputProperty = inputProperties[name];
    const outputProperty = outputProperties[name];
    const propertySchema = {
      ...(isRecord(inputProperty) ? inputProperty : {}),
      ...(isRecord(outputProperty) ? outputProperty : {})
    };
    const description = propertySchema.description;
    parameters.push({
      name,
      in: location,
      required: location === "path" || requiredProperties.has(name),
      schema: propertySchema,
      ...(typeof description === "string" ? { description } : {})
    });
  }
}

function responseDescription(statusCode: number, noContent: boolean): string {
  if (noContent) return "Successful response with no response body.";
  if (statusCode >= 200 && statusCode < 300) return "Successful response.";
  if (statusCode === 400) return "The request is invalid.";
  if (statusCode === 401) return "Authentication is required.";
  if (statusCode === 403) return "The operation is not allowed.";
  if (statusCode === 404) return "The requested resource was not found.";
  if (statusCode === 409) return "The request conflicts with the current state.";
  if (statusCode === 410) return "The requested resource is no longer available.";
  if (statusCode === 413) return "The request payload is too large.";
  if (statusCode === 422) return "The request could not be processed.";
  if (statusCode === 429) return "The request limit was exceeded.";
  if (statusCode >= 500) return "The server could not complete the request.";
  return `Response for HTTP ${statusCode}.`;
}

function buildResponses(route: ApiRouteDefinition): Record<string, OpenApiResponse> {
  const responses: Record<string, OpenApiResponse> = {};
  for (const [status, schema] of Object.entries(route.schema.responses)) {
    const statusCode = Number(status);
    const noContent = isNoContentSchema(statusCode, schema);
    const binary = statusCode >= 200 && statusCode < 300 && route.meta.responseContentType === "application/octet-stream";
    const responseContentType = statusCode >= 200 && statusCode < 300
      ? route.meta.responseContentType ?? "application/json"
      : "application/json";
    responses[status] = {
      description: responseDescription(statusCode, noContent),
      ...(!noContent
        ? {
            content: {
              [responseContentType]: {
                schema: binary ? { type: "string", format: "binary" } : toJsonSchema(schema, "output")
              }
            }
          }
        : {})
    };
  }

  // The server applies a global throttle even when a descriptor does not declare a route-specific 429
  // response — except where the descriptor says the route is exempt, because advertising an error the
  // runtime cannot answer is exactly the drift `rateLimitExempt` exists to prevent.
  if (route.meta.rateLimitExempt !== true) {
    responses["429"] ??= {
      description: responseDescription(429, false),
      content: {
        "application/json": { schema: toJsonSchema(apiErrorResponses[429], "output") }
      }
    };
  }

  return responses;
}

function buildOperation(route: ApiRouteDefinition): OpenApiOperation {
  const parameters: OpenApiParameter[] = [];
  addObjectParameters(parameters, route.schema.params, "path");
  addObjectParameters(parameters, route.schema.query, "query");
  addObjectParameters(parameters, route.schema.headers, "header");
  addObjectParameters(parameters, route.schema.cookies, "cookie");

  const operation: OpenApiOperation = {
    operationId: route.meta.operationId,
    summary: route.meta.summary,
    tags: route.meta.tags.map((tag) => tag.replace(/^#/, "")),
    responses: buildResponses(route),
    "x-borobiya-access": route.meta.access,
    // The docs publish the complete contract catalog without registering fake handlers.
    "x-borobiya-runtime-status": implementedOperationIds.has(route.meta.operationId) ? "implemented" : "contract-only"
  };

  if (route.meta.description) operation.description = route.meta.description;
  if (route.meta.deprecated) operation.deprecated = true;
  if (parameters.length > 0) operation.parameters = parameters;

  if (route.schema.body) {
    const requestContentType = route.meta.requestContentType ?? "application/json";
    operation.requestBody = {
      required: !isOptionalSchema(route.schema.body),
      content: {
        [requestContentType]: { schema: toJsonSchema(route.schema.body, "input") }
      }
    };
  }

  if (route.meta.access === "authenticated" || route.meta.access === "admin") {
    operation.security = [{ bearerAuth: [] }];
  }

  return operation;
}

/**
 * Construct the contract catalog directly from shared descriptors. Domain paths
 * deliberately are not registered as placeholder Fastify handlers here.
 */
export function buildOpenApiPaths(): OpenApiPaths {
  const paths: OpenApiPaths = {};

  for (const route of allApiRoutes) {
    const openApiPath = (route as ApiRouteDefinition & { makeOpenApiPathShape: () => string })
      .makeOpenApiPathShape();
    const pathItem = (paths[openApiPath] ??= {});
    const method = route.method.toLowerCase();
    if (pathItem[method]) {
      throw new Error(`Duplicate API contract: ${route.method} ${openApiPath}`);
    }
    pathItem[method] = buildOperation(route);
  }

  return paths;
}

/**
 * Builds the `openapi.info.description` runtime summary directly from `x-borobiya-runtime-status`
 * on the generated paths so prose in `/docs/json` can never drift behind `implementedOperationIds`.
 */
export function describeOpenApiRuntimeStatus(paths: OpenApiPaths = buildOpenApiPaths()): string {
  let implementedCount = 0;
  let contractOnlyCount = 0;
  const implementedByTag = new Map<string, string[]>();
  const contractOnlyByTag = new Map<string, string[]>();

  for (const [openApiPath, methods] of Object.entries(paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      const label = `${method.toUpperCase()} ${openApiPath}`;
      const isImplemented = operation["x-borobiya-runtime-status"] === "implemented";
      if (isImplemented) implementedCount += 1;
      else contractOnlyCount += 1;

      const tags = Array.isArray(operation.tags) ? (operation.tags as string[]) : [];
      for (const tag of tags) {
        const target = isImplemented ? implementedByTag : contractOnlyByTag;
        const list = target.get(tag) ?? [];
        list.push(label);
        target.set(tag, list);
      }
    }
  }

  const totalCount = implementedCount + contractOnlyCount;
  const sosImplemented = implementedByTag.get("sos") ?? [];
  const sosClause = sosImplemented.length > 0
    ? `SOS creation, evidence upload, admin queue/detail reads, nearest-responder ranking, and multi-responder dispatch (${sosImplemented.join(", ")}) are live, while the remaining SOS history/cancellation, rescuer proposal, mission, and place-search operations carry \`x-borobiya-runtime-status: contract-only\` and currently return 404.`
    : "SOS and mission operations carry `x-borobiya-runtime-status: contract-only` and currently return 404.";

  return (
    `OpenAPI is generated from the shared Zod route contracts (${implementedCount} of ${totalCount} operations implemented at runtime, ` +
    `${contractOnlyCount} marked \`x-borobiya-runtime-status: contract-only\`). Public health/security-question/incident-type catalogs, auth/session/recovery, ` +
    `admin user list/detail/create/status, the admin incident-type catalog (list/create/update), the responder-category catalog with member assignment and removal, ` +
    `authenticated profile/onboarding/devices, partial-username user search, live-location share creation, revocation, listing, history-share creation with its windowed reads, ` +
    `grant lists, and delete, and the deprecated REST location-update fallback are implemented at runtime (live \`location:update\` and \`location:share-ended\` run over Socket.IO). ` +
    sosClause
  );
}

export async function registerSwagger(app: FastifyInstance, openApiServerPath = "/"): Promise<void> {
  const paths = buildOpenApiPaths();
  const tags = [...new Set(allApiRoutes.flatMap((route) => route.meta.tags))].map((name) => ({
    name: name.replace(/^#/, "")
  }));

  const swaggerOptions: SwaggerOptions = {
    mode: "dynamic",
    openapi: {
      info: {
        title: "Borobiya API",
        version: process.env.npm_package_version ?? "0.2.0",
        description: describeOpenApiRuntimeStatus(paths)
      },
      servers: [
        { url: openApiServerPath },
        ...(openApiServerPath === "/" ? [] : [{ url: "/" }])
      ],
      tags,
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
            description: "Access token for authenticated and administrator operations."
          }
        }
      }
    },
    transformObject: (document) => {
      if (!("openapiObject" in document)) return document.swaggerObject;
      const openapiObject = document.openapiObject as Partial<OpenAPIV3_2.Document>;
      return {
        ...openapiObject,
        paths: paths as unknown as OpenAPIV3_2.Document["paths"]
      };
    }
  };

  await app.register(swagger, swaggerOptions);
  await app.register(swaggerUi, {
    routePrefix: "/docs",
    staticCSP: true,
    uiConfig: {
      docExpansion: "list",
      deepLinking: true
    }
  });
}
