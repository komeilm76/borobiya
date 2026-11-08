import { expect } from 'vitest';
import { createApp, type BorobiyaApp } from '../src/server/app.ts';
import type { ConfigOverrides } from '../src/server/core/config.ts';
import { AUDIO, WS_EVENTS } from '../src/shared/protocol.ts';

/** A running in-process Bun server used by API, realtime and script suites. */
export interface TestServer {
  app: BorobiyaApp;
  base: string;
  origin: string;
  port: number;
  close(): Promise<void>;
}

/** Parsed HTTP response with both JSON and text views. */
export interface ApiResponse {
  status: number;
  headers: Headers;
  json: any;
  text: string;
}

/**
 * Boots the real application on an ephemeral port with a throwaway SQLite database.
 *
 * @param overrides Configuration overrides for the scenario under test.
 * @returns A connected test server.
 */
export async function createTestServer(overrides: ConfigOverrides = {}): Promise<TestServer> {
  const app = await createApp({
    environment: 'test',
    host: '127.0.0.1',
    port: 0,
    databasePath: ':memory:',
    dataDir: './data',
    adminUsername: 'admin',
    adminPassword: 'AdminPass!2026',
    seedDemoUsers: true,
    startJobs: false,
    allowedOrigins: [],
    cookieSecure: false,
    trustProxy: false,
    ...overrides
  });
  const info = await app.listen(0, '127.0.0.1');
  return {
    app,
    base: info.url,
    origin: `http://127.0.0.1:${info.port}`,
    port: info.port,
    close: () => app.close()
  };
}

/**
 * Issues a request against the test server with sane JSON defaults.
 *
 * @param server The running test server.
 * @param path API path.
 * @param options Method, body, cookie, origin and extra headers.
 * @returns The parsed response.
 */
export async function apiFetch(
  server: TestServer,
  path: string,
  options: {
    method?: string;
    body?: unknown;
    cookie?: string;
    origin?: string | null;
    headers?: Record<string, string>;
  } = {}
): Promise<ApiResponse> {
  const method = options.method ?? 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.origin === null ? {} : { Origin: options.origin ?? server.origin }),
    ...(options.headers ?? {})
  };
  if (options.body !== undefined && method !== 'GET' && method !== 'HEAD') headers['Content-Type'] = 'application/json';
  if (options.cookie) headers.Cookie = options.cookie;
  const response = await fetch(new URL(path, server.base), {
    method,
    headers,
    body: options.body === undefined || method === 'GET' || method === 'HEAD' ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, headers: response.headers, json, text };
}

/** Extracts the session cookie from a login response. */
export function sessionCookie(response: ApiResponse): string {
  const raw = response.headers.get('set-cookie');
  expect(raw, 'login response must set a session cookie').toBeTruthy();
  return String(raw).split(';')[0];
}

/**
 * Signs in a demo or administrator account.
 *
 * @param server The running test server.
 * @param username Account name.
 * @param password Account password.
 * @returns The `bb_session` cookie pair.
 */
export async function login(server: TestServer, username: string, password: string): Promise<string> {
  const response = await apiFetch(server, '/_auth/login', {
    method: 'POST',
    body: { username, password, deviceId: 'test-device', deviceName: 'Bun test' }
  });
  expect(response.status, response.text).toBe(200);
  expect(response.json.ok).toBe(true);
  return sessionCookie(response);
}

/** Requests a one-use realtime ticket. */
export async function issueTicket(server: TestServer, cookie: string): Promise<any> {
  const response = await apiFetch(server, '/_user/realtime/ticket', { method: 'POST', cookie });
  expect(response.status, response.text).toBe(200);
  expect(response.json.data.ticket).toBeTruthy();
  return response.json.data;
}

/** Builds the WebSocket URL for a ticket. */
export function websocketUrl(server: TestServer, ticket: string): string {
  return `${server.base.replace(/^http:/, 'ws:')}/ws?ticket=${encodeURIComponent(ticket)}`;
}

/**
 * Opens a socket and waits for the connection to be established.
 *
 * @param url WebSocket URL including the ticket.
 * @returns The open socket.
 */
export async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 4000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket open failed'));
    }, { once: true });
  });
  return socket;
}

/**
 * Opens a socket and resolves the first `hello` message.
 *
 * @param url WebSocket URL including the ticket.
 * @returns The socket plus its hello payload.
 */
export async function openSocketWithHello(url: string): Promise<{ socket: WebSocket; hello: any }> {
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  const hello = waitForMessage(socket, (message) => message?.type === WS_EVENTS.HELLO);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 4000);
    socket.addEventListener('open', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
    socket.addEventListener('error', () => {
      clearTimeout(timer);
      reject(new Error('WebSocket open failed'));
    }, { once: true });
  });
  return { socket, hello: await hello };
}

/**
 * Waits for the first JSON message matching a predicate.
 *
 * @param socket Connected socket.
 * @param predicate Message filter.
 * @param timeout Failure timeout in milliseconds.
 * @returns The matching message.
 */
export function waitForMessage(socket: WebSocket, predicate: (message: any) => boolean, timeout = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', handler);
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeout);
    const handler = (event: MessageEvent) => {
      let message: any = event.data;
      if (typeof message === 'string') {
        try {
          message = JSON.parse(message);
        } catch {
          return;
        }
      }
      if (predicate(message)) {
        clearTimeout(timer);
        socket.removeEventListener('message', handler);
        resolve(message);
      }
    };
    socket.addEventListener('message', handler);
  });
}

/** Waits for the first binary frame matching a predicate. */
export function waitForBinary(socket: WebSocket, predicate: (frame: ArrayBuffer) => boolean, timeout = 4000): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', handler);
      reject(new Error('Timed out waiting for binary audio frame'));
    }, timeout);
    const handler = (event: MessageEvent) => {
      if (!(event.data instanceof ArrayBuffer)) return;
      if (predicate(event.data)) {
        clearTimeout(timer);
        socket.removeEventListener('message', handler);
        resolve(event.data);
      }
    };
    socket.addEventListener('message', handler);
  });
}

/** Sends a JSON message on a socket. */
export function sendJson(socket: WebSocket, payload: unknown): void {
  socket.send(JSON.stringify(payload));
}

/** Builds a valid binary audio frame for floor-control tests. */
export function audioFrame(talkId: number, sequence: number, payloadLength = 320): ArrayBuffer {
  const frame = new ArrayBuffer(AUDIO.HEADER_BYTES + payloadLength);
  const header = new DataView(frame);
  header.setUint8(0, AUDIO.VERSION);
  header.setUint8(1, AUDIO.TYPE);
  header.setUint32(2, talkId, false);
  header.setUint32(6, sequence, false);
  return frame;
}

/** Closes a socket and waits for the close handshake. */
export function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) {
      resolve();
      return;
    }
    socket.addEventListener('close', () => resolve(), { once: true });
    try {
      socket.close(1000, 'test complete');
    } catch {
      resolve();
    }
    setTimeout(() => resolve(), 1000);
  });
}

/** Resolves after a delay. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
