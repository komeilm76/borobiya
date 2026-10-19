const CACHE_NAME = "borobiya-map-runtime-v1";
const MAX_CACHE_ENTRIES = 512;

function isMapResource(pathname) {
  return /^\/map\/style\/(?:light|dark)$/.test(pathname)
    || /^\/[^/]+\/\d+\/\d+\/\d+(?:\.(?:pbf|mvt))?$/.test(pathname)
    || /^\/sprite\/borobiya(?:@2x)?\.(?:json|png)$/.test(pathname)
    || /^\/font\/[^/]+\/\d+-\d+(?:\.pbf)?$/.test(pathname);
}

async function trimCache(cache) {
  const requests = await cache.keys();
  const excess = requests.length - MAX_CACHE_ENTRIES;
  for (let index = 0; index < excess; index += 1) {
    await cache.delete(requests[index]);
  }
}

async function notifyCachedFallback(request) {
  try {
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const pathname = new URL(request.url).pathname;
    for (const client of clients) {
      client.postMessage({ type: "borobiya-map-cache-fallback", pathname });
    }
  } catch {
    // A cache hit should still be returned if a client cannot be notified.
  }
}

async function respondWithMapResource(request) {
  let cache;
  try {
    cache = await caches.open(CACHE_NAME);
  } catch {
    cache = null;
  }

  try {
    const response = await fetch(request);
    if (cache && response.status === 200 && response.ok) {
      try {
        await cache.put(request, response.clone());
        await trimCache(cache);
      } catch {
        // Quota/Cache API failures must not prevent the live map response.
      }
      return response;
    }

    if (cache && response.status >= 500) {
      try {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          await notifyCachedFallback(request);
          return cachedResponse;
        }
      } catch {
        // Keep the upstream error if reading Cache Storage fails.
      }
    }

    return response;
  } catch {
    if (cache) {
      try {
        const cachedResponse = await cache.match(request);
        if (cachedResponse) {
          await notifyCachedFallback(request);
          return cachedResponse;
        }
      } catch {
        // Continue to a clean 503 when cache storage itself is unavailable.
      }
    }

    return new Response("Map resource is unavailable and no cached copy exists.", {
      status: 503,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      }
    });
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter((name) => name.startsWith("borobiya-map-runtime-") && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !isMapResource(url.pathname)) return;

  event.respondWith(respondWithMapResource(request));
});
