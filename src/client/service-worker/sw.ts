/**
 * Borobiya service worker source.
 *
 * This TypeScript file is the single source of truth. `bun run build` compiles it with
 * `Bun.build` into the browser-required `public/sw.js` artifact (see `scripts/build.ts`).
 * The generated `sw.js` is treated as build output, not hand-authored source.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */



/** Bounded cache for deterministic SVG tiles. */
const TILE_CACHE = 'borobiya-tiles-v1';
const TILE_LIMIT = 256;
let staticCacheName = 'borobiya-static';

/**
 * Typed view of the service-worker global scope. The file is compiled to a classic worker
 * script, so it cannot use `export {}` to escape the global declaration file rule; the
 * worker surface is therefore reached through one narrow, documented accessor.
 */
interface WorkerScope {
  addEventListener(type: string, listener: (event: any) => void): void;
  skipWaiting(): Promise<void>;
  clients: { claim(): Promise<void> };
  location: { origin: string };
}

const scope = globalThis as unknown as WorkerScope;

interface CacheManifest {
  version: string;
  precache: string[];
  runtime?: { tileLimit?: number; apiCaching?: boolean };
}

type CacheLike = {
  addAll(entries: string[]): Promise<void>;
  match(request: unknown, options?: unknown): Promise<Response | null | undefined>;
  put(request: unknown, response: Response): Promise<void>;
  keys(): Promise<unknown[]>;
  delete(request: unknown): Promise<boolean>;
};

type CacheStorageLike = {
  open(name: string): Promise<CacheLike>;
  keys(): Promise<string[]>;
  delete(name: string): Promise<boolean>;
};

const cachesStore = caches as unknown as CacheStorageLike;

scope.addEventListener('install', (event: any) => {
  event.waitUntil(
    (async () => {
      const response = await fetch('/assets/cache-manifest.json', { cache: 'no-store' });
      const manifest = (await response.json()) as CacheManifest;
      staticCacheName = `borobiya-static-${manifest.version}`;
      const cache = await cachesStore.open(staticCacheName);
      const urls = [...new Set(['/', ...(manifest.precache ?? [])])];
      await cache.addAll(urls);
      await scope.skipWaiting();
    })()
  );
});

scope.addEventListener('activate', (event: any) => {
  event.waitUntil(
    (async () => {
      const names = await cachesStore.keys();
      await Promise.all(
        names
          .filter((name) => name.startsWith('borobiya-static-') && name !== staticCacheName)
          .map((name) => cachesStore.delete(name))
      );
      await scope.clients.claim();
    })()
  );
});

scope.addEventListener('fetch', (event: any) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== scope.location.origin) return;
  const path = url.pathname;
  if (path.startsWith('/_public/map/tiles/')) {
    event.respondWith(cacheTile(request));
    return;
  }
  // Private APIs and the WebSocket endpoint are never intercepted or cached.
  if (path.startsWith('/_auth/') || path.startsWith('/_user/') || path.startsWith('/_admin/') || path === '/ws') return;
  if (path.startsWith('/_public/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (path === '/' || /\.(?:css|js|webmanifest|svg|ttf|png|jpg|jpeg)$/i.test(path)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

/** Serves a tile from the bounded cache, filling it from the network on a miss. */
async function cacheTile(request: any): Promise<Response> {
  const cache = await cachesStore.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimCache(cache, TILE_LIMIT);
  }
  return response;
}

/** Serves a cached shell/asset while refreshing it in the background, with an offline fallback. */
async function staleWhileRevalidate(request: any): Promise<Response> {
  const cache = await cachesStore.open(staticCacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) void cache.put(request, response.clone());
      return response;
    })
    .catch(() => (cached as Response | null | undefined) ?? Response.error());
  return (cached as Response | null | undefined) ?? network;
}

/** Trims the tile cache to a deterministic bound, dropping the oldest entries. */
async function trimCache(cache: CacheLike, limit: number): Promise<void> {
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  for (const key of keys.slice(0, keys.length - limit)) await cache.delete(key);
}
