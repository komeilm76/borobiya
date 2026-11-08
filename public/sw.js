/* Borobiya service worker: versioned static cache and bounded offline vector tiles. */
const TILE_CACHE = 'borobiya-tiles-v1';
const TILE_LIMIT = 256;
let staticCacheName = 'borobiya-static';

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const response = await fetch('/assets/cache-manifest.json', { cache: 'no-store' });
    const manifest = await response.json();
    staticCacheName = `borobiya-static-${manifest.version}`;
    const cache = await caches.open(staticCacheName);
    const urls = [...new Set(['/', ...(manifest.precache || [])])];
    await cache.addAll(urls);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith('borobiya-static-') && name !== staticCacheName)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const path = url.pathname;
  if (path.startsWith('/_public/map/tiles/')) {
    event.respondWith(cacheTile(request));
    return;
  }
  if (path.startsWith('/_auth/') || path.startsWith('/_user/') || path.startsWith('/_admin/') || path === '/ws') return;
  if (path.startsWith('/_public/')) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }
  if (path === '/' || /\.(?:css|js|webmanifest|svg|ttf|png|jpg|jpeg)$/i.test(path)) {
    event.respondWith(staleWhileRevalidate(request));
  }
});

async function cacheTile(request) {
  const cache = await caches.open(TILE_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    await cache.put(request, response.clone());
    await trimCache(cache, TILE_LIMIT);
  }
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(staticCacheName);
  const cached = await cache.match(request, { ignoreSearch: false });
  const network = fetch(request).then((response) => {
    if (response.ok) cache.put(request, response.clone()).catch(() => {});
    return response;
  }).catch(() => cached || Response.error());
  return cached || network;
}

async function trimCache(cache, limit) {
  const keys = await cache.keys();
  if (keys.length <= limit) return;
  for (const key of keys.slice(0, keys.length - limit)) await cache.delete(key);
}
