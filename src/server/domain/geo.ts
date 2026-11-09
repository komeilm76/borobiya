import type { Point } from '../../shared/geo.ts';

export interface TileCoordinate { z: number; x: number; y: number }

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
