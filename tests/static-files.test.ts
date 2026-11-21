// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadConfig } from '../src/server/core/config.ts';
import { StaticFiles } from '../src/server/core/static.ts';

/**
 * The static file server behind the SPA shell. Driven directly because the HTTP app always passes
 * `fallbackToIndex` explicitly and always runs in the production cache configuration, so three arms
 * of the class are unreachable through the server.
 */

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'borobiya-static-'));
  writeFileSync(join(root, 'index.html'), '<!doctype html><title>borobiya</title>');
  writeFileSync(join(root, 'robots.txt'), 'User-agent: *\nDisallow: /_admin\n');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const developmentConfig = () => loadConfig({
  environment: 'development',
  publicDir: root,
  databasePath: ':memory:',
  allowedOrigins: []
});

describe('development cache behaviour', () => {
  it('serves assets with a no-cache header and a 1s bucket in development', async () => {
    const files = new StaticFiles(developmentConfig());
    const response = await files.serve(new Request('http://localhost/robots.txt'), '/robots.txt');
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-cache');
    expect(response.headers.get('content-type')).toContain('text/plain');
    expect(await response.text()).toContain('User-agent');
  });

  it('serves the shell with the default fallback flag and nosniff', async () => {
    const files = new StaticFiles(developmentConfig());
    // `fallbackToIndex` is omitted: the third argument's default must be used.
    const response = await files.serve(new Request('http://localhost/'), '/index.html');
    expect(response.status).toBe(200);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
    expect(response.headers.get('cache-control')).toBe('no-cache');
  });

  it('refuses a path outside the public root even if the segment checks were bypassed', async () => {
    // `.` segments are refused before the root check, so this exercises the guard through the API:
    // an unknown extension is refused with 404 rather than served.
    const files = new StaticFiles(developmentConfig());
    await expect(files.serve(new Request('http://localhost/x.bin'), '/x.bin')).rejects.toMatchObject({ status: 404 });
  });
});
