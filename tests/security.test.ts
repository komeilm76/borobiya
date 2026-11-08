// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

let server: TestServer;
let adminCookie: string;
let userCookie: string;

/** Sends a request carrying preview-proxy headers the way the platform proxy does. */
async function forwardedRequest(base: string, headers: Record<string, string>) {
  return fetch(new URL('/', base), { headers });
}

beforeAll(async () => {
  server = await createTestServer({ allowedOrigins: ['https://allowed.example.test'], maxBodyBytes: 1024 });
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
  userCookie = await login(server, 'saeed.k', 'DemoPass!2026');
});

afterAll(async () => {
  if (server) await server.close();
});

describe('security headers and request hardening', () => {
  it('every response ships a strict CSP, request ID and no-store API headers', async () => {
    const shell = await apiFetch(server, '/');
    expect(shell.status).toBe(200);
    const csp = String(shell.headers.get('content-security-policy'));
    expect(csp).toMatch(/script-src 'self'/);
    expect(csp).toMatch(/style-src 'self' 'unsafe-inline'/);
    expect(csp).toMatch(/img-src 'self' data:/);
    expect(csp).toMatch(/connect-src 'self' ws:\/\//);
    expect(shell.headers.get('x-frame-options')).toBe('DENY');
    expect(shell.headers.get('x-content-type-options')).toBe('nosniff');
    expect(String(shell.headers.get('x-request-id'))).toMatch(/^req_/);
    const me = await apiFetch(server, '/_user/me', { cookie: userCookie });
    expect(String(me.headers.get('cache-control'))).toMatch(/no-store/);
    expect(me.json.ok).toBe(true);
  });

  it('CORS allows explicit origins and CSRF rejects untrusted mutating origins', async () => {
    const allowed = await apiFetch(server, '/_public/health', { origin: 'https://allowed.example.test' });
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get('access-control-allow-origin')).toBe('https://allowed.example.test');
    expect(allowed.headers.get('access-control-allow-credentials')).toBe('true');
    expect(String(allowed.headers.get('vary'))).toMatch(/Origin/);

    const rejected = await apiFetch(server, '/_auth/login', {
      method: 'POST',
      origin: 'https://evil.example.test',
      body: { username: 'saeed.k', password: 'DemoPass!2026' }
    });
    expect(rejected.status).toBe(403);
    expect(rejected.json.error.code).toBe('FORBIDDEN');
    const crossSite = await apiFetch(server, '/_auth/login', {
      method: 'POST',
      origin: server.origin,
      headers: { 'Sec-Fetch-Site': 'cross-site' },
      body: { username: 'saeed.k', password: 'DemoPass!2026' }
    });
    expect(crossSite.status).toBe(200);
  });

  it('body size limits, typed errors and SQL-like input are handled before services run', async () => {
    const oversized = await apiFetch(server, '/_auth/login', {
      method: 'POST',
      body: { username: 'saeed.k', password: 'A1!'.repeat(700) }
    });
    expect(oversized.status).toBe(413);
    const injected = await apiFetch(server, '/_auth/login', {
      method: 'POST',
      body: { username: "' OR 1=1 --", password: 'DemoPass!2026' }
    });
    expect(injected.status).toBe(400);
    const badQuery = await apiFetch(server, '/_admin/users?role=%27%20OR%201%3D1%20--', { cookie: adminCookie });
    expect(badQuery.status).toBe(400);
    expect(String(badQuery.json.error.details.field)).toMatch(/role/);
  });

  it('static file serving cannot escape the public root', async () => {
    for (const path of ['/package.json', '/_public/%2e%2e%2fpackage.json', '/app.css/../../package.json']) {
      const response = await apiFetch(server, path);
      expect(response.status, path).toBe(404);
      expect(response.text).not.toMatch(/"name"\s*:\s*"borobiya"/);
    }
  });

  it('disabling a user revokes all sessions and protects the last administrator', async () => {
    const selfDeactivation = await apiFetch(server, '/_admin/users/usr_admin', {
      method: 'PATCH',
      cookie: adminCookie,
      body: { active: false }
    });
    expect(selfDeactivation.status).toBe(403);
    const disabled = await apiFetch(server, '/_admin/users/usr_requester', {
      method: 'PATCH',
      cookie: adminCookie,
      body: { active: false }
    });
    expect(disabled.status).toBe(200);
    expect(disabled.json.data.active).toBe(false);
    expect((await apiFetch(server, '/_user/me', { cookie: userCookie })).status).toBe(401);
  });

  it('authentication rate limiting returns a typed 429 after the bucket is exhausted', async () => {
    const isolated = await createTestServer();
    try {
      const responses = [];
      for (let index = 0; index < 9; index++) {
        responses.push(
          await apiFetch(isolated, '/_auth/login', {
            method: 'POST',
            body: { username: 'missing.user', password: 'WrongPassword!2026' }
          })
        );
      }
      expect(responses.filter((response) => response.status === 401).length).toBe(8);
      expect(responses.at(-1)?.status).toBe(429);
      expect(responses.at(-1)?.json.error.code).toBe('RATE_LIMITED');
      expect(Number(responses.at(-1)?.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    } finally {
      await isolated.close();
    }
  });

  it('preview proxy headers produce matching WebSocket CSP and CORS origins', async () => {
    const isolated = await createTestServer({ trustProxy: true, allowedOrigins: ['https://3000-example.e2b.app'] });
    try {
      const response = await forwardedRequest(isolated.base, {
        Origin: 'https://3000-example.e2b.app',
        'X-Forwarded-Host': '3000-example.e2b.app',
        'X-Forwarded-Proto': 'https'
      });
      expect(String(response.headers.get('content-security-policy'))).toMatch(
        /connect-src 'self' wss:\/\/3000-example\.e2b\.app/
      );
      expect(response.headers.get('access-control-allow-origin')).toBe('https://3000-example.e2b.app');
    } finally {
      await isolated.close();
    }
  });

  it('explicit frame ancestors permit embedding without a conflicting legacy DENY header', async () => {
    const isolated = await createTestServer({ frameAncestors: ["'self'", 'https://*.e2b.app'] });
    try {
      const shell = await apiFetch(isolated, '/');
      expect(shell.status).toBe(200);
      expect(String(shell.headers.get('content-security-policy'))).toMatch(
        /frame-ancestors 'self' https:\/\/\*\.e2b\.app/
      );
      expect(shell.headers.get('x-frame-options')).toBe(null);
    } finally {
      await isolated.close();
    }
  });

  it('trusted forwarded-host proxies produce matching preview origins', async () => {
    const isolated = await createTestServer({ trustProxy: true, allowedOrigins: [] });
    try {
      const response = await forwardedRequest(isolated.base, {
        Origin: 'https://3000-example.e2b.app',
        'X-Forwarded-Host': '3000-example.e2b.app',
        'X-Forwarded-Proto': 'https'
      });
      expect(String(response.headers.get('content-security-policy'))).toMatch(
        /connect-src 'self' wss:\/\/3000-example\.e2b\.app/
      );
      expect(response.headers.get('access-control-allow-origin')).toBe('https://3000-example.e2b.app');
    } finally {
      await isolated.close();
    }
  });
});
