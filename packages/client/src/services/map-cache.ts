let mapCacheWorkerReady: Promise<void> | undefined;

/** Register and activate the map-only cache worker before a map starts making requests. */
export function registerMapCacheWorker(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return Promise.resolve();
  }

  if (!mapCacheWorkerReady) {
    mapCacheWorkerReady = navigator.serviceWorker
      .register("/map-cache-worker.js", { scope: "/" })
      .then(() => Promise.race([
        navigator.serviceWorker.ready,
        new Promise<void>((resolve) => setTimeout(resolve, 1_500))
      ]))
      .then(() => undefined)
      .catch(() => {
        // The map still has MapLibre's in-memory tile cache on unsupported/insecure origins.
      });
  }

  return mapCacheWorkerReady;
}
