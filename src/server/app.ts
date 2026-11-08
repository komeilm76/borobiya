import type { Server, ServerWebSocket } from 'bun';
import { WebSocketHub, type PeerData } from './core/websocket.ts';
import {
  clientIpFromRequest,
  loadConfig,
  originAllowed as isOriginAllowed,
  requestOrigin,
  type Config,
  type ConfigOverrides
} from './core/config.ts';
import { RateLimiters } from './core/rate-limit.ts';
import {
  assertSafeMutation,
  emptyResponse,
  errorResponse,
  jsonResponse,
  readJsonBody,
  textResponse,
  withBaseHeaders
} from './core/http.ts';
import { newId, parseCookieHeader } from './core/crypto.ts';
import { forbidden, notFound, tooMany, unauthorized } from './core/errors.ts';
import { Router, type AuthIdentity, type HttpMethod, type RequestContext } from './core/router.ts';
import { StaticFiles } from './core/static.ts';
import { parse, queryObject } from './core/validate.ts';
import { openDatabase, seedDatabase, type SeedResult } from './db/database.ts';
import { Repository } from './db/repository.ts';
import { UnitOfWork } from './db/unit-of-work.ts';
import { ROLES } from '../shared/protocol.ts';
import type { AppContext } from './services/context.ts';
import { createServices } from './services/index.ts';
import { registerRoutes } from './routes/index.ts';

/** Address information returned by {@link BorobiyaApp.listen}. */
export interface ListenResult {
  host: string;
  port: number;
  url: string;
}

/** The running Borobiya application: one Bun server, one SQLite connection, one realtime hub. */
export interface BorobiyaApp {
  server: Server<PeerData> | null;
  context: AppContext;
  config: Config;
  seed: SeedResult;
  listen(port?: number, host?: string): Promise<ListenResult>;
  close(): Promise<void>;
  startJobs(): void;
  stopJobs(): void;
}

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Builds the complete application: typed SQLite repository, services, routes and realtime hub.
 * Nothing is bound to a port until {@link BorobiyaApp.listen} runs, so tests can drive
 * the same code paths in-process.
 *
 * @param overrides Configuration overrides used by tests and scripts.
 * @returns A ready, not-yet-listening application.
 */
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

  const hubClientIp = (request: Request): string => clientIpFromRequest(request, config);

  const hub = new WebSocketHub({
    path: '/ws',
    maxFrameBytes: config.wsMaxFrameBytes,
    heartbeatMs: config.wsHeartbeatMs,
    clientIp: hubClientIp,
    originAllowed: (origin, request) => isOriginAllowed(origin, requestOrigin(request, config), config),
    authenticate: (ticket, request) => context.services.realtime.consumeTicket(ticket, request),
    onConnect: (peer) => context.services.realtime.handleConnect(peer),
    onDisconnect: (peer) => {
      if (!closing) context.services.realtime.handleDisconnect(peer);
    },
    onText: (peer, message) => context.services.realtime.handleText(peer, message),
    onBinary: (peer, frame) => context.services.realtime.handleBinary(peer, frame)
  });
  const uow = new UnitOfWork(repo, hub);

  context = {
    config,
    database,
    hubClientIp,
    repo,
    uow,
    hub,
    router,
    staticFiles,
    limiters,
    services: undefined as unknown as AppContext['services'],
    clock,
    startedAt,
    jobs: []
  };
  context.services = createServices(context);
  registerRoutes(router);

  async function handleRequest(request: Request): Promise<Response> {
    const requestId = newId('req');
    const url = new URL(request.url);
    if (url.pathname === '/ws') {
      const upgradeResponse = hub.upgrade(request, {
        upgrade: (req, options) => (server ? server.upgrade(req, options) : false)
      });
      if (upgradeResponse) return withBaseHeaders(request, upgradeResponse, config, requestId);
      return emptyResponse(101);
    }
    let response: Response;
    try {
      response = await dispatch(request, url, requestId);
    } catch (error) {
      response = errorResponse(request, error, requestId);
    }
    return withBaseHeaders(request, response, config, requestId);
  }

  async function dispatch(request: Request, url: URL, requestId: string): Promise<Response> {
    if (request.method === 'OPTIONS') return emptyResponse();
    const method = (request.method === 'HEAD' ? 'GET' : request.method) as HttpMethod;
    const match = router.match(method, url.pathname);
    if (match) {
      const route = match.route;
      if (MUTATING_METHODS.has(method)) assertSafeMutation(request, config);
      const ip = hubClientIp(request);
      if (route.rate) {
        const limit = limiters.consume(route.rate, `${ip}:${route.path}`);
        if (!limit.allowed) throw tooMany('Too many requests.', Math.max(1, Math.ceil(limit.retryAfterMs / 1000)));
      }
      const cookies = parseCookieHeader(request.headers.get('cookie'));
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
      const rawBody = MUTATING_METHODS.has(method) ? await readJsonBody(request, config.maxBodyBytes) : {};
      const validatedBody = route.body ? parse(route.body, rawBody, 'body') : rawBody;
      const rawQuery = queryObject(url.searchParams);
      const validatedQuery = route.query ? parse(route.query, rawQuery, 'query') : rawQuery;
      const requestContext: RequestContext<AppContext> = {
        app: context,
        request,
        config,
        requestId,
        method,
        path: url.pathname,
        url,
        params: match.params,
        query: validatedQuery,
        body: validatedBody,
        cookies,
        ip,
        origin: requestOrigin(request, config),
        auth
      };
      const result = await route.handler(requestContext);
      if (result.envelope === false && result.raw !== undefined) {
        return textResponse(request, result.status ?? 200, result.raw, result.contentType ?? 'application/octet-stream', {
          cacheControl: result.cacheControl,
          etag: result.etag,
          compress: result.compress,
          headers: {
            ...(result.headers ?? {}),
            ...(result.cookies?.length ? { 'Set-Cookie': result.cookies } : {})
          }
        });
      }
      return jsonResponse(
        request,
        result.status ?? 200,
        { ok: true, requestId, data: result.data ?? null },
        {
          ...(result.headers ?? {}),
          ...(result.cookies?.length ? { 'Set-Cookie': result.cookies } : {})
        }
      );
    }
    if (method !== 'GET') throw notFound('Route not found.');
    const pathname = url.pathname;
    if (pathname.startsWith('/_public/') || pathname === '/ws') throw notFound('Route not found.');
    const accept = request.headers.get('accept') ?? '';
    const spaPrefix = /^\/(?:_auth|_user|_admin|_design)(?:\/|$)/.test(pathname);
    const hasExtension = extensionOf(pathname) !== '';
    const fallbackToIndex = pathname === '/' || spaPrefix || (!hasExtension && accept.includes('text/html'));
    return staticFiles.serve(request, pathname, fallbackToIndex);
  }

  let server: Server<PeerData> | null = null;

  function startJobs(): void {
    if (context.jobs.length || !config.startJobs) return;
    const fast = setInterval(() => {
      try {
        context.services.realtime.sweep();
      } catch (error) {
        console.error('[jobs] realtime sweep failed', error);
      }
    }, 1000);
    const slow = setInterval(() => {
      try {
        context.services.location.expireShares();
        context.services.location.purgePoints(context.clock() - config.locationRetentionHours * 3_600_000);
        context.repo.purgeEventsOlderThan(new Date(context.clock() - 7 * 86_400_000).toISOString());
      } catch (error) {
        console.error('[jobs] maintenance failed', error);
      }
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
    if (server) throw new Error('The server is already listening.');
    const instance = Bun.serve<PeerData, never>({
      hostname: host,
      port,
      development: config.environment === 'development',
      fetch: handleRequest,
      websocket: {
        open(socket: ServerWebSocket<PeerData>) {
          hub.handleOpen(socket);
        },
        message(socket: ServerWebSocket<PeerData>, message: string | Buffer) {
          hub.handleMessage(socket, message);
        },
        pong(socket: ServerWebSocket<PeerData>) {
          hub.markAlive(socket);
        },
        close(socket: ServerWebSocket<PeerData>) {
          const peer = socket.data?.peer;
          if (peer) hub.unregister(peer);
        },
        maxPayloadLength: config.wsMaxFrameBytes,
        idleTimeout: Math.max(30, Math.ceil((config.wsHeartbeatMs * 3) / 1000)),
        perMessageDeflate: false
      }
    });
    server = instance;
    startJobs();
    const displayHost = host === '0.0.0.0' ? 'localhost' : host;
    const boundPort = instance.port ?? port;
    return { host, port: boundPort, url: `http://${displayHost}:${boundPort}` };
  }

  async function close(): Promise<void> {
    closing = true;
    stopJobs();
    hub.close();
    if (server) {
      await server.stop(true);
      server = null;
    }
    staticFiles.clear();
    limiters.clear();
    repo.close();
  }

  return { server, context, config, seed, listen, close, startJobs, stopJobs };
}

/** Returns the lower-case extension of a URL path (including the dot) or an empty string. */
function extensionOf(pathname: string): string {
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  return dot <= 0 ? '' : lastSegment.slice(dot).toLowerCase();
}
