export const DEFAULT_MAP_CONFIG = Object.freeze({
  region: "tehran",
  bbox: Object.freeze([51.0, 35.5, 51.7, 35.9]),
  dataVersion: "2026-10-18",
  minZoom: 0,
  maxZoom: 14
});

const REGION_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const MAX_SUPPORTED_ZOOM = 16;

function readZoom(source, name, fallback) {
  const raw = source[name]?.trim();
  if (!raw) return fallback;
  if (!/^\d+$/.test(raw)) throw new Error(`${name} must be an integer from 0 to ${MAX_SUPPORTED_ZOOM}.`);
  const zoom = Number(raw);
  if (zoom > MAX_SUPPORTED_ZOOM) throw new Error(`${name} must be an integer from 0 to ${MAX_SUPPORTED_ZOOM}.`);
  return zoom;
}

function readBbox(source) {
  const raw = source.MAP_BBOX?.trim();
  if (!raw) return [...DEFAULT_MAP_CONFIG.bbox];
  const parts = raw.split(",").map((part) => part.trim());
  if (parts.length !== 4 || parts.some((part) => part.length === 0)) {
    throw new Error("MAP_BBOX must contain west,south,east,north coordinates.");
  }
  if (parts.some((part) => !DECIMAL_PATTERN.test(part))) {
    throw new Error("MAP_BBOX coordinates must be finite decimal numbers.");
  }
  const bbox = parts.map(Number);
  const [west, south, east, north] = bbox;
  if (!bbox.every(Number.isFinite) || west < -180 || west > 180 || east < -180 || east > 180 || south < -90 || south > 90 || north < -90 || north > 90 || west >= east || south >= north) {
    throw new Error("MAP_BBOX must be an ordered WGS84 west,south,east,north box.");
  }
  return bbox;
}

export function parseMapConfig(source = {}) {
  const region = source.MAP_REGION?.trim() || DEFAULT_MAP_CONFIG.region;
  if (!REGION_PATTERN.test(region)) throw new Error("MAP_REGION must be a lowercase slug using letters, numbers, and hyphens.");

  const dataVersion = source.MAP_DATA_VERSION?.trim() || DEFAULT_MAP_CONFIG.dataVersion;
  if (!VERSION_PATTERN.test(dataVersion)) throw new Error("MAP_DATA_VERSION must be a 1–64 character version slug.");

  const minZoom = readZoom(source, "MAP_MIN_ZOOM", DEFAULT_MAP_CONFIG.minZoom);
  const maxZoom = readZoom(source, "MAP_MAX_ZOOM", DEFAULT_MAP_CONFIG.maxZoom);
  if (minZoom > maxZoom) throw new Error("MAP_MIN_ZOOM cannot exceed MAP_MAX_ZOOM.");

  return Object.freeze({
    region,
    bbox: Object.freeze(readBbox(source)),
    dataVersion,
    minZoom,
    maxZoom
  });
}
