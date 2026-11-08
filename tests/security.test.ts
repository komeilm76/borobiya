import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

let server: TestServer;
let adminCookie: string;
let userCookie: string;

before(async () => {
  server = await createTestServer({ allowedOrigins: ['https://allowed.example.test'], maxBodyBytes: 1024 });
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
  userCookie = await login(server, 'saeed.k', 'DemoPass!2026');
});
after(async () => { if (server) await server.close(); });

test('every response ships a strict CSP, request ID and no-store API headers', async () => {
  const shell = await apiFetch(server, '/');
  assert.equal(shell.status, 200);
  const csp = String(shell.headers.get('content-security-policy'));
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /style-src 'self' 'unsafe-inline'/);
  assert.match(csp, /img-src 'self' data:/);
  assert.match(csp, /connect-src 'self' ws:\/\//);
  assert.equal(shell.headers.get('x-frame-options'), 'DENY');
  assert.equal(shell.headers.get('x-content-type-options'), 'nosniff');
  assert.match(String(shell.headers.get('x-request-id')), /^req_/);
  const me = await apiFetch(server, '/_user/me', { cookie: userCookie });
  assert.match(String(me.headers.get('cache-control')), /no-store/);
  assert.equal(me.json.ok, true);
});

test('CORS allows explicit origins and CSRF rejects untrusted mutating origins', async () => {
  const allowed = await apiFetch(server, '/_public/health', { origin: 'https://allowed.example.test' });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://allowed.example.test');
  assert.equal(allowed.headers.get('access-control-allow-credentials'), 'true');
  assert.match(String(allowed.headers.get('vary')), /Origin/);

  const rejected = await apiFetch(server, '/_auth/login', {
    method: 'POST', origin: 'https://evil.example.test',
    body: { username: 'saeed.k', password: 'DemoPass!2026' }
  });
  assert.equal(rejected.status, 403);
  assert.equal(rejected.json.error.code, 'FORBIDDEN');
  const crossSite = await apiFetch(server, '/_auth/login', {
    method: 'POST', origin: server.origin,
    headers: { 'Sec-Fetch-Site': 'cross-site' },
    body: { username: 'saeed.k', password: 'DemoPass!2026' }
  });
  assert.equal(crossSite.status, 200);
});

test('body size limits, typed errors and SQL-like input are handled before services run', async () => {
  const oversized = await apiFetch(server, '/_auth/login', {
    method: 'POST', body: { username: 'saeed.k', password: 'A1!'.repeat(700) }
  });
  assert.equal(oversized.status, 413);
  const injected = await apiFetch(server, '/_auth/login', {
    method: 'POST', body: { username: "' OR 1=1 --", password: 'DemoPass!2026' }
  });
  assert.equal(injected.status, 400);
  const badQuery = await apiFetch(server, "/_admin/users?role=%27%20OR%201%3D1%20--", { cookie: adminCookie });
  assert.equal(badQuery.status, 400);
  assert.match(String(badQuery.json.error.details.field), /role/);
});

test('static file serving cannot escape the public root', async () => {
  for (const path of ['/package.json', '/_public/%2e%2e%2fpackage.json', '/app.css/../../package.json']) {
    const response = await apiFetch(server, path);
    assert.equal(response.status, 404, path);
    assert.doesNotMatch(response.text, /"name"\s*:\s*"borobiya"/);
  }
});

test('disabling a user revokes all sessions and protects the last administrator', async () => {
  const selfDeactivation = await apiFetch(server, '/_admin/users/usr_admin', {
    method: 'PATCH', cookie: adminCookie, body: { active: false }
  });
  assert.equal(selfDeactivation.status, 403);
  const disabled = await apiFetch(server, '/_admin/users/usr_requester', {
    method: 'PATCH', cookie: adminCookie, body: { active: false }
  });
  assert.equal(disabled.status, 200);
  assert.equal(disabled.json.data.active, false);
  assert.equal((await apiFetch(server, '/_user/me', { cookie: userCookie })).status, 401);
});

test('authentication rate limiting returns a typed 429 after the bucket is exhausted', async () => {
  const isolated = await createTestServer();
  try {
    const responses = [];
    for (let index = 0; index < 9; index++) {
      responses.push(await apiFetch(isolated, '/_auth/login', {
        method: 'POST', body: { username: 'missing.user', password: 'WrongPassword!2026' }
      }));
    }
    assert.equal(responses.filter((response) => response.status === 401).length, 8);
    assert.equal(responses.at(-1)?.status, 429);
    assert.equal(responses.at(-1)?.json.error.code, 'RATE_LIMITED');
    assert.ok(Number(responses.at(-1)?.headers.get('retry-after')) >= 1);
  } finally {
    await isolated.close();
  }
});
