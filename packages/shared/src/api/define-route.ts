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
  /**
   * `true` when the server deliberately does not apply its global request throttle to this route.
   *
   * The OpenAPI generator adds a `429` response to every operation because the throttle is global, so a
   * route that opts out must opt out of that claim too — otherwise the contract advertises an error the
   * runtime can never produce. One field on the descriptor feeds both sides (see `app.ts` and
   * `plugins/swagger.ts`), because "documented as limited" and "actually limited" drifting apart is the
   * failure this exists to prevent.
   */
  rateLimitExempt?: boolean;
}

export interface ApiRouteDefinition {
  method: IMethod;
  url: `/${string}`;
  schema: ApiRouteSchema;
  meta: ApiRouteMeta;
}

type OutputOrFallback<Schema, Fallback> = Schema extends ZodType ? z.output<Schema> : Fallback;
type RouteBody<Definition extends ApiRouteDefinition> =
  OutputOrFallback<Definition["schema"]["body"], unknown>;
type RouteParams<Definition extends ApiRouteDefinition> =
  OutputOrFallback<Definition["schema"]["params"], z.output<typeof emptyObjectSchema>>;
type RouteQuery<Definition extends ApiRouteDefinition> =
  OutputOrFallback<Definition["schema"]["query"], z.output<typeof emptyObjectSchema>>;
type RouteHeaders<Definition extends ApiRouteDefinition> =
  OutputOrFallback<Definition["schema"]["headers"], z.output<typeof emptyObjectSchema>>;
type RouteCookies<Definition extends ApiRouteDefinition> =
  OutputOrFallback<Definition["schema"]["cookies"], z.output<typeof emptyObjectSchema>>;

type RouteHelperMethods<Definition extends ApiRouteDefinition> = {
  makeBody: (body: RouteBody<Definition>) => RouteBody<Definition>;
  makeParams: (params: RouteParams<Definition>) => RouteParams<Definition>;
  makeQueries: (queries: RouteQuery<Definition>) => RouteQuery<Definition>;
  makeHeaders: (headers: RouteHeaders<Definition>) => RouteHeaders<Definition>;
  makeCookies: (cookies: RouteCookies<Definition>) => RouteCookies<Definition>;
  makeFullPath: (params: RouteParams<Definition>) => string;
};

function fillPathParams(pathShape: string, params: object): string {
  const values = new Map<string, unknown>(Object.entries(params));
  return pathShape.replace(
    /[{]([A-Za-z_][A-Za-z0-9_]*)[}]|:([A-Za-z_][A-Za-z0-9_]*)(?=[.]|[/]|$)/g,
    (placeholder, openApiName: string | undefined, expressName: string | undefined) => {
      const name = openApiName ?? expressName;
      return name !== undefined && values.has(name) ? String(values.get(name)) : placeholder;
    }
  );
}

/**
 * Creates the repository's stable method/url/schema/meta descriptor and its
 * corresponding km-api config. Server adapters should register
 * `makeExpressPathShape()` so OpenAPI-style `{param}` placeholders are converted
 * to Express/Fastify `:param` syntax; OpenAPI tooling can use the other km-api
 * fields and helpers on the same object.
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

  // Retype km-api's identity helpers with this route's exact Zod outputs; its
  // broad config generics otherwise erase path params to `never` for consumers.
  const makeBody = (body: RouteBody<Definition>) => body;
  const makeParams = (params: RouteParams<Definition>) => params;
  const makeQueries = (queries: RouteQuery<Definition>) => queries;
  const makeHeaders = (headers: RouteHeaders<Definition>) => headers;
  const makeCookies = (cookies: RouteCookies<Definition>) => cookies;
  const makeFullPath = (params: RouteParams<Definition>) => fillPathParams(url, params);
  const routeHelpers: RouteHelperMethods<Definition> = {
    makeBody,
    makeParams,
    makeQueries,
    makeHeaders,
    makeCookies,
    makeFullPath
  };

  return Object.assign(kmApiConfig, { method, url, schema, meta, ...routeHelpers }) as
    Omit<typeof kmApiConfig, keyof RouteHelperMethods<Definition>> & RouteHelperMethods<Definition> & Definition;
}

export type ApiRoute = ReturnType<typeof defineRoute>;
