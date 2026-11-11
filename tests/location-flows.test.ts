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

describe('share without an expiry', () => {
  it('lists a live share whose expires_at was never set', async () => {
    // Rows restored from a backup or written before expiry was mandatory can carry NULL.
    const context = server.app.context;
    const me = context.repo.one<{ id: string }>("SELECT id FROM users WHERE username = 'saeed.k'");
    expect(me).toBeTruthy();
    context.repo.run(
      "INSERT INTO location_shares(id,owner_id,recipient_id,kind,duration_seconds,expires_at,history_from,history_to,created_at,revoked_at)"
      + " VALUES('shr_unexpiring', ?, 'usr_companion', 'live', NULL, NULL, NULL, NULL, ?, NULL)",
      me!.id, Date.now());
    try {
      const listed = await apiFetch(server, '/_user/location/shares', { cookie: requesterCookie });
      expect(listed.status, listed.text).toBe(200);
      const share = listed.json.data.items.find((item: any) => item.id === 'shr_unexpiring');
      expect(share).toBeTruthy();
      expect(share.expiresAt).toBeNull();
      expect(share.durationSeconds).toBeNull();
    } finally {
      context.repo.run("DELETE FROM location_shares WHERE id = 'shr_unexpiring'");
    }
  });
});

describe('publish with no audience', () => {
  it('acknowledges with zero recipients when nobody shares with the publisher', async () => {
    const cookie = await login(server, 'maryam.a', 'DemoPass!2026');
    const { socket } = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, cookie)).ticket));
    try {
      const ack = waitForMessage(socket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.LOCATION_UPDATE);
      sendJson(socket, {
        type: WS_EVENTS.LOCATION_UPDATE,
        latitude: 35.7000, longitude: 51.4100, accuracy: 12
      });
      expect((await ack).recipients).toBe(0);
    } finally {
      await closeSocket(socket);
    }
  });
});

describe('nearest responders with a cached fix', () => {
  it('serves a live fix for a responder that just published one', async () => {
    const cookie = await login(server, 'reza.m', 'DemoPass!2026');
    const { socket } = await openSocketWithHello(websocketUrl(server, (await issueTicket(server, cookie)).ticket));
    try {
      const ack = waitForMessage(socket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.LOCATION_UPDATE);
      sendJson(socket, {
        type: WS_EVENTS.LOCATION_UPDATE,
        latitude: 35.72, longitude: 51.33, accuracy: 8
      });
      expect((await ack).accepted).toBe(true);

      const nearestSos = await apiFetch(server, '/_user/sos', {
        method: 'POST', cookie: requesterCookie,
        body: { incidentTypeId: 'inc_medical', severity: 'medium', description: 'Nearest probe fixture for the live-fix test.', latitude: 35.72, longitude: 51.33, accuracy: 10, isManual: false }
      });
      expect(nearestSos.status, nearestSos.text).toBe(201);
      const fresh = await apiFetch(server, `/_admin/sos/${nearestSos.json.data.sos.id}/nearest`, { cookie: adminCookie });
      expect(fresh.status, fresh.text).toBe(200);
      const responder = fresh.json.data.items.find((item: any) => item.username === 'reza.m');
      expect(responder?.recordedAt).not.toBeNull();
      expect(responder?.distanceMeters).not.toBeNull();

    } finally {
      await closeSocket(socket);
    }
  });
});

describe('share history (include=all)', () => {
  it('hides revoked shares by default and reports them as revoked with include=all', async () => {
    const created = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_companion', kind: 'live', durationSeconds: 3600 }
    });
    expect(created.status, created.text).toBe(201);
    const shareId = created.json.data.share.shareId as string;
    const revoked = await apiFetch(server, `/_user/location/shares/${shareId}`, { method: 'DELETE', cookie: requesterCookie });
    expect(revoked.status, revoked.text).toBe(200);

    const activeOnly = await apiFetch(server, '/_user/location/shares', { cookie: requesterCookie });
    expect(activeOnly.json.data.items.find((item: any) => item.id === shareId)).toBeUndefined();

    const all = await apiFetch(server, '/_user/location/shares?include=all', { cookie: requesterCookie });
    const row = all.json.data.items.find((item: any) => item.id === shareId);
    expect(row, 'revoked share must be visible with include=all').toBeTruthy();
    expect(row.state).toBe('revoked');
    expect(row.revokedAt).toBeTypeOf('number');
  });

  it('reports an expired share as expired with include=all', async () => {
    const me = server.app.context.repo.one<{ id: string }>("SELECT id FROM users WHERE username = 'saeed.k'");
    const now = Date.now();
    server.app.context.repo.run(
      `INSERT INTO location_shares(id,owner_id,recipient_id,kind,duration_seconds,expires_at,history_from,history_to,created_at,revoked_at)
       VALUES('shr_expired_flows', ?, 'usr_companion', 'live', 60, ?, NULL, NULL, ?, NULL)`,
      me.id, now - 1000, now - 120_000);

    const activeOnly = await apiFetch(server, '/_user/location/shares', { cookie: requesterCookie });
    expect(activeOnly.json.data.items.find((item: any) => item.id === 'shr_expired_flows')).toBeUndefined();

    const all = await apiFetch(server, '/_user/location/shares?include=all', { cookie: requesterCookie });
    const row = all.json.data.items.find((item: any) => item.id === 'shr_expired_flows');
    expect(row.state).toBe('expired');
    // Untouched expired rows must not masquerade as active.
    expect(all.json.data.items.every((item: any) => item.state === 'active' || item.state === 'expired' || item.state === 'revoked')).toBe(true);
  });
});
