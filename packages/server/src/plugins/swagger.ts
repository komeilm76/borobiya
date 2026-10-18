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

const implementedOperationIds = new Set(["publicHealth", "authRegister", "authLogin", "authRefresh", "authLogout"]);

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
  const responseContentType = route.meta.responseContentType ?? "application/json";

  for (const [status, schema] of Object.entries(route.schema.responses)) {
    const statusCode = Number(status);
    const noContent = isNoContentSchema(statusCode, schema);
    responses[status] = {
      description: responseDescription(statusCode, noContent),
      ...(!noContent
        ? {
            content: {
              [responseContentType]: { schema: toJsonSchema(schema, "output") }
            }
          }
        : {})
    };
  }

  // The server applies a global throttle even when a descriptor does not declare
  // a route-specific 429 response.
  responses["429"] ??= {
    description: responseDescription(429, false),
    content: {
      "application/json": { schema: toJsonSchema(apiErrorResponses[429], "output") }
    }
  };

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

export async function registerSwagger(app: FastifyInstance, openApiServerPath = "/"): Promise<void> {
  const tags = [...new Set(allApiRoutes.flatMap((route) => route.meta.tags))].map((name) => ({
    name: name.replace(/^#/, "")
  }));

  const swaggerOptions: SwaggerOptions = {
    mode: "dynamic",
    openapi: {
      info: {
        title: "Borobiya API",
        version: process.env.npm_package_version ?? "0.1.0",
        description:
          "OpenAPI is generated from the shared Zod route contracts. Public health, user registration, login, refresh, and logout are implemented at runtime; remaining operations are contract-only and currently return 404."
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
        paths: buildOpenApiPaths() as unknown as OpenAPIV3_2.Document["paths"]
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
