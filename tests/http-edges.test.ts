// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, type TestServer } from './helpers.ts';
import { randomToken } from '../src/server/core/crypto.ts';
import { badRequest } from '../src/server/core/errors.ts';

/**
 * The transport details that have no other home: HEAD requests map onto the GET route table, a
 * `Secure` session cookie when the configuration asks for one, the bytes of a bare token and the
 * default refusal every `badRequest()` carries when the caller forgets to say why.
 */

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer({ cookieSecure: true });
});

afterAll(async () => {
  if (server) await server.close();
});

describe('HTTP dispatch edge paths', () => {
  it('answers HEAD with the GET route and no body', async () => {
    const response = await apiFetch(server, '/_public/health', { method: 'HEAD' });
    expect(response.status).toBe(200);
    expect(response.text).toBe('');
  });

  it('marks the session cookie Secure when cookieSecure is configured', async () => {
    const response = await apiFetch(server, '/_auth/login', {
      method: 'POST',
      body: { username: 'saeed.k', password: 'DemoPass!2026' }
    });
    expect(response.status, response.text).toBe(200);
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });
});

describe('bare defaults', () => {
  it('mints a 32-byte base64url token when no length is given', () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('explains nothing when the refusal carries no message', () => {
    const error = badRequest();
    expect(error.status).toBe(400);
    expect(error.code).toBe('INVALID_INPUT');
    expect(error.message).toBe('Invalid input');
  });
});
