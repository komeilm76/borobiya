import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clientIpFromRequest, loadConfig, originAllowed, pathResolve, requestOrigin, ROOT, type Config } from '../src/server/core/config.ts';

/**
 * Configuration is where a bad default becomes a security incident. These tests pin the parsing
 * rules around environment variables and the trust decisions on the request path — the branches that
 * only fire on the edge of valid input, and therefore the ones that break in production, not in
 * development.
 *
 * The `.env` file path is deliberately not tested: under `NODE_ENV=test` the environment module
 * returns `process.env` as-is, so a file read would make the suite depend on the checkout.
 * The repository-root resolver likewise cannot be exercised without moving the checkout.
 */

const MANAGED = ['NODE_ENV', 'PORT', 'TRUST_PROXY', 'COOKIE_SECURE', 'ALLOWED_ORIGINS', 'SEED_DEMO_USERS'] as const;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of MANAGED) savedEnv[key] = process.env[key];
});

afterEach(() => {
  for (const key of MANAGED) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function bare(): Config {
  return loadConfig();
}

describe('loadConfig environment parsing', () => {
  it('produces a sane test configuration with no overrides', () => {
    const config = bare();
    expect(config.environment).toBe('test');
    expect(config.port).toBe(3000);
    expect(config.host).toBe('0.0.0.0');
    expect(config.cookieSecure).toBe(false);
    expect(config.allowedOrigins).toEqual([]);
    // Demo data ships to every non-production environment by design; only production strips it.
    expect(config.seedDemoUsers).toBe(true);
  });

  it('falls back to development when NODE_ENV is absent', () => {
    delete process.env.NODE_ENV;
    // Without an environment hint the server targets development defaults, never production.
    expect(bare().environment).toBe('development');
  });

  it('rejects an environment outside the known set', () => {
    expect(() => loadConfig({ environment: 'staging' as never })).toThrow(/Invalid NODE_ENV/);
  });

  it('parses boolean-ish environment values case-insensitively', () => {
    process.env.TRUST_PROXY = 'yes';
    process.env.COOKIE_SECURE = 'ON';
    expect(bare().trustProxy).toBe(true);
    expect(bare().cookieSecure).toBe(true);
    process.env.TRUST_PROXY = '0';
    process.env.COOKIE_SECURE = 'off';
    expect(bare().trustProxy).toBe(false);
    expect(bare().cookieSecure).toBe(false);
  });

  it('rejects an out-of-range integer from the environment', () => {
    process.env.PORT = '70000';
    expect(() => bare()).toThrow(/Invalid integer setting/);
    process.env.PORT = '3.5';
    expect(() => bare()).toThrow(/Invalid integer setting/);
    delete process.env.PORT;
  });

  it('resolves dot segments in an override path', () => {
    // Pure path arithmetic only — the directory does not need to exist. `..` pops the last
    // component; a leading `./` is skipped; absolute segments reset the stack.
    // The checkout can live anywhere, so derive the expectation from the exported ROOT rather
    // than hardcoding a path this sandbox happens to use.
    const parent = ROOT.slice(0, ROOT.lastIndexOf('/'));
    expect(loadConfig({ dataDir: '../outside-repo' }).dataDir).toBe(`${parent}/outside-repo`);
    expect(loadConfig({ dataDir: './relative-dir' }).dataDir).toBe(`${ROOT}/relative-dir`);
    expect(loadConfig({ dataDir: '/absolute/dir' }).dataDir).toBe('/absolute/dir');
    expect(loadConfig({ dataDir: 'a/./b' }).dataDir).toBe(`${ROOT}/a/b`);
  });

  it('trims ALLOWED_ORIGINS entries and drops the empty ones', () => {
    process.env.ALLOWED_ORIGINS = ' https://a.test , https://b.test ,,';
    expect(bare().allowedOrigins).toEqual(['https://a.test', 'https://b.test']);
  });

  it('refuses an unsafe admin password in production', () => {
    expect(() => loadConfig({ environment: 'production', adminPassword: 'short', seedDemoUsers: false })).toThrow(/ADMIN_PASSWORD/);
    expect(() => loadConfig({ environment: 'production', adminPassword: 'change-me-before-production', seedDemoUsers: false })).toThrow(/ADMIN_PASSWORD/);
  });

  it('refuses to seed demo users in production', () => {
    expect(() => loadConfig({ environment: 'production', adminPassword: 'UniqueProductionPass!2026', seedDemoUsers: true })).toThrow(/SEED_DEMO_USERS/);
  });

  it('accepts a safe production configuration', () => {
    const config = loadConfig({ environment: 'production', adminPassword: 'UniqueProductionPass!2026', seedDemoUsers: false });
    expect(config.environment).toBe('production');
    expect(config.cookieSecure).toBe(true);
  });
});

describe('requestOrigin', () => {
  const trusting = loadConfig({ trustProxy: true });
  const direct = loadConfig({ trustProxy: false });

  function fakeRequest(headers: HeadersInit = {}) {
    return { headers: new Headers(headers) } as never;
  }

  it('honours the forwarded proto and host from a trusted proxy', () => {
    const request = fakeRequest({ 'x-forwarded-proto': 'https, http', 'x-forwarded-host': 'app.example.test, internal:3000' });
    expect(requestOrigin(request, trusting)).toBe('https://app.example.test');
  });

  it('ignores forwarded headers from an untrusted source', () => {
    const request = fakeRequest({ 'x-forwarded-proto': 'https', 'x-forwarded-host': 'evil.test', host: 'internal.test:3000' });
    expect(requestOrigin(request, direct)).toBe('http://internal.test:3000');
  });

  it('falls back to localhost with the configured port when no host is present', () => {
    expect(requestOrigin(fakeRequest(), direct)).toBe('http://localhost:3000');
  });

  it('ignores a garbage forwarded proto', () => {
    const request = fakeRequest({ 'x-forwarded-proto': 'gopher', 'x-forwarded-host': 'app.example.test' });
    expect(requestOrigin(request, trusting)).toBe('http://app.example.test');
  });
});

describe('originAllowed wildcard handling', () => {
  const config = loadConfig({ allowedOrigins: ['*'] });

  it('accepts any origin with a star pattern', () => {
    expect(originAllowed('https://anything.test', 'http://localhost:3000', config)).toBe(true);
  });

  it('matches a suffix wildcard without letting the scheme boundary leak', () => {
    const suffix = loadConfig({ allowedOrigins: ['*.example.test'] });
    expect(originAllowed('https://admin.example.test', 'http://localhost:3000', suffix)).toBe(true);
    expect(originAllowed('https://a.b.example.test', 'http://localhost:3000', suffix)).toBe(true);
    // The dot boundary must hold, or the apex site itself would pass the wildcard.
    expect(originAllowed('https://example.test', 'http://localhost:3000', suffix)).toBe(false);
    expect(originAllowed('https://admin.example.test.evil.com', 'http://localhost:3000', suffix)).toBe(false);
  });

  it('escapes regex metacharacters in patterns', () => {
    const literal = loadConfig({ allowedOrigins: ['https://a+b.example.test'] });
    expect(originAllowed('https://a+b.example.test', 'http://localhost:3000', literal)).toBe(true);
    expect(originAllowed('https://aaab.example.test', 'http://localhost:3000', literal)).toBe(false);
  });
});

describe('clientIpFromRequest', () => {
  const trusting = loadConfig({ trustProxy: true });
  const direct = loadConfig({ trustProxy: false });

  it('prefers the first forwarded address from a trusted proxy', () => {
    const request = new Request('http://x/', { headers: { 'x-forwarded-for': ' 203.0.113.7 , 10.0.0.1' } });
    expect(clientIpFromRequest(request, trusting)).toBe('203.0.113.7');
  });

  it('ignores an empty forwarded list and falls through', () => {
    const request = new Request('http://x/', { headers: { 'x-forwarded-for': '   ' } });
    // An empty XFF carries no information; the peer address (unknown here) is used instead.
    expect(clientIpFromRequest(request, trusting)).toBe('unknown');
  });

  it('does not trust forwarding when the proxy is untrusted', () => {
    const request = new Request('http://x/', { headers: { 'x-forwarded-for': '203.0.113.7', 'fly-client-ip': '198.51.100.9' } });
    expect(clientIpFromRequest(request, direct)).toBe('unknown');
  });

  it('strips the IPv4-mapped prefix from a direct peer address', () => {
    const request = Object.assign(new Request('http://x/'), { ip: '::ffff:127.0.0.1' });
    expect(clientIpFromRequest(request, direct)).toBe('127.0.0.1');
  });
});

describe('path resolution', () => {
  it('clamps `..` at the root instead of walking above it', () => {
    // A relative base has no absolute marker in the output, and a `..` with nothing to pop must
    // not reach above the root.
    expect(pathResolve('relative', '..', '..', 'assets')).toBe('assets');
  });
});
