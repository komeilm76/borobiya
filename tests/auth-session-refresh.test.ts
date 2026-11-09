// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';
import { tokenHash } from '../src/server/core/crypto.ts';

/**
 * The refusal paths of session rotation: a garbage cookie, a user deactivated between login and
 * refresh, and a logout with no session at all — the cookie is still cleared, because a client
 * that believes it is signed out must not keep a stray cookie alive.
 */

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server?.close();
});

describe('session rotation refusals', () => {
  it('refuses a refresh with a garbage cookie', async () => {
    const response = await apiFetch(server, '/_auth/refresh', { method: 'POST', cookie: 'bb_session=garbage.signature' });
    expect(response.status).toBe(401);
  });

  it('refuses to rotate a session whose user was deactivated after the cache was written', async () => {
    const cookie = await login(server, 'saeed.k', 'DemoPass!2026');
    const context = server.app.context;
    const token = decodeURIComponent(cookie.split('=')[1]!);
    const [sessionId, secret] = token.split('.') as [string, string];
    // Evict the verified-session cache so the fresh row (active = 0) is consulted.
    context.services.auth.sessionCache.delete(`${sessionId}:${tokenHash(secret)}`);
    context.repo.run('UPDATE users SET active = 0 WHERE username = ?', 'saeed.k');

    const response = await apiFetch(server, '/_auth/refresh', { method: 'POST', cookie });
    expect(response.status).toBe(401);
    context.repo.run('UPDATE users SET active = 1 WHERE username = ?', 'saeed.k');
  });

  it('clears the cookie on logout even when no session exists', async () => {
    const response = await apiFetch(server, '/_auth/logout', { method: 'POST', cookie: 'bb_session=garbage.signature' });
    expect(response.status).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('bb_session=');
  });
});
