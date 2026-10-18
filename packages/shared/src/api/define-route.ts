import { makeApiConfig, type IMethod, type IRequestContentType, type IResponseContentType } from "km-api";
import { z, type ZodObject, type ZodType } from "zod";

const emptyObjectSchema = z.strictObject({});

export type ApiRouteAccess = "public" | "guest" | "authenticated" | "admin";

export interface ApiRouteSchema {
  body?: ZodType;
  params?: ZodObject;
  query?: ZodObject;
  headers?: ZodObject;
  cookies?: ZodObject;
  responses: Record<number, ZodType>;
}

export interface ApiRouteMeta {
  operationId: string;
  summary: string;
  description?: string;
  tags: readonly string[];
  access: ApiRouteAccess;
  requestContentType?: IRequestContentType;
  responseContentType?: IResponseContentType;
  deprecated?: boolean;
}

export interface ApiRouteDefinition {
  method: IMethod;
  url: `/${string}`;
  schema: ApiRouteSchema;
  meta: ApiRouteMeta;
}

/**
 * Creates the repository's stable method/url/schema/meta descriptor and its
 * corresponding km-api config. Server adapters can consume the descriptor;
 * OpenAPI tooling can use the km-api fields and helpers on the same object.
 */
export function defineRoute<const Definition extends ApiRouteDefinition>(definition: Definition) {
  const { method, url, schema, meta } = definition;
  const tags = meta.tags.map((tag) => (tag.startsWith("#") ? tag : `#${tag}`)) as Array<`#${string}`>;
  const requiresAuthentication = meta.access === "authenticated" || meta.access === "admin";

  const kmApiConfig = makeApiConfig({
    method,
    pathShape: url,
    tags,
    auth: requiresAuthentication ? "YES" : "NO",
    responseContentType: meta.responseContentType ?? "application/json",
    ...(meta.requestContentType ? { requestContentType: meta.requestContentType } : {}),
    ...(meta.description ? { description: meta.description } : {}),
    ...(meta.deprecated ? { deprecated: "YES" as const } : {}),
    summary: meta.summary,
    operationId: meta.operationId,
    request: {
      // km-api requires a body schema; z.any() is its documented no-body placeholder.
      body: schema.body ?? z.any(),
      params: schema.params ?? emptyObjectSchema,
      query: schema.query ?? emptyObjectSchema,
      headers: schema.headers ?? emptyObjectSchema,
      cookies: schema.cookies ?? emptyObjectSchema
    },
    response: schema.responses
  });

  return Object.assign(kmApiConfig, { method, url, schema, meta });
}

export type ApiRoute = ReturnType<typeof defineRoute>;
