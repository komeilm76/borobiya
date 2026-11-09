// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Administrator service edge cases that the happy-path suite never reaches: validation filters,
 * ownership guards, and — most importantly — the spreadsheet-formula neutralization in CSV exports.
 *
 * The CSV guard exists because Excel and LibreOffice execute cells whose text starts with `=`, `+`,
 * `-` or `@`. Every value in the export is attacker-influenced at some point: with a trusted proxy
 * in front, the recorded client address is whatever `X-Forwarded-For` says. Auditing that path end
 * to end keeps the export safe to open on a workstation.
 */

let server: TestServer;
let adminCookie: string;
let responderCookie: string;

const ADMIN_IDENTITY = {
  userId: 'usr_admin',
  sessionId: 'sess_test',
  username: 'admin',
  role: 'admin',
  deviceId: 'test-device',
  ip: '127.0.0.1'
};

beforeAll(async () => {
  server = await createTestServer();
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
});

afterAll(async () => {
  await server?.close();
});

describe('user list filters', () => {
  it('returns only responders when the role filter is applied', async () => {
    const response = await apiFetch(server, '/_admin/users?role=responder', { cookie: adminCookie });
    expect(response.status).toBe(200);
    expect(response.json.data.items.length).toBeGreaterThan(0);
    for (const item of response.json.data.items) expect(item.role).toBe('responder');
  });

  it('returns only suspended accounts with active=false and only working ones with active=true', async () => {
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST',
      cookie: adminCookie,
      body: { username: 'filter.target', password: 'FilterPass!2026', role: 'user' }
    });
    expect(created.status, created.text).toBe(201);
    const suspended = await apiFetch(server, `/_admin/users/${created.json.data.userId}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { active: false }
    });
    expect(suspended.status, suspended.text).toBe(200);

    const inactive = await apiFetch(server, '/_admin/users?active=false', { cookie: adminCookie });
    expect(inactive.status).toBe(200);
    expect(inactive.json.data.items.map((item: any) => item.username)).toContain('filter.target');
    for (const item of inactive.json.data.items) expect(item.active).toBe(false);

    const active = await apiFetch(server, '/_admin/users?active=true', { cookie: adminCookie });
    expect(active.json.data.items.map((item: any) => item.username)).not.toContain('filter.target');
    for (const item of active.json.data.items) expect(item.active).toBe(true);
  });
});

describe('account creation guards', () => {
  it('refuses a duplicate username with 409 instead of erroring or overwriting', async () => {
    const response = await apiFetch(server, '/_admin/users', {
      method: 'POST',
      cookie: adminCookie,
      body: { username: 'reza.m', password: 'Whatever!2026', role: 'user' }
    });
    expect(response.status).toBe(409);
  });

  it('refuses a role outside the allowed set when called at the service layer', async () => {
    // The route validator already restricts role to the known set, so the service guard is the
    // second line of defense. It must still refuse rather than persist an unusable account.
    await expect(
      server.app.context.services.admin.createUser(ADMIN_IDENTITY, {
        username: 'direct.role',
        password: 'DirectRole!2026',
        role: 'not-a-role'
      })
    ).rejects.toThrow('Unknown account role.');
  });
});

describe('user detail', () => {
  it('serves sessions, login history and request counts for an existing account', async () => {
    const response = await apiFetch(server, '/_admin/users/usr_responder', { cookie: adminCookie });
    expect(response.status, response.text).toBe(200);
    const { user, sessions, logins, sosCount } = response.json.data;
    expect(user.id).toBe('usr_responder');
    expect(Array.isArray(sessions)).toBe(true);
    expect(sessions.length).toBeGreaterThan(0);
    expect(typeof sessions[0].deviceName).toBe('string');
    expect(typeof sessions[0].ip).toBe('string');
    expect(typeof sessions[0].lastActiveAt).toBe('number');
    expect(Array.isArray(logins)).toBe(true);
    expect(logins.length).toBeGreaterThan(0);
    expect(logins[0].success).toBe(true);
    expect(typeof sosCount).toBe('number');
  });

  it('answers 404 for an account that does not exist', async () => {
    const response = await apiFetch(server, '/_admin/users/usr_missing', { cookie: adminCookie });
    expect(response.status).toBe(404);
  });
});


describe('account update guards', () => {
  it('answers 404 for an account that does not exist', async () => {
    const response = await apiFetch(server, '/_admin/users/usr_missing', {
      method: 'PATCH',
      cookie: adminCookie,
      body: { active: false }
    });
    expect(response.status).toBe(404);
  });

  it('refuses to remove the last active administrator even from an inactive admin session', async () => {
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST',
      cookie: adminCookie,
      body: { username: 'second.admin', password: 'SecondPass!2026', role: 'admin' }
    });
    expect(created.status, created.text).toBe(201);
    const secondId = created.json.data.userId;
    // The acting administrator suspends the second one; that is allowed because they are not alone.
    const suspended = await apiFetch(server, `/_admin/users/${secondId}`, {
      method: 'PATCH',
      cookie: adminCookie,
      body: { active: false }
    });
    expect(suspended.status, suspended.text).toBe(200);

    // A stale identity for the now-inactive administrator must not be able to strip the last
    // remaining active administrator. The route self-check cannot see this; the service can.
    const staleIdentity = {
      userId: secondId,
      sessionId: 'sess_stale',
      username: 'second.admin',
      role: 'admin',
      deviceId: 'test-device',
      ip: '127.0.0.1'
    };
    expect(() =>
      server.app.context.services.admin.updateUser(staleIdentity, 'usr_admin', { active: false })
    ).toThrow('The last active administrator cannot be removed.');
  });
});

describe('service group update', () => {
  it('renames a group and replaces its incident types', async () => {
    const response = await apiFetch(server, '/_admin/groups/grp_fire', {
      method: 'PATCH',
      cookie: adminCookie,
      body: { name: 'آتش‌نشانی عملیاتی', color: '#B35A18', capacity: 21, incidentIds: ['inc_fire'], status: 'active' }
    });
    expect(response.status, response.text).toBe(200);
    expect(response.json.data.ok).toBe(true);

    const groups = await apiFetch(server, '/_admin/groups', { cookie: adminCookie });
    const fire = groups.json.data.items.find((group: any) => group.id === 'grp_fire');
    expect(fire.capacity).toBe(21);
  });

  it('answers 404 for a group that does not exist', async () => {
    const response = await apiFetch(server, '/_admin/groups/grp_missing', {
      method: 'PATCH',
      cookie: adminCookie,
      body: { name: 'گروه نامعتبر', color: '#123456', capacity: 5, incidentIds: ['inc_fire'], status: 'active' }
    });
    expect(response.status).toBe(404);
  });

  it('refuses duplicate or unknown incident types at the service boundary', async () => {
    const duplicated = await apiFetch(server, '/_admin/groups', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: 'گروه تکراری', color: '#123456', capacity: 5, incidentIds: ['inc_fire', 'inc_fire'], status: 'active' }
    });
    expect(duplicated.status).toBe(400);

    const unknown = await apiFetch(server, '/_admin/groups', {
      method: 'POST',
      cookie: adminCookie,
      body: { name: 'گروه ناشناخته', color: '#123456', capacity: 5, incidentIds: ['inc_nope'], status: 'active' }
    });
    expect(unknown.status).toBe(400);
  });
});

describe('service group membership', () => {
  it('adds a responder, upserts the role, and removes them again', async () => {
    const added = await apiFetch(server, '/_admin/groups/grp_urban/members', {
      method: 'POST',
      cookie: adminCookie,
      body: { userId: 'usr_responder', role: 'member' }
    });
    expect(added.status, added.text).toBe(200);

    const promoted = await apiFetch(server, '/_admin/groups/grp_urban/members', {
      method: 'POST',
      cookie: adminCookie,
      body: { userId: 'usr_responder', role: 'leader' }
    });
    expect(promoted.status, promoted.text).toBe(200);

    const groups = await apiFetch(server, '/_admin/groups', { cookie: adminCookie });
    const urban = groups.json.data.items.find((group: any) => group.id === 'grp_urban');
    expect(urban.memberIds).toContain('usr_responder');

    const removed = await apiFetch(server, '/_admin/groups/grp_urban/members/usr_responder', {
      method: 'DELETE',
      cookie: adminCookie
    });
    expect(removed.status, removed.text).toBe(200);
  });

  it('refuses plain users and unknown accounts as members', async () => {
    const plainUser = await apiFetch(server, '/_admin/groups/grp_fire/members', {
      method: 'POST',
      cookie: adminCookie,
      body: { userId: 'usr_requester', role: 'member' }
    });
    expect(plainUser.status).toBe(400);

    const ghost = await apiFetch(server, '/_admin/groups/grp_fire/members', {
      method: 'POST',
      cookie: adminCookie,
      body: { userId: 'usr_ghost', role: 'member' }
    });
    expect(ghost.status).toBe(400);
  });

  it('answers 404 when the group does not exist', async () => {
    const added = await apiFetch(server, '/_admin/groups/grp_missing/members', {
      method: 'POST',
      cookie: adminCookie,
      body: { userId: 'usr_responder', role: 'member' }
    });
    expect(added.status).toBe(404);

    const removed = await apiFetch(server, '/_admin/groups/grp_missing/members/usr_responder', {
      method: 'DELETE',
      cookie: adminCookie
    });
    expect(removed.status).toBe(404);
  });
});

describe('audit log filters', () => {
  it('returns only the requested action', async () => {
    const response = await apiFetch(server, '/_admin/audit?action=user.create&limit=50', { cookie: adminCookie });
    expect(response.status).toBe(200);
    expect(response.json.data.items.length).toBeGreaterThan(0);
    for (const item of response.json.data.items) expect(item.action).toBe('user.create');
  });

  it('matches the free-text filter against action, target and actor', async () => {
    const response = await apiFetch(server, '/_admin/audit?q=user.create&limit=50', { cookie: adminCookie });
    expect(response.status).toBe(200);
    expect(response.json.data.items.length).toBeGreaterThan(0);
    for (const item of response.json.data.items) {
      const haystack = `${item.action} ${item.target} ${item.actorUsername ?? ''}`;
      expect(haystack).toContain('user.create');
    }
  });

  it('returns nothing for a filter that matches no event', async () => {
    const response = await apiFetch(server, '/_admin/audit?q=zzz_no_such_event&limit=50', { cookie: adminCookie });
    expect(response.status).toBe(200);
    expect(response.json.data.items).toEqual([]);
    expect(response.json.data.total).toBe(0);
  });
});

describe('alerts', () => {
  it('answers 404 when resolving an alert that does not exist or is already closed', async () => {
    const response = await apiFetch(server, '/_admin/alerts/alt_missing/resolve', {
      method: 'POST',
      cookie: adminCookie
    });
    expect(response.status).toBe(404);
  });
});

describe('settings guards', () => {
  it('refuses an empty update at the service boundary', async () => {
    const response = await apiFetch(server, '/_admin/settings', {
      method: 'PUT',
      cookie: adminCookie,
      body: {}
    });
    expect(response.status).toBe(400);
  });

  it('refuses unknown setting keys at the service layer', async () => {
    // The route only forwards the four known keys, so this guard is the boundary for internal
    // callers; it must refuse rather than persist an unreadable setting.
    expect(() => server.app.context.services.admin.updateSettings(ADMIN_IDENTITY, { bogus_key: '1' }))
      .toThrow('Unknown setting key.');
  });
});

describe('CSV formula injection', () => {
  let proxyServer: TestServer;

  beforeAll(async () => {
    // A trusted proxy honors X-Forwarded-For, so the recorded address is whatever the client chose
    // to send. The audit export must neutralize values that a spreadsheet would execute.
    proxyServer = await createTestServer({ trustProxy: true });
  });

  afterAll(async () => {
    await proxyServer?.close();
  });

  it('prefixes spreadsheet-leading characters with an apostrophe in the audit CSV', async () => {
    // The session records the address seen at login, so the login is where a hostile
    // X-Forwarded-For would first take hold.
    const loginResponse = await apiFetch(proxyServer, '/_auth/login', {
      method: 'POST',
      headers: { 'x-forwarded-for': '=1+1' },
      body: { username: 'admin', password: 'AdminPass!2026', deviceId: 'test-device', deviceName: 'Bun test' }
    });
    expect(loginResponse.status, loginResponse.text).toBe(200);
    const cookie = String(loginResponse.headers.get('set-cookie')).split(';')[0];

    const mutation = await apiFetch(proxyServer, '/_admin/users', {
      method: 'POST',
      cookie,
      body: { username: 'csv.target', password: 'CsvTarget!2026', role: 'user' }
    });
    expect(mutation.status, mutation.text).toBe(201);

    const csv = await apiFetch(proxyServer, '/_admin/audit.csv', { cookie });
    expect(csv.status).toBe(200);
    expect(csv.text).toContain("'=1+1");
    // No cell anywhere in the export may still lead with a formula character.
    for (const line of csv.text.split('\r\n')) {
      for (const cell of line.split(',')) {
        expect(cell).not.toMatch(/^[=+\-@]/);
      }
    }
  });
});
