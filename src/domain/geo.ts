import { bearingDegrees, clamp, haversineMeters, isStale, visibleTileRange, worldCoordinate } from '../../public/js/geo.js';

export interface Point { latitude: number; longitude: number }
export interface TileCoordinate { z: number; x: number; y: number }

export { bearingDegrees, clamp, haversineMeters, isStale, visibleTileRange, worldCoordinate };

export function isValidPoint(point: Point): boolean {
  return Number.isFinite(point.latitude) && Number.isFinite(point.longitude) &&
    point.latitude >= -90 && point.latitude <= 90 &&
    point.longitude >= -180 && point.longitude <= 180;
}

export function validateTile(z: number, x: number, y: number): TileCoordinate | null {
  if (![z, x, y].every((value) => Number.isSafeInteger(value) && value >= 0)) return null;
  if (z < 10 || z > 17) return null;
  const max = 2 ** z;
  if (x >= max || y >= max) return null;
  return { z, x, y };
}

export function tileBounds(tile: TileCoordinate): { west: number; east: number; north: number; south: number } {
  const scale = 2 ** tile.z;
  const longitude = (index: number) => index / scale * 360 - 180;
  const latitude = (index: number) => {
    const n = Math.PI - 2 * Math.PI * index / scale;
    return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };
  return { west: longitude(tile.x), east: longitude(tile.x + 1), north: latitude(tile.y), south: latitude(tile.y + 1) };
}

export function tileKey(tile: TileCoordinate): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

export function boundingBox(points: Point[]): { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number } | null {
  if (!points.length) return null;
  return points.reduce((box, point) => ({
    minLatitude: Math.min(box.minLatitude, point.latitude),
    maxLatitude: Math.max(box.maxLatitude, point.latitude),
    minLongitude: Math.min(box.minLongitude, point.longitude),
    maxLongitude: Math.max(box.maxLongitude, point.longitude)
  }), {
    minLatitude: points[0].latitude,
    maxLatitude: points[0].latitude,
    minLongitude: points[0].longitude,
    maxLongitude: points[0].longitude
  });
}
