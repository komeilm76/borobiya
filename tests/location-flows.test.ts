// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  apiFetch, closeSocket, createTestServer, issueTicket, login, openSocketWithHello, sendJson,
  waitForMessage, websocketUrl, type TestServer
} from './helpers.ts';
import { WS_EVENTS } from '../src/shared/protocol.ts';

/**
 * Location sharing defaults and the publishing pipeline, over the wire: what a live share defaults
 * to when no duration is named, what a history share defaults to when no range is named, the
 * inactive-recipient refusal, and the live-fix rules (staleness, future clamp, headingless rows)
 * as seen from a socket and from the history endpoint.
 */

let server: TestServer;
let adminCookie: string;
let requesterCookie: string;
let requesterSocket: WebSocket;

beforeAll(async () => {
  server = await createTestServer();
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
}, 30_000);

afterAll(async () => {
  if (requesterSocket) await closeSocket(requesterSocket);
  if (server) await server.close();
});

async function socket(): Promise<WebSocket> {
  if (!requesterSocket) {
    const opened = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, requesterCookie)).ticket));
    requesterSocket = opened.socket;
  }
  return requesterSocket;
}

describe('share creation defaults', () => {
  it('defaults a live share to one hour with no history range', async () => {
    const before = Date.now();
    const created = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_companion', kind: 'live' }
    });
    expect(created.status, created.text).toBe(201);
    const after = Date.now();

    const listed = await apiFetch(server, '/_user/location/shares', { cookie: requesterCookie });
    const share = listed.json.data.items.find((item: any) => item.id === created.json.data.share.shareId);
    expect(share).toBeTruthy();
    expect(share.durationSeconds).toBe(3600);
    expect(share.expiresAt).toBeGreaterThanOrEqual(before + 3600_000);
    expect(share.expiresAt).toBeLessThanOrEqual(after + 3600_000 + 1000);
    expect(share.historyFrom).toBeNull();
    expect(share.historyTo).toBeNull();
  });

  it('defaults a history share to the last 24 hours with no duration', async () => {
    const before = Date.now();
    const created = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_companion', kind: 'history' }
    });
    expect(created.status, created.text).toBe(201);
    const after = Date.now();

    // The history share expires at historyTo, so it no longer appears in the live list view;
    // read the stored row to pin the defaults.
    const row = server.app.context.repo.one<Record<string, any>>(
      'SELECT kind, duration_seconds, history_from, history_to, expires_at FROM location_shares WHERE id=?',
      created.json.data.share.shareId);
    expect(row).toBeTruthy();
    expect(row.kind).toBe('history');
    expect(row.duration_seconds).toBeNull();
    expect(Number(row.history_from)).toBeGreaterThanOrEqual(before - 24 * 3600_000 - 1000);
    expect(Number(row.history_from)).toBeLessThanOrEqual(after - 24 * 3600_000 + 1000);
    expect(Number(row.history_to)).toBeGreaterThanOrEqual(before);
    expect(Number(row.history_to)).toBeLessThanOrEqual(after + 1000);
    expect(Number(row.expires_at)).toBe(Number(row.history_to));
  });

  it('maps an unexpired history share through the list view', async () => {
    const now = Date.now();
    const created = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_companion', kind: 'history', historyFrom: now - 1800_000, historyTo: now + 30_000 }
    });
    expect(created.status, created.text).toBe(201);

    const listed = await apiFetch(server, '/_user/location/shares', { cookie: requesterCookie });
    const share = listed.json.data.items.find((item: any) => item.id === created.json.data.share.shareId);
    expect(share).toBeTruthy();
    expect(share.kind).toBe('history');
    expect(share.durationSeconds).toBeNull();
    expect(share.historyFrom).toBe(now - 1800_000);
    expect(share.historyTo).toBe(now + 30_000);
    expect(share.expiresAt).toBe(now + 30_000);
    expect(share.revokedAt).toBeNull();
  });

  it('refuses to share with a deactivated account', async () => {
    server.app.context.repo.run('UPDATE users SET active=0 WHERE id=?', 'usr_companion');
    try {
      const response = await apiFetch(server, '/_user/location/shares', {
        method: 'POST', cookie: requesterCookie,
        body: { recipientId: 'usr_companion', kind: 'live', durationSeconds: 600 }
      });
      expect(response.status).toBe(404);
    } finally {
      server.app.context.repo.run('UPDATE users SET active=1 WHERE id=?', 'usr_companion');
    }
  });
});

describe('live fix publishing', () => {
  it('drops a fix that is already older than the stale window', async () => {
    const ws = await socket();
    const ack = waitForMessage(ws, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.LOCATION_UPDATE);
    sendJson(ws, {
      type: WS_EVENTS.LOCATION_UPDATE,
      latitude: 35.7219, longitude: 51.3347, accuracy: 10,
      recordedAt: Date.now() - 60_000
    });
    expect((await ack).accepted).toBe(true);

    const snapshot = await apiFetch(server, '/_user/location/snapshot', { cookie: requesterCookie });
    expect(snapshot.status).toBe(200);
    // The stale fix is stored for history but never presented as live.
    expect(snapshot.json.data.items).toEqual([]);
  });

  it('publishes without heading or speed and stores nulls in the history', async () => {
    const ws = await socket();
    const ack = waitForMessage(ws, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.LOCATION_UPDATE);
    sendJson(ws, {
      type: WS_EVENTS.LOCATION_UPDATE,
      latitude: 35.7219, longitude: 51.3347, accuracy: 11
    });
    expect((await ack).accepted).toBe(true);

    const snapshot = await apiFetch(server, '/_user/location/snapshot', { cookie: requesterCookie });
    expect(snapshot.json.data.items).toHaveLength(1);
    expect(snapshot.json.data.items[0].heading).toBeNull();
    expect(snapshot.json.data.items[0].speed).toBeNull();
    expect(typeof snapshot.json.data.items[0].recordedAt).toBe('number');

    const history = await apiFetch(server, '/_user/location/history/usr_requester', { cookie: adminCookie });
    expect(history.status, history.text).toBe(200);
    const headingless = history.json.data.items.find((item: any) => item.heading === null && item.speed === null);
    expect(headingless).toBeTruthy();
  });

  it('clamps a future timestamp instead of trusting the client clock', async () => {
    const ws = await socket();
    const future = Date.now() + 5_000;
    const ack = waitForMessage(ws, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.LOCATION_UPDATE);
    sendJson(ws, {
      type: WS_EVENTS.LOCATION_UPDATE,
      latitude: 35.7219, longitude: 51.3347, accuracy: 9,
      recordedAt: future + 60_000
    });
    expect((await ack).accepted).toBe(true);

    const snapshot = await apiFetch(server, '/_user/location/snapshot', { cookie: requesterCookie });
    const fresh = snapshot.json.data.items[0];
    expect(fresh).toBeTruthy();
    expect(fresh.recordedAt).toBeLessThanOrEqual(Date.now() + 5_000);
  });
});

describe('route defaults', () => {
  it('serves login history, user search, sync, reports and incident types without query parameters', async () => {
    const logins = await apiFetch(server, '/_user/logins', { cookie: requesterCookie });
    expect(logins.status, logins.text).toBe(200);
    expect(Array.isArray(logins.json.data.items)).toBe(true);

    const search = await apiFetch(server, '/_user/users/search?q=sa', { cookie: adminCookie });
    expect(search.status, search.text).toBe(200);
    expect(Array.isArray(search.json.data.items)).toBe(true);

    const sync = await apiFetch(server, '/_user/sync', { cookie: requesterCookie });
    expect(sync.status, sync.text).toBe(200);
    expect(Array.isArray(sync.json.data.events)).toBe(true);
    expect(typeof sync.json.data.cursor).toBe('number');

    const reports = await apiFetch(server, '/_admin/reports', { cookie: adminCookie });
    expect(reports.status, reports.text).toBe(200);
    expect(reports.json.data.overview || reports.json.data).toBeTruthy();

    const incidentTypes = await apiFetch(server, '/_admin/incident-types', { cookie: adminCookie });
    expect(incidentTypes.status, incidentTypes.text).toBe(200);
    expect(incidentTypes.json.data.items.length).toBeGreaterThan(0);
  });
});
