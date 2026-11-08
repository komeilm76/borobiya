import { LruTtlCache } from '../core/cache.ts';
import { sha256 } from '../core/crypto.ts';
import { MAP_BOUNDS, MAP_CENTER, MAP_ORIGIN, MAP_ZOOM, renderMapTile } from '../domain/map.ts';
import { CACHE } from '../../shared/protocol.ts';
import type { AppContext } from './context.ts';

export interface CachedTile { svg: string; etag: string }

export class MapService {
  private readonly tiles: LruTtlCache<string, CachedTile>;
  constructor(private readonly ctx: AppContext) {
    this.tiles = new LruTtlCache(CACHE.TILE_LIMIT, Number.POSITIVE_INFINITY, ctx.clock);
  }

  config(): Record<string, unknown> {
    const version = this.ctx.config.dataVersion;
    return {
      center: MAP_CENTER,
      bounds: MAP_BOUNDS,
      defaultZoom: MAP_ZOOM,
      minZoom: 10,
      maxZoom: 17,
      tileSize: 256,
      tileTemplate: `/_public/map/tiles/{z}/{x}/{y}.svg?v=${encodeURIComponent(version)}`,
      dataVersion: version,
      attribution: 'Borobiya deterministic vector map',
      offline: true,
      vector: true,
      raster: false,
      worldOrigin: MAP_ORIGIN,
      styles: {
        light: { land: '#F0F2EC', water: '#B6D7E4', park: '#D3E6C6', route: '#0E6666', text: '#122A2A' },
        dark: { land: '#0C1617', water: '#173C46', park: '#17372A', route: '#71C7BE', text: '#EDF5F2' }
      },
      cache: { tileLimit: CACHE.TILE_LIMIT, immutable: true, serviceWorkerTiles: 256 }
    };
  }

  tile(z: number, x: number, y: number): CachedTile | null {
    const key = `${this.ctx.config.dataVersion}:${z}/${x}/${y}`;
    const cached = this.tiles.get(key);
    if (cached) return cached;
    const svg = renderMapTile(z, x, y);
    if (!svg) return null;
    const value = { svg, etag: `"${sha256(svg).slice(0, 24)}"` };
    this.tiles.set(key, value);
    return value;
  }

  stats(): Record<string, unknown> {
    return { tiles: this.tiles.stats(), dataVersion: this.ctx.config.dataVersion };
  }

  clear(): void { this.tiles.clear(); }
}
