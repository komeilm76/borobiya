import type { Config } from './config.ts';
import type { Validator } from './validate.ts';
import type { RateRule } from './rate-limit.ts';

export type AuthMode = 'none' | 'user' | 'admin';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface AuthIdentity {
  userId: string;
  sessionId: string;
  username: string;
  role: string;
  deviceId: string;
  ip: string;
}

export interface RequestContext<App = unknown> {
  app: App;
  /** The raw Bun request; handlers read headers and the client IP from it. */
  request: Request;
  config: Config;
  requestId: string;
  method: HttpMethod;
  path: string;
  url: URL;
  params: Record<string, string>;
  query: unknown;
  body: unknown;
  cookies: Record<string, string>;
  ip: string;
  origin: string;
  auth: AuthIdentity | null;
}

/** JSON envelope result. The handler must say the status; payloads may be empty (void endpoints). */
export interface JsonRouteResult {
  status: number;
  data?: unknown;
  headers?: Record<string, string>;
  cookies?: string[];
}

/** Raw (non-envelope) result, e.g. CSV, SVG or other downloads. Raw responses never set cookies. */
export interface RawRouteResult {
  status: number;
  raw: string;
  contentType: string;
  cacheControl?: string;
  etag?: string;
  compress?: boolean;
  headers?: Record<string, string>;
}

export type RouteResult = JsonRouteResult | RawRouteResult;

export interface RouteDefinition<App = unknown> {
  method: HttpMethod;
  path: string;
  auth: AuthMode;
  handler: (ctx: RequestContext<App>) => RouteResult | Promise<RouteResult>;
  body?: Validator<unknown>;
  query?: Validator<unknown>;
  rate?: RateRule;
  summary?: string;
  tags?: string[];
}

export interface RouteMatch<App = unknown> {
  route: RouteDefinition<App>;
  params: Record<string, string>;
}

export const ok = (data: unknown, status = 200): RouteResult => ({ status, data });
export const created = (data: unknown): RouteResult => ({ status: 201, data });
export const raw = (
  body: string,
  contentType: string,
  options: Omit<RawRouteResult, 'status' | 'raw' | 'contentType'> = {}
): RawRouteResult => ({ status: 200, raw: body, contentType, ...options });

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

interface CompiledPath {
  regex: RegExp;
  names: string[];
}

function compilePath(pathname: string): CompiledPath {
  const names: string[] = [];
  const pieces = pathname.split('/').map((segment) => {
    const match = /^:([A-Za-z0-9_]+)(.*)$/.exec(segment);
    if (!match) return escapeRegex(segment);
    names.push(match[1]);
    return `([^/]+)${escapeRegex(match[2])}`;
  });
  return { regex: new RegExp(`^${pieces.join('/')}/?$`), names };
}

export class Router<App = unknown> {
  private readonly compiled: Array<{ definition: RouteDefinition<App>; path: CompiledPath }> = [];

  add(definition: RouteDefinition<App>): this {
    this.compiled.push({ definition, path: compilePath(definition.path) });
    return this;
  }

  all(): RouteDefinition<App>[] {
    return this.compiled.map((entry) => entry.definition);
  }

  match(method: string, pathname: string): RouteMatch<App> | null {
    for (const entry of this.compiled) {
      if (entry.definition.method !== method) continue;
      const match = entry.path.regex.exec(pathname);
      if (!match) continue;
      const params: Record<string, string> = {};
      try {
        entry.path.names.forEach((name, index) => {
          params[name] = decodeURIComponent(match[index + 1]);
        });
      } catch {
        return null;
      }
      return { route: entry.definition, params };
    }
    return null;
  }

  openapi(title: string, version: string): Record<string, unknown> {
    const paths: Record<string, Record<string, unknown>> = {};
    for (const route of this.all()) {
      const openPath = route.path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
      const operation: Record<string, unknown> = {
        operationId: `${route.method.toLowerCase()}${route.path.replace(/[^A-Za-z0-9]+/g, '_')}`,
        summary: route.summary ?? `${route.method} ${route.path}`,
        tags: route.tags ?? ['api'],
        security: route.auth === 'none' ? [] : [{ sessionCookie: [] }],
        responses: {
          '200': { description: 'Success' },
          '400': { description: 'Invalid input' },
          '401': { description: 'Authentication required' },
          '403': { description: 'Permission denied' },
          '429': { description: 'Rate limited' }
        }
      };
      if (route.body) operation.requestBody = { required: true, content: { 'application/json': { schema: { type: 'object' } } } };
      paths[openPath] ??= {};
      paths[openPath][route.method.toLowerCase()] = operation;
    }
    return {
      openapi: '3.1.0',
      info: { title, version },
      servers: [{ url: '/' }],
      components: { securitySchemes: { sessionCookie: { type: 'apiKey', in: 'cookie', name: 'bb_session' } } },
      paths
    };
  }
}
