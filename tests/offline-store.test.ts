import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { useOfflineStore } from '../src/client/stores/offline.ts';

/**
 * The offline store is what tells a responder in a basement that the app has stopped talking to the
 * network. Every path here is one the user reads as a statement about their own connectivity, so
 * the interesting cases are the failures: a store that claims to be online while offline, or one
 * that reports a cache version it never fetched, is worse than one that reports nothing.
 */

/** Creates the store inside a scope so its listeners and watchers are torn down afterwards. */
function makeStore() {
  const scope = effectScope();
  const pinia = createPinia();
  setActivePinia(pinia);
  const store = scope.run(() => useOfflineStore())!;
  return { store, scope };
}

let scope: ReturnType<typeof effectScope> | undefined;

beforeEach(() => {
  setActivePinia(createPinia());
  vi.restoreAllMocks();
});

afterEach(() => {
  scope?.stop();
  scope = undefined;
  document.documentElement.removeAttribute('data-offline');
  vi.unstubAllGlobals();
});

/** The workspace store, inside a scope that `afterEach` stops. */
function store() {
  const made = makeStore();
  scope = made.scope;
  return made.store;
}

/** Stubs `navigator.onLine` and dispatches the matching event, as a browser would. */
function setOnline(value: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, value });
  window.dispatchEvent(new Event(value ? 'online' : 'offline'));
}

describe('connectivity state', () => {
  it('reports the browser\'s online state', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const offline = store();
    expect(offline.online).toBe(true);
    expect(offline.offline).toBe(false);
    expect(offline.statusLabel).toBe('متصل');
  });

  it('flips to offline when the browser goes offline', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const offline = store();
    setOnline(false);
    await nextTick();
    expect(offline.offline).toBe(true);
    expect(offline.online).toBe(false);
    // The label is the only part of this a user actually sees.
    expect(offline.statusLabel).toBe('حالت آفلاین');
  });

  it('returns to online when the connection comes back', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const offline = store();
    expect(offline.offline).toBe(true);
    setOnline(true);
    await nextTick();
    expect(offline.offline).toBe(false);
    expect(offline.statusLabel).toBe('متصل');
  });

  it('marks the document so CSS can react, and clears the mark', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    const offline = store();
    // The flag drives the offline banner and the muted palette, so it must be present while offline
    // and, just as importantly, removed afterwards — a stale attribute means a permanently dimmed
    // screen on a perfectly good connection.
    expect(document.documentElement.hasAttribute('data-offline')).toBe(false);
    setOnline(false);
    await nextTick();
    expect(document.documentElement.getAttribute('data-offline')).toBe('true');
    setOnline(true);
    await nextTick();
    expect(document.documentElement.hasAttribute('data-offline')).toBe(false);
  });

  it('applies the offline mark immediately, before any transition', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    store();
    // A watcher that only ran on the next tick would leave one frame of online-looking UI at
    // start-up, which is exactly when a user in a dead zone is looking at it.
    expect(document.documentElement.getAttribute('data-offline')).toBe('true');
  });

  it('records when the connection was lost', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    try {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
      const offline = store();
      expect(offline.lastOfflineAt).toBe(null);
      window.dispatchEvent(new Event('offline'));
      // The timestamp is only useful if it is the time of the drop, not of the last reconnect.
      expect(offline.lastOfflineAt).toBe(1_700_000_000_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not move the timestamp when the connection returns', async () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    try {
      const offline = store();
      window.dispatchEvent(new Event('offline'));
      const lost = offline.lastOfflineAt;
      vi.setSystemTime(1_700_000_060_000);
      window.dispatchEvent(new Event('online'));
      // Going back online must not overwrite when it went down — the pair is used to say how long
      // the user was cut off.
      expect(offline.lastOfflineAt).toBe(lost);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports an unknown network type rather than an empty string', () => {
    const offline = store();
    // Either a real type or the fallback; never undefined, which would render as "الحاقه" in the UI.
    expect(typeof offline.effectiveType).toBe('string');
    expect(offline.effectiveType.length).toBeGreaterThan(0);
  });
});

describe('service worker registration', () => {
  it('reports failure when the browser has no service worker support', async () => {
    const original = 'serviceWorker' in navigator;
    if (original) delete (navigator as unknown as Record<string, unknown>).serviceWorker;
    try {
      const offline = store();
      // Must be a boolean answer, not a throw: callers decide whether to warn the user.
      await expect(offline.registerServiceWorker()).resolves.toBe(false);
      expect(offline.serviceWorkerReady).toBe(false);
    } finally {
      if (original) Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: undefined });
    }
  });

  it('does not try to register when the app was opened from the filesystem', async () => {
    const register = vi.fn(async () => ({}));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, ready: Promise.resolve({}) }
    });
    // A `file://` document cannot register a worker at all, and asking throws a SecurityError in
    // some browsers. The guard keeps a locally opened build from logging a console error on every
    // load. Driven through a stubbed location because the test document has an http origin.
    const original = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, protocol: 'file:', origin: 'null' }
    });
    try {
      const offline = store();
      await expect(offline.registerServiceWorker()).resolves.toBe(false);
      expect(register).not.toHaveBeenCalled();
      expect(offline.serviceWorkerReady).toBe(false);
    } finally {
      Object.defineProperty(window, 'location', { configurable: true, value: original });
    }
  });

  it('registers the worker at the root scope and waits for it to be ready', async () => {
    const registration = { scope: '/' };
    const register = vi.fn(async () => registration);
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, ready: Promise.resolve(registration) }
    });
    const offline = store();
    await expect(offline.registerServiceWorker()).resolves.toBe(true);
    // The root scope is required for the worker to control `/_user/...` routes; registering under a
    // narrower scope would leave the app shell uncached precisely where the map lives.
    expect(register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(offline.serviceWorkerReady).toBe(true);
  });

  it('reports failure instead of throwing when registration is rejected', async () => {
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: vi.fn(async () => {
          throw new Error('SecurityError: insecure context');
        }),
        ready: Promise.resolve(null)
      }
    });
    const offline = store();
    // A failed worker must not take the app down with it; offline support is an enhancement.
    await expect(offline.registerServiceWorker()).resolves.toBe(false);
    expect(offline.serviceWorkerReady).toBe(false);
  });

  it('registers only when a worker becomes ready', async () => {
    const register = vi.fn(async () => ({}));
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: { register, ready: Promise.resolve(null) }
    });
    const offline = store();
    // `ready` resolving null means no worker took control, so "ready" would be a lie.
    await expect(offline.registerServiceWorker()).resolves.toBe(false);
    expect(offline.serviceWorkerReady).toBe(false);
  });
});

describe('cached dataset version', () => {
  it('reads the version from the generated manifest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 'd292f297b0ab33bf' }), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    })));
    const offline = store();
    await expect(offline.loadCacheVersion()).resolves.toBe('d292f297b0ab33bf');
    expect(offline.cachedVersion).toBe('d292f297b0ab33bf');
  });

  it('asks for the manifest uncached', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ version: 'v2' }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const offline = store();
    await offline.loadCacheVersion();
    // A cached manifest reports the version the user is *not* running, which is the one case where
    // showing the version is pointless.
    expect(fetch).toHaveBeenCalledWith('/assets/cache-manifest.json', { cache: 'no-store' });
  });

  it('leaves the version unset when the manifest is missing', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('not found', { status: 404 })));
    const offline = store();
    await expect(offline.loadCacheVersion()).resolves.toBe(null);
    expect(offline.cachedVersion).toBe(null);
  });

  it('does not trust a version delivered with an error status', async () => {
    // A 404 or 502 that still carries a JSON body: without the status check the body would be
    // parsed and its version displayed, so the app would advertise a cache it never received.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 'stale' }), { status: 404 })));
    const offline = store();
    await expect(offline.loadCacheVersion()).resolves.toBe(null);
    expect(offline.cachedVersion).toBe(null);
  });

  it('leaves the version unset when the request fails outright', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    const offline = store();
    // This is the normal case while offline — the screen must not break because of it.
    await expect(offline.loadCacheVersion()).resolves.toBe(null);
    expect(offline.cachedVersion).toBe(null);
  });

  it('treats a manifest with no version field as unknown', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ precache: [] }), { status: 200 })));
    const offline = store();
    // `undefined` would render as the word "undefined" under the app; null renders as nothing.
    await expect(offline.loadCacheVersion()).resolves.toBe(null);
    expect(offline.cachedVersion).toBe(null);
  });

  it('keeps the last known version when a later read fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 'v1' }), { status: 200 })));
    const offline = store();
    await offline.loadCacheVersion();
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    await offline.loadCacheVersion();
    // A transient failure should not erase the version already displayed.
    expect(offline.cachedVersion).toBe('v1');
  });
});
