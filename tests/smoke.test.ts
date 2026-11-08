// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp, type BorobiyaApp } from '../src/server/app.ts';
import { apiFetch, closeSocket, issueTicket, login, openSocketWithHello, waitForMessage, websocketUrl } from './helpers.ts';
import { HTTP_EVENTS, WS_EVENTS } from '../src/shared/protocol.ts';

const PREVIEW_HOST = '3000-example.e2b.app';
const PREVIEW_ORIGIN = `https://${PREVIEW_HOST}`;
let app: BorobiyaApp;
let base: string;

beforeAll(async () => {
  app = await createApp({
    environment: 'test',
    host: '0.0.0.0',
    port: 0,
    databasePath: ':memory:',
    adminUsername: 'admin',
    adminPassword: 'AdminPass!2026',
    seedDemoUsers: true,
    startJobs: false,
    trustProxy: true,
    allowedOrigins: ['https://*.e2b.app'],
    frameAncestors: ["'self'", 'https://*.e2b.app'],
    cookieSecure: false
  });
  const info = await app.listen(0, '0.0.0.0');
  base = `http://127.0.0.1:${info.port}`;
});

afterAll(async () => {
  if (app) await app.close();
});

/** Issues a request the way the Arena preview proxy forwards it. */
async function previewFetch(path: string, init: RequestInit = {}): Promise<Response> {
  return fetch(new URL(path, base), {
    ...init,
    headers: {
      Origin: PREVIEW_ORIGIN,
      'X-Forwarded-Host': PREVIEW_HOST,
      'X-Forwarded-Proto': 'https',
      ...((init.headers as Record<string, string>) ?? {})
    }
  });
}

describe('in-process preview smoke', () => {
  it('serves the built SPA shell, assets and deterministic tiles behind the proxy headers', async () => {
    const health = await (await previewFetch('/_public/health')).json();
    expect(health.ok).toBe(true);

    const shell = await previewFetch('/');
    expect(shell.status).toBe(200);
    const html = await shell.text();
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('dir="rtl"');
    const csp = String(shell.headers.get('content-security-policy'));
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).toContain(`connect-src 'self' wss://${PREVIEW_HOST}`);
    expect(csp).toContain('frame-ancestors \'self\' https://*.e2b.app');
    expect(shell.headers.get('x-frame-options')).toBe(null);
    expect(shell.headers.get('access-control-allow-origin')).toBe(PREVIEW_ORIGIN);
    expect(shell.headers.get('x-request-id')).toMatch(/^req_/);

    const manifest = JSON.parse(await (await previewFetch('/assets/cache-manifest.json')).text());
    expect(Object.hasOwn(manifest, 'generatedAt')).toBe(false);
    for (const path of manifest.precache) {
      if (path === '/') continue;
      const response = await previewFetch(path);
      expect(response.status, path).toBe(200);
    }
    const openapi = await (await previewFetch('/_public/openapi.json')).json();
    expect(openapi.paths['/_public/health']).toBeTruthy();
    const mapConfig = await previewFetch('/_public/map/config');
    expect(mapConfig.status).toBe(200);
    const tile = await previewFetch('/_public/map/tiles/14/1000/1000.svg');
    expect(tile.status).toBe(200);
    expect(tile.headers.get('content-type')).toMatch(/image\/svg\+xml/);
    expect(String(tile.headers.get('cache-control'))).toMatch(/immutable/);
    expect(await tile.text()).toMatch(/<svg/);
  });

  it('authenticates, opens a socket and fans a committed SOS event out to administrators', async () => {
    const server = {
      app,
      base,
      origin: `http://127.0.0.1:${new URL(base).port}`,
      port: Number(new URL(base).port),
      close: async () => undefined
    };
    const userCookie = await login(server as never, 'saeed.k', 'DemoPass!2026');
    const adminCookie = await login(server as never, 'admin', 'AdminPass!2026');
    const me = await apiFetch(server as never, '/_user/me', { cookie: userCookie });
    expect(me.status).toBe(200);
    expect(me.json.data.username).toBe('saeed.k');

    const userTicket = await issueTicket(server as never, userCookie);
    const adminTicket = await issueTicket(server as never, adminCookie);
    const user = await openSocketWithHello(websocketUrl(server as never, userTicket.ticket));
    const admin = await openSocketWithHello(websocketUrl(server as never, adminTicket.ticket));
    await admin.hello;
    try {
      const published = waitForMessage(
        admin.socket,
        (message) => message.type === WS_EVENTS.EVENT && message.event?.type === HTTP_EVENTS.SOS_CREATED
      );
      const created = await apiFetch(server as never, '/_user/sos', {
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
      expect(created.status, created.text).toBe(201);
      const event = await published;
      expect(event.event.payload.sosId).toBe(created.json.data.sos.id);

      const overview = await apiFetch(server as never, '/_admin/overview', { cookie: adminCookie });
      expect(overview.status).toBe(200);
      const health = await apiFetch(server as never, '/_admin/system/health', { cookie: adminCookie });
      expect(health.json.data.status).toBe('ok');
      expect(health.json.data.realtime.connections).toBeGreaterThanOrEqual(1);
    } finally {
      await closeSocket(user.socket);
      await closeSocket(admin.socket);
    }
  });
});
