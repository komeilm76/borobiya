import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { Duplex } from 'node:stream';
import { clientIp, loadConfig, originAllowed as isOriginAllowed, requestOrigin, type Config, type ConfigOverrides } from './core/config.ts';
import { RateLimiters } from './core/rate-limit.ts';
import { applyBaseHeaders, assertSafeMutation, readJsonBody, writeBuffer, writeError, writeJson, writeNoContent } from './core/http.ts';
import { newId, parseCookieHeader } from './core/crypto.ts';
import { forbidden, notFound, tooMany, unauthorized } from './core/errors.ts';
import { Router, type AuthIdentity, type HttpMethod, type RequestContext } from './core/router.ts';
import { StaticFiles } from './core/static.ts';
import { WebSocketHub } from './core/websocket.ts';
import { parse, queryObject } from './core/validate.ts';
import { openDatabase, seedDatabase, type SeedResult } from './db/database.ts';
import { Repository } from './db/repository.ts';
import { UnitOfWork } from './db/unit-of-work.ts';
import { ROLES } from '../public/js/protocol.js';
import type { AppContext } from './services/context.ts';
import { createServices } from './services/index.ts';
import { registerRoutes } from './routes/index.ts';

export interface ListenResult { host: string; port: number; url: string }

export interface BorobiyaApp {
  server: ReturnType<typeof createServer>;
  context: AppContext;
  config: Config;
  seed: SeedResult;
  listen(port?: number, host?: string): Promise<ListenResult>;
  close(): Promise<void>;
  startJobs(): void;
  stopJobs(): void;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function createApp(overrides: ConfigOverrides = {}): Promise<BorobiyaApp> {
  const config = loadConfig(overrides);
  const database = openDatabase(config);
  const seed = await seedDatabase(database, config);
  const repo = new Repository(database);
  const limiters = new RateLimiters();
  const staticFiles = new StaticFiles(config);
  const router = new Router<AppContext>();
  const startedAt = Date.now();
  const clock = () => Date.now();
  let context!: AppContext;
  let closing = false;

  const hub = new WebSocketHub({
    path: '/ws',
    maxFrameBytes: config.wsMaxFrameBytes,
    heartbeatMs: config.wsHeartbeatMs,
    originAllowed: (origin, req) => isOriginAllowed(origin, requestOrigin(req, config), config),
    authenticate: (ticket, req) => context.services.realtime.consumeTicket(ticket, req),
    onConnect: (peer) => context.services.realtime.handleConnect(peer),
    onDisconnect: (peer) => { if (!closing) context.services.realtime.handleDisconnect(peer); },
    onText: (peer, message) => context.services.realtime.handleText(peer, message),
    onBinary: (peer, frame) => context.services.realtime.handleBinary(peer, frame)
  });
  const uow = new UnitOfWork(repo, hub);

  context = {
    config, database, repo, uow, hub, router, staticFiles, limiters,
    services: undefined as unknown as AppContext['services'],
    clock, startedAt, jobs: []
  };
  context.services = createServices(context);
  registerRoutes(router);

  async function handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const requestId = newId('req');
    applyBaseHeaders(req, res, config, requestId);
    try {
      if (req.method === 'OPTIONS') { writeNoContent(res); return; }
      const url = new URL(req.url ?? '/', requestOrigin(req, config));
      const method = (req.method === 'HEAD' ? 'GET' : req.method ?? 'GET') as HttpMethod;
      const match = router.match(method, url.pathname);
      if (match) {
        const route = match.route;
        if (MUTATING_METHODS.has(method)) assertSafeMutation(req, config);
        const ip = clientIp(req, config);
        if (route.rate) {
          const limit = limiters.consume(route.rate, `${ip}:${route.path}`);
          if (!limit.allowed) throw tooMany('Too many requests.', Math.max(1, Math.ceil(limit.retryAfterMs / 1000)));
        }
        const cookies = parseCookieHeader(req.headers.cookie);
        let auth: AuthIdentity | null = null;
        if (route.auth !== 'none') {
          const session = context.services.auth.resolveSession(cookies.bb_session, ip);
          if (route.auth === 'optional') auth = session;
          else {
            if (!session) throw unauthorized('A valid session is required.');
            if (route.auth === 'admin' && session.role !== ROLES.ADMIN) throw forbidden('Administrator permission is required.');
            auth = session;
          }
        }
        const rawBody = MUTATING_METHODS.has(method) ? await readJsonBody(req, config.maxBodyBytes) : {};
        const validatedBody = route.body ? parse(route.body, rawBody, 'body') : rawBody;
        const rawQuery = queryObject(url.searchParams);
        const validatedQuery = route.query ? parse(route.query, rawQuery, 'query') : rawQuery;
        const requestContext: RequestContext<AppContext> = {
          app: context, req, res, config, requestId, method, path: url.pathname, url,
          params: match.params, query: validatedQuery, body: validatedBody, cookies,
          ip, origin: requestOrigin(req, config), auth
        };
        const result = await route.handler(requestContext);
        if (result.envelope === false && result.raw !== undefined) {
          const bodyBuffer = Buffer.isBuffer(result.raw) ? result.raw : Buffer.from(String(result.raw), 'utf8');
          const headers: Record<string, string | string[]> = { ...(result.headers ?? {}) };
          if (result.cookies?.length) headers['Set-Cookie'] = result.cookies;
          writeBuffer(req, res, result.status ?? 200, bodyBuffer, {
            contentType: result.contentType ?? 'application/octet-stream',
            cacheControl: result.cacheControl,
            etag: result.etag,
            compress: result.compress,
            headers
          });
        } else {
          writeJson(
            req, res, result.status ?? 200,
            { ok: true, requestId, data: result.data ?? null },
            result.headers,
            result.cookies
          );
        }
        return;
      }
      if (method !== 'GET') throw notFound('Route not found.');
      const pathname = url.pathname;
      if (pathname.startsWith('/_public/') || pathname === '/ws') throw notFound('Route not found.');
      const accept = String(req.headers.accept ?? '');
      const spaPrefix = /^\/(?:_auth|_user|_admin|_design)(?:\/|$)/.test(pathname);
      const hasExtension = path.extname(pathname) !== '';
      const fallbackToIndex = pathname === '/' || spaPrefix || (!hasExtension && accept.includes('text/html'));
      await staticFiles.serve(req, res, pathname, fallbackToIndex);
    } catch (error) {
      if (res.headersSent) { res.destroy(); return; }
      writeError(req, res, error, requestId);
    }
  }

  const server = createServer((req, res) => { void handleRequest(req, res); });
  server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (!hub.handleUpgrade(req, socket, head)) socket.destroy();
  });

  function startJobs(): void {
    if (context.jobs.length || !config.startJobs) return;
    const fast = setInterval(() => {
      try { context.services.realtime.sweep(); } catch (error) { console.error('[jobs] realtime sweep failed', error); }
    }, 1000);
    const slow = setInterval(() => {
      try {
        context.services.location.expireShares();
        context.services.location.purgePoints(context.clock() - config.locationRetentionHours * 3_600_000);
        context.repo.purgeEventsOlderThan(new Date(context.clock() - 7 * 86_400_000).toISOString());
      } catch (error) { console.error('[jobs] maintenance failed', error); }
    }, 60_000);
    fast.unref?.();
    slow.unref?.();
    context.jobs.push(fast, slow);
  }

  function stopJobs(): void {
    for (const timer of context.jobs) clearInterval(timer);
    context.jobs.length = 0;
  }

  async function listen(port = config.port, host = config.host): Promise<ListenResult> {
    await new Promise<void>((resolve, reject) => {
      const onError = (error: Error) => { server.off('listening', onListening); reject(error); };
      const onListening = () => { server.off('error', onError); resolve(); };
      server.once('error', onError);
      server.once('listening', onListening);
      server.listen(port, host);
    });
    startJobs();
    const address = server.address() as AddressInfo;
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    return { host, port: address.port, url: `http://${displayHost}:${address.port}` };
  }

  async function close(): Promise<void> {
    closing = true;
    stopJobs();
    hub.close();
    if (server.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    staticFiles.clear();
    limiters.clear();
    repo.close();
  }

  return { server, context, config, seed, listen, close, startJobs, stopJobs };
}
