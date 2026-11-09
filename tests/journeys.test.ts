// @vitest-environment node
import { afterAll, beforeAll, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, sessionCookie, type TestServer } from './helpers.ts';
import { SECURITY_QUESTIONS } from '../src/server/domain/catalog.ts';

let server: TestServer;
let requesterCookie: string;
let companionCookie: string;
let responderCookie: string;
let adminCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});
afterAll(async () => { if (server) await server.close(); });

it('hypothetical requester journey: SOS, dispatch, acceptance, response, completion and rating', async () => {
  const created = await apiFetch(server, '/_user/sos', {
    method: 'POST', cookie: requesterCookie,
    body: {
      incidentTypeId: 'inc_medical', severity: 'high',
      description: 'A cyclist needs immediate medical assistance near the park.',
      latitude: 35.7219, longitude: 51.3347, accuracy: 11, isManual: false
    }
  });
  expect(created.status).toBe(201);
  const sosId = created.json.data.sos.id;
  expect(created.json.data.sos.status).toBe('pending');

  const board = await apiFetch(server, '/_admin/dispatch', { cookie: adminCookie });
  expect(board.status).toBe(200);
  expect(board.json.data.queue.items.some((item: any) => item.id === sosId)).toBeTruthy();
  const nearest = await apiFetch(server, `/_admin/sos/${sosId}/nearest?latitude=35.7219&longitude=51.3347&limit=10&incidentTypeId=inc_medical`, { cookie: adminCookie });
  expect(nearest.status).toBe(200);
  expect(nearest.json.data.items.some((item: any) => item.id === 'usr_responder')).toBeTruthy();

  const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie,
    body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
  });
  expect(dispatched.status).toBe(200);
  expect(dispatched.json.data.status).toBe('dispatched');

  const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: responderCookie });
  expect(accepted.status).toBe(200);
  expect(accepted.json.data.status).toBe('accepted');
  expect(accepted.json.data.missionStatus).toBe('on_the_way');
  const missionId = accepted.json.data.missionId;

  for (const [action, expected] of [['arrive', 'arrived'], ['start', 'in_progress'], ['complete', 'completed']]) {
    const progress = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: responderCookie,
      body: { action, note: `Journey step ${action}` }
    });
    expect(progress.status, progress.text).toBe(200);
    expect(progress.json.data.status).toBe(expected);
  }

  const rated = await apiFetch(server, `/_user/missions/${missionId}/rating`, {
    method: 'POST', cookie: requesterCookie, body: { rating: 5, note: 'The responder arrived quickly.' }
  });
  expect(rated.status).toBe(200);
  const final = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requesterCookie });
  expect(final.json.data.status).toBe('completed');
  expect(final.json.data.mission.id).toBe(missionId);
  expect(final.json.data.timeline.length >= 4).toBeTruthy();
  const missions = await apiFetch(server, '/_user/missions?limit=20', { cookie: responderCookie });
  expect(missions.json.data.items.some((item: any) => item.id === missionId)).toBeTruthy();
});

it('hypothetical requester journey: cancellation with a reason cannot be repeated', async () => {
  const created = await apiFetch(server, '/_user/sos', {
    method: 'POST', cookie: requesterCookie,
    body: {
      incidentTypeId: 'inc_road', severity: 'low',
      description: 'A minor road incident was reported and then resolved independently.',
      latitude: 35.7201, longitude: 51.3321, accuracy: 18, isManual: false
    }
  });
  const sosId = created.json.data.sos.id;
  const cancelled = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
    method: 'POST', cookie: requesterCookie,
    body: { reasonId: 'cancel_resolved', detail: 'The motorist received help from a passing driver.' }
  });
  expect(cancelled.status).toBe(200);
  expect(cancelled.json.data.status).toBe('cancelled');
  const repeated = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
    method: 'POST', cookie: requesterCookie, body: { reasonId: 'cancel_mistake' }
  });
  expect(repeated.status).toBe(409);
  const final = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requesterCookie });
  expect(final.json.data.status).toBe('cancelled');
  expect(final.json.data.cancellationReasonId).toBe('cancel_resolved');
});

it('hypothetical companion journey: live sharing, history playback and snapshot', async () => {
  const now = Date.now();
  const from = now - 3_600_000;
  const to = now + 30_000;
  const share = await apiFetch(server, '/_user/location/shares', {
    method: 'POST', cookie: companionCookie,
    body: { recipientId: 'usr_requester', kind: 'history', historyFrom: from, historyTo: to }
  });
  expect(share.status, share.text).toBe(201);
  expect(share.json.data.share.ownerId).toBe('usr_companion');
  const range = `from=${from}&to=${to}&limit=50`;
  const history = await apiFetch(server, `/_user/location/history/usr_companion?${range}`, { cookie: requesterCookie });
  expect(history.status, history.text).toBe(200);
  expect(history.json.data.items.length >= 5).toBeTruthy();
  const snapshot = await apiFetch(server, '/_user/location/snapshot', { cookie: requesterCookie });
  expect(snapshot.status).toBe(200);
  expect(Array.isArray(snapshot.json.data.items)).toBeTruthy();
  const revoked = await apiFetch(server, `/_user/location/shares/${share.json.data.share.shareId}`, { method: 'DELETE', cookie: companionCookie });
  expect(revoked.status).toBe(200);
  const denied = await apiFetch(server, `/_user/location/history/usr_companion?${range}`, { cookie: requesterCookie });
  expect(denied.status).toBe(403);
});

it('hypothetical administrator journey: overview, dispatch board, alerts, settings and exports', async () => {
  const overview = await apiFetch(server, '/_admin/overview', { cookie: adminCookie });
  expect(overview.status).toBe(200);
  expect(overview.json.data.kpis.requestsToday >= 1).toBeTruthy();
  const active = await apiFetch(server, '/_admin/alerts?includeResolved=true', { cookie: adminCookie });
  expect(active.json.data.items.length >= 1).toBeTruthy();
  const resolved = await apiFetch(server, `/_admin/alerts/${active.json.data.items[0].id}/resolve`, { method: 'POST', cookie: adminCookie });
  expect(resolved.status).toBe(200);
  const settings = await apiFetch(server, '/_admin/settings', {
    method: 'PUT', cookie: adminCookie,
    body: { sos_auto_dispatch: '0', default_dispatch_radius_m: '3500', mission_ready_required: '1', maintenance_mode: '0' }
  });
  expect(settings.status).toBe(200);
  const users = await apiFetch(server, '/_admin/users.csv', { cookie: adminCookie });
  expect(users.text).toMatch(/id,username,role,active/);
  const audit = await apiFetch(server, '/_admin/audit.csv', { cookie: adminCookie });
  expect(audit.text).toMatch(/id,createdAt,actorUsername/);
});

it('full login-to-rating journey: registration, sharing, SOS, dispatch, acceptance, status and rating', async () => {
  const username = `journey.${Date.now().toString(36)}`;
  const password = 'JourneyPass!2026';
  const securityQuestions = SECURITY_QUESTIONS.map((question) => ({ questionId: question.id, answer: `Journey-${question.id}` }));
  const registered = await apiFetch(server, '/_auth/register', {
    method: 'POST', body: { username, password, securityQuestions }
  });
  expect(registered.status, registered.text).toBe(201);
  const signedIn = await apiFetch(server, '/_auth/login', {
    method: 'POST', body: { username, password, deviceId: 'journey-device' }
  });
  expect(signedIn.status).toBe(200);
  const requester = sessionCookie(signedIn);
  const me = await apiFetch(server, '/_user/me', { cookie: requester });
  expect(me.json.data.username).toBe(username);
  expect(me.json.data.securityReady).toBe(true);

  const share = await apiFetch(server, '/_user/location/shares', {
    method: 'POST', cookie: requester,
    body: { recipientId: 'usr_companion', kind: 'live', durationSeconds: 1800 }
  });
  expect(share.status).toBe(201);
  const created = await apiFetch(server, '/_user/sos', {
    method: 'POST', cookie: requester,
    body: {
      incidentTypeId: 'inc_medical', severity: 'high',
      description: 'End-to-end journey from account creation to mission rating.',
      latitude: 35.7219, longitude: 51.3347, accuracy: 10, isManual: false
    }
  });
  expect(created.status).toBe(201);
  const sosId = created.json.data.sos.id;
  const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie,
    body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
  });
  expect(dispatched.status).toBe(200);
  const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: responderCookie });
  expect(accepted.status).toBe(200);
  const missionId = accepted.json.data.missionId;
  for (const [action, expected] of [['arrive', 'arrived'], ['start', 'in_progress'], ['complete', 'completed']]) {
    const progress = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: responderCookie, body: { action }
    });
    expect(progress.status, progress.text).toBe(200);
    expect(progress.json.data.status).toBe(expected);
  }
  const rated = await apiFetch(server, `/_user/missions/${missionId}/rating`, {
    method: 'POST', cookie: requester, body: { rating: 5, note: 'Complete end-to-end journey.' }
  });
  expect(rated.status).toBe(200);
  const final = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requester });
  expect(final.json.data.status).toBe('completed');
  expect(final.json.data.mission.id).toBe(missionId);
  expect(final.json.data.mission.rating).toBe(5);
  const timeline = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requester });
  expect(timeline.json.data.timeline.length >= 4).toBeTruthy();
});
