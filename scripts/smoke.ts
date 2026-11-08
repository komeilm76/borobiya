#!/usr/bin/env bun
/**
 * Reproducible in-process runtime smoke for HTTP, generated assets, auth, WebSockets and SOS fan-out.
 *
 * The server binds `0.0.0.0` on an ephemeral port, and every preview-facing request carries the
 * proxy headers the Arena preview proxy sends (`X-Forwarded-Host`/`X-Forwarded-Proto`), so the
 * CSP, CORS and framing behaviour exercised here is the behaviour users receive behind the proxy.
 */
import {
  apiFetch,
  closeSocket,
  createTestServer,
  issueTicket,
  login,
  openSocketWithHello,
  waitForMessage,
  websocketUrl
} from '../tests/helpers.ts';
import { HTTP_EVENTS, WS_EVENTS } from '../src/shared/protocol.ts';

const previewHost = '3000-example.e2b.app';
const previewOrigin = `https://${previewHost}`;

/** Fields reported by the smoke run. */
export interface SmokeReport {
  health: string;
  previewCsp: string;
  previewFrames: string;
  previewCors: string;
  staticAssets: number;
  precachedAssets: number;
  openapi: string;
  mapConfig: string;
  tile: string;
  login: string;
  wsHello: string;
  sosFanout: number;
  adminOverview: string;
  systemHealth: string;
}

/**
 * Runs the smoke scenario against a throwaway server.
 *
 * @returns A machine-readable summary of everything that passed.
 */
export async function smoke(): Promise<SmokeReport> {
  const server = await createTestServer({
    trustProxy: true,
    allowedOrigins: ['https://*.e2b.app'],
    frameAncestors: ["'self'", 'https://*.e2b.app']
  });
  let adminSocket: WebSocket | null = null;
  try {
    const previewFetch = (path: string, init: RequestInit = {}): Promise<Response> =>
      fetch(new URL(path, server.base), {
        ...init,
        headers: {
          Origin: previewOrigin,
          'X-Forwarded-Host': previewHost,
          'X-Forwarded-Proto': 'https',
          ...((init.headers as Record<string, string>) ?? {})
        }
      });

    const health = (await (await previewFetch('/_public/health')).json()) as { ok: boolean };
    if (!health.ok) throw new Error('public health failed');

    const shell = await previewFetch('/');
    if (shell.status !== 200) throw new Error(`SPA shell returned ${shell.status}`);
    const html = await shell.text();
    if (!html.toLowerCase().includes('<!doctype html>')) throw new Error('SPA shell is not HTML');
    if (!html.includes('dir="rtl"')) throw new Error('SPA shell lost the RTL contract');
    const requestId = shell.headers.get('x-request-id');
    if (!requestId) throw new Error('missing request id');
    const csp = String(shell.headers.get('content-security-policy'));
    for (const directive of [
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      `connect-src 'self' wss://${previewHost}`,
      "frame-ancestors 'self' https://*.e2b.app"
    ]) {
      if (!csp.includes(directive)) throw new Error(`CSP missing ${directive}`);
    }
    if (shell.headers.get('x-frame-options') !== null) throw new Error('frame ancestors conflict with legacy DENY');
    if (shell.headers.get('access-control-allow-origin') !== previewOrigin) throw new Error('preview CORS origin missing');

    const manifest = (await (await previewFetch('/assets/cache-manifest.json')).json()) as {
      version: string;
      precache: string[];
      generatedAt?: string;
    };
    if (Object.hasOwn(manifest, 'generatedAt')) throw new Error('cache manifest contains a timestamp');
    for (const path of manifest.precache) {
      if (path === '/') continue;
      const response = await previewFetch(path);
      if (response.status !== 200) throw new Error(`precached asset ${path} returned ${response.status}`);
      await response.arrayBuffer();
    }

    const openapi = (await (await previewFetch('/_public/openapi.json')).json()) as { paths: Record<string, unknown> };
    if (!openapi.paths['/_public/health']) throw new Error('OpenAPI document is incomplete');
    const mapConfig = await previewFetch('/_public/map/config');
    if (mapConfig.status !== 200) throw new Error('map configuration failed');
    const tile = await previewFetch('/_public/map/tiles/14/1000/1000.svg');
    if (tile.status !== 200) throw new Error('map tile failed');
    if (!String(tile.headers.get('content-type')).startsWith('image/svg+xml')) throw new Error('tile content type');
    if (!String(tile.headers.get('cache-control')).includes('immutable')) throw new Error('tile cache policy');
    if (!(await tile.text()).startsWith('<svg')) throw new Error('tile is not SVG');

    const userCookie = await login(server, 'saeed.k', 'DemoPass!2026');
    const adminCookie = await login(server, 'admin', 'AdminPass!2026');
    const me = await apiFetch(server, '/_user/me', { cookie: userCookie });
    if (me.status !== 200 || me.json.data.username !== 'saeed.k') throw new Error('session resolution failed');

    const userTicket = await issueTicket(server, userCookie);
    const adminTicket = await issueTicket(server, adminCookie);
    const user = await openSocketWithHello(websocketUrl(server, userTicket.ticket));
    const admin = await openSocketWithHello(websocketUrl(server, adminTicket.ticket));
    adminSocket = admin.socket;
    await admin.hello;
    let fanoutId = 0;
    try {
      const published = waitForMessage(
        admin.socket,
        (message) => message.type === WS_EVENTS.EVENT && message.event?.type === HTTP_EVENTS.SOS_CREATED
      );
      const created = await apiFetch(server, '/_user/sos', {
        method: 'POST',
        cookie: userCookie,
        body: {
          incidentTypeId: 'inc_medical',
          severity: 'low',
          description: 'Reproducible runtime smoke request',
          latitude: 35.7219,
          longitude: 51.3347,
          accuracy: 10,
          isManual: false
        }
      });
      if (created.status !== 201) throw new Error(`SOS creation failed: ${created.text}`);
      const event = await published;
      if (event.event.payload.sosId !== created.json.data.sos.id) throw new Error('SOS fan-out payload mismatch');
      fanoutId = event.event.id;
    } finally {
      await closeSocket(user.socket);
    }

    const overview = await apiFetch(server, '/_admin/overview', { cookie: adminCookie });
    if (overview.status !== 200 || overview.json.data.kpis.requestsToday < 1) throw new Error('admin overview failed');
    const system = await apiFetch(server, '/_admin/system/health', { cookie: adminCookie });
    if (system.status !== 200) throw new Error('system health failed');
    if (system.json.data.realtime.connections < 1) throw new Error('realtime connection was not counted');

    await closeSocket(admin.socket);
    adminSocket = null;

    return {
      health: 'ok',
      previewCsp: 'ok',
      previewFrames: 'ok',
      previewCors: 'ok',
      staticAssets: manifest.precache.length,
      precachedAssets: manifest.precache.length,
      openapi: 'ok',
      mapConfig: 'ok',
      tile: 'ok',
      login: 'ok',
      wsHello: 'ok',
      sosFanout: fanoutId,
      adminOverview: 'ok',
      systemHealth: 'ok'
    };
  } finally {
    if (adminSocket) await closeSocket(adminSocket);
    await server.close();
  }
}

if (import.meta.main) {
  const report = await smoke();
  console.log(JSON.stringify(report));
}
