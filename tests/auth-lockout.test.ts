// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, type TestServer } from './helpers.ts';

/**
 * Brute-force resistance as the client experiences it: the sixth wrong password answers 429,
 * and a suspended account answers 403 — not a generic 401 that would leak which one happened.
 */

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server?.close();
});

describe('account lockout', () => {
  it('locks the account for fifteen minutes after five failed attempts', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const response = await apiFetch(server, '/_auth/login', {
        method: 'POST',
        body: { username: 'maryam.a', password: 'WrongPass!2026' }
      });
      expect(response.status, `attempt ${attempt + 1}`).toBe(401);
    }
    const locked = await apiFetch(server, '/_auth/login', {
      method: 'POST',
      body: { username: 'maryam.a', password: 'DemoPass!2026' }
    });
    // Even the correct password is refused while the account is locked.
    expect(locked.status).toBe(429);
  });

  it('answers 403 — not 401 — for a suspended account', async () => {
    server.app.context.repo.run('UPDATE users SET active = 0 WHERE username = ?', 'saeed.k');
    const response = await apiFetch(server, '/_auth/login', {
      method: 'POST',
      body: { username: 'saeed.k', password: 'DemoPass!2026' }
    });
    expect(response.status).toBe(403);
    server.app.context.repo.run('UPDATE users SET active = 1 WHERE username = ?', 'saeed.k');
  });
});
