import test from 'node:test';
import assert from 'node:assert/strict';
import { LruTtlCache } from '../src/core/cache.ts';
import { hashPassword, verifyPassword, tokenHash, randomToken, splitSessionToken, parseCookieHeader } from '../src/core/crypto.ts';
import { loadConfig, originAllowed } from '../src/core/config.ts';
import { RateLimiters } from '../src/core/rate-limit.ts';
import { parse, shape, text, number, oneOf, boolean } from '../src/core/validate.ts';
import { isValidPoint, validateTile, tileBounds, boundingBox } from '../src/domain/geo.ts';
import { transitionSos, transitionMission, sosStageIndex, isTerminal } from '../src/domain/state.ts';
import { renderMapTile, MAP_CENTER, MAP_ZOOM } from '../src/domain/map.ts';
import { haversineMeters, worldCoordinate, visibleTileRange, formatDistance, toPersianDigits } from '../public/js/geo.js';
import { SOS_STATUS, MISSION_STATUS, ROLES } from '../public/js/protocol.js';

test('strict validators accept, coerce and reject exactly once', () => {
  const schema = shape({ name: text({ min: 2, max: 12 }), age: number({ min: 1, max: 120, integer: true }), role: oneOf(['user', 'admin']), active: boolean() });
  const parsed = parse(schema, { name: '  Ava  ', age: '31', role: 'user', active: 'true' }, 'body');
  assert.deepEqual(parsed, { name: 'Ava', age: 31, role: 'user', active: true });
  assert.throws(() => parse(schema, { name: 'A', age: 31, role: 'user', active: true }, 'body'));
  assert.throws(() => parse(schema, { name: 'Ava', age: 31, role: 'user', active: true, injected: 1 }, 'body'));
});

test('LRU TTL cache is bounded, deterministic and expires without timers', () => {
  let now = 1000;
  const cache = new LruTtlCache<string, number>(2, 10, () => now);
  cache.set('a', 1); cache.set('b', 2);
  assert.equal(cache.get('a'), 1);
  cache.set('c', 3);
  assert.equal(cache.size, 2);
  assert.equal(cache.peek('b'), undefined);
  now = 1010;
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.prune() >= 1, true);
  assert.equal(cache.stats().max, 2);
});

test('token bucket limiter refills at a controlled rate', () => {
  let now = 0;
  const limiters = new RateLimiters(() => now);
  const rule = { name: 'unit', capacity: 2, refillPerSecond: 1, windowMs: 60_000 };
  assert.equal(limiters.consume(rule, 'client').allowed, true);
  assert.equal(limiters.consume(rule, 'client').allowed, true);
  const blocked = limiters.consume(rule, 'client');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterMs > 0);
  now = 1000;
  assert.equal(limiters.consume(rule, 'client').allowed, true);
});

test('password hashing, token hashing and cookies are safe', async () => {
  const hash = await hashPassword('CorrectHorse!2026');
  assert.equal(await verifyPassword('CorrectHorse!2026', hash), true);
  assert.equal(await verifyPassword('wrong-password-1', hash), false);
  assert.notEqual(tokenHash('same-token'), 'same-token');
  const token = randomToken(24);
  assert.equal(splitSessionToken(`session_1.${token}`)?.secret, token);
  assert.equal(parseCookieHeader('bb_session=a.b; theme=dark').bb_session, 'a.b');
});

test('shared geometry helpers produce stable coordinates and ranges', () => {
  const tehran = { latitude: 35.7219, longitude: 51.3347 };
  const nearby = { latitude: 35.7229, longitude: 51.3347 };
  assert.ok(haversineMeters(tehran, nearby) > 100 && haversineMeters(tehran, nearby) < 120);
  const world = worldCoordinate(tehran.latitude, tehran.longitude, MAP_ZOOM);
  assert.ok(world.x > 0 && world.y > 0);
  const range = visibleTileRange(tehran, MAP_ZOOM, 393, 852);
  assert.ok(range.xMax >= range.xMin && range.yMax >= range.yMin);
  assert.equal(isValidPoint({ latitude: 91, longitude: 10 }), false);
  assert.equal(validateTile(14, 2 ** 14, 0), null);
  const box = boundingBox([tehran, nearby]);
  assert.ok(box && box.maxLatitude >= box.minLatitude);
  assert.match(formatDistance(1250), /[۰-۹]/);
  assert.equal(toPersianDigits(2026), '۲۰۲۶');
});

test('tile validation, bounds and offline SVG rendering are deterministic', () => {
  const tile = validateTile(14, 1000, 1000);
  assert.ok(tile);
  const bounds = tileBounds(tile!);
  assert.ok(bounds.east > bounds.west && bounds.north > bounds.south);
  const first = renderMapTile(14, 1000, 1000);
  const second = renderMapTile(14, 1000, 1000);
  assert.ok(first?.startsWith('<svg'));
  assert.equal(first, second);
  assert.equal(renderMapTile(9, 1, 1), null);
  assert.ok(first?.includes(MAP_CENTER.latitude.toString()) || first?.includes('bb-map-land'));
});

test('state machines reject impossible transitions and expose stage indices', () => {
  assert.deepEqual(transitionSos(SOS_STATUS.PENDING, 'dispatch', ROLES.ADMIN), { ok: true, next: SOS_STATUS.DISPATCHED });
  assert.equal(transitionSos(SOS_STATUS.COMPLETED, 'dispatch', ROLES.ADMIN).ok, false);
  assert.equal(transitionSos(SOS_STATUS.PENDING, 'cancel', ROLES.RESPONDER).ok, false);
  assert.deepEqual(transitionMission(MISSION_STATUS.ON_THE_WAY, 'arrive'), { ok: true, next: MISSION_STATUS.ARRIVED });
  assert.equal(sosStageIndex(SOS_STATUS.ACCEPTED), 2);
  assert.equal(isTerminal(SOS_STATUS.CANCELLED), true);
  assert.equal(isTerminal(SOS_STATUS.PENDING), false);
});

test('configuration enforces explicit origins and safe defaults', () => {
  const config = loadConfig({ nodeEnv: 'test', databasePath: ':memory:', port: 0, allowedOrigins: ['https://*.example.test'] });
  assert.equal(originAllowed('http://localhost:3000', 'http://localhost:3000', config), true);
  assert.equal(originAllowed('https://admin.example.test', 'http://localhost:3000', config), true);
  assert.equal(originAllowed('https://attacker.test', 'http://localhost:3000', config), false);
  assert.equal(originAllowed(undefined, 'http://localhost:3000', config), true);
  assert.throws(() => loadConfig({ nodeEnv: 'production', adminPassword: 'change-me-before-production' }), /ADMIN_PASSWORD/);
});
