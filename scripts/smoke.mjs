#!/usr/bin/env node
/** Reproducible in-process runtime smoke for HTTP, generated assets, auth, WebSockets and SOS fan-out. */
import assert from 'node:assert/strict';
import {
  apiFetch, closeSocket, createTestServer, issueTicket, login, openSocketWithHello,
  waitForMessage, websocketUrl
} from '../tests/helpers.ts';
import { HTTP_EVENTS, WS_EVENTS } from '../public/js/protocol.js';

const previewHost = '3000-example.e2b.app';
const previewOrigin = `https://${previewHost}`;
const server = await createTestServer({
  trustProxy: true,
  allowedOrigins: ['https://*.e2b.app']
});
let adminSocket;
try {
  const previewFetch = (path, init = {}) => fetch(new URL(path, server.base), {
    ...init,
    headers: {
      Host: previewHost,
      Origin: previewOrigin,
      'X-Forwarded-Host': previewHost,
      'X-Forwarded-Proto': 'https',
      ...(init.headers || {})
    }
  });
  const health = await (await previewFetch('/_public/health')).json();
  assert.equal(health.ok, true);
  const shell = await previewFetch('/');
  assert.equal(shell.status, 200);
  assert.ok(shell.headers.get('x-request-id'));
  const csp = shell.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, new RegExp(`connect-src 'self' wss:\\/\\/${previewHost.replaceAll('.', '\\.')}`));
  assert.equal(shell.headers.get('access-control-allow-origin'), previewOrigin);

  const staticPaths = [
    '/app.css', '/js/app.js', '/js/ui.js', '/js/views/auth.js', '/js/views/map.js',
    '/js/views/admin.js', '/sw.js', '/manifest.webmanifest', '/assets/cache-manifest.json',
    '/assets/icons.css'
  ];
  for (const path of staticPaths) assert.equal((await previewFetch(path)).status, 200, path);
  const manifest = await (await previewFetch('/assets/cache-manifest.json')).json();
  assert.equal(Object.hasOwn(manifest, 'generatedAt'), false);
  for (const path of ['/js/views/auth.js', '/js/views/map.js', '/js/views/admin.js']) {
    assert.ok(manifest.precache.includes(path), path);
  }
  const openapi = await (await previewFetch('/_public/openapi.json')).json();
  assert.ok(openapi.paths['/_public/health']);
  const mapConfig = await previewFetch('/_public/map/config');
  assert.equal(mapConfig.status, 200);
  const tile = await previewFetch('/_public/map/tiles/14/1000/1000.svg');
  assert.equal(tile.status, 200);
  assert.match(tile.headers.get('content-type'), /image\/svg\+xml/);
  assert.match(await tile.text(), /<svg/);

  const userCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  const adminCookie = await login(server, 'admin', 'AdminPass!2026');
  const me = await apiFetch(server, '/_user/me', { cookie: userCookie });
  assert.equal(me.status, 200);
  assert.equal(me.json.data.username, 'saeed.k');
  const ticket = await issueTicket(server, userCookie);
  const adminTicket = await issueTicket(server, adminCookie);
  const user = await openSocketWithHello(websocketUrl(server, ticket.ticket));
  const admin = await openSocketWithHello(websocketUrl(server, adminTicket.ticket));
  adminSocket = admin.socket;
  await admin.hello;
  const event = waitForMessage(adminSocket, (message) =>
    message.type === WS_EVENTS.EVENT && message.event?.type === HTTP_EVENTS.SOS_CREATED);
  const created = await apiFetch(server, '/_user/sos', {
    method: 'POST', cookie: userCookie,
    body: {
      incidentTypeId: 'inc_medical', severity: 'low',
      description: 'Reproducible runtime smoke request',
      latitude: 35.7219, longitude: 51.3347, accuracy: 10, isManual: false
    }
  });
  assert.equal(created.status, 201, created.text);
  const published = await event;
  assert.equal(published.event.payload.sosId, created.json.data.sos.id);
  const overview = await apiFetch(server, '/_admin/overview', { cookie: adminCookie });
  assert.equal(overview.status, 200);
  assert.ok(overview.json.data.kpis.requestsToday >= 1);
  const system = await apiFetch(server, '/_admin/system/health', { cookie: adminCookie });
  assert.equal(system.status, 200);
  assert.ok(system.json.data.realtime.connections >= 1);
  await closeSocket(user.socket);
  await closeSocket(admin.socket);
  adminSocket = undefined;
  console.log(JSON.stringify({
    health: 'ok', previewCsp: 'ok', previewCors: 'ok', staticAssets: staticPaths.length,
    precachedViews: 3, openapi: 'ok', mapConfig: 'ok', tile: 'ok', login: 'ok',
    wsHello: 'ok', sosFanout: published.event.id, adminOverview: 'ok', systemHealth: 'ok'
  }));
} finally {
  if (adminSocket) await closeSocket(adminSocket);
  await server.close();
}
