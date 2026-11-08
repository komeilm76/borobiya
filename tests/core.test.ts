import { describe, expect, it } from 'vitest';
import { LruTtlCache } from '../src/server/core/cache.ts';
import {
  hashPassword,
  parseCookieHeader,
  randomToken,
  splitSessionToken,
  tokenHash,
  verifyPassword
} from '../src/server/core/crypto.ts';
import { loadConfig, originAllowed, parseDotEnv } from '../src/server/core/config.ts';
import { RateLimiters } from '../src/server/core/rate-limit.ts';
import { boolean, number, oneOf, parse, shape, text } from '../src/server/core/validate.ts';
import { boundingBox, isValidPoint, tileBounds, validateTile } from '../src/server/domain/geo.ts';
import { isTerminal, sosStageIndex, transitionMission, transitionSos } from '../src/server/domain/state.ts';
import { MAP_CENTER, MAP_ZOOM, renderMapTile } from '../src/server/domain/map.ts';
import {
  formatDistance,
  haversineMeters,
  toPersianDigits,
  visibleTileRange,
  worldCoordinate
} from '../src/shared/geo.ts';
import { MISSION_STATUS, ROLES, SOS_STATUS } from '../src/shared/protocol.ts';

describe('core primitives', () => {
  it('strict validators accept, coerce and reject exactly once', () => {
    const schema = shape({
      name: text({ min: 2, max: 12 }),
      age: number({ min: 1, max: 120, integer: true }),
      role: oneOf(['user', 'admin'] as const),
      active: boolean()
    });
    const parsed = parse(schema, { name: '  Ava  ', age: '31', role: 'user', active: 'true' }, 'body');
    expect(parsed).toEqual({ name: 'Ava', age: 31, role: 'user', active: true });
    expect(() => parse(schema, { name: 'A', age: 31, role: 'user', active: true }, 'body')).toThrow();
    expect(() => parse(schema, { name: 'Ava', age: 31, role: 'user', active: true, injected: 1 }, 'body')).toThrow();
  });

  it('LRU TTL cache is bounded, deterministic and expires without timers', () => {
    let now = 1000;
    const cache = new LruTtlCache<string, number>(2, 10, () => now);
    cache.set('a', 1);
    cache.set('b', 2);
    expect(cache.get('a')).toBe(1);
    cache.set('c', 3);
    expect(cache.size).toBe(2);
    expect(cache.peek('b')).toBeUndefined();
    now = 1010;
    expect(cache.get('a')).toBeUndefined();
    expect(cache.prune() >= 1).toBe(true);
    expect(cache.stats().max).toBe(2);
  });

  it('token bucket limiter refills at a controlled rate', () => {
    let now = 0;
    const limiters = new RateLimiters(() => now);
    const rule = { name: 'unit', capacity: 2, refillPerSecond: 1, windowMs: 60_000 };
    expect(limiters.consume(rule, 'client').allowed).toBe(true);
    expect(limiters.consume(rule, 'client').allowed).toBe(true);
    const blocked = limiters.consume(rule, 'client');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    now = 1000;
    expect(limiters.consume(rule, 'client').allowed).toBe(true);
  });

  it('password hashing, token hashing and cookies are safe', async () => {
    const hash = await hashPassword('CorrectHorse!2026');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword('CorrectHorse!2026', hash)).toBe(true);
    expect(await verifyPassword('wrong-password-1', hash)).toBe(false);
    expect(tokenHash('same-token')).not.toBe('same-token');
    const token = randomToken(24);
    expect(splitSessionToken(`session_1.${token}`)?.secret).toBe(token);
    expect(parseCookieHeader('bb_session=a.b; theme=dark').bb_session).toBe('a.b');
  });

  it('shared geometry helpers produce stable coordinates and ranges', () => {
    const tehran = { latitude: 35.7219, longitude: 51.3347 };
    const nearby = { latitude: 35.7229, longitude: 51.3347 };
    expect(haversineMeters(tehran, nearby)).toBeGreaterThan(100);
    expect(haversineMeters(tehran, nearby)).toBeLessThan(120);
    const world = worldCoordinate(tehran.latitude, tehran.longitude, MAP_ZOOM);
    expect(world.x).toBeGreaterThan(0);
    expect(world.y).toBeGreaterThan(0);
    const range = visibleTileRange(tehran, MAP_ZOOM, 393, 852);
    expect(range.xMax).toBeGreaterThanOrEqual(range.xMin);
    expect(range.yMax).toBeGreaterThanOrEqual(range.yMin);
    expect(isValidPoint({ latitude: 91, longitude: 10 })).toBe(false);
    expect(validateTile(14, 2 ** 14, 0)).toBeNull();
    const box = boundingBox([tehran, nearby]);
    expect(box && box.maxLatitude >= box.minLatitude).toBe(true);
    expect(formatDistance(1250)).toMatch(/[۰-۹]/);
    expect(toPersianDigits(2026)).toBe('۲۰۲۶');
  });

  it('tile validation, bounds and offline SVG rendering are deterministic', () => {
    const tile = validateTile(14, 1000, 1000);
    expect(tile).toBeTruthy();
    const bounds = tileBounds(tile!);
    expect(bounds.east).toBeGreaterThan(bounds.west);
    expect(bounds.north).toBeGreaterThan(bounds.south);
    const first = renderMapTile(14, 1000, 1000);
    const second = renderMapTile(14, 1000, 1000);
    expect(first?.startsWith('<svg')).toBe(true);
    expect(first).toBe(second);
    expect(renderMapTile(9, 1, 1)).toBeNull();
    expect(first?.includes(MAP_CENTER.latitude.toString()) || first?.includes('bb-map-land')).toBe(true);
  });

  it('state machines reject impossible transitions and expose stage indices', () => {
    expect(transitionSos(SOS_STATUS.PENDING, 'dispatch', ROLES.ADMIN)).toEqual({ ok: true, next: SOS_STATUS.DISPATCHED });
    expect(transitionSos(SOS_STATUS.COMPLETED, 'dispatch', ROLES.ADMIN).ok).toBe(false);
    expect(transitionSos(SOS_STATUS.PENDING, 'cancel', ROLES.RESPONDER).ok).toBe(false);
    expect(transitionMission(MISSION_STATUS.ON_THE_WAY, 'arrive')).toEqual({ ok: true, next: MISSION_STATUS.ARRIVED });
    expect(sosStageIndex(SOS_STATUS.ACCEPTED)).toBe(2);
    expect(isTerminal(SOS_STATUS.CANCELLED)).toBe(true);
    expect(isTerminal(SOS_STATUS.PENDING)).toBe(false);
  });

  it('configuration enforces explicit origins and safe defaults', () => {
    const config = loadConfig({
      environment: 'test',
      databasePath: ':memory:',
      port: 0,
      allowedOrigins: ['https://*.example.test']
    });
    expect(originAllowed('http://localhost:3000', 'http://localhost:3000', config)).toBe(true);
    expect(originAllowed('https://admin.example.test', 'http://localhost:3000', config)).toBe(true);
    expect(originAllowed('https://attacker.test', 'http://localhost:3000', config)).toBe(false);
    expect(originAllowed(undefined, 'http://localhost:3000', config)).toBe(true);
    expect(() => loadConfig({ environment: 'production', adminPassword: 'change-me-before-production' })).toThrow(/ADMIN_PASSWORD/);
  });
});

describe('test isolation', () => {
  it('runs under NODE_ENV=test so configuration guards cannot read a developer .env', () => {
    // `tests/setup.ts` strips every key named in the repository `.env`, which itself sets
    // NODE_ENV=development. Pinning NODE_ENV before the strip let the strip delete it, so the
    // runner's inherited value decided whether `loadConfig` re-read the file: green on CI, and a
    // different branch locally after any build in the same shell. The value is a contract.
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('does not expose the repository .env settings to suites', () => {
    // `./boro setup` writes these two; neither may reach a test.
    expect(process.env.SEED_DEMO_USERS).toBeUndefined();
    expect(process.env.COOKIE_SECURE).toBeUndefined();
  });
});

describe('dotenv parsing', () => {
  it('reads the format the setup script writes', () => {
    const parsed = parseDotEnv('NODE_ENV=development\nPORT=3000\nADMIN_USERNAME=admin\n');
    expect(parsed).toEqual({ NODE_ENV: 'development', PORT: '3000', ADMIN_USERNAME: 'admin' });
  });

  it('ignores blank lines and comments', () => {
    // `./boro setup` writes a commented header, and a stray blank line must not become a key.
    const parsed = parseDotEnv('# Borobiya local settings\n\n   \nPORT=3000\n#PORT=4000\n');
    expect(parsed).toEqual({ PORT: '3000' });
  });

  it('does not treat a line without = or with = first as a setting', () => {
    const parsed = parseDotEnv('JUST_A_WORD\n=novalue\nOK=yes\n');
    expect(parsed).toEqual({ OK: 'yes' });
  });

  it('strips one layer of matching quotes but keeps inner spaces', () => {
    const parsed = parseDotEnv(`A="quoted value"\nB='single value'\nC= bare value \nD="mismatched'\n`);
    expect(parsed).toEqual({ A: 'quoted value', B: 'single value', C: 'bare value', D: `"mismatched'` });
  });

  it('keeps everything after the first = so values may contain one', () => {
    // A base64 secret or a URL query string must survive intact.
    const parsed = parseDotEnv('DATABASE_URL=postgres://u:p@h/db?a=b\nTOKEN=abc==\n');
    expect(parsed.DATABASE_URL).toBe('postgres://u:p@h/db?a=b');
    expect(parsed.TOKEN).toBe('abc==');
  });

  it('handles CRLF line endings', () => {
    const parsed = parseDotEnv('PORT=3000\r\nHOST=0.0.0.0\r\n');
    expect(parsed).toEqual({ PORT: '3000', HOST: '0.0.0.0' });
  });

  it('returns nothing for an empty file', () => {
    expect(parseDotEnv('')).toEqual({});
  });
});
