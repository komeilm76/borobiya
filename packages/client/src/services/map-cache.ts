let mapCacheWorkerReady: Promise<void> | undefined;

/** Allow a short head start for an already-installing worker, not a 1.5s map-render blockade. */
export const MAP_CACHE_STARTUP_BUDGET_MS = 200;

/**
 * Registration is best-effort. A ready worker can intercept the first tile request, but on a fresh
 * install (or a blocked service-worker API) the online map must start even if register() never resolves.
 * The registration continues in the background after the budget expires; its eventual rejection is
 * handled here rather than becoming an unhandled promise rejection.
 */
export async function waitForMapCacheStartup(register: () => Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve().then(register).catch(() => undefined),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, MAP_CACHE_STARTUP_BUDGET_MS); })
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/**
 * Download the lazy MapLibre module while the worker gets its bounded cache head start. Waiting for
 * one and only then importing the other serializes two independent startup costs. Promise.all attaches
 * rejection handlers to both immediately, so an early import failure cannot become unhandled.
 */
export async function prepareMapRuntime<T>(register: () => Promise<void>, load: () => Promise<T>): Promise<T> {
  const [, maplibre] = await Promise.all([
    waitForMapCacheStartup(register),
    Promise.resolve().then(load)
  ]);
  return maplibre;
}

/** Register and activate the map-only cache worker when possible. */
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
