// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * CSV export is where a spreadsheet becomes a command shell: a cell starting with `=`, `+`, `-`
 * or `@` is a formula. The export must neutralise it and quote embedded separators. The account
 * rows come from the live database, so the injection is planted through the same repository the
 * export reads from.
 */

let server: TestServer;
let adminCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
  // A legitimate audit row so the export has content to neutralise.
  const created = await apiFetch(server, '/_admin/groups', {
    method: 'POST',
    cookie: adminCookie,
    body: { name: 'گروه سی‌اس‌وی', color: '#123456', capacity: 3, incidentIds: ['inc_fire'] }
  });
  expect(created.status, created.text).toBe(201);
});

afterAll(async () => {
  await server?.close();
});

describe('users CSV', () => {
  it('prefixes formula-leading values and quotes embedded separators', async () => {
    const context = server.app.context;
    context.repo.run('UPDATE users SET username = ? WHERE id = ?', '=HYPERLINK("http://evil.example","x")', 'usr_responder');
    context.repo.run('UPDATE users SET username = ? WHERE id = ?', 'evil,"quoted', 'usr_requester');

    const csv = await apiFetch(server, '/_admin/users.csv', { cookie: adminCookie });
    expect(csv.status, csv.text).toBe(200);
    expect(csv.headers.get('content-disposition')).toContain('borobiya-users.csv');
    // Formula cells get a leading apostrophe; none may start a field raw.
    expect(csv.text).toContain(`'=HYPERLINK(`);
    expect(csv.text).not.toMatch(/(^|,)=HYPERLINK/);
    // Embedded quotes are doubled and the cell is wrapped.
    expect(csv.text).toContain('"evil,""quoted"');

    context.repo.run('UPDATE users SET username = ? WHERE id = ?', 'responder', 'usr_responder');
    context.repo.run('UPDATE users SET username = ? WHERE id = ?', 'requester', 'usr_requester');
  });
});

describe('audit CSV', () => {
  it('neutralises formula-leading actor names the same way', async () => {
    const context = server.app.context;
    context.repo.run('UPDATE users SET username = ? WHERE id = ?', '=1+cmd', 'usr_admin');

    const csv = await apiFetch(server, '/_admin/audit.csv', { cookie: adminCookie });
    expect(csv.status, csv.text).toBe(200);
    expect(csv.text).toContain(`'=1+cmd`);
    expect(csv.text).not.toMatch(/(^|,)=1\+cmd/);

    context.repo.run('UPDATE users SET username = ? WHERE id = ?', 'admin', 'usr_admin');
  });
});
