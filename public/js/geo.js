/**
 * Shared pure geometry and display helpers. The server and browser use these exact functions.
 * @typedef {{ latitude: number, longitude: number }} Point
 */

const EARTH_RADIUS_METERS = 6371008.8;
const DEG_TO_RAD = Math.PI / 180;
const PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

/** @param {number} value @param {number} min @param {number} max */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Converts geographic coordinates to Web Mercator world pixels.
 * @param {number} latitude @param {number} longitude @param {number} zoom
 * @returns {{x: number, y: number}}
 */
export function worldCoordinate(latitude, longitude, zoom) {
  const scale = 256 * 2 ** zoom;
  const x = (longitude + 180) / 360 * scale;
  const sin = Math.sin(clamp(latitude, -85.05112878, 85.05112878) * DEG_TO_RAD);
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * scale;
  return { x, y };
}

/** @param {Point} a @param {Point} b @returns {number} */
export function haversineMeters(a, b) {
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
 * @param {Point} center @param {number} zoom @param {number} width @param {number} height @param {number} [tileSize]
 */
export function visibleTileRange(center, zoom, width, height, tileSize = 256) {
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

/** @param {Point} from @param {Point} to @returns {number} */
export function bearingDegrees(from, to) {
  const lat1 = from.latitude * DEG_TO_RAD;
  const lat2 = to.latitude * DEG_TO_RAD;
  const delta = (to.longitude - from.longitude) * DEG_TO_RAD;
  const y = Math.sin(delta) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(delta);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

/** @param {number} recordedAt @param {number} [now] @param {number} [maxAgeMs] */
export function isStale(recordedAt, now = Date.now(), maxAgeMs = 45000) {
  return !Number.isFinite(recordedAt) || now - recordedAt > maxAgeMs || recordedAt > now + 5000;
}

/** @param {string|number} value */
export function toPersianDigits(value) {
  return String(value).replace(/[0-9]/g, (digit) => PERSIAN_DIGITS[Number(digit)]);
}

/** @param {number} meters */
export function formatDistance(meters) {
  if (!Number.isFinite(meters)) return '—';
  if (meters < 1000) return `${toPersianDigits(Math.round(meters))} متر`;
  return `${toPersianDigits((meters / 1000).toFixed(1))} کیلومتر`;
}

/** @param {number} seconds */
export function formatDuration(seconds) {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours) return `${toPersianDigits(hours)}:${toPersianDigits(String(minutes).padStart(2, '0'))} ساعت`;
  return `${toPersianDigits(minutes)} دقیقه`;
}

/** @param {Date|string|number} value */
export function formatClock(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${toPersianDigits(String(date.getHours()).padStart(2, '0'))}:${toPersianDigits(String(date.getMinutes()).padStart(2, '0'))}`;
}

/** @param {number} value @param {number} digits */
export function round(value, digits = 6) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}
