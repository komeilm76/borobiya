// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Administrator flows rather than refusal paths: resolving an alert and seeing the
 * `resolvedAt`/`resolvedBy` pair materialise, a system-authored audit row (no actor) through
 * both the JSON list and the CSV export, and the account-role patch matrix where the
 * active flag is left alone.
 */

let server: TestServer;
let adminCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

afterAll(async () => {
  await server?.close();
});

describe('alert resolution', () => {
  it('stamps the resolved pair when an open alert is resolved', async () => {
    const open = await apiFetch(server, '/_admin/alerts', { cookie: adminCookie });
    expect(open.status).toBe(200);
    const target = open.json.data.items.find((item: any) => item.resolvedAt === null) ?? open.json.data.items[0];
    expect(target).toBeTruthy();

    const resolved = await apiFetch(server, `/_admin/alerts/${target.id}/resolve`, { method: 'POST', cookie: adminCookie });
    expect(resolved.status, resolved.text).toBe(200);

    const all = await apiFetch(server, '/_admin/alerts?includeResolved=true', { cookie: adminCookie });
    expect(all.status).toBe(200);
    const stamped = all.json.data.items.find((item: any) => item.id === target.id);
    expect(stamped).toBeTruthy();
    expect(typeof stamped.resolvedAt).toBe('number');
    expect(stamped.resolvedBy).toBeTruthy();
  });
});

describe('audit rows authored by the system', () => {
  it('lists and exports an actor-less audit row without crashing', async () => {
    server.app.context.repo.run(
      `INSERT INTO audit_log(actor_id, action, target, ip, meta_json, created_at)
       VALUES(NULL, 'system.sweep', 'tests', '127.0.0.1', '{}', ?)`,
      Date.now());

    const json = await apiFetch(server, '/_admin/audit', { cookie: adminCookie });
    expect(json.status, json.text).toBe(200);
    const row = json.json.data.items.find((item: any) => item.action === 'system.sweep');
    expect(row).toBeTruthy();
    expect(row.actorUsername).toBeNull();

    const csv = await apiFetch(server, '/_admin/audit.csv', { cookie: adminCookie });
    expect(csv.status, csv.text).toBe(200);
    const line = csv.text.split('\r\n').find((entry: string) => entry.includes('system.sweep'))!;
    const cells = line.split(',');
    expect(cells[2]).toBe(''); // actorUsername renders empty, not the string "null"
    expect(cells[3]).toBe('system.sweep');
  });
});

describe('account role patches', () => {
  it('accepts a same-role patch that leaves the active flag untouched', async () => {
    const response = await apiFetch(server, '/_admin/users/usr_admin', {
      method: 'PATCH', cookie: adminCookie, body: { role: 'admin' }
    });
    expect(response.status, response.text).toBe(200);
    expect(response.json.data.role).toBe('admin');
  });

  it('promotes then demotes a fresh account without a last-admin conflict', async () => {
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'promote.two', password: 'PromoteTwo!2026', role: 'responder' }
    });
    expect(created.status, created.text).toBe(201);
    const userId = created.json.data.userId;

    const promoted = await apiFetch(server, `/_admin/users/${userId}`, {
      method: 'PATCH', cookie: adminCookie, body: { role: 'admin' }
    });
    expect(promoted.status, promoted.text).toBe(200);

    // Now an admin being demoted while the seed admin remains: allowed.
    const demoted = await apiFetch(server, `/_admin/users/${userId}`, {
      method: 'PATCH', cookie: adminCookie, body: { role: 'user' }
    });
    expect(demoted.status, demoted.text).toBe(200);
    expect(demoted.json.data.role).toBe('user');
  });

  it('suspends an account with an active-only patch', async () => {
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'suspend.two', password: 'SuspendTwo!2026', role: 'user' }
    });
    expect(created.status, created.text).toBe(201);
    const userId = created.json.data.userId;

    const suspended = await apiFetch(server, `/_admin/users/${userId}`, {
      method: 'PATCH', cookie: adminCookie, body: { active: false }
    });
    expect(suspended.status, suspended.text).toBe(200);
    expect(suspended.json.data.active).toBe(false);
  });
});
