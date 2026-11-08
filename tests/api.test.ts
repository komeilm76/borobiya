import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

let server: TestServer;
let userCookie: string;
let adminCookie: string;

before(async () => {
  server = await createTestServer();
  userCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});
after(async () => { if (server) await server.close(); });

test('public health, OpenAPI, catalog and SPA routes use the intended envelopes', async () => {
  const health = await apiFetch(server, '/_public/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);
  assert.equal(health.json.data.status, 'ok');
  assert.match(health.json.requestId, /^req_/);

  const openapi = await apiFetch(server, '/_public/openapi.json');
  assert.equal(openapi.status, 200);
  assert.equal(openapi.json.openapi, '3.1.0');
  assert.ok(openapi.json.paths['/_auth/login']);
  assert.ok(openapi.json.paths['/_user/sos']);

  for (const path of ['/_public/security-questions', '/_public/incident-types', '/_public/cancellation-reasons', '/_public/map/config']) {
    const response = await apiFetch(server, path);
    assert.equal(response.status, 200, path);
    assert.equal(response.json.ok, true);
    assert.ok(response.json.data);
  }
  const shell = await apiFetch(server, '/_auth/login');
  assert.equal(shell.status, 200);
  assert.match(shell.text, /<!doctype html>/i);
  const css = await apiFetch(server, '/app.css');
  assert.equal(css.status, 200);
  assert.match(css.text, /Borobiya design system/);
});

test('offline vector tiles are immutable SVG and invalid tiles are rejected', async () => {
  const config = (await apiFetch(server, '/_public/map/config')).json.data;
  assert.equal(config.offline, true);
  assert.match(config.tileTemplate, /_public\/map\/tiles/);
  const tile = await apiFetch(server, '/_public/map/tiles/14/1000/1000.svg?v=test');
  assert.equal(tile.status, 200);
  assert.match(tile.text, /<svg/);
  assert.match(String(tile.headers.get('cache-control')), /immutable/);
  assert.ok(tile.headers.get('etag'));
  const invalid = await apiFetch(server, '/_public/map/tiles/9/1/1.svg');
  assert.equal(invalid.status, 404);
  const missing = await apiFetch(server, '/_public/missing');
  assert.equal(missing.status, 404);
  assert.equal(missing.json.ok, false);
});

test('authentication boundaries protect user and administrator APIs', async () => {
  const anonymous = await apiFetch(server, '/_user/me');
  assert.equal(anonymous.status, 401);
  const forbidden = await apiFetch(server, '/_admin/overview', { cookie: userCookie });
  assert.equal(forbidden.status, 403);
  const me = await apiFetch(server, '/_user/me', { cookie: userCookie });
  assert.equal(me.status, 200);
  assert.equal(me.json.data.username, 'saeed.k');
  assert.equal(me.json.data.role, 'user');
  const overview = await apiFetch(server, '/_admin/overview', { cookie: adminCookie });
  assert.equal(overview.status, 200);
  assert.ok(overview.json.data.kpis);
  assert.ok(Array.isArray(overview.json.data.trend));
});

test('saved places, shares, sync and realtime tickets round-trip through the API', async () => {
  const created = await apiFetch(server, '/_user/places', {
    method: 'POST', cookie: userCookie,
    body: { name: 'Test Lab', label: 'Test Lab', latitude: 35.72, longitude: 51.33, address: 'Test Street 1', icon: 'test-tube', rank: 3 }
  });
  assert.equal(created.status, 201);
  const placeId = created.json.data.id;
  const listed = await apiFetch(server, '/_user/places', { cookie: userCookie });
  assert.ok(listed.json.data.items.some((item: any) => item.id === placeId));
  const updated = await apiFetch(server, `/_user/places/${placeId}`, {
    method: 'PATCH', cookie: userCookie,
    body: { name: 'Test Lab', label: 'Lab', latitude: 35.721, longitude: 51.331, address: 'Test Street 2', icon: 'test-tube', rank: 1 }
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.json.data.ok, true);
  const reorder = await apiFetch(server, '/_user/places/reorder', { method: 'POST', cookie: userCookie, body: { ids: [placeId] } });
  assert.equal(reorder.status, 200);
  const deleted = await apiFetch(server, `/_user/places/${placeId}`, { method: 'DELETE', cookie: userCookie });
  assert.equal(deleted.status, 200);

  const share = await apiFetch(server, '/_user/location/shares', {
    method: 'POST', cookie: userCookie,
    body: { recipientId: 'usr_companion', kind: 'live', durationSeconds: 600 }
  });
  assert.equal(share.status, 201);
  const revoked = await apiFetch(server, `/_user/location/shares/${share.json.data.share.shareId}`, { method: 'DELETE', cookie: userCookie });
  assert.equal(revoked.status, 200);

  const sync = await apiFetch(server, '/_user/sync?since=0&limit=50', { cookie: userCookie });
  assert.equal(sync.status, 200);
  assert.ok(Array.isArray(sync.json.data.events));
  const ticket = await apiFetch(server, '/_user/realtime/ticket', { method: 'POST', cookie: userCookie });
  assert.equal(ticket.status, 200);
  assert.ok(ticket.json.data.ticket.length >= 20);
});

test('SOS creation accepts an API-backed photo and cancellation uses a catalog reason', async () => {
  const photo = `data:image/png;base64,${'A'.repeat(40)}`;
  const created = await apiFetch(server, '/_user/sos', {
    method: 'POST', cookie: userCookie,
    body: {
      incidentTypeId: 'inc_fire', severity: 'high', description: 'Smoke reported in the test laboratory.',
      photoDataUrl: photo, latitude: 35.7219, longitude: 51.3347, accuracy: 12, isManual: false
    }
  });
  assert.equal(created.status, 201, created.text);
  const sosId = created.json.data.sos.id;
  assert.equal(created.json.data.sos.photoDataUrl, photo);
  const detail = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: userCookie });
  assert.equal(detail.status, 200);
  assert.equal(detail.json.data.photoDataUrl, photo);
  assert.ok(Array.isArray(detail.json.data.timeline));
  const cancel = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
    method: 'POST', cookie: userCookie,
    body: { reasonId: 'cancel_mistake', detail: 'Created by the automated API test.' }
  });
  assert.equal(cancel.status, 200);
  assert.equal(cancel.json.data.status, 'cancelled');
});

test('administrator APIs cover users, groups, settings, audit and CSV export', async () => {
  const newUser = await apiFetch(server, '/_admin/users', {
    method: 'POST', cookie: adminCookie,
    body: { username: 'api.new.user', password: 'ApiUserPass!2026', role: 'responder' }
  });
  assert.equal(newUser.status, 201);
  assert.equal(newUser.json.data.mustCompleteSecurityQuestions, true);

  const users = await apiFetch(server, '/_admin/users?q=api.new&limit=10', { cookie: adminCookie });
  assert.equal(users.status, 200);
  assert.ok(users.json.data.items.some((item: any) => item.username === 'api.new.user'));
  const userDetail = await apiFetch(server, `/_admin/users/${newUser.json.data.userId}`, { cookie: adminCookie });
  assert.equal(userDetail.status, 200);
  assert.ok(Array.isArray(userDetail.json.data.sessions));

  const group = await apiFetch(server, '/_admin/groups', {
    method: 'POST', cookie: adminCookie,
    body: { name: 'API response group', color: '#123456', capacity: 12, incidentIds: ['inc_fire'], status: 'active' }
  });
  assert.equal(group.status, 201);
  const groups = await apiFetch(server, '/_admin/groups', { cookie: adminCookie });
  assert.ok(groups.json.data.items.some((item: any) => item.id === group.json.data.groupId));

  const settings = await apiFetch(server, '/_admin/settings', { method: 'PUT', cookie: adminCookie, body: {
    sos_auto_dispatch: '1', default_dispatch_radius_m: '4200', mission_ready_required: '0', maintenance_mode: '0'
  } });
  assert.equal(settings.status, 200);
  assert.equal(settings.json.data.keys.length, 4);
  const stored = await apiFetch(server, '/_admin/settings', { cookie: adminCookie });
  assert.ok(stored.json.data.items.some((item: any) => item.key === 'sos_auto_dispatch' && item.value === '1'));

  const audit = await apiFetch(server, '/_admin/audit?limit=20', { cookie: adminCookie });
  assert.equal(audit.status, 200);
  assert.ok(audit.json.data.items.some((item: any) => item.action === 'user.create'));
  const auditCsv = await apiFetch(server, '/_admin/audit.csv', { cookie: adminCookie });
  assert.equal(auditCsv.status, 200);
  assert.match(String(auditCsv.headers.get('content-type')), /text\/csv/);
  assert.match(auditCsv.text, /id,createdAt,actorUsername/);
  const usersCsv = await apiFetch(server, '/_admin/users.csv', { cookie: adminCookie });
  assert.equal(usersCsv.status, 200);
  assert.match(usersCsv.text, /id,username,role,active/);
  const health = await apiFetch(server, '/_admin/system/health', { cookie: adminCookie });
  assert.equal(health.json.data.status, 'ok');
  assert.ok(health.json.data.database.users >= 1);
});
