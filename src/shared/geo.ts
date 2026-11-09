/**
 * Shared pure geometry and Persian display helpers.
 * The Bun server, the Vue client and the Vitest suites import these exact functions.
 */

/** A geographic point in WGS84 degrees. */
export interface Point {
  latitude: number;
  longitude: number;
}

/** Web Mercator pixel coordinate at a given zoom level. */
interface WorldCoordinate {
  x: number;
  y: number;
}

/** Inclusive tile range covering a viewport, with the centre in world pixels. */
interface TileRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  centerX: number;
  centerY: number;
}

const EARTH_RADIUS_METERS = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** Clamps a number into an inclusive range. */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Converts geographic coordinates to Web Mercator world pixels.
 *
 * @param latitude Latitude in degrees.
 * @param longitude Longitude in degrees.
 * @param zoom Web Mercator zoom level.
 * @returns The world pixel coordinate at that zoom level.
 */
export function worldCoordinate(latitude: number, longitude: number, zoom: number): WorldCoordinate {
  const scale = 256 * 2 ** zoom;
  const x = ((longitude + 180) / 360) * scale;
  const sin = Math.sin(clamp(latitude, -85.05112878, 85.05112878) * DEG_TO_RAD);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/**
 * Great-circle distance between two points in metres.
 *
 * @param a First point.
 * @param b Second point.
 * @returns Distance in metres.
 */
export function haversineMeters(a: Point, b: Point): number {
  const latitudeDelta = (b.latitude - a.latitude) * DEG_TO_RAD;
  const longitudeDelta = (b.longitude - a.longitude) * DEG_TO_RAD;
  const lat1 = a.latitude * DEG_TO_RAD;
  const lat2 = b.latitude * DEG_TO_RAD;
  const sinLat = Math.sin(latitudeDelta / 2);
  const sinLon = Math.sin(longitudeDelta / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Computes the inclusive tile range that covers a viewport.
 *
 * @param center Map centre.
 * @param zoom Zoom level.
 * @param width Viewport width in pixels.
 * @param height Viewport height in pixels.
 * @param tileSize Tile edge in pixels.
 * @returns The visible tile range and the centre in world pixels.
 */
export function visibleTileRange(center: Point, zoom: number, width: number, height: number, tileSize = 256): TileRange {
  const centerWorld = worldCoordinate(center.latitude, center.longitude, zoom);
  return {
    xMin: Math.floor((centerWorld.x - width / 2) / tileSize),
    xMax: Math.floor((centerWorld.x + width / 2) / tileSize),
    yMin: Math.floor((centerWorld.y - height / 2) / tileSize),
    yMax: Math.floor((centerWorld.y + height / 2) / tileSize),
    centerX: centerWorld.x,
    centerY: centerWorld.y
  };
}

/**
 * Reports whether a fix is too old, in the future, or not a number.
 *
 * @param recordedAt Epoch milliseconds of the fix.
 * @param now Current epoch milliseconds.
 * @param maxAgeMs Maximum acceptable age.
 * @returns True when the fix must be treated as stale.
 */
export function isStale(recordedAt: number, now = Date.now(), maxAgeMs = 45000): boolean {
  return !Number.isFinite(recordedAt) || now - recordedAt > maxAgeMs || recordedAt > now + 5000;
}

/** Converts ASCII digits to Persian digits for the RTL interface. */
export function toPersianDigits(value: string | number): string {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/** Formats a metre distance in Persian units. */
export function formatDistance(meters: number): string {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${toPersianDigits(Math.round(meters))} متر`;
  return `${toPersianDigits((meters / 1000).toFixed(1))} کیلومتر`;
}

/** Formats a duration in seconds as a Persian hours/minutes label. */
export function formatDuration(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${toPersianDigits(hours)}:${toPersianDigits(String(minutes).padStart(2, '0'))} ساعت`;
  return `${toPersianDigits(minutes)} دقیقه`;
}

/** Formats a timestamp as a Persian clock time. */
export function formatClock(value: Date | string | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${toPersianDigits(String(date.getHours()).padStart(2, '0'))}:${toPersianDigits(String(date.getMinutes()).padStart(2, '0'))}`;
}

/** Rounds a number to a fixed number of decimal places. */
export function round(value: number, digits = 6): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
