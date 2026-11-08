/** Shared test harness for the new dependency-free Borobiya stack. */
import assert from 'node:assert/strict';
import { createApp, type BorobiyaApp } from '../src/app.ts';
import type { ConfigOverrides } from '../src/core/config.ts';
import { AUDIO, WS_EVENTS } from '../public/js/protocol.js';

export interface TestServer {
  app: BorobiyaApp;
  base: string;
  origin: string;
  port: number;
  close(): Promise<void>;
}

export interface ApiResponse {
  status: number;
  headers: Headers;
  json: any;
  text: string;
}

export async function createTestServer(overrides: ConfigOverrides = {}): Promise<TestServer> {
  const app = await createApp({
    nodeEnv: 'test',
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

export async function apiFetch(server: TestServer, path: string, options: {
  method?: string;
  body?: unknown;
  cookie?: string;
  origin?: string | null;
  headers?: Record<string, string>;
} = {}): Promise<ApiResponse> {
  const method = options.method || 'GET';
  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...(options.origin === null ? {} : { Origin: options.origin || server.origin }),
    ...(options.headers || {})
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
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status, headers: response.headers, json, text };
}

export function sessionCookie(response: ApiResponse): string {
  const raw = response.headers.get('set-cookie');
  assert.ok(raw, 'login response must set a session cookie');
  return raw.split(';')[0];
}

export async function login(server: TestServer, username: string, password: string): Promise<string> {
  const response = await apiFetch(server, '/_auth/login', {
    method: 'POST',
    body: { username, password, deviceId: 'test-device', deviceName: 'Node test' }
  });
  assert.equal(response.status, 200, response.text);
  assert.equal(response.json.ok, true);
  return sessionCookie(response);
}

export async function issueTicket(server: TestServer, cookie: string): Promise<any> {
  const response = await apiFetch(server, '/_user/realtime/ticket', { method: 'POST', cookie });
  assert.equal(response.status, 200, response.text);
  assert.ok(response.json.data.ticket);
  return response.json.data;
}

export function websocketUrl(server: TestServer, ticket: string): string {
  return `${server.base.replace(/^http:/, 'ws:')}/ws?ticket=${encodeURIComponent(ticket)}`;
}

export async function openSocket(url: string): Promise<WebSocket> {
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 4000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket open failed')); }, { once: true });
  });
  return socket;
}

export async function openSocketWithHello(url: string): Promise<{ socket: WebSocket; hello: any }> {
  const socket = new WebSocket(url);
  socket.binaryType = 'arraybuffer';
  const hello = waitForMessage(socket, (message) => message?.type === WS_EVENTS.HELLO);
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 4000);
    socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
    socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket open failed')); }, { once: true });
  });
  return { socket, hello: await hello };
}

export function waitForMessage(socket: WebSocket, predicate: (message: any) => boolean, timeout = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.removeEventListener('message', handler);
      reject(new Error('Timed out waiting for WebSocket message'));
    }, timeout);
    const handler = (event: MessageEvent) => {
      let message: any = event.data;
      if (typeof message === 'string') {
        try { message = JSON.parse(message); } catch { /* text frames are ignored by protocol tests */ }
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

export function sendJson(socket: WebSocket, payload: unknown): void {
  socket.send(JSON.stringify(payload));
}

export function audioFrame(talkId: number, sequence: number, payloadLength = 320): ArrayBuffer {
  const frame = new ArrayBuffer(AUDIO.HEADER_BYTES + payloadLength);
  const header = new DataView(frame);
  header.setUint8(0, AUDIO.VERSION);
  header.setUint8(1, AUDIO.TYPE);
  header.setUint32(2, talkId, false);
  header.setUint32(6, sequence, false);
  return frame;
}

export function closeSocket(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    if (socket.readyState === WebSocket.CLOSED) { resolve(); return; }
    socket.addEventListener('close', () => resolve(), { once: true });
    try { socket.close(1000, 'test complete'); } catch { resolve(); }
    setTimeout(() => resolve(), 1000).unref?.();
  });
}

export function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
