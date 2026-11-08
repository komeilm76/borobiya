// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

let server: TestServer;
let userCookie: string;
let adminCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  userCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

afterAll(async () => {
  if (server) await server.close();
});

describe('HTTP API', () => {
  it('public health, OpenAPI, catalog and SPA routes use the intended envelopes', async () => {
    const health = await apiFetch(server, '/_public/health');
    expect(health.status).toBe(200);
    expect(health.json.ok).toBe(true);
    expect(health.json.data.status).toBe('ok');
    expect(health.json.data.version).toBe('2.0.0');
    expect(health.json.requestId).toMatch(/^req_/);

    const openapi = await apiFetch(server, '/_public/openapi.json');
    expect(openapi.status).toBe(200);
    expect(openapi.json.openapi).toBe('3.1.0');
    expect(openapi.json.info.version).toBe('2.0.0');
    expect(openapi.json.paths['/_auth/login']).toBeTruthy();
    expect(openapi.json.paths['/_user/sos']).toBeTruthy();

    for (const path of [
      '/_public/security-questions',
      '/_public/incident-types',
      '/_public/cancellation-reasons',
      '/_public/map/config'
    ]) {
      const response = await apiFetch(server, path);
      expect(response.status, path).toBe(200);
      expect(response.json.ok).toBe(true);
      expect(response.json.data).toBeTruthy();
    }
    const shell = await apiFetch(server, '/_auth/login');
    expect(shell.status).toBe(200);
    expect(shell.text).toMatch(/<!doctype html>/i);
    const css = await apiFetch(server, '/app.css');
    expect(css.status).toBe(200);
    // The production stylesheet is minified, so assertions use design tokens rather than comments.
    expect(css.text).toMatch(/--primary:#0E6666/i);
    expect(css.text).toMatch(/prefers-reduced-motion/);
  });

  it('offline vector tiles are immutable SVG and invalid tiles are rejected', async () => {
    const config = (await apiFetch(server, '/_public/map/config')).json.data;
    expect(config.offline).toBe(true);
    expect(config.tileTemplate).toMatch(/_public\/map\/tiles/);
    const tile = await apiFetch(server, '/_public/map/tiles/14/1000/1000.svg?v=test');
    expect(tile.status).toBe(200);
    expect(tile.text).toMatch(/<svg/);
    expect(String(tile.headers.get('cache-control'))).toMatch(/immutable/);
    expect(tile.headers.get('etag')).toBeTruthy();
    const invalid = await apiFetch(server, '/_public/map/tiles/9/1/1.svg');
    expect(invalid.status).toBe(404);
    const missing = await apiFetch(server, '/_public/missing');
    expect(missing.status).toBe(404);
    expect(missing.json.ok).toBe(false);
  });

  it('authentication boundaries protect user and administrator APIs', async () => {
    const anonymous = await apiFetch(server, '/_user/me');
    expect(anonymous.status).toBe(401);
    const forbidden = await apiFetch(server, '/_admin/overview', { cookie: userCookie });
    expect(forbidden.status).toBe(403);
    const me = await apiFetch(server, '/_user/me', { cookie: userCookie });
    expect(me.status).toBe(200);
    expect(me.json.data.username).toBe('saeed.k');
    expect(me.json.data.role).toBe('user');
    const overview = await apiFetch(server, '/_admin/overview', { cookie: adminCookie });
    expect(overview.status).toBe(200);
    expect(overview.json.data.kpis).toBeTruthy();
    expect(Array.isArray(overview.json.data.trend)).toBe(true);
  });

  it('saved places, shares, sync and realtime tickets round-trip through the API', async () => {
    const created = await apiFetch(server, '/_user/places', {
      method: 'POST',
      cookie: userCookie,
      body: {
        name: 'Test Lab',
        label: 'Test Lab',
        latitude: 35.72,
        longitude: 51.33,
        address: 'Test Street 1',
        icon: 'test-tube',
        rank: 3
      }
    });
    expect(created.status, created.text).toBe(201);
    const placeId = created.json.data.id;
    const listed = await apiFetch(server, '/_user/places', { cookie: userCookie });
    expect(listed.json.data.items.some((item: any) => item.id === placeId)).toBe(true);
    const updated = await apiFetch(server, `/_user/places/${placeId}`, {
      method: 'PATCH',
      cookie: userCookie,
      body: {
        name: 'Test Lab',
        label: 'Lab',
        latitude: 35.721,
        longitude: 51.331,
        address: 'Test Street 2',
        icon: 'test-tube',
        rank: 1
      }
    });
    expect(updated.status).toBe(200);
    expect(updated.json.data.ok).toBe(true);
    const reorder = await apiFetch(server, '/_user/places/reorder', {
      method: 'POST',
      cookie: userCookie,
      body: { ids: [placeId] }
    });
    expect(reorder.status).toBe(200);
    const deleted = await apiFetch(server, `/_user/places/${placeId}`, { method: 'DELETE', cookie: userCookie });
    expect(deleted.status).toBe(200);

    const share = await apiFetch(server, '/_user/location/shares', {
      method: 'POST',
      cookie: userCookie,
      body: { recipientId: 'usr_companion', kind: 'live', durationSeconds: 600 }
    });
    expect(share.status, share.text).toBe(201);
    const revoked = await apiFetch(server, `/_user/location/shares/${share.json.data.share.shareId}`, {
      method: 'DELETE',
      cookie: userCookie
    });
    expect(revoked.status).toBe(200);

    const sync = await apiFetch(server, '/_user/sync?since=0&limit=50', { cookie: userCookie });
    expect(sync.status).toBe(200);
    expect(Array.isArray(sync.json.data.events)).toBe(true);
    const ticket = await apiFetch(server, '/_user/realtime/ticket', { method: 'POST', cookie: userCookie });
    expect(ticket.status).toBe(200);
    expect(ticket.json.data.ticket.length).toBeGreaterThanOrEqual(20);
  });

  it('SOS creation accepts an API-backed photo and cancellation uses a catalog reason', async () => {
    const photo = `data:image/png;base64,${'A'.repeat(40)}`;
    const created = await apiFetch(server, '/_user/sos', {
      method: 'POST',
      cookie: userCookie,
      body: {
        incidentTypeId: 'inc_fire',
        severity: 'high',
        description: 'Smoke reported in the test laboratory.',
        photoDataUrl: photo,
        latitude: 35.7219,
        longitude: 51.3347,
        accuracy: 12,
        isManual: false
      }
    });
    expect(created.status, created.text).toBe(201);
    const sosId = created.json.data.sos.id;
    expect(created.json.data.sos.photoDataUrl).toBe(photo);
    const detail = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: userCookie });
    expect(detail.status).toBe(200);
    expect(detail.json.data.photoDataUrl).toBe(photo);
    expect(Array.isArray(detail.json.data.timeline)).toBe(true);
    const cancel = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST',
      cookie: userCookie,
      body: { reasonId: 'cancel_mistake', detail: 'Created by the automated API test.' }
    });
    expect(cancel.status, cancel.text).toBe(200);
    expect(cancel.json.data.status).toBe('cancelled');
  });

  it('administrator APIs cover users, groups, settings, audit and CSV export', async () => {
    const newUser = await apiFetch(server, '/_admin/users', {
      method: 'POST',
      cookie: adminCookie,
      body: { username: 'api.new.user', password: 'ApiUserPass!2026', role: 'responder' }
    });
    expect(newUser.status, newUser.text).toBe(201);
    expect(newUser.json.data.mustCompleteSecurityQuestions).toBe(true);

    const users = await apiFetch(server, '/_admin/users?q=api.new&limit=10', { cookie: adminCookie });
    expect(users.status).toBe(200);
    expect(users.json.data.items.some((item: any) => item.username === 'api.new.user')).toBe(true);
    const userDetail = await apiFetch(server, `/_admin/users/${newUser.json.data.userId}`, { cookie: adminCookie });
    expect(userDetail.status).toBe(200);
    expect(Array.isArray(userDetail.json.data.sessions)).toBe(true);

    const group = await apiFetch(server, '/_admin/groups', {
      method: 'POST',
      cookie: adminCookie,
      body: {
        name: 'API response group',
        color: '#123456',
        capacity: 12,
        incidentIds: ['inc_fire'],
        status: 'active'
      }
    });
    expect(group.status, group.text).toBe(201);
    const groups = await apiFetch(server, '/_admin/groups', { cookie: adminCookie });
    expect(groups.json.data.items.some((item: any) => item.id === group.json.data.groupId)).toBe(true);
    // A freshly created group has no members. The dispatch board relies on knowing which
    // responders a group actually has, because the server rejects any id that is not a member.
    const fresh = groups.json.data.items.find((item: any) => item.id === group.json.data.groupId);
    expect(fresh.memberIds).toEqual([]);
    // The seeded medical group is the one that has a responder; it is what the board should pick.
    const staffed = groups.json.data.items.find((item: any) => item.memberIds.length > 0);
    expect(staffed.memberIds).toContain('usr_responder');
    expect(staffed.memberCount).toBe(staffed.memberIds.length);

    // A real pending request, so the dispatch below exercises the membership rule rather than
    // stopping at an unknown SOS id.
    const pending = await apiFetch(server, '/_user/sos', {
      method: 'POST',
      cookie: userCookie,
      body: {
        incidentTypeId: 'inc_fire',
        severity: 'high',
        description: 'Smoke on the fourth floor of the depot.',
        latitude: 35.7219,
        longitude: 51.4047,
        accuracy: 12,
        isManual: false
      }
    });
    expect(pending.status, pending.text).toBe(201);
    // The creation response nests the record under `sos`.
    const sosId = pending.json.data.sos.id;
    const sos = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST',
      cookie: adminCookie,
      body: { groupId: group.json.data.groupId, responderIds: ['usr_responder'] }
    });
    // The empty group must refuse the dispatch rather than half-accepting it: every named
    // responder has to be an active member of the chosen group.
    expect(sos.status).toBe(400);
    expect(String(sos.json.error.message)).toContain('active member');

    const settings = await apiFetch(server, '/_admin/settings', {
      method: 'PUT',
      cookie: adminCookie,
      body: {
        sos_auto_dispatch: '1',
        default_dispatch_radius_m: '4200',
        mission_ready_required: '0',
        maintenance_mode: '0'
      }
    });
    expect(settings.status).toBe(200);
    expect(settings.json.data.keys.length).toBe(4);
    const stored = await apiFetch(server, '/_admin/settings', { cookie: adminCookie });
    expect(stored.json.data.items.some((item: any) => item.key === 'sos_auto_dispatch' && item.value === '1')).toBe(true);

    const audit = await apiFetch(server, '/_admin/audit?limit=20', { cookie: adminCookie });
    expect(audit.status).toBe(200);
    expect(audit.json.data.items.some((item: any) => item.action === 'user.create')).toBe(true);
    const auditCsv = await apiFetch(server, '/_admin/audit.csv', { cookie: adminCookie });
    expect(auditCsv.status).toBe(200);
    expect(String(auditCsv.headers.get('content-type'))).toMatch(/text\/csv/);
    expect(auditCsv.text).toMatch(/id,createdAt,actorUsername/);
    const usersCsv = await apiFetch(server, '/_admin/users.csv', { cookie: adminCookie });
    expect(usersCsv.status).toBe(200);
    expect(usersCsv.text).toMatch(/id,username,role,active/);
    const health = await apiFetch(server, '/_admin/system/health', { cookie: adminCookie });
    expect(health.json.data.status).toBe('ok');
    expect(health.json.data.database.users).toBeGreaterThanOrEqual(1);
  });

  it('serializes device sessions with the field names the profile screen reads', async () => {
    // The screen once read `id`/`lastSeenAt`/`current` while the API returned
    // `sessionId`/`lastActiveAt`/`isCurrentDevice`, and revoked through a route that did not exist.
    // Pin the wire contract here so a rename fails in CI instead of silently blanking the UI.
    const second = await login(server, 'saeed.k', 'DemoPass!2026');
    expect(second).toBeTruthy();

    const listed = await apiFetch(server, '/_user/devices', { cookie: userCookie });
    expect(listed.status).toBe(200);
    const devices = listed.json.data.items as Array<Record<string, unknown>>;
    expect(devices.length).toBeGreaterThanOrEqual(2);

    const current = devices.find((device) => device.isCurrentDevice === true);
    expect(current).toBeTruthy();
    expect(Object.keys(current!).sort()).toEqual([
      'createdAt',
      'deviceId',
      'deviceName',
      'expiresAt',
      'ip',
      'isCurrentDevice',
      'isOnline',
      'lastActiveAt',
      'sessionId'
    ]);
    expect(typeof current!.sessionId).toBe('string');

    const other = devices.find((device) => device.isCurrentDevice === false)!;
    const revoked = await apiFetch(server, `/_user/devices/${other.sessionId}`, { method: 'DELETE', cookie: userCookie });
    expect(revoked.status).toBe(200);

    const after = await apiFetch(server, '/_user/devices', { cookie: userCookie });
    expect(after.json.data.items.some((device: any) => device.sessionId === other.sessionId)).toBe(false);
    // The caller keeps its own session: revoking another device must not sign you out.
    expect(after.json.data.items.some((device: any) => device.isCurrentDevice === true)).toBe(true);

    // Revoking a session that is already gone is a 404, not a silent success.
    const again = await apiFetch(server, `/_user/devices/${other.sessionId}`, { method: 'DELETE', cookie: userCookie });
    expect(again.status).toBe(404);
  });
});
