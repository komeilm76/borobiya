// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Database } from 'bun:sqlite';
import { LruTtlCache } from '../src/server/core/cache.ts';
import { loadConfig } from '../src/server/core/config.ts';
import {
  assertSafeMutation,
  baseHeaders,
  bufferResponse,
  readJsonBody,
  strongEtag,
  textResponse,
  withBaseHeaders
} from '../src/server/core/http.ts';
import {
  badRequest,
  conflict,
  forbidden,
  isHttpError,
  notFound,
  payloadTooLarge,
  publicError,
  tooMany,
  unauthorized,
  unsupportedMedia
} from '../src/server/core/errors.ts';
import {
  cryptoRuntimeInfo,
  parseCookieHeader,
  randomInt,
  safeHexEqual,
  splitSessionToken,
  verifyPassword
} from '../src/server/core/crypto.ts';
import { boundingBox, tileKey, validateTile } from '../src/server/domain/geo.ts';
import { mapTileKey, renderMapTile } from '../src/server/domain/map.ts';
import { canCancelSos, missionStageIndex, transitionSos } from '../src/server/domain/state.ts';
import {
  array,
  boolean,
  loginSecret,
  number,
  oneOf,
  optional,
  parse,
  password,
  queryObject,
  shape,
  text,
  withDefault
} from '../src/server/core/validate.ts';
import { displayText } from '../src/server/core/validate.ts';
import { Repository } from '../src/server/db/repository.ts';
import { ok, raw, Router } from '../src/server/core/router.ts';
import { RateLimiters } from '../src/server/core/rate-limit.ts';
import { apiFetch, createTestServer, type TestServer } from './helpers.ts';

/**
 * The edge of every core primitive the happy-path suites never quite reach: cache boundaries,
 * crypto refusals, cookie parsing faults, repository corruption tolerance, static path handling
 * and the application's own lifecycle. These are the lines an attacker or a corrupt disk, not a
 * user, would otherwise find first.
 */

describe('LRU TTL cache edges', () => {
  it('refuses to build a cache without a sane capacity', () => {
    expect(() => new LruTtlCache<string, number>(0)).toThrow(RangeError);
    expect(() => new LruTtlCache<string, number>(1.5)).toThrow(RangeError);
    expect(() => new LruTtlCache<string, number>(-3)).toThrow(RangeError);
  });

  it('peeks, checks and iterates without exposing expired entries', () => {
    let now = 1000;
    const cache = new LruTtlCache<string, number>(4, 10_000, () => now);
    cache.set('fresh', 1);
    expect(cache.peek('fresh')).toBe(1);
    expect(cache.has('fresh')).toBe(true);
    cache.set('stale', 2);
    now = 11_001; // both entries have outlived their TTL
    expect(cache.peek('stale')).toBeUndefined();
    expect(cache.has('fresh')).toBe(false);
    // Iterators prune expired entries before exposing them.
    expect(cache.keys()).toEqual([]);
    expect(cache.values()).toEqual([]);
    expect(cache.entries()).toEqual([]);
  });

  it('keeps live entries visible through the iterators', () => {
    const cache = new LruTtlCache<string, number>(4, 60_000, () => 1000);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.keys().sort()).toEqual(['a', 'b']);
    expect(cache.values().sort()).toEqual([1, 2]);
    expect(cache.entries().map(([key]) => key).sort()).toEqual(['a', 'b']);
  });
});

describe('crypto refusal paths', () => {
  it('compares hex strings in constant shape and refuses unequal lengths', () => {
    expect(safeHexEqual('deadbeef', 'deadbeef')).toBe(true);
    expect(safeHexEqual('deadbeef', 'deadbeee')).toBe(false);
    expect(safeHexEqual('short', 'much-longer-value')).toBe(false);
    expect(safeHexEqual('', '')).toBe(true);
  });

  it('refuses a password against a stored hash that is not argon2', async () => {
    // Not a $argon2 prefix: refused after the flat-time dummy hash, never against user input.
    expect(await verifyPassword('Whatever!2026', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('Whatever!2026', '$2b$10$bcryptstylehash')).toBe(false);
  });

  it('refuses a password against a corrupt argon2 hash', async () => {
    // Well-formed prefix, unreadable payload: the verifier throws and the wrapper refuses.
    expect(await verifyPassword('Whatever!2026', '$argon2id$v=19$corrupted')).toBe(false);
  });

  it('describes the runtime without leaking parameters', () => {
    expect(cryptoRuntimeInfo()).toEqual({ hasher: 'Bun.CryptoHasher', passwordAlgorithm: 'argon2id' });
  });

  it('caps randomInt at the requested bound', () => {
    expect(randomInt(0)).toBe(0);
    expect(randomInt(-5)).toBe(0);
    expect(randomInt(1)).toBe(0);
    for (let i = 0; i < 64; i += 1) {
      const value = randomInt(6);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(6);
    }
  });

  it('splits session tokens only when both halves are well-formed', () => {
    const material = { sessionId: 'ses_abcdefghij', secret: 's3cretvalue0123456789abc' };
    expect(splitSessionToken(`${material.sessionId}.${material.secret}`)).toEqual(material);
    expect(splitSessionToken(undefined)).toBe(null);
    expect(splitSessionToken('')).toBe(null);
    expect(splitSessionToken('short.validsecretvalue1234')).toBe(null);
    expect(splitSessionToken('validsessionid.too short!')).toBe(null);
    expect(splitSessionToken('validsessionid.validsecretvalue1234.extra')).toBe(null);
  });

  it('parses cookie headers and skips the pairs that are not cookies', () => {
    expect(parseCookieHeader(undefined)).toEqual({});
    expect(parseCookieHeader('a=1; b=2')).toEqual({ a: '1', b: '2' });
    // The leading-space pair yields an empty key, which the app tolerates; the pair without '=' is skipped.
    expect(parseCookieHeader('noequals; =nokey; k=')).toEqual({ '': 'nokey', k: '' });
    // A value that is not valid percent-encoding is dropped, not thrown for.
    expect(parseCookieHeader('good=1; broken=%E0%A4%A')).toEqual({ good: '1' });
    expect(parseCookieHeader('encoded=%D8%B3%D9%84%D8%A7%D9%85')).toEqual({ encoded: 'سلام' });
  });
});

describe('domain state refusal paths', () => {
  it('refuses transitions from an unknown role', () => {
    expect(transitionSos('pending', 'cancel', 'audience')).toEqual({ ok: false, reason: 'unknown role' });
  });

  it('indexes mission stages and reports unknown stages as -1', () => {
    expect(missionStageIndex('on_the_way')).toBe(1);
    expect(missionStageIndex('not_a_stage')).toBe(-1);
  });

  it('knows a terminal SOS can no longer be cancelled', () => {
    expect(canCancelSos('pending')).toBe(true);
    expect(canCancelSos('in_progress')).toBe(true);
    expect(canCancelSos('completed')).toBe(false);
    expect(canCancelSos('cancelled')).toBe(false);
  });
});

describe('tile math edges', () => {
  it('rejects non-integer and negative tile coordinates', () => {
    expect(validateTile(-1, 0, 0)).toBe(null);
    expect(validateTile(1.5, 0, 0)).toBe(null);
    expect(validateTile(10, -1, 0)).toBe(null);
    expect(validateTile(10.5, 0, 0)).toBe(null);
  });

  it('renders the canonical tile key', () => {
    expect(tileKey({ z: 14, x: 1000, y: 1000 })).toBe('14/1000/1000');
  });

  it('returns null for an empty point set instead of InfiniteBounds', () => {
    expect(boundingBox([])).toBe(null);
  });
});

describe('validator refusal paths', () => {
  it('rejects text that is not a string, empty, overlong or carrying control characters', () => {
    expect(() => parse(text({ min: 1 }), 42, 'body')).toThrow('Invalid request.');
    expect(() => parse(text({ min: 1 }), '   ', 'body')).toThrow('Invalid request.');
    expect(() => parse(text({ max: 3 }), 'toolong', 'body')).toThrow('Invalid request.');
    expect(() => parse(text({ min: 1 }), 'bell\u0007', 'body')).toThrow('Invalid request.');
  });

  it('rejects numbers that are not finite or not integers', () => {
    expect(() => parse(number({ min: 0 }), 'abc', 'body')).toThrow('Invalid request.');
    expect(() => parse(number({ integer: true }), 3.5, 'body')).toThrow('Invalid request.');
    expect(() => parse(number({ min: 0 }), Number.POSITIVE_INFINITY, 'body')).toThrow('Invalid request.');
  });

  it('rejects arrays that are not arrays or exceed their bounds', () => {
    expect(() => parse(array(number(), { min: 1 }), 'nope', 'body')).toThrow('Invalid request.');
    expect(() => parse(array(number(), { min: 1 }), [], 'body')).toThrow('Invalid request.');
    expect(() => parse(array(number(), { max: 2 }), [1, 2, 3], 'body')).toThrow('Invalid request.');
  });

  it('rejects a shape body that is not a plain object', () => {
    expect(() => parse(shape({ a: text() }), ['a'], 'body')).toThrow('Invalid request.');
    expect(() => parse(shape({ a: text() }), 'string', 'body')).toThrow('Invalid request.');
    expect(() => parse(shape({ a: text() }), null, 'body')).toThrow('Invalid request.');
  });

  it('omits absent optional keys and fills them only through withDefault', () => {
    const optionalOnly = shape({ required: text({ min: 1 }), maybe: optional(text({ min: 1 })) });
    expect(parse(optionalOnly, { required: 'x' }, 'body')).toEqual({ required: 'x' });

    const withFallback = shape({ required: text({ min: 1 }), maybe: withDefault(text({ min: 1 }), 'fallback') });
    expect(parse(withFallback, { required: 'x' }, 'body')).toEqual({ required: 'x', maybe: 'fallback' });
    expect(parse(withFallback, { required: 'x', maybe: 'value' }, 'body')).toEqual({ required: 'x', maybe: 'value' });
  });

  it('withDefault falls back on undefined and null but keeps real values', () => {
    expect(withDefault(text({ min: 1 }), 'fb')(undefined, 'field')).toBe('fb');
    expect(withDefault(text({ min: 1 }), 'fb')(null, 'field')).toBe('fb');
    expect(withDefault(text({ min: 1 }), 'fb')('real', 'field')).toBe('real');
  });
});

describe('rate limiter defaults', () => {
  it('consumes a single token per call and defaults the bucket window', () => {
    const clock = (): number => 1_000_000;
    const limiters = new RateLimiters(clock);
    const rule = { name: 'test-default', capacity: 2, refillPerSecond: 1 }; // no windowMs: the default window applies
    expect(limiters.consume(rule, 'k').allowed).toBe(true);
    expect(limiters.consume(rule, 'k').allowed).toBe(true);
    // Third call exhausts the bucket and reports a retry delay.
    expect(limiters.consume(rule, 'k').allowed).toBe(false);
  });
});

describe('router edge paths', () => {
  it('generates an operation summary and api tag for routes that declare neither', () => {
    const router = new Router<object>();
    router.add({ method: 'GET', path: '/_public/thing', auth: 'none', handler: () => ok({ ok: true }) });
    const doc = router.openapi('Test API', '1.0.0') as any;
    const operation = doc.paths['/_public/thing'].get;
    expect(operation.summary).toBe('GET /_public/thing');
    expect(operation.tags).toEqual(['api']);
    expect(operation.security).toEqual([]);
  });

  it('answers raw without options and refuses a percent-broken path parameter', () => {
    const bare = raw('plain', 'text/plain');
    expect(bare.status).toBe(200);
    // Raw results are not JSON envelopes: the discriminant is the raw body itself.
    expect('raw' in bare).toBe(true);
    expect('data' in bare).toBe(false);
    expect(bare.contentType).toBe('text/plain');

    const router = new Router<object>();
    router.add({ method: 'GET', path: '/_user/sos/:id', auth: 'user', handler: () => ok({ ok: true }) });
    expect(router.match('GET', '/_user/sos/%E0%A4%A')).toBe(null);
    expect(router.match('GET', '/_user/sos/abc123')?.params).toEqual({ id: 'abc123' });
  });
});

describe('repository event append edges', () => {
  it('normalises a null payload to an empty object on write and on return', () => {
    const database = new Database(':memory:');
    database.exec(`CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      audience_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    const repo = new Repository(database);
    const event = repo.appendEvent('test.edge', null, ['all']);
    expect(event.payload).toEqual({});
    const stored = database.prepare('SELECT payload_json FROM events WHERE type=?').get('test.edge') as { payload_json: string };
    expect(JSON.parse(stored.payload_json)).toEqual({});
  });
});

describe('repository corruption tolerance', () => {
  function seedCorruptEvents(): Repository {
    const database = new Database(':memory:');
    database.exec(`CREATE TABLE events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      audience_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`);
    database.exec(`CREATE TABLE location_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      accuracy REAL NOT NULL,
      heading REAL,
      speed REAL,
      recorded_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL
    )`);
    const insert = database.prepare('INSERT INTO events(type,payload_json,audience_json,created_at) VALUES(?,?,?,?)');
    // Not JSON at all — the audience read must fail and the row must vanish quietly.
    insert.run('e.broken-audience', '{}', 'not-json', '2026-11-01T00:00:00.000Z');
    // Valid JSON that is not a string array.
    insert.run('e.scalar-audience', '{}', '"role:user"', '2026-11-01T00:00:01.000Z');
    // Wrong audience for the caller.
    insert.run('e.other-audience', '{}', JSON.stringify(['role:admin']), '2026-11-01T00:00:02.000Z');
    // Broken payload with a good audience — must surface with an empty object.
    insert.run('e.broken-payload', '{{{', JSON.stringify(['user:usr_guard']), '2026-11-01T00:00:03.000Z');
    // Well-formed for the caller.
    insert.run('e.good', JSON.stringify({ hello: 'world' }), JSON.stringify(['user:usr_guard', 'all']), '2026-11-01T00:00:04.000Z');
    return new Repository(database);
  }

  it('drops unreadable or irrelevant rows without failing the sync', () => {
    const repo = seedCorruptEvents();
    const events = repo.eventsSince(0, { userId: 'usr_guard', role: 'user', sessionId: 'sess_guard' }, 50);
    // Only the two events addressed to this caller survive, and the broken payload is tolerated.
    expect(events.map((event) => event.type)).toEqual(['e.broken-payload', 'e.good']);
    expect(events[0].payload).toEqual({});
    expect(events[1].payload).toEqual({ hello: 'world' });
  });

  it('clamps the sync cursor and purges with floored bounds', () => {
    const repo = seedCorruptEvents();
    expect(repo.eventsSince(Number.NaN, { userId: 'usr_guard', role: 'user', sessionId: 'sess_guard' }).length).toBe(2);
    // Cutting between rows removes exactly the older ones (ids 1 and 2); fractional bounds are floored.
    expect(repo.purgeEventsBefore(3.9)).toBe(2);
    expect(repo.eventsSince(0, { userId: 'usr_guard', role: 'user', sessionId: 'sess_guard' }).map((event) => event.type))
      .toEqual(['e.broken-payload', 'e.good']);
    // Time-based purge removes the rest of the log up to the bound.
    expect(repo.purgeEventsOlderThan('2026-11-02T00:00:00.000Z')).toBe(3);
    repo.database.prepare('INSERT INTO location_points(user_id,latitude,longitude,accuracy,recorded_at,created_at) VALUES(?,?,?,?,?,?)')
      .run('usr_guard', 35.7, 51.3, 10, 1000, 1000);
    repo.database.prepare('INSERT INTO location_points(user_id,latitude,longitude,accuracy,recorded_at,created_at) VALUES(?,?,?,?,?,?)')
      .run('usr_guard', 35.7, 51.3, 10, 2000, 2000);
    expect(repo.purgeLocationPointsBefore(1500)).toBe(1);
  });

  it('refuses to count tables whose names are not plain identifiers', () => {
    const repo = seedCorruptEvents();
    expect(() => repo.count('events; DROP TABLE users; --')).toThrow('Invalid table name');
    expect(() => repo.count('Users')).toThrow('Invalid table name');
    expect(repo.count('events')).toBe(5);
  });
});

describe('application lifecycle and static fallbacks', () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server?.close();
  });

  it('answers a preflight OPTIONS with an empty 204', async () => {
    const response = await apiFetch(server, '/_user/me', { method: 'OPTIONS' });
    expect(response.status).toBe(204);
    expect(response.text).toBe('');
  });

  it('refuses a second listen while already bound', async () => {
    await expect(server.app.listen(0, '127.0.0.1')).rejects.toThrow('The server is already listening.');
  });

  it('runs the maintenance jobs and stops them cleanly', async () => {
    const captured: Array<{ fn: () => void; delay: number }> = [];
    const original = globalThis.setInterval;
    vi.stubGlobal('setInterval', (fn: () => void, delay?: number) => {
      captured.push({ fn, delay: delay ?? 0 });
      return original(fn, 86_400_000);
    });
    let jobsApp: TestServer['app'] | null = null;
    try {
      const { createApp } = await import('../src/server/app.ts');
      jobsApp = await createApp({
        environment: 'test', host: '127.0.0.1', port: 0, databasePath: ':memory:',
        dataDir: './data', seedDemoUsers: false, startJobs: true,
        allowedOrigins: [], cookieSecure: false, trustProxy: false
      });
      await jobsApp.listen(0, '127.0.0.1');
      // Bun's runtime uses setInterval too; the maintenance jobs are the two with our delays.
      expect(jobsApp.context.jobs).toHaveLength(2);
      const fast = captured.find((job) => job.delay === 1_000);
      const slow = captured.find((job) => job.delay === 60_000);
      expect(fast).toBeTruthy();
      expect(slow).toBeTruthy();
      // Both sweeps must complete without a throw, including the maintenance pass.
      expect(() => fast!.fn()).not.toThrow();
      expect(() => slow!.fn()).not.toThrow();
      jobsApp.stopJobs();
      expect(jobsApp.context.jobs).toHaveLength(0);
    } finally {
      vi.unstubAllGlobals();
      if (jobsApp) await jobsApp.close();
    }
  });

  it('serves an existing asset from the tile cache on the second read', async () => {
    const first = await apiFetch(server, '/_public/map/tiles/14/1000/1000.svg?v=test');
    expect(first.status).toBe(200);
    const second = await apiFetch(server, '/_public/map/tiles/14/1000/1000.svg?v=test');
    expect(second.status).toBe(200);
    expect(second.headers.get('etag')).toBe(first.headers.get('etag'));
    server.app.context.services.map.clear();
  });

  it('renders the SPA shell for an extensionless fallback path that does not exist', async () => {
    const response = await apiFetch(server, '/_user/no-such-page', {
      headers: { Accept: 'text/html' }
    });
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<!doctype html>/i);
    expect(response.headers.get('x-content-type-options')).toBe('nosniff');
  });

  it('renders the SPA shell when the asset path itself is invalid', async () => {
    // The percent-decoding of the path fails inside the file resolver; the fallback rewrites to
    // the shell rather than leaking the resolver error to the client.
    const response = await apiFetch(server, '/_user/%E0%A4%A', {
      headers: { Accept: 'text/html' }
    });
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/<!doctype html>/i);
  });

  it('answers 404 for invalid static paths when no fallback applies', async () => {
    const badPercent = await apiFetch(server, '/%E0%A4%A');
    expect(badPercent.status).toBe(404);
    const nullByte = await apiFetch(server, '/%00');
    expect(nullByte.status).toBe(404);
    const hidden = await apiFetch(server, '/%2Ehidden');
    expect(hidden.status).toBe(404);
  });

  it('serves an existing file twice so the mtime-matched cache path is exercised', async () => {
    const first = await apiFetch(server, '/app.css');
    expect(first.status).toBe(200);
    const second = await apiFetch(server, '/app.css');
    expect(second.status).toBe(200);
    expect(second.headers.get('etag')).toBe(first.headers.get('etag'));
  });
});

describe('error envelope primitives', () => {
  it('serialises typed errors without a details key when none was supplied', () => {
    const typed = badRequest('bad input');
    expect(typed.status).toBe(400);
    expect(typed.code).toBe('INVALID_INPUT');
    const result = publicError(typed, 'req_edge');
    expect(result.status).toBe(400);
    expect(result.body.error).toEqual({ code: 'INVALID_INPUT', message: 'bad input' });
    expect(result.headers).toBeUndefined();
    expect(isHttpError(typed)).toBe(true);
    expect(isHttpError(new Error('plain'))).toBe(false);
  });

  it('builds the default error factories the routes rely on', () => {
    expect(unauthorized().message).toBe('Authentication required');
    expect(unauthorized().code).toBe('UNAUTHORIZED');
    expect(forbidden().message).toBe('Permission denied');
    expect(notFound().message).toBe('Resource not found');
    expect(conflict().message).toBe('Conflict');
    const limited = tooMany();
    expect(limited.details).toEqual({ retryAfterSeconds: 1 });
    expect(limited.headers).toEqual({ 'Retry-After': '1' });
    expect(payloadTooLarge().status).toBe(413);
    expect(payloadTooLarge().code).toBe('PAYLOAD_TOO_LARGE');
    expect(unsupportedMedia().status).toBe(415);
    expect(unsupportedMedia().code).toBe('UNSUPPORTED_MEDIA_TYPE');
    expect(badRequest('with-details', { field: 'x' }).details).toEqual({ field: 'x' });
  });

  it('renders an internal error to the public envelope and reports it to the console', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const result = publicError(new Error('boom'), 'req_internal');
      expect(spy).toHaveBeenCalledOnce();
      expect(result.status).toBe(500);
      expect(result.body).toEqual({
        ok: false,
        requestId: 'req_internal',
        error: { code: 'INTERNAL', message: 'The request could not be completed.' }
      });
    } finally {
      spy.mockRestore();
    }
  });
});

describe('HTTP response primitives', () => {
  const baseConfig = {
    environment: 'test' as const,
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    dataDir: './data',
    adminUsername: 'admin',
    adminPassword: 'Correct-Horse-2026',
    seedDemoUsers: false,
    allowedOrigins: [],
    cookieSecure: false,
    trustProxy: false
  };

  it('hardens the production header set and omits X-Frame-Options when ancestors are framed', () => {
    const config = loadConfig({ ...baseConfig, environment: 'production', frameAncestors: ['https://parent.example'] });
    const request = new Request('http://test.example/_user/me');
    const headers = baseHeaders(request, config);
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
    expect(headers['Content-Security-Policy']).toContain('frame-ancestors https://parent.example');
    expect(headers['X-Frame-Options']).toBeUndefined();
  });

  it('denies framing and keeps the default CSP for same-site deployments', () => {
    const config = loadConfig(baseConfig);
    const headers = baseHeaders(new Request('http://test.example/_user/me', { headers: { Host: 'test.example' } }), config);
    expect(headers['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(headers['X-Frame-Options']).toBe('DENY');
    expect(headers['Strict-Transport-Security']).toBeUndefined();
    expect(headers.Vary).toBe('Accept-Encoding');
  });

  it('echoes a trusted origin and varies on it', () => {
    const config = loadConfig(baseConfig);
    const request = new Request('http://test.example/_user/me', { headers: { Host: 'test.example', Origin: 'http://test.example' } });
    const headers = baseHeaders(request, config);
    expect(headers['Access-Control-Allow-Origin']).toBe('http://test.example');
    expect(headers['Access-Control-Allow-Credentials']).toBe('true');
    expect(headers.Vary).toBe('Origin, Accept-Encoding');
  });

  it('preserves an explicit per-response cache policy and stamps the request id', () => {
    const config = loadConfig(baseConfig);
    const response = new Response('ok', { headers: { 'Cache-Control': 'public, max-age=60' } });
    const decorated = withBaseHeaders(new Request('http://test.example/app.css'), response, config, 'req_css');
    expect(decorated.headers.get('Cache-Control')).toBe('public, max-age=60');
    expect(decorated.headers.get('X-Request-Id')).toBe('req_css');
    expect(decorated.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });

  it('refuses cross-site mutations and foreign origins before any service runs', () => {
    const config = loadConfig(baseConfig);
    const mk = (headers: Record<string, string>) => new Request('http://test.example/_user/me', { method: 'POST', headers: { Host: 'test.example', ...headers } });
    expect(() => assertSafeMutation(mk({ 'sec-fetch-site': 'cross-site', origin: 'https://evil.example' }), config))
      .toThrow('Cross-site request rejected.');
    expect(() => assertSafeMutation(mk({ origin: 'https://evil.example' }), config))
      .toThrow('Origin is not allowed.');
    expect(() => assertSafeMutation(mk({ origin: 'http://test.example' }), config)).not.toThrow();
    // No site hint and no origin header: nothing to verify, let it through.
    expect(() => assertSafeMutation(mk({}), config)).not.toThrow();
  });

  it('rejects a declared body over the byte budget before reading anything', async () => {
    const request = new Request('http://test.example/', {
      method: 'POST',
      headers: { 'content-length': '5000', 'content-type': 'application/json' },
      body: '{}'
    });
    await expect(readJsonBody(request, 100)).rejects.toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects a streamed body that grows past the byte budget mid-read', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('x'.repeat(2048)));
        controller.close();
      }
    });
    const request = new Request('http://test.example/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: stream,
      // @ts-expect-error Bun streams request bodies without the undici duplex flag
      duplex: 'half'
    });
    await expect(readJsonBody(request, 100)).rejects.toMatchObject({ status: 413, code: 'PAYLOAD_TOO_LARGE' });
  });

  it('rejects non-JSON media types and malformed JSON with 415', async () => {
    const textPlain = new Request('http://test.example/', { method: 'POST', headers: { 'content-type': 'text/plain' }, body: '{}' });
    await expect(readJsonBody(textPlain, 1024)).rejects.toMatchObject({ status: 415, code: 'UNSUPPORTED_MEDIA_TYPE' });

    const broken = new Request('http://test.example/', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{nope' });
    await expect(readJsonBody(broken, 1024)).rejects.toMatchObject({ status: 415, message: 'Body is not valid JSON.' });

    const missingType = new Request('http://test.example/', { method: 'POST', body: '{"a":1}' });
    await expect(readJsonBody(missingType, 1024)).rejects.toMatchObject({ status: 415 });

    const empty = new Request('http://test.example/', { method: 'POST' });
    await expect(readJsonBody(empty, 1024)).resolves.toEqual({});

    const valid = new Request('http://test.example/', { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: '{"ok":true}' });
    await expect(readJsonBody(valid, 1024)).resolves.toEqual({ ok: true });
  });

  it('answers a conditional revalidation with a 304 and no body', async () => {
    const request = new Request('http://test.example/app.css', { headers: { 'if-none-match': '"other", "abc123"' } });
    const response = bufferResponse(request, 200, new TextEncoder().encode('body'), { etag: '"abc123"', contentType: 'text/css' });
    expect(response.status).toBe(304);
    expect(response.headers.get('Content-Length')).toBe('0');
    expect(await response.text()).toBe('');
  });

  it('decorates a bare response when no options are given', () => {
    const response = bufferResponse(new Request('http://test.example/'), 418, new TextEncoder().encode('teapot'));
    expect(response.status).toBe(418);
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('appends repeated headers given as arrays and skips compression for small bodies', () => {
    const response = bufferResponse(new Request('http://test.example/'), 200, new TextEncoder().encode('hi'), {
      headers: { 'Set-Cookie': ['a=1; Path=/', 'b=2; Path=/'] }
    });
    const setCookies = response.headers.getSetCookie();
    expect(setCookies).toEqual(['a=1; Path=/', 'b=2; Path=/']);
    expect(response.headers.get('Content-Encoding')).toBeNull();
    expect(response.headers.get('Content-Type')).toBe('application/octet-stream');
  });

  it('gzip-compresses large compressible bodies when the client accepts it', () => {
    const body = new TextEncoder().encode(`{"payload":"${'x'.repeat(2048)}"}`);
    const request = new Request('http://test.example/', { headers: { 'accept-encoding': 'br, gzip;q=0.8' } });
    const compressed = bufferResponse(request, 200, body, { contentType: 'application/json' });
    expect(compressed.headers.get('Content-Encoding')).toBe('gzip');
    expect(Number(compressed.headers.get('Content-Length'))).toBeLessThan(body.byteLength);

    const plain = bufferResponse(new Request('http://test.example/'), 200, body, { contentType: 'application/json' });
    expect(plain.headers.get('Content-Encoding')).toBeNull();
    expect(Number(plain.headers.get('Content-Length'))).toBe(body.byteLength);

    const optedOut = bufferResponse(request, 200, body, { contentType: 'application/json', compress: false });
    expect(optedOut.headers.get('Content-Encoding')).toBeNull();
  });

  it('writes HEAD responses with the real length but an empty body', async () => {
    const response = bufferResponse(new Request('http://test.example/', { method: 'HEAD' }), 200, new TextEncoder().encode('hello'), {});
    expect(response.headers.get('Content-Length')).toBe('5');
    expect(await response.text()).toBe('');
  });

  it('uses the latin1 view of binary bodies for the ETag and the text defaults', async () => {
    expect(strongEtag(new Uint8Array([255, 0, 16, 128]))).toMatch(/^"[0-9a-f]{24}"$/);
    expect(strongEtag('same-bytes')).toMatch(/^"[0-9a-f]{24}"$/);
    const text = textResponse(new Request('http://test.example/'), 200, 'pong');
    expect(text.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
    expect(text.status).toBe(200);
  });
});

describe('share expiry maintenance', () => {
  let edgeServer: TestServer;

  beforeAll(async () => {
    edgeServer = await createTestServer();
  });

  afterAll(async () => {
    await edgeServer?.close();
  });

  it('revokes elapsed shares exactly once and emits the ended event', () => {
    const context = edgeServer.app.context;
    const owners = context.repo.all<{ id: string }>('SELECT id FROM users WHERE active = 1 ORDER BY id LIMIT 2');
    const ownerId = owners[0]!.id;
    const recipientId = owners[1]!.id;
    context.repo.run(
      `INSERT INTO location_shares(id,owner_id,recipient_id,kind,duration_seconds,expires_at,history_from,history_to,created_at,revoked_at)
       VALUES(?,?,?,?,?,?,?,?,?,NULL)`,
      'shr_expired_edge', ownerId, recipientId, 'live', 3600, Date.now() - 1000, null, null, Date.now() - 10_000
    );
    const first = context.services.location.expireShares();
    expect(first).toBeGreaterThanOrEqual(1);
    // The second sweep finds nothing new to revoke.
    expect(context.services.location.expireShares()).toBe(0);
    const events = context.repo.eventsSince(0, { userId: ownerId, role: 'user', sessionId: 'sess_edge' }, 100);
    expect(events.some((event) => event.type === 'location.share.ended')).toBe(true);
  });
});

describe('map tile rendering edges', () => {
  it('renders the SPA-time tile key and refuses invalid coordinates', () => {
    expect(mapTileKey(14, 10533, 6459)).toBe('14/10533/6459');
    expect(mapTileKey(-1, 0, 0)).toBe('invalid');
    expect(mapTileKey(3.5, 0, 0)).toBe('invalid');
    expect(mapTileKey(0, 0, 1)).toBe('invalid');
  });

  it('draws the Persian street labels only for tiles that contain them', () => {
    // Deterministic vector tiles: the tile covering the دانشگاه label must carry it, an
    // out-of-bounds neighbour must validate to null instead of rendering a corrupt SVG.
    const labeled = renderMapTile(14, 10533, 6459);
    expect(labeled).toContain('bb-map-label');
    expect(labeled).toContain('دانشگاه');
    expect(renderMapTile(14, 1, 1)).toContain('<svg');
    expect(renderMapTile(14, 99_999, 0)).toBe(null);
  });
});

describe('validator acceptance paths without a path argument', () => {
  it('accepts validators called with no field path at all', () => {
    // Each factory below defaults the path argument; every one of them must still validate.
    expect(text({ min: 1 })('ok')).toBe('ok');
    expect(number({ min: 0 })(3)).toBe(3);
    expect(boolean()(true)).toBe(true);
    expect(oneOf(['a', 'b'] as const)('a')).toBe('a');
    expect(array(number())([1, 2])).toEqual([1, 2]);
    expect(password('Str0ngPassword')).toBe('Str0ngPassword');
    expect(loginSecret('whatever-goes')).toBe('whatever-goes');
    expect(displayText()('x')).toBe('x');
    expect(shape({ a: text({ min: 1 }) })({ a: 'x' })).toEqual({ a: 'x' });
  });

  it('accepts a null-prototype object as a plain object body', () => {
    const body = Object.create(null);
    body.a = 'x';
    expect(parse(shape({ a: text({ min: 1 }) }), body, 'body')).toEqual({ a: 'x' });
  });

  it('keeps the first value when a query string carries a repeated key', () => {
    const parsed = queryObject(new URLSearchParams('a=first&a=second&b=only'));
    expect(parsed).toEqual({ a: 'first', b: 'only' });
  });
});
