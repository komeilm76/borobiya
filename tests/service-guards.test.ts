// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Guard paths of the users and location services over HTTP: login history, account search, the
 * rename flow, the account-must-exist invariant and the location-share rulebook. Each assertion
 * pins a refusal or an edge the journey suites cannot reach.
 */

let server: TestServer;
let requesterCookie: string;
let companionCookie: string;
let responderCookie: string;
let adminCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

afterAll(async () => {
  await server?.close();
});

describe('location share guards', () => {
  it('refuses to share location with yourself', async () => {
    const response = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_requester', kind: 'live', durationSeconds: 3600 }
    });
    expect(response.status).toBe(400);
  });

  it('answers 404 for an unknown recipient', async () => {
    const response = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_ghost', kind: 'live', durationSeconds: 3600 }
    });
    expect(response.status).toBe(404);
  });

  it('rejects a history range that runs backwards', async () => {
    const now = Date.now();
    const response = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_companion', kind: 'history', historyFrom: now, historyTo: now - 60_000 }
    });
    expect(response.status).toBe(400);
  });

  it('rejects a history range that ends in the future', async () => {
    const now = Date.now();
    const response = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_companion', kind: 'history', historyFrom: now - 60_000, historyTo: now + 3_600_000 }
    });
    expect(response.status).toBe(400);
  });

  it('rejects a history range deeper than 30 days', async () => {
    const now = Date.now();
    const response = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_companion', kind: 'history', historyFrom: now - 31 * 86_400_000, historyTo: now }
    });
    expect(response.status).toBe(400);
  });

  it('answers 404 when revoking a share the caller does not own', async () => {
    const created = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: companionCookie,
      body: { recipientId: 'usr_requester', kind: 'live', durationSeconds: 3600 }
    });
    expect(created.status, created.text).toBe(201);
    const shareId = created.json.data.share.shareId;
    const stolen = await apiFetch(server, `/_user/location/shares/${shareId}`, { method: 'DELETE', cookie: requesterCookie });
    expect(stolen.status).toBe(404);
    const revoked = await apiFetch(server, `/_user/location/shares/${shareId}`, { method: 'DELETE', cookie: companionCookie });
    expect(revoked.status).toBe(200);
  });

  it('rejects a history query whose range runs backwards', async () => {
    const response = await apiFetch(server, '/_user/location/history/usr_companion?from=2000&to=1000&limit=10', { cookie: requesterCookie });
    expect(response.status).toBe(400);
  });
});

describe('login history and search', () => {
  it('serves the account login history with the documented fields', async () => {
    const response = await apiFetch(server, '/_user/logins?limit=10', { cookie: requesterCookie });
    expect(response.status).toBe(200);
    expect(Array.isArray(response.json.data.items)).toBe(true);
    expect(response.json.data.items.length).toBeGreaterThan(0);
    for (const item of response.json.data.items) {
      expect(typeof item.ip).toBe('string');
      expect(typeof item.deviceName).toBe('string');
      expect(typeof item.success).toBe('boolean');
      expect(typeof item.loginAt).toBe('number');
    }
  });

  it('finds accounts by username, excludes the caller and honors the role filter', async () => {
    const adminSearch = await apiFetch(server, '/_user/users/search?q=admin&limit=10', { cookie: requesterCookie });
    expect(adminSearch.status).toBe(200);
    expect(adminSearch.json.data.items.map((item: any) => item.username)).toContain('admin');

    const responderSearch = await apiFetch(server, '/_user/users/search?q=admin&role=responder&limit=10', { cookie: requesterCookie });
    expect(responderSearch.json.data.items.map((item: any) => item.username)).not.toContain('admin');

    const selfSearch = await apiFetch(server, '/_user/users/search?q=saeed.k&limit=10', { cookie: requesterCookie });
    expect(selfSearch.json.data.items).toEqual([]);

    const fields = adminSearch.json.data.items[0];
    expect(typeof fields.readyForMission).toBe('boolean');
    expect(typeof fields.averageRating).toBe('number');
    expect(typeof fields.online).toBe('boolean');
  });
});

describe('username change', () => {
  it('renames the account, rejects a taken name and invalidates the session cache', async () => {
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'rename.target', password: 'RenamePass!2026', role: 'user' }
    });
    expect(created.status, created.text).toBe(201);
    const renamed = await login(server, 'rename.target', 'RenamePass!2026');

    const updated = await apiFetch(server, '/_user/me', {
      method: 'PATCH', cookie: renamed,
      body: { username: 'renamed.target' }
    });
    expect(updated.status, updated.text).toBe(200);
    expect(updated.json.data.username).toBe('renamed.target');

    const me = await apiFetch(server, '/_user/me', { cookie: renamed });
    expect(me.json.data.username).toBe('renamed.target');

    const taken = await apiFetch(server, '/_user/me', {
      method: 'PATCH', cookie: renamed,
      body: { username: 'admin' }
    });
    expect(taken.status).toBe(409);
  });

  it('throws when reading an account that no longer exists', () => {
    expect(() => server.app.context.services.users.me(
      { userId: 'usr_ghost', sessionId: 'sess_x', username: 'ghost', role: 'user', deviceId: 'dev', ip: '127.0.0.1' }
    )).toThrow('Account not found.');
  });
});
