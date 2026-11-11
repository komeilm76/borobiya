const CACHE_NAME = "borobiya-map-runtime-v2";
const MAX_CACHE_ENTRIES = 512;
const MAP_FETCH_TIMEOUT_MS = 8_000;

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

async function fetchMapResourceWithDeadline(request) {
  const controller = new AbortController();
  let timer;
  try {
    // Race the deadline as well as aborting: a stalled fetch may not settle
    // promptly after its signal is aborted, but cached tiles must remain usable.
    return await Promise.race([
      fetch(request, { signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error("Map resource request timed out"));
        }, MAP_FETCH_TIMEOUT_MS);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function respondWithMapResource(request, retain) {
  // Start the network request independently of Cache Storage. A slow/opening
  // cache must never hold up a healthy online tile, style, sprite or glyph.
  const cacheReady = Promise.resolve().then(() => caches.open(CACHE_NAME)).catch(() => null);
  try {
    const response = await fetchMapResourceWithDeadline(request);
    if (response.status === 200 && response.ok) {
      try {
        // Clone while the live body is still available. The fetch event retains
        // this write without delaying respondWith's reply.
        const copy = response.clone();
        retain((async () => {
          const cache = await cacheReady;
          if (!cache) return;
          try {
            await cache.put(request, copy);
            await trimCache(cache);
          } catch {
            // Quota/Cache API failures must not prevent the live map response.
          }
        })());
      } catch {
        // An unavailable Cache API must not affect a successful network response.
      }
      return response;
    }

    if (response.status >= 500) {
      const cache = await cacheReady;
      if (cache) {
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
    }

    return response;
  } catch {
    const cache = await cacheReady;
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

  let background = Promise.resolve();
  const response = respondWithMapResource(request, (work) => { background = work; });
  event.respondWith(response);
  // Register during dispatch, not after fetch resolves: some browsers reject
  // late waitUntil calls. The background work is attached before response settles.
  event.waitUntil(response.then(() => background, () => background));
});
