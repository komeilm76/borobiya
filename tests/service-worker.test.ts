import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { createContext, runInContext } from 'node:vm';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = readFileSync(path.join(ROOT, 'public/sw.js'), 'utf8');
const ORIGIN = 'http://127.0.0.1:3000';
const absolute = (relative: string): string => new URL(relative, ORIGIN).href;

class MockResponse {
  readonly body: string;
  readonly status: number;
  readonly ok: boolean;
  constructor(body = '', init: { status?: number } = {}) {
    this.body = body;
    this.status = init.status ?? 200;
    this.ok = this.status >= 200 && this.status < 300;
  }
  clone(): MockResponse { return new MockResponse(this.body, { status: this.status }); }
  async json(): Promise<any> { return JSON.parse(this.body); }
  async text(): Promise<string> { return this.body; }
  static error(): MockResponse { return new MockResponse('', { status: 0 }); }
}

class MockRequest {
  readonly url: string;
  readonly method: string;
  constructor(input: string | MockRequest, init: { method?: string } = {}) {
    const raw = typeof input === 'string' ? input : input.url;
    this.url = absolute(raw);
    this.method = init.method || (typeof input === 'string' ? 'GET' : input.method);
  }
}

class MockCache {
  readonly entries = new Map<string, MockResponse>();
  async addAll(urls: string[]): Promise<void> {
    for (const url of urls) this.entries.set(absolute(url), new MockResponse(`cached ${url}`));
  }
  async match(request: string | MockRequest, _options: unknown = undefined): Promise<MockResponse | null> {
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

class MockCacheStorage {
  readonly stores = new Map<string, MockCache>();
  async open(name: string): Promise<MockCache> {
    let cache = this.stores.get(name);
    if (!cache) { cache = new MockCache(); this.stores.set(name, cache); }
    return cache;
  }
  async keys(): Promise<string[]> { return [...this.stores.keys()]; }
  async delete(name: string): Promise<boolean> { return this.stores.delete(name); }
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

function harness(): Harness {
  const listeners = new Map<string, (event: any) => void>();
  const storage = new MockCacheStorage();
  const fetchCalls: string[] = [];
  const failUrls = new Set<string>();
  const state = { skipped: false, claimed: false };
  const manifest = { version: 'test-version', precache: ['/app.css', '/js/app.js', '/sw.js'] };
  const fetchMock = async (input: string | MockRequest, init: { cache?: string } = {}): Promise<MockResponse> => {
    const url = typeof input === 'string' ? absolute(input) : input.url;
    fetchCalls.push(url);
    if (url === absolute('/assets/cache-manifest.json')) {
      assert.equal(init.cache, 'no-store');
      return new MockResponse(JSON.stringify(manifest));
    }
    if (failUrls.has(url)) throw new Error('offline');
    if (url.includes('/_public/map/tiles/')) return new MockResponse('tile');
    return new MockResponse('network');
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: any) => void): void => { listeners.set(type, listener); },
    skipWaiting: async (): Promise<void> => { state.skipped = true; },
    clients: { claim: async (): Promise<void> => { state.claimed = true; } }
  };
  const sandbox = { self, fetch: fetchMock, caches: storage, Response: MockResponse, Request: MockRequest, URL, console };
  const context = createContext(sandbox);
  runInContext(SOURCE, context);
  return {
    storage, fetchCalls, failUrls, state,
    async emit(type: string, request?: MockRequest): Promise<FetchResult> {
      const listener = listeners.get(type);
      assert.ok(listener, `missing ${type} listener`);
      let waitUntil: Promise<unknown> | null = null;
      let responsePromise: Promise<MockResponse> | null = null;
      const event = {
        request,
        waitUntil(promise: Promise<unknown>): void { waitUntil = promise; },
        respondWith(promise: Promise<MockResponse>): void { responsePromise = promise; }
      };
      listener(event);
      if (waitUntil) await waitUntil;
      if (responsePromise) return { responded: true, response: await responsePromise };
      return { responded: false, response: null };
    }
  };
}

test('service worker installs a versioned static cache and removes only obsolete static caches', async () => {
  const runtime = harness();
  await runtime.emit('install');
  assert.equal(runtime.state.skipped, true);
  assert.ok(runtime.fetchCalls.includes(absolute('/assets/cache-manifest.json')));
  const current = runtime.storage.stores.get('borobiya-static-test-version');
  assert.ok(current);
  assert.equal(current.entries.get(absolute('/'))?.body, 'cached /');
  assert.equal(current.entries.get(absolute('/app.css'))?.body, 'cached /app.css');
  runtime.storage.stores.set('borobiya-static-old', new MockCache());
  runtime.storage.stores.set('borobiya-tiles-v1', new MockCache());
  await runtime.emit('activate');
  assert.equal(runtime.state.claimed, true);
  assert.equal(runtime.storage.stores.has('borobiya-static-old'), false);
  assert.equal(runtime.storage.stores.has('borobiya-static-test-version'), true);
  assert.equal(runtime.storage.stores.has('borobiya-tiles-v1'), true);
});

test('service worker never intercepts private APIs, WebSockets, cross-origin or mutating requests', async () => {
  const runtime = harness();
  await runtime.emit('install');
  for (const relative of ['/_auth/login', '/_user/me', '/_admin/overview', '/ws']) {
    const result = await runtime.emit('fetch', new MockRequest(absolute(relative)));
    assert.equal(result.responded, false, relative);
  }
  const crossOrigin = await runtime.emit('fetch', new MockRequest('https://example.test/app.css'));
  assert.equal(crossOrigin.responded, false);
  const mutation = await runtime.emit('fetch', new MockRequest(absolute('/app.css'), { method: 'POST' }));
  assert.equal(mutation.responded, false);
});

test('static and public responses use stale-while-revalidate and refresh the cache', async () => {
  const runtime = harness();
  await runtime.emit('install');
  const current = runtime.storage.stores.get('borobiya-static-test-version');
  assert.ok(current);
  const asset = absolute('/app.css');
  const cached = await runtime.emit('fetch', new MockRequest(asset));
  assert.equal(cached.responded, true);
  assert.equal(cached.response?.body, 'cached /app.css');
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  assert.equal(current.entries.get(asset)?.body, 'network');
  const health = absolute('/_public/health');
  const publicResult = await runtime.emit('fetch', new MockRequest(health));
  assert.equal(publicResult.responded, true);
  assert.equal(publicResult.response?.body, 'network');
});

test('tile responses are cached, bounded and served offline', async () => {
  const runtime = harness();
  await runtime.emit('install');
  let lastUrl = '';
  for (let index = 0; index < 260; index++) {
    lastUrl = absolute(`/_public/map/tiles/14/${1000 + index}/1000.svg`);
    const result = await runtime.emit('fetch', new MockRequest(lastUrl));
    assert.equal(result.response?.body, 'tile');
  }
  const tiles = runtime.storage.stores.get('borobiya-tiles-v1');
  assert.ok(tiles);
  assert.equal(tiles.entries.size, 256);
  assert.equal(tiles.entries.has(absolute('/_public/map/tiles/14/1000/1000.svg')), false);
  assert.equal(tiles.entries.has(lastUrl), true);
  const before = runtime.fetchCalls.length;
  const cached = await runtime.emit('fetch', new MockRequest(lastUrl));
  assert.equal(cached.response?.body, 'tile');
  assert.equal(runtime.fetchCalls.length, before);
});

test('offline static requests return a cached response or a recoverable error', async () => {
  const runtime = harness();
  await runtime.emit('install');
  const cachedUrl = absolute('/app.css');
  runtime.failUrls.add(cachedUrl);
  const cached = await runtime.emit('fetch', new MockRequest(cachedUrl));
  assert.equal(cached.response?.body, 'cached /app.css');
  const missingUrl = absolute('/missing.css');
  runtime.failUrls.add(missingUrl);
  const missing = await runtime.emit('fetch', new MockRequest(missingUrl));
  assert.equal(missing.responded, true);
  assert.equal(missing.response?.ok, false);
  assert.equal(missing.response?.status, 0);
});
