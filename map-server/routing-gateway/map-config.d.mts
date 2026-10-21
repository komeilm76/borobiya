import type { MapConfig } from "../../packages/shared/src/schemas/map";

export { type MapConfig };
export const DEFAULT_MAP_CONFIG: Readonly<MapConfig>;
export function parseMapConfig(source?: Record<string, string | undefined>): Readonly<MapConfig>;
