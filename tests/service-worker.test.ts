// @vitest-environment node
import vm from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { ROOT } from '../src/server/core/config.ts';

const ORIGIN = 'http://127.0.0.1:3000';
const absolute = (relative: string): string => new URL(relative, ORIGIN).href;
let SOURCE = '';

beforeAll(async () => {
  SOURCE = await Bun.file(`${ROOT}/public/sw.js`).text();
});

/** Minimal `Response` stand-in for the worker sandbox. */
class MockResponse {
  readonly body: string;
  readonly status: number;
  readonly ok: boolean;
  constructor(body = '', init: { status?: number } = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
  }
  clone(): MockResponse {
    return new MockResponse(this.body, { status: this.status });
  }
  async json(): Promise<any> {
    return JSON.parse(this.body);
  }
  async text(): Promise<string> {
    return this.body;
  }
  static error(): MockResponse {
    return new MockResponse('', { status: 0 });
  }
}

/** Minimal `Request` stand-in for the worker sandbox. */
class MockRequest {
  readonly url: string;
  readonly method: string;
  constructor(input: string | MockRequest, init: { method?: string } = {}) {
    const raw = typeof input === 'string' ? input : input.url;
    this.url = raw.startsWith('http') ? raw : absolute(raw);
    this.method = init.method || (typeof input === 'string' ? 'GET' : input.method);
  }
}

/** In-memory `Cache` stand-in with insertion ordering preserved. */
class MockCache {
  readonly entries = new Map<string, MockResponse>();
  async addAll(urls: string[]): Promise<void> {
    for (const url of urls) this.entries.set(absolute(url), new MockResponse(`cached ${url}`));
  }
  async match(request: string | MockRequest): Promise<MockResponse | null> {
    return this.entries.get(typeof request === 'string' ? absolute(request) : request.url) ?? null;
  }
  async put(request: string | MockRequest, response: MockResponse): Promise<void> {
    this.entries.set(typeof request === 'string' ? absolute(request) : request.url, response.clone());
  }
  async keys(): Promise<MockRequest[]> {
    return [...this.entries.keys()].map((url) => new MockRequest(url));
  }
  async delete(request: string | MockRequest): Promise<boolean> {
    return this.entries.delete(typeof request === 'string' ? absolute(request) : request.url);
  }
}

/** In-memory `CacheStorage` stand-in. */
class MockCacheStorage {
  readonly stores = new Map<string, MockCache>();
  async open(name: string): Promise<MockCache> {
    let cache = this.stores.get(name);
    if (!cache) {
      cache = new MockCache();
      this.stores.set(name, cache);
    }
    return cache;
  }
  async keys(): Promise<string[]> {
    return [...this.stores.keys()];
  }
  async delete(name: string): Promise<boolean> {
    return this.stores.delete(name);
  }
}

interface FetchResult {
  responded: boolean;
  response: MockResponse | null;
}

interface Harness {
  storage: MockCacheStorage;
  fetchCalls: string[];
  failUrls: Set<string>;
  state: { skipped: boolean; claimed: boolean };
  emit(type: string, request?: MockRequest): Promise<FetchResult>;
}

/**
 * Loads the generated service worker into an isolated VM context with deterministic
 * `fetch`, `caches`, `Request` and `Response` doubles.
 *
 * @returns A reusable harness bound to one worker instance.
 */
function harness(): Harness {
  const listeners = new Map<string, (event: any) => void>();
  const storage = new MockCacheStorage();
  const fetchCalls: string[] = [];
  const failUrls = new Set<string>();
  const state = { skipped: false, claimed: false };
  const manifest = { version: 'test-version', precache: ['/app.css', '/js/index.js', '/sw.js'] };
  const fetchMock = async (input: string | MockRequest, init: { cache?: string } = {}): Promise<MockResponse> => {
    const url = typeof input === 'string' ? absolute(input) : input.url;
    fetchCalls.push(url);
    if (url === absolute('/assets/cache-manifest.json')) {
      expect(init.cache).toBe('no-store');
      return new MockResponse(JSON.stringify(manifest));
    }
    if (failUrls.has(url)) throw new Error('offline');
    if (url.includes('/_public/map/tiles/')) return new MockResponse('tile');
    return new MockResponse('network');
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: any) => void): void => {
      listeners.set(type, listener);
    },
    skipWaiting: async (): Promise<void> => {
      state.skipped = true;
    },
    clients: {
      claim: async (): Promise<void> => {
        state.claimed = true;
      }
    }
  };
  // A service worker global is `self` and `globalThis` at once, so the doubles must sit on the
  // contextified global object while `self` stays available for feature checks.
  const sandbox = {
    ...self,
    self,
    fetch: fetchMock,
    caches: storage,
    Response: MockResponse,
    Request: MockRequest,
    URL,
    console
  };
  vm.runInContext(SOURCE, vm.createContext(sandbox));
  return {
    storage,
    fetchCalls,
    failUrls,
    state,
    async emit(type: string, request?: MockRequest): Promise<FetchResult> {
      const listener = listeners.get(type);
      expect(listener, `missing ${type} listener`).toBeTruthy();
      let waitUntil: Promise<unknown> | null = null;
      let responsePromise: Promise<MockResponse> | null = null;
      listener!({
        request,
        waitUntil(promise: Promise<unknown>): void {
          waitUntil = promise;
        },
        respondWith(promise: Promise<MockResponse>): void {
          responsePromise = promise;
        }
      });
      if (waitUntil) await waitUntil;
      if (responsePromise) return { responded: true, response: await responsePromise };
      return { responded: false, response: null };
    }
  };
}

describe('service worker behavior', () => {
  it('installs a versioned static cache and removes only obsolete static caches', async () => {
    const runtime = harness();
    await runtime.emit('install');
    expect(runtime.state.skipped).toBe(true);
    expect(runtime.fetchCalls).toContain(absolute('/assets/cache-manifest.json'));
    const current = runtime.storage.stores.get('borobiya-static-test-version');
    expect(current).toBeTruthy();
    expect(current!.entries.get(absolute('/'))?.body).toBe('cached /');
    expect(current!.entries.get(absolute('/app.css'))?.body).toBe('cached /app.css');
    runtime.storage.stores.set('borobiya-static-old', new MockCache());
    runtime.storage.stores.set('borobiya-tiles-v1', new MockCache());
    await runtime.emit('activate');
    expect(runtime.state.claimed).toBe(true);
    expect(runtime.storage.stores.has('borobiya-static-old')).toBe(false);
    expect(runtime.storage.stores.has('borobiya-static-test-version')).toBe(true);
    expect(runtime.storage.stores.has('borobiya-tiles-v1')).toBe(true);
  });

  it('never intercepts private APIs, WebSockets, cross-origin or mutating requests', async () => {
    const runtime = harness();
    await runtime.emit('install');
    for (const relative of ['/_auth/login', '/_user/me', '/_admin/overview', '/ws']) {
      const result = await runtime.emit('fetch', new MockRequest(absolute(relative)));
      expect(result.responded, relative).toBe(false);
    }
    const crossOrigin = await runtime.emit('fetch', new MockRequest('https://example.test/app.css'));
    expect(crossOrigin.responded).toBe(false);
    const mutation = await runtime.emit('fetch', new MockRequest(absolute('/app.css'), { method: 'POST' }));
    expect(mutation.responded).toBe(false);
  });

  it('serves static and public responses with stale-while-revalidate and refreshes the cache', async () => {
    const runtime = harness();
    await runtime.emit('install');
    const current = runtime.storage.stores.get('borobiya-static-test-version');
    const asset = absolute('/app.css');
    const cached = await runtime.emit('fetch', new MockRequest(asset));
    expect(cached.responded).toBe(true);
    expect(cached.response?.body).toBe('cached /app.css');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(current!.entries.get(asset)?.body).toBe('network');
    const publicResult = await runtime.emit('fetch', new MockRequest(absolute('/_public/health')));
    expect(publicResult.responded).toBe(true);
    expect(publicResult.response?.body).toBe('network');
  });

  it('caches tile responses, keeps them bounded and serves them offline', async () => {
    const runtime = harness();
    await runtime.emit('install');
    let lastUrl = '';
    for (let index = 0; index < 260; index++) {
      lastUrl = absolute(`/_public/map/tiles/14/${1000 + index}/1000.svg`);
      const result = await runtime.emit('fetch', new MockRequest(lastUrl));
      expect(result.response?.body).toBe('tile');
    }
    const tiles = runtime.storage.stores.get('borobiya-tiles-v1');
    expect(tiles).toBeTruthy();
    expect(tiles!.entries.size).toBe(256);
    expect(tiles!.entries.has(absolute('/_public/map/tiles/14/1000/1000.svg'))).toBe(false);
    expect(tiles!.entries.has(lastUrl)).toBe(true);
    const before = runtime.fetchCalls.length;
    const cached = await runtime.emit('fetch', new MockRequest(lastUrl));
    expect(cached.response?.body).toBe('tile');
    expect(runtime.fetchCalls.length).toBe(before);
  });

  it('returns a cached response or a recoverable error for offline static requests', async () => {
    const runtime = harness();
    await runtime.emit('install');
    const cachedUrl = absolute('/app.css');
    runtime.failUrls.add(cachedUrl);
    const cached = await runtime.emit('fetch', new MockRequest(cachedUrl));
    expect(cached.response?.body).toBe('cached /app.css');
    const missingUrl = absolute('/missing.css');
    runtime.failUrls.add(missingUrl);
    const missing = await runtime.emit('fetch', new MockRequest(missingUrl));
    expect(missing.responded).toBe(true);
    expect(missing.response?.ok).toBe(false);
    expect(missing.response?.status).toBe(0);
  });
});
