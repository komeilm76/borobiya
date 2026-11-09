import { describe, expect, it } from 'vitest';
import {
  bearingDegrees,
  clamp,
  formatClock,
  formatDistance,
  formatDuration,
  haversineMeters,
  isStale,
  round,
  toPersianDigits,
  visibleTileRange,
  worldCoordinate
} from '../src/shared/geo.ts';

/**
 * The shared geometry and Persian display helpers are the one module both the Bun server and the
 * Vue client import. They are pure, so these tests pin down exact, checkable properties rather than
 * smoke behaviour: cardinal bearings, polar clamping, Persian digit rendering and the stale-fix
 * policy.
 */

const TEHRAN = { latitude: 35.7219, longitude: 51.3347 };

describe('worldCoordinate', () => {
  it('clamps the poles instead of producing NaN or infinity', () => {
    // The Web Mercator projection is undefined at the poles; the clamp maps lat 90 to the edge of
    // the projection, so a fix near the pole still yields a finite, usable world pixel.
    const north = worldCoordinate(90, 0, 1);
    const south = worldCoordinate(-90, 0, 1);
    const scale = 256 * 2 ** 1;
    expect(Number.isFinite(north.x)).toBe(true);
    expect(Number.isFinite(north.y)).toBe(true);
    expect(north.y).toBeCloseTo(0, 6);
    expect(south.y).toBeCloseTo(scale, 6);
    expect(north.x).toBeCloseTo(scale / 2, 6);
  });

  it('places the antimeridian at the scale edges', () => {
    const scale = 256 * 2 ** 2;
    expect(worldCoordinate(0, -180, 2).x).toBeCloseTo(0, 6);
    expect(worldCoordinate(0, 180, 2).x).toBeCloseTo(scale, 6);
  });

  it('matches the projection origin at the equator and prime meridian', () => {
    const scale = 256 * 2 ** 10;
    const center = worldCoordinate(0, 0, 10);
    expect(center.x).toBeCloseTo(scale / 2, 6);
    expect(center.y).toBeCloseTo(scale / 2, 6);
  });
});

describe('haversineMeters', () => {
  it('is zero for identical points', () => {
    expect(haversineMeters(TEHRAN, TEHRAN)).toBe(0);
  });

  it('measures a known intercity distance', () => {
    // Tehran to Isfahan is roughly 340km over ground; anything outside a generous band is wrong.
    const isfahan = { latitude: 32.6546, longitude: 51.6680 };
    const distance = haversineMeters(TEHRAN, isfahan);
    expect(distance).toBeGreaterThan(320_000);
    expect(distance).toBeLessThan(360_000);
  });
});

describe('visibleTileRange', () => {
  it('covers the viewport, both at detail and at world scale', () => {
    const range = visibleTileRange(TEHRAN, 14, 393, 852);
    expect(range.xMax).toBeGreaterThanOrEqual(range.xMin);
    expect(range.yMax).toBeGreaterThanOrEqual(range.yMin);
    // The range must actually contain the centre tile.
    const center = worldCoordinate(TEHRAN.latitude, TEHRAN.longitude, 14);
    expect(Math.floor(center.x / 256)).toBeGreaterThanOrEqual(range.xMin);
    expect(Math.floor(center.x / 256)).toBeLessThanOrEqual(range.xMax);
    expect(Math.floor(center.y / 256)).toBeGreaterThanOrEqual(range.yMin);
    expect(Math.floor(center.y / 256)).toBeLessThanOrEqual(range.yMax);
  });
});

describe('bearingDegrees', () => {
  it('points due north, east, south and west', () => {
    const origin = TEHRAN;
    expect(bearingDegrees(origin, { latitude: origin.latitude + 0.5, longitude: origin.longitude })).toBeCloseTo(0, 1);
    // A great-circle bearing due east is not exactly 90° away from the equator; 89.85° is correct.
    expect(bearingDegrees(origin, { latitude: origin.latitude, longitude: origin.longitude + 0.5 })).toBeCloseTo(90, 0);
    expect(bearingDegrees(origin, { latitude: origin.latitude - 0.5, longitude: origin.longitude })).toBeCloseTo(180, 1);
    expect(bearingDegrees(origin, { latitude: origin.latitude, longitude: origin.longitude - 0.5 })).toBeCloseTo(270, 0);
  });

  it('always returns a value in [0, 360)', () => {
    const far = { latitude: 36.0, longitude: 52.5 };
    const bearing = bearingDegrees(TEHRAN, far);
    expect(bearing).toBeGreaterThanOrEqual(0);
    expect(bearing).toBeLessThan(360);
    // A point to the north-east must land in the first quadrant.
    expect(bearing).toBeGreaterThan(0);
    expect(bearing).toBeLessThan(90);
    // A point to the south-east lands in the second quadrant.
    const southEast = bearingDegrees(TEHRAN, { latitude: 34.0, longitude: 52.5 });
    expect(southEast).toBeGreaterThan(90);
    expect(southEast).toBeLessThan(180);
  });
});

describe('isStale', () => {
  const now = 1_800_000_000_000;

  it('rejects a non-finite fix', () => {
    expect(isStale(Number.NaN, now)).toBe(true);
    expect(isStale(Number.POSITIVE_INFINITY, now)).toBe(true);
  });

  it('accepts a fresh fix and rejects an old one', () => {
    expect(isStale(now - 5_000, now)).toBe(false);
    expect(isStale(now - 45_001, now)).toBe(true);
    // An explicit window overrides the default 45 seconds.
    expect(isStale(now - 120_000, now, 300_000)).toBe(false);
  });

  it('rejects a fix from the future', () => {
    // A fix dated more than five seconds ahead is a clock skew, not a prediction.
    expect(isStale(now + 5_001, now)).toBe(true);
    expect(isStale(now + 4_999, now)).toBe(false);
  });

  it('defaults to the wall clock when asked without arguments', () => {
    expect(isStale(Date.now())).toBe(false);
    expect(isStale(Date.now() - 60_000)).toBe(true);
  });
});

describe('Persian display helpers', () => {
  it('renders distances below a kilometre in metres', () => {
    expect(formatDistance(847)).toBe(`${toPersianDigits(Math.round(847))} متر`);
    expect(formatDistance(0)).toBe('۰ متر');
  });

  it('renders distances in kilometres above a thousand metres', () => {
    expect(formatDistance(1250)).toBe('۱.۳ کیلومتر');
  });

  it('renders a dash for a non-finite distance', () => {
    expect(formatDistance(Number.NaN)).toBe('—');
    expect(formatDistance(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('renders durations as minutes or as hours and padded minutes', () => {
    expect(formatDuration(0)).toBe('۰ دقیقه');
    expect(formatDuration(600)).toBe('۱۰ دقیقه');
    expect(formatDuration(3_660)).toBe('۱:۰۱ ساعت');
    expect(formatDuration(-30)).toBe('۰ دقیقه');
  });

  it('renders a clock time with zero-padded Persian digits', () => {
    const morning = new Date(2026, 5, 15, 9, 5);
    const asDate = formatClock(morning);
    const asString = formatClock('2026-06-15T09:05:00');
    const asNumber = formatClock(morning.getTime());
    expect(asDate).toBe(asString);
    expect(asDate).toBe(asNumber);
    expect(asDate).toMatch(/^[۰-۹]{2}:[۰-۹]{2}$/);
    // 9:05, not 9:5 — a single-digit minute must be padded.
    expect(asDate.split(':')[1]).toBe('۰۵');
  });

  it('renders a dash for a nonsensical timestamp', () => {
    expect(formatClock('not a date')).toBe('—');
    expect(formatClock(Number.NaN)).toBe('—');
  });
});

describe('round', () => {
  it('rounds to six digits by default and to fewer on request', () => {
    expect(round(1.23456789)).toBeCloseTo(1.234568, 6);
    expect(round(Math.PI, 2)).toBe(3.14);
    expect(round(Math.PI, 0)).toBe(3);
  });

  it('clamps with the inclusive clamp helper', () => {
    expect(clamp(5, 1, 3)).toBe(3);
    expect(clamp(-2, 1, 3)).toBe(1);
    expect(clamp(2, 1, 3)).toBe(2);
  });
});
