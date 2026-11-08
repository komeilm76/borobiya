import type { IncomingMessage, ServerResponse } from 'node:http';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import type { Config } from './config.ts';
import { clientIp, originAllowed, requestOrigin, websocketOrigin } from './config.ts';
import { forbidden, payloadTooLarge, publicError, unsupportedMedia } from './errors.ts';
import { sha256 } from './crypto.ts';

export interface WriteOptions {
  contentType?: string;
  cacheControl?: string;
  etag?: string;
  headers?: Record<string, string | string[]>;
  compress?: boolean;
}

export function baseHeaders(req: IncomingMessage, config: Config): Record<string, string> {
  const sameOrigin = requestOrigin(req, config);
  const ws = websocketOrigin(sameOrigin);
  const csp = [
    "default-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
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
    'X-Frame-Options': 'DENY',
    'Permissions-Policy': 'geolocation=(self), microphone=(self), camera=(self)',
    'Cache-Control': 'no-store',
    'X-Request-Id': ''
  };
  if (config.nodeEnv === 'production') headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains';
  const origin = req.headers.origin;
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

export function applyBaseHeaders(req: IncomingMessage, res: ServerResponse, config: Config, requestId: string): void {
  const headers = baseHeaders(req, config);
  headers['X-Request-Id'] = requestId;
  for (const [key, value] of Object.entries(headers)) res.setHeader(key, value);
}

export function assertSafeMutation(req: IncomingMessage, config: Config): void {
  const origin = req.headers.origin;
  const site = req.headers['sec-fetch-site'];
  if (typeof site === 'string' && site === 'cross-site' && !originAllowed(origin, requestOrigin(req, config), config)) {
    throw forbidden('Cross-site request rejected.');
  }
  if (typeof origin === 'string' && !originAllowed(origin, requestOrigin(req, config), config)) {
    throw forbidden('Origin is not allowed.');
  }
}

export async function readJsonBody(req: IncomingMessage, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw payloadTooLarge();
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.length;
    if (size > maxBytes) throw payloadTooLarge();
    chunks.push(part);
  }
  if (size === 0) return {};
  const contentType = String(req.headers['content-type'] ?? '').toLowerCase();
  if (!contentType.includes('application/json')) throw unsupportedMedia();
  const raw = Buffer.concat(chunks).toString('utf8');
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw unsupportedMedia('Body is not valid JSON.');
  }
}

export function strongEtag(value: Buffer | string): string {
  return `"${sha256(value).slice(0, 24)}"`;
}

function compress(body: Buffer, acceptEncoding: string, contentType: string): { body: Buffer; encoding?: string } {
  const canCompress = /^(text\/|application\/(json|javascript|xml)|image\/svg\+xml|\+json)/.test(contentType);
  if (!canCompress || body.length < 1024) return { body };
  const accepted = acceptEncoding.toLowerCase();
  if (accepted.includes('br')) return { body: brotliCompressSync(body), encoding: 'br' };
  if (accepted.includes('gzip')) return { body: gzipSync(body), encoding: 'gzip' };
  return { body };
}

export function writeBuffer(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: Buffer,
  options: WriteOptions = {}
): void {
  const contentType = options.contentType ?? 'application/octet-stream';
  const headers: Record<string, string | string[]> = { 'Content-Type': contentType, ...(options.headers ?? {}) };
  if (options.cacheControl) headers['Cache-Control'] = options.cacheControl;
  if (options.etag) headers.ETag = options.etag;
  const ifNoneMatch = req.headers['if-none-match'];
  if (options.etag && typeof ifNoneMatch === 'string' && ifNoneMatch.split(',').map((item) => item.trim()).includes(options.etag)) {
    res.writeHead(304, headers);
    res.end();
    return;
  }
  const compressed = options.compress === false
    ? { body, encoding: undefined }
    : compress(body, String(req.headers['accept-encoding'] ?? ''), contentType);
  if (compressed.encoding) headers['Content-Encoding'] = compressed.encoding;
  headers['Content-Length'] = String(compressed.body.length);
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : compressed.body);
}

export function writeJson(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  payload: unknown,
  extraHeaders?: Record<string, string | string[]>,
  cookies?: string[]
): void {
  const body = Buffer.from(JSON.stringify(payload), 'utf8');
  const headers: Record<string, string | string[]> = { ...(extraHeaders ?? {}) };
  if (cookies?.length) headers['Set-Cookie'] = cookies;
  writeBuffer(req, res, status, body, { contentType: 'application/json; charset=utf-8', headers, cacheControl: 'no-store', compress: true });
}

export function writeText(
  req: IncomingMessage,
  res: ServerResponse,
  status: number,
  body: string,
  contentType = 'text/plain; charset=utf-8',
  options: WriteOptions = {}
): void {
  writeBuffer(req, res, status, Buffer.from(body, 'utf8'), { contentType, ...options });
}

export function writeError(req: IncomingMessage, res: ServerResponse, error: unknown, requestId: string): void {
  const result = publicError(error, requestId);
  writeJson(req, res, result.status, result.body, result.headers);
}

export function writeNoContent(res: ServerResponse, headers?: Record<string, string>): void {
  res.writeHead(204, headers ?? {});
  res.end();
}

export function requestClientKey(req: IncomingMessage, config: Config, scope: string): string {
  return `${scope}:${clientIp(req, config)}`;
}
