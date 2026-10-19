import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

const workerScript = readFileSync(fileURLToPath(new URL("../../public/map-cache-worker.js", import.meta.url)), "utf8");

type WorkerRequest = { method: string; url: string };
type WorkerEvent = {
  request: WorkerRequest;
  respondWith: (response: Promise<Response>) => void;
};
type WorkerFetchHandler = (event: WorkerEvent) => void;

function createWorker(fetcher: (request: WorkerRequest) => Promise<Response>) {
  const handlers: Record<string, (event: never) => void> = {};
  const cachedResponses = new Map<string, Response>();
  const clientMessages: unknown[] = [];
  const cache = {
    async match(request: WorkerRequest) {
      return cachedResponses.get(request.url)?.clone();
    },
    async put(request: WorkerRequest, response: Response) {
      cachedResponses.set(request.url, response.clone());
    },
    async keys() {
      return [...cachedResponses.keys()].map((url) => ({ url }));
    },
    async delete(request: WorkerRequest) {
      return cachedResponses.delete(request.url);
    }
  };
  const workerScope = {
    location: { origin: "https://maps.example.test" },
    addEventListener(name: string, callback: (event: never) => void) {
      handlers[name] = callback;
    },
    skipWaiting: vi.fn(async () => undefined),
    clients: {
      claim: vi.fn(async () => undefined),
      matchAll: vi.fn(async () => [{ postMessage: (message: unknown) => clientMessages.push(message) }])
    }
  };

  runInNewContext(workerScript, {
    self: workerScope,
    caches: {
      open: vi.fn(async () => cache),
      keys: vi.fn(async () => []),
      delete: vi.fn(async () => true)
    },
    fetch: fetcher,
    Response,
    URL
  });

  async function fetchResource(request: WorkerRequest): Promise<Response> {
    let responsePromise: Promise<Response> | undefined;
    const event = {
      request,
      respondWith(response: Promise<Response>) {
        responsePromise = response;
      }
    };
    (handlers.fetch as WorkerFetchHandler)(event);
    if (!responsePromise) throw new Error("The worker did not handle this request.");
    return responsePromise;
  }

  return { cachedResponses, clientMessages, fetchResource, handlers };
}

const tileRequest = { method: "GET", url: "https://maps.example.test/tehran/11/1050/698" };

describe("map resource cache worker", () => {
  it("caches successful map responses and serves them after a network failure", async () => {
    let shouldFail = false;
    const worker = createWorker(async () => {
      if (shouldFail) throw new TypeError("Network is offline");
      return new Response("vector tile", { status: 200 });
    });

    const onlineResponse = await worker.fetchResource(tileRequest);
    expect(await onlineResponse.text()).toBe("vector tile");
    expect(worker.cachedResponses.has(tileRequest.url)).toBe(true);

    shouldFail = true;
    const offlineResponse = await worker.fetchResource(tileRequest);
    expect(offlineResponse.status).toBe(200);
    expect(await offlineResponse.text()).toBe("vector tile");
    expect(worker.clientMessages).toContainEqual({
      type: "borobiya-map-cache-fallback",
      pathname: "/tehran/11/1050/698"
    });
  });

  it("caches style, sprite, and glyph resources as well as vector tiles", async () => {
    const worker = createWorker(async () => new Response("map resource", { status: 200 }));
    const resourceUrls = [
      "https://maps.example.test/map/style/dark",
      "https://maps.example.test/sprite/borobiya@2x.json",
      "https://maps.example.test/font/Noto%20Sans%20Arabic/0-255.pbf"
    ];

    for (const url of resourceUrls) {
      const response = await worker.fetchResource({ method: "GET", url });
      expect(await response.text()).toBe("map resource");
      expect(worker.cachedResponses.has(url)).toBe(true);
    }
  });

  it("serves a cached response when the map server returns a 5xx", async () => {
    let status = 200;
    const worker = createWorker(async () => new Response(status === 200 ? "fresh tile" : "server unavailable", { status }));

    await worker.fetchResource(tileRequest);
    status = 503;

    const fallback = await worker.fetchResource(tileRequest);
    expect(fallback.status).toBe(200);
    expect(await fallback.text()).toBe("fresh tile");
  });

  it("returns a non-cacheable 503 when the network and cache both miss", async () => {
    const worker = createWorker(async () => {
      throw new TypeError("Network is offline");
    });

    const response = await worker.fetchResource(tileRequest);
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain("no cached copy exists");
  });

  it("leaves unrelated, cross-origin, and non-GET requests to the browser", () => {
    const worker = createWorker(vi.fn(async () => new Response("unused")));
    const fetchHandler = worker.handlers.fetch as WorkerFetchHandler;

    for (const request of [
      { method: "GET", url: "https://maps.example.test/map-config" },
      { method: "GET", url: "https://other.example.test/tehran/11/1050/698" },
      { method: "POST", url: "https://maps.example.test/tehran/11/1050/698" }
    ]) {
      let intercepted = false;
      fetchHandler({
        request,
        respondWith() {
          intercepted = true;
        }
      });
      expect(intercepted).toBe(false);
    }
  });
});
