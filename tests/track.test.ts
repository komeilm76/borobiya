// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as sqlite from 'bun:sqlite';
import { loadConfig } from '../src/server/core/config.ts';
import { openDatabase, SCHEMA_VERSION } from '../src/server/db/database.ts';
import {
  apiFetch, createTestServer, login, issueTicket, openSocketWithHello, sendJson, waitForMessage,
  type TestServer
} from './helpers.ts';
import { WS_EVENTS } from '../src/shared/protocol.ts';
import type { AuthIdentity } from '../src/server/core/router.ts';

/**
 * Stage D — trip/mission track recording. Covers the consent gate (account opt-in AND per-context
 * decision), the active-context write window, member/participant replay, share-scoped replay with
 * the grant's scope projection, the audit-logged administrator read, honest summaries that survive
 * the raw-point retention purge (fail-closed), and the v8→v9 migration.
 */

let server: TestServer;
let repo: any;
let requesterCookie: string;
let companionCookie: string;
let responderCookie: string;
let adminCookie: string;
const temporaryDirectories: string[] = [];

const STOPS = [
  { label: 'میدان انقلاب', latitude: 35.7219, longitude: 51.3997 },
  { label: 'بیمارستان امید', latitude: 35.7231, longitude: 51.4122 }
];

const identity = (userId: string, username: string, role = 'user'): AuthIdentity => ({
  userId, username, role, sessionId: `sess-${userId}`, deviceId: 'test-device', ip: '127.0.0.1'
});
const REQUESTER = identity('usr_requester', 'saeed.k', 'user');
const COMPANION = identity('usr_companion', 'maryam.a', 'user');
const RESPONDER = identity('usr_responder', 'reza.m', 'responder');
const ADMIN = identity('usr_admin', 'admin', 'admin');

async function createTrip(cookie: string, body: Record<string, unknown> = {}) {
  const response = await apiFetch(server, '/_user/trips', {
    method: 'POST', cookie, body: { name: 'مسیر ثبت مسیر', stops: STOPS, ...body }
  });
  expect(response.status, response.text).toBe(201);
  return response.json.data;
}

async function startTrip(cookie: string, tripId: string) {
  const response = await apiFetch(server, `/_user/trips/${tripId}/start`, { method: 'POST', cookie });
  expect(response.status, response.text).toBe(200);
  return response.json.data;
}

async function setRecordTrack(cookie: string, enabled: boolean) {
  const response = await apiFetch(server, '/_user/me', {
    method: 'PATCH', cookie, body: { recordTrack: enabled }
  });
  expect(response.status, response.text).toBe(200);
  return response.json.data;
}

function recordPoint(who: AuthIdentity, fix: { latitude: number; longitude: number; accuracy?: number; recordedAt?: number }, context: { type: 'trip' | 'mission'; id: string }) {
  return server.app.context.services.track.recordPoint(who, {
    latitude: fix.latitude, longitude: fix.longitude,
    accuracy: fix.accuracy ?? 12,
    recordedAt: fix.recordedAt ?? Date.now()
  } as any, context);
}

beforeAll(async () => {
  server = await createTestServer();
  repo = server.app.context.repo;
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
}, 30_000);

beforeEach(() => { server.app.context.limiters.clear(); });

afterAll(async () => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
  if (server) await server.close();
});

describe('account opt-in and per-context consent', () => {
  it('exposes recordTrack on /_user/me and defaults it off', async () => {
    const before = await apiFetch(server, '/_user/me', { cookie: requesterCookie });
    expect(before.json.data.recordTrack).toBe(false);
    await setRecordTrack(requesterCookie, true);
    const after = await apiFetch(server, '/_user/me', { cookie: requesterCookie });
    expect(after.json.data.recordTrack).toBe(true);
    const audit = repo.one("SELECT action FROM audit_log WHERE action='user.record_track' ORDER BY id DESC");
    expect(audit?.action).toBe('user.record_track');
    await setRecordTrack(requesterCookie, false);
  });

  it('rejects an empty PATCH body', async () => {
    const response = await apiFetch(server, '/_user/me', { method: 'PATCH', cookie: requesterCookie, body: {} });
    expect(response.status).toBe(400);
  });

  it('records consent per context and embeds it in the trip projection', async () => {
    const trip = await createTrip(requesterCookie);
    await setRecordTrack(requesterCookie, true);
    const declined = await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, {
      method: 'POST', cookie: requesterCookie, body: { decision: 'declined' }
    });
    expect(declined.status).toBe(200);
    const detail = await apiFetch(server, `/_user/trips/${trip.id}`, { cookie: requesterCookie });
    expect(detail.json.data.trackConsent).toBe('declined');
    expect(detail.json.data.trackStatus).toBe('none');
    const accepted = await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, {
      method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' }
    });
    expect(accepted.status).toBe(200);
    const after = await apiFetch(server, `/_user/trips/${trip.id}`, { cookie: requesterCookie });
    expect(after.json.data.trackConsent).toBe('accepted');
    await setRecordTrack(requesterCookie, false);
  });

  it('a non-member cannot consent and cannot replay a trip track', async () => {
    const trip = await createTrip(requesterCookie);
    const refused = await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, {
      method: 'POST', cookie: companionCookie, body: { decision: 'accepted' }
    });
    expect(refused.status).toBe(404);
    const replay = await apiFetch(server, `/_user/trips/${trip.id}/track`, { cookie: companionCookie });
    expect(replay.status).toBe(404);
  });
});

describe('recording gate and replay', () => {
  it('records only with opt-in, accepted consent and an active trip', async () => {
    const trip = await createTrip(requesterCookie);
    // Consent accepted but trip still planned -> nothing is written.
    await setRecordTrack(requesterCookie, true);
    await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' } });
    expect(recordPoint(REQUESTER, { latitude: 35.72, longitude: 51.4 }, { type: 'trip', id: trip.id })).toBe(false);
    await startTrip(requesterCookie, trip.id);
    expect(recordPoint(REQUESTER, { latitude: 35.7200, longitude: 51.4000 }, { type: 'trip', id: trip.id })).toBe(true);
    expect(recordPoint(REQUESTER, { latitude: 35.7201, longitude: 51.4002 }, { type: 'trip', id: trip.id })).toBe(true);
    expect(recordPoint(REQUESTER, { latitude: 35.7202, longitude: 51.4004, accuracy: 250 }, { type: 'trip', id: trip.id })).toBe(false);
    const replay = await apiFetch(server, `/_user/trips/${trip.id}/track`, { cookie: requesterCookie });
    expect(replay.status).toBe(200);
    expect(replay.json.data.access).toBe('member');
    expect(replay.json.data.availability).toBe('available');
    expect(replay.json.data.points).toHaveLength(2);
    const listed = await apiFetch(server, '/_user/trips', { cookie: requesterCookie });
    const row = (listed.json.data.items as Array<any>).find((item) => item.id === trip.id);
    expect(row.trackStatus).toBe('available');
    await setRecordTrack(requesterCookie, false);
  });

  it('declined consent stops writes even with the global toggle on', async () => {
    const trip = await createTrip(requesterCookie);
    await setRecordTrack(requesterCookie, true);
    await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'declined' } });
    await startTrip(requesterCookie, trip.id);
    expect(recordPoint(REQUESTER, { latitude: 35.725, longitude: 51.405 }, { type: 'trip', id: trip.id })).toBe(false);
    await setRecordTrack(requesterCookie, false);
  });

  it('a share-scoped recipient replays only the sharer’s points and only granted details', async () => {
    const trip = await createTrip(requesterCookie);
    await setRecordTrack(requesterCookie, true);
    await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' } });
    await startTrip(requesterCookie, trip.id);
    const base = Date.now();
    recordPoint(REQUESTER, { latitude: 35.7300, longitude: 51.4100, recordedAt: base - 20_000 }, { type: 'trip', id: trip.id });
    recordPoint(REQUESTER, { latitude: 35.7305, longitude: 51.4105, recordedAt: base - 10_000 }, { type: 'trip', id: trip.id });
    const share = await apiFetch(server, '/_user/location/shares', {
      method: 'POST', cookie: requesterCookie,
      body: { recipientId: 'usr_companion', kind: 'history', historyFrom: base - 60_000, historyTo: base + 60_000, scope: ['route'] }
    });
    expect(share.status, share.text).toBe(201);
    const replay = await apiFetch(server, `/_user/trips/${trip.id}/track`, { cookie: companionCookie });
    expect(replay.status, replay.text).toBe(200);
    expect(replay.json.data.access).toBe('share');
    expect(replay.json.data.points.every((point: any) => point.userId === 'usr_requester')).toBe(true);
    expect(replay.json.data.points.every((point: any) => point.accuracy === null)).toBe(true);
    expect(replay.json.data.authorizedUntil).toBe(share.json.data.share.expiresAt);
    // A future window is rejected honestly instead of silently clamped.
    const future = await apiFetch(server, `/_user/trips/${trip.id}/track?from=${base + 3_600_000}&to=${base + 7_200_000}`, { cookie: companionCookie });
    expect([400, 404]).toContain(future.status);
    // Window-scoped grant semantics (same as location history): the companion's grant covers
    // the owner's trail inside the window regardless of which trip produced the points — and
    // only the owner's points, scope-projected.
    const other = await createTrip(requesterCookie);
    await apiFetch(server, `/_user/trips/${other.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' } });
    await startTrip(requesterCookie, other.id);
    recordPoint(REQUESTER, { latitude: 35.7330, longitude: 51.4130 }, { type: 'trip', id: other.id });
    const covered = await apiFetch(server, `/_user/trips/${other.id}/track`, { cookie: companionCookie });
    expect(covered.status).toBe(200);
    expect(covered.json.data.points.every((point: any) => point.userId === 'usr_requester')).toBe(true);
    // Revoking the grant removes the basis for access immediately.
    const revoked = await apiFetch(server, `/_user/location/shares/${share.json.data.share.shareId}`, { method: 'DELETE', cookie: requesterCookie });
    expect(revoked.status).toBe(200);
    const afterRevoke = await apiFetch(server, `/_user/trips/${other.id}/track`, { cookie: companionCookie });
    expect(afterRevoke.status).toBe(404);
    await setRecordTrack(requesterCookie, false);
  });

  it('administrator track read is audit-logged with counts only, never coordinates', async () => {
    const trip = await createTrip(requesterCookie);
    await setRecordTrack(requesterCookie, true);
    await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' } });
    await startTrip(requesterCookie, trip.id);
    recordPoint(REQUESTER, { latitude: 35.7310, longitude: 51.4110 }, { type: 'trip', id: trip.id });
    const read = await apiFetch(server, `/_admin/tracks/trip/${trip.id}`, { cookie: adminCookie });
    expect(read.status).toBe(200);
    expect(read.json.data.access).toBe('admin');
    expect(read.json.data.points.length).toBe(1);
    const audit = repo.one("SELECT meta_json FROM audit_log WHERE action='admin.track.read' ORDER BY id DESC");
    expect(audit).toBeTruthy();
    expect(audit.meta_json).not.toContain('latitude');
    expect(JSON.parse(audit.meta_json).pointCount).toBe(1);
    await setRecordTrack(requesterCookie, false);
  });
});

describe('retention keeps summaries, never the raw points', () => {
  it('purge deletes only raw points, persists summaries first, and keeps trip rows intact', async () => {
    const trip = await createTrip(requesterCookie);
    await setRecordTrack(requesterCookie, true);
    await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' } });
    await startTrip(requesterCookie, trip.id);
    const base = Date.now() - 200 * 86_400_000;
    recordPoint(REQUESTER, { latitude: 35.7400, longitude: 51.4200, recordedAt: base }, { type: 'trip', id: trip.id });
    recordPoint(REQUESTER, { latitude: 35.7410, longitude: 51.4210, recordedAt: base + 60_000 }, { type: 'trip', id: trip.id });
    recordPoint(REQUESTER, { latitude: 35.7420, longitude: 51.4220, recordedAt: base + 120_000 }, { type: 'trip', id: trip.id });
    const purged = server.app.context.services.track.purgeExpiredTrackPoints();
    expect(purged.deleted).toBeGreaterThanOrEqual(3);
    expect(purged.blocked).toBe(0);
    const remaining = repo.one('SELECT COUNT(*) AS c FROM track_points WHERE context_type=? AND context_id=?', 'trip', trip.id);
    expect(Number(remaining.c)).toBe(0);
    const tripRow = repo.one('SELECT id, name, status FROM trips WHERE id=?', trip.id);
    expect(tripRow?.id).toBe(trip.id);
    expect(Number(repo.one('SELECT COUNT(*) AS c FROM trip_stops WHERE trip_id=?', trip.id).c)).toBe(2);
    // The summary outlives the points: distance is preserved, replay reports expired honestly.
    const summary = repo.one('SELECT distance_m, duration_ms, quality FROM track_summaries WHERE context_type=? AND context_id=? AND user_id=?', 'trip', trip.id, 'usr_requester');
    expect(summary).toBeTruthy();
    expect(Number(summary.distance_m)).toBeGreaterThan(0);
    expect(Number(summary.duration_ms)).toBe(120_000);
    expect(String(summary.quality)).toBe('ok');
    const replay = await apiFetch(server, `/_user/trips/${trip.id}/track`, { cookie: requesterCookie });
    expect(replay.json.data.availability).toBe('expired');
    expect(replay.json.data.points).toHaveLength(0);
    expect(replay.json.data.summaries[0].quality).toBe('ok');
    const detail = await apiFetch(server, `/_user/trips/${trip.id}`, { cookie: requesterCookie });
    expect(detail.json.data.trackStatus).toBe('expired');
    await setRecordTrack(requesterCookie, false);
  });

  it('a context whose summary cannot be persisted keeps every point (fail-closed)', async () => {
    const trip = await createTrip(requesterCookie);
    await setRecordTrack(requesterCookie, true);
    await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' } });
    await startTrip(requesterCookie, trip.id);
    const base = Date.now() - 200 * 86_400_000;
    recordPoint(REQUESTER, { latitude: 35.7500, longitude: 51.4300, recordedAt: base }, { type: 'trip', id: trip.id });
    recordPoint(REQUESTER, { latitude: 35.7505, longitude: 51.4305, recordedAt: base + 30_000 }, { type: 'trip', id: trip.id });
    const track = server.app.context.services.track as any;
    const original = track.ensureSummary.bind(track);
    track.ensureSummary = () => { throw new Error('disk full'); };
    try {
      const purged = track.purgeExpiredTrackPoints();
      expect(purged.blocked).toBe(1);
    } finally {
      track.ensureSummary = original;
    }
    const remaining = repo.one('SELECT COUNT(*) AS c FROM track_points WHERE context_type=? AND context_id=?', 'trip', trip.id);
    expect(Number(remaining.c)).toBe(2);
    await setRecordTrack(requesterCookie, false);
  });

  it('a single point yields insufficient_data, never a zero-distance fabrication', async () => {
    const trip = await createTrip(requesterCookie);
    await setRecordTrack(requesterCookie, true);
    await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' } });
    await startTrip(requesterCookie, trip.id);
    recordPoint(REQUESTER, { latitude: 35.7600, longitude: 51.4400 }, { type: 'trip', id: trip.id });
    server.app.context.services.track.finalizeContext('trip', trip.id);
    const summary = repo.one('SELECT distance_m, duration_ms, quality FROM track_summaries WHERE context_type=? AND context_id=?', 'trip', trip.id);
    expect(String(summary.quality)).toBe('insufficient_data');
    expect(summary.distance_m).toBeNull();
    expect(summary.duration_ms).toBeNull();
    await setRecordTrack(requesterCookie, false);
  });

  it('teleport segments are rejected; distance is never an estimate', async () => {
    const trip = await createTrip(requesterCookie);
    await setRecordTrack(requesterCookie, true);
    await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' } });
    await startTrip(requesterCookie, trip.id);
    const base = Date.now();
    recordPoint(REQUESTER, { latitude: 35.7000, longitude: 51.3000, recordedAt: base }, { type: 'trip', id: trip.id });
    recordPoint(REQUESTER, { latitude: 36.7000, longitude: 52.3000, recordedAt: base + 5_000 }, { type: 'trip', id: trip.id });
    server.app.context.services.track.finalizeContext('trip', trip.id);
    const summary = repo.one('SELECT distance_m, quality FROM track_summaries WHERE context_type=? AND context_id=?', 'trip', trip.id);
    expect(String(summary.quality)).toBe('insufficient_data');
    expect(summary.distance_m).toBeNull();
    await setRecordTrack(requesterCookie, false);
  });

  it('the retention window is configurable and never touches fresh points', async () => {
    const longRetention = await createTestServer({ tripTrackRetentionDays: 3650 });
    try {
      const base = Date.now() - 400 * 86_400_000;
      repo = server.app.context.repo;
      const t = await apiFetch(longRetention, '/_user/trips', {
        method: 'POST', cookie: await login(longRetention, 'saeed.k', 'DemoPass!2026'),
        body: { name: 'retention fixture', stops: STOPS }
      });
      const tripId = t.json.data.id as string;
      const ctx = longRetention.app.context;
      const cookie = await login(longRetention, 'saeed.k', 'DemoPass!2026');
      await apiFetch(longRetention, '/_user/me', { method: 'PATCH', cookie, body: { recordTrack: true } });
      await apiFetch(longRetention, `/_user/trips/${tripId}/start`, { method: 'POST', cookie });
      await apiFetch(longRetention, `/_user/trips/${tripId}/track-consent`, { method: 'POST', cookie, body: { decision: 'accepted' } });
      const who = identity('usr_requester', 'saeed.k', 'user');
      ctx.services.track.recordPoint(who, { latitude: 35.77, longitude: 51.45, accuracy: 10, recordedAt: base }, { type: 'trip', id: tripId });
      const purged = ctx.services.track.purgeExpiredTrackPoints();
      expect(purged.deleted).toBe(0);
    } finally {
      await longRetention.close();
    }
  });
});

describe('mission track end to end', () => {
  it('records the assigned responder’s track, replays for participants only', async () => {
    const sos = await apiFetch(server, '/_user/sos', {
      method: 'POST', cookie: requesterCookie,
      body: { incidentTypeId: 'inc_medical', severity: 'high', description: 'Mission track fixture incident.', latitude: 35.7219, longitude: 51.3347, accuracy: 12, isManual: false }
    });
    expect(sos.status, sos.text).toBe(201);
    const sosId = sos.json.data.sos.id as string;
    const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds: ['usr_responder'], mode: 'immediate' }
    });
    expect(dispatched.status, dispatched.text).toBeLessThan(300);
    const missionId = repo.one('SELECT id FROM missions WHERE sos_id=?', sosId).id;
    await setRecordTrack(responderCookie, true);
    const consentResponse = await apiFetch(server, `/_user/missions/${missionId}/track-consent`, {
      method: 'POST', cookie: responderCookie, body: { decision: 'accepted' }
    });
    expect(consentResponse.status).toBe(200);
    expect(recordPoint(RESPONDER, { latitude: 35.7225, longitude: 51.3350 }, { type: 'mission', id: missionId })).toBe(true);
    const replayRequester = await apiFetch(server, `/_user/missions/${missionId}/track`, { cookie: requesterCookie });
    expect(replayRequester.status).toBe(200);
    expect(replayRequester.json.data.access).toBe('participant');
    expect(replayRequester.json.data.points).toHaveLength(1);
    const replayOutsider = await apiFetch(server, `/_user/missions/${missionId}/track`, { cookie: companionCookie });
    expect(replayOutsider.status).toBe(404);
    const missions = await apiFetch(server, '/_user/missions', { cookie: responderCookie });
    const row = (missions.json.data.items as Array<any>).find((item) => item.id === missionId);
    expect(row.trackStatus).toBe('available');
    await setRecordTrack(responderCookie, false);
  });
});

describe('wire path', () => {
  it('location.update over WebSocket persists the track point when consented', async () => {
    const trip = await createTrip(requesterCookie);
    await setRecordTrack(requesterCookie, true);
    await apiFetch(server, `/_user/trips/${trip.id}/track-consent`, { method: 'POST', cookie: requesterCookie, body: { decision: 'accepted' } });
    await startTrip(requesterCookie, trip.id);
    const ticket = await issueTicket(server, requesterCookie);
    const { socket } = await openSocketWithHello(`${server.base.replace(/^http:/, 'ws:')}/ws?ticket=${encodeURIComponent(ticket.ticket)}`);
    try {
      const ack = waitForMessage(socket, (message) => message.type === WS_EVENTS.ACK && message.kind === WS_EVENTS.LOCATION_UPDATE);
      sendJson(socket, {
        type: WS_EVENTS.LOCATION_UPDATE, requestId: 'track-1',
        latitude: 35.7355, longitude: 51.4155, accuracy: 8, recordedAt: Date.now(),
        contextType: 'trip', contextId: trip.id
      });
      await ack;
      const replay = await apiFetch(server, `/_user/trips/${trip.id}/track`, { cookie: requesterCookie });
      expect(replay.json.data.points.some((point: any) => point.latitude === 35.7355)).toBe(true);
    } finally {
      socket.close();
      await setRecordTrack(requesterCookie, false);
    }
  });
});

describe('migration v8 to v9', () => {
  it('a v8 database gains track tables and users.record_track without touching rows', async () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'borobiya-track-migration-'));
    temporaryDirectories.push(directory);
    const databasePath = path.join(directory, 'legacy.sqlite');
    const legacy = new (sqlite as any).Database(databasePath);
    legacy.exec(`
      CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT INTO meta(key,value) VALUES('schema_version','8');
      CREATE TABLE users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1,
        security_ready INTEGER NOT NULL DEFAULT 0,
        must_complete_security_questions INTEGER NOT NULL DEFAULT 1,
        ready_for_mission INTEGER NOT NULL DEFAULT 0,
        failed_logins INTEGER NOT NULL DEFAULT 0, locked_until INTEGER,
        average_rating REAL NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      INSERT INTO users(id,username,password_hash,role,active,security_ready,must_complete_security_questions,ready_for_mission,created_at,updated_at)
        VALUES('usr_legacy','legacy.user','unused','user',1,1,0,0,1,1);
    `);
    legacy.close();
    const config = loadConfig({
      environment: 'test', databasePath, dataDir: directory,
      adminPassword: 'MigrationPass!2026', seedDemoUsers: false, startJobs: false
    });
    const database = openDatabase(config);
    try {
      const columns = database.prepare('PRAGMA table_info(users)').all() as Array<{ name: string }>;
      expect(columns.some((column) => column.name === 'record_track')).toBe(true);
      const row = database.prepare('SELECT record_track FROM users WHERE id=?').get('usr_legacy') as { record_track: number };
      expect(Number(row.record_track)).toBe(0);
      for (const table of ['track_points', 'track_consents', 'track_summaries']) {
        const found = database.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(table);
        expect(found, table).toBeTruthy();
      }
      const version = database.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get() as { value: string };
      expect(version.value).toBe(String(SCHEMA_VERSION));
    } finally {
      database.close();
    }
  });
});
