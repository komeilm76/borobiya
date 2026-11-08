import type { Config } from './config.ts';
import { originAllowed, requestOrigin, websocketOrigin } from './config.ts';
import { forbidden, payloadTooLarge, publicError, unsupportedMedia } from './errors.ts';
import { sha256 } from './crypto.ts';

/** Options controlling a buffered response write. */
export interface WriteOptions {
  contentType?: string;
  cacheControl?: string;
  etag?: string;
  headers?: Record<string, string | string[]>;
  compress?: boolean;
  status?: number;
}

/** Compression result for a response body. */
interface CompressedBody {
  body: Uint8Array;
  encoding?: 'gzip';
}

/**
 * Builds the security and CORS header set applied to every response.
 *
 * @param request Incoming request.
 * @param config Runtime configuration.
 * @returns Header name/value pairs.
 */
export function baseHeaders(request: Request, config: Config): Record<string, string> {
  const sameOrigin = requestOrigin(request, config);
  const ws = websocketOrigin(sameOrigin);
  const frameAncestors = config.frameAncestors.length ? config.frameAncestors.join(' ') : "'none'";
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    `frame-ancestors ${frameAncestors}`,
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${ws}`,
    "worker-src 'self'",
    "manifest-src 'self'"
  ].join('; ');
  const headers: Record<string, string> = {
    'Content-Security-Policy': csp,
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    ...(config.frameAncestors.length ? {} : { 'X-Frame-Options': 'DENY' }),
    'Permissions-Policy': 'geolocation=(self), microphone=(self), camera=(self)',
    'Cache-Control': 'no-store',
    'X-Request-Id': ''
  };
  if (config.environment === 'production') headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  const origin = request.headers.get('origin');
  if (typeof origin === 'string' && originAllowed(origin, sameOrigin, config)) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Credentials'] = 'true';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, PATCH, PUT, DELETE, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, X-Request-Id';
    headers['Access-Control-Max-Age'] = '600';
    headers.Vary = 'Origin, Accept-Encoding';
  } else {
    headers.Vary = 'Accept-Encoding';
  }
  return headers;
}

/**
 * Applies the base headers plus the request identifier to a response.
 *
 * @param request Incoming request.
 * @param response Response to decorate.
 * @param config Runtime configuration.
 * @param requestId Correlation identifier for logs and clients.
 * @returns The same response for chaining.
 */
export function withBaseHeaders(request: Request, response: Response, config: Config, requestId: string): Response {
  const headers = baseHeaders(request, config);
  headers['X-Request-Id'] = requestId;
  // API responses must never be stored, but generated assets and deterministic tiles set their
  // own long-lived policy; an explicit per-response `Cache-Control` therefore wins.
  const explicitCacheControl = response.headers.get('cache-control');
  if (explicitCacheControl) delete headers['Cache-Control'];
  for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
  return response;
}

/**
 * Rejects cross-site mutations before they touch a service.
 *
 * @param request Incoming request.
 * @param config Runtime configuration.
 * @throws HttpError 403 when the origin is untrusted.
 */
export function assertSafeMutation(request: Request, config: Config): void {
  const origin = request.headers.get('origin') ?? undefined;
  const site = request.headers.get('sec-fetch-site');
  const sameOrigin = requestOrigin(request, config);
  if (site === 'cross-site' && !originAllowed(origin, sameOrigin, config)) {
    throw forbidden('Cross-site request rejected.');
  }
  if (origin && !originAllowed(origin, sameOrigin, config)) {
    throw forbidden('Origin is not allowed.');
  }
}

/**
 * Reads and validates a JSON body with a hard byte budget.
 *
 * @param request Incoming request.
 * @param maxBytes Maximum accepted body size.
 * @returns The parsed JSON value, or an empty object for empty bodies.
 * @throws HttpError 413 when too large and 415 when the media type or JSON is invalid.
 */
export async function readJsonBody(request: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (request.body) {
    const reader = request.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw payloadTooLarge();
      }
      chunks.push(value);
    }
  }
  if (size === 0) return {};
  const contentType = (request.headers.get('content-type') ?? '').toLowerCase();
  if (!contentType.includes('application/json')) throw unsupportedMedia();
  const raw = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString('utf8');
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw unsupportedMedia('Body is not valid JSON.');
  }
}

/**
 * Creates a strong ETag for a body.
 *
 * @param value Body bytes or text.
 * @returns A quoted ETag.
 */
export function strongEtag(value: Uint8Array | string): string {
  return `"${sha256(typeof value === 'string' ? value : Buffer.from(value).toString('latin1')).slice(0, 24)}"`;
}

function compress(body: Uint8Array, acceptEncoding: string, contentType: string): CompressedBody {
  const canCompress = /^(text\/|application\/(json|javascript|xml)|image\/svg\+xml|\+json)/.test(contentType);
  if (!canCompress || body.byteLength < 1024) return { body };
  // Bun ships a native zlib binding that supports gzip and deflate; gzip is the interoperable choice here.
  if (acceptEncoding.toLowerCase().includes('gzip')) {
    return { body: new Uint8Array(Bun.gzipSync(body as Uint8Array<ArrayBuffer>)), encoding: 'gzip' };
  }
  return { body };
}

/**
 * Writes a buffered response with optional compression, ETag revalidation and extra headers.
 *
 * @param request Incoming request (for `HEAD` and `If-None-Match`).
 * @param status HTTP status code.
 * @param body Response body bytes.
 * @param options Content type, cache policy, ETag and extra headers.
 * @returns A fully decorated response.
 */
export function bufferResponse(request: Request, status: number, body: Uint8Array, options: WriteOptions = {}): Response {
  const contentType = options.contentType ?? 'application/octet-stream';
  const headers = new Headers();
  headers.set('Content-Type', contentType);
  for (const [key, value] of Object.entries(options.headers ?? {})) {
    if (Array.isArray(value)) {
      for (const item of value) headers.append(key, item);
    } else {
      headers.set(key, value);
    }
  }
  if (options.cacheControl) headers.set('Cache-Control', options.cacheControl);
  if (options.etag) headers.set('ETag', options.etag);
  const ifNoneMatch = request.headers.get('if-none-match');
  if (options.etag && ifNoneMatch && ifNoneMatch.split(',').map((item) => item.trim()).includes(options.etag)) {
    headers.set('Content-Length', '0');
    return new Response(null, { status: 304, headers });
  }
  const compressed = options.compress === false
    ? { body, encoding: undefined }
    : compress(body, request.headers.get('accept-encoding') ?? '', contentType);
  if (compressed.encoding) headers.set('Content-Encoding', compressed.encoding);
  headers.set('Content-Length', String(compressed.body.byteLength));
  const head = request.method === 'HEAD';
  return new Response(head ? null : (compressed.body as unknown as BodyInit), { status: options.status ?? status, headers });
}

/**
 * Writes a JSON envelope response.
 *
 * @param request Incoming request.
 * @param status HTTP status code.
 * @param payload Serializable payload.
 * @param extraHeaders Additional headers such as `Set-Cookie`.
 * @returns A response containing the JSON payload.
 */
export function jsonResponse(
  request: Request,
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string | string[]>
): Response {
  const body = new TextEncoder().encode(JSON.stringify(payload));
  return bufferResponse(request, status, body, {
    contentType: 'application/json; charset=utf-8',
    headers: extraHeaders,
    cacheControl: 'no-store',
    compress: true
  });
}

/**
 * Writes a plain-text response.
 *
 * @param request Incoming request.
 * @param status HTTP status code.
 * @param body Text body.
 * @param contentType Media type.
 * @param options Extra write options.
 * @returns A text response.
 */
export function textResponse(
  request: Request,
  status: number,
  body: string,
  contentType = 'text/plain; charset=utf-8',
  options: WriteOptions = {}
): Response {
  return bufferResponse(request, status, new TextEncoder().encode(body), { contentType, ...options, status });
}

/**
 * Serialises a typed error into the public error envelope.
 *
 * @param request Incoming request.
 * @param error Thrown value.
 * @param requestId Correlation identifier.
 * @returns An error response with a stable code.
 */
export function errorResponse(request: Request, error: unknown, requestId: string): Response {
  const result = publicError(error, requestId);
  return jsonResponse(request, result.status, result.body, result.headers);
}

/**
 * Builds an empty response, used for CORS preflight.
 *
 * @param status HTTP status code.
 * @returns A response without a body.
 */
export function emptyResponse(status = 204): Response {
  return new Response(null, { status });
}
