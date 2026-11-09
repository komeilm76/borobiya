// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, type TestServer } from './helpers.ts';

/**
 * Login history records a friendly device label derived from the user agent. The mapping decides
 * what an administrator reads on the devices screen, so every branch of it is pinned here.
 */

let server: TestServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server?.close();
});

const CASES: Array<[string, string]> = [
  ['Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36', 'Android device'],
  ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 'iOS device'],
  ['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15', 'iOS device'],
  ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Windows device'],
  ['Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15', 'macOS device'],
  ['Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0', 'Linux device'],
  ['TotallyUnknownAgent/1.0', 'Browser device']
];

describe('device labels recorded at sign-in', () => {
  for (const [userAgent, expected] of CASES) {
    it(`records ${expected} for that user agent`, async () => {
      const response = await apiFetch(server, '/_auth/login', {
        method: 'POST',
        headers: { 'User-Agent': userAgent },
        // No explicit deviceName: the label must fall back to the user agent.
        body: { username: 'reza.m', password: 'DemoPass!2026' }
      });
      expect(response.status, response.text).toBe(200);

      const row = server.app.context.repo.one<{ device_name: string }>(
        'SELECT device_name FROM sessions ORDER BY created_at DESC LIMIT 1');
      expect(row?.device_name).toBe(expected);
    });
  }
});
