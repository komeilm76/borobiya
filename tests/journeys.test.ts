import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

let server: TestServer;
let requesterCookie: string;
let companionCookie: string;
let responderCookie: string;
let adminCookie: string;

before(async () => {
  server = await createTestServer();
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});
after(async () => { if (server) await server.close(); });

test('hypothetical requester journey: SOS, dispatch, acceptance, response, completion and rating', async () => {
  const created = await apiFetch(server, '/_user/sos', {
    method: 'POST', cookie: requesterCookie,
    body: {
      incidentTypeId: 'inc_medical', severity: 'high',
      description: 'A cyclist needs immediate medical assistance near the park.',
      latitude: 35.7219, longitude: 51.3347, accuracy: 11, isManual: false
    }
  });
  assert.equal(created.status, 201);
  const sosId = created.json.data.sos.id;
  assert.equal(created.json.data.sos.status, 'pending');

  const board = await apiFetch(server, '/_admin/dispatch', { cookie: adminCookie });
  assert.equal(board.status, 200);
  assert.ok(board.json.data.queue.items.some((item: any) => item.id === sosId));
  const nearest = await apiFetch(server, `/_admin/sos/${sosId}/nearest?latitude=35.7219&longitude=51.3347&limit=10&incidentTypeId=inc_medical`, { cookie: adminCookie });
  assert.equal(nearest.status, 200);
  assert.ok(nearest.json.data.items.some((item: any) => item.id === 'usr_responder'));

  const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie,
    body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
  });
  assert.equal(dispatched.status, 200);
  assert.equal(dispatched.json.data.status, 'dispatched');

  const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: responderCookie });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.data.status, 'accepted');
  assert.equal(accepted.json.data.missionStatus, 'on_the_way');
  const missionId = accepted.json.data.missionId;

  for (const [action, expected] of [['arrive', 'arrived'], ['start', 'in_progress'], ['complete', 'completed']]) {
    const progress = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: responderCookie,
      body: { action, note: `Journey step ${action}` }
    });
    assert.equal(progress.status, 200, progress.text);
    assert.equal(progress.json.data.status, expected);
  }

  const rated = await apiFetch(server, `/_user/missions/${missionId}/rating`, {
    method: 'POST', cookie: requesterCookie, body: { rating: 5, note: 'The responder arrived quickly.' }
  });
  assert.equal(rated.status, 200);
  const final = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requesterCookie });
  assert.equal(final.json.data.status, 'completed');
  assert.equal(final.json.data.mission.id, missionId);
  assert.ok(final.json.data.timeline.length >= 4);
  const missions = await apiFetch(server, '/_user/missions?limit=20', { cookie: responderCookie });
  assert.ok(missions.json.data.items.some((item: any) => item.id === missionId));
});

test('hypothetical requester journey: cancellation with a reason cannot be repeated', async () => {
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
  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.json.data.status, 'cancelled');
  const repeated = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
    method: 'POST', cookie: requesterCookie, body: { reasonId: 'cancel_mistake' }
  });
  assert.equal(repeated.status, 409);
  const final = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requesterCookie });
  assert.equal(final.json.data.status, 'cancelled');
  assert.equal(final.json.data.cancellationReasonId, 'cancel_resolved');
});

test('hypothetical companion journey: live sharing, history playback and snapshot', async () => {
  const now = Date.now();
  const from = now - 3_600_000;
  const to = now + 30_000;
  const share = await apiFetch(server, '/_user/location/shares', {
    method: 'POST', cookie: companionCookie,
    body: { recipientId: 'usr_requester', kind: 'history', historyFrom: from, historyTo: to }
  });
  assert.equal(share.status, 201, share.text);
  assert.equal(share.json.data.share.ownerId, 'usr_companion');
  const range = `from=${from}&to=${to}&limit=50`;
  const history = await apiFetch(server, `/_user/location/history/usr_companion?${range}`, { cookie: requesterCookie });
  assert.equal(history.status, 200, history.text);
  assert.ok(history.json.data.items.length >= 5);
  const snapshot = await apiFetch(server, '/_user/location/snapshot', { cookie: requesterCookie });
  assert.equal(snapshot.status, 200);
  assert.ok(Array.isArray(snapshot.json.data.items));
  const revoked = await apiFetch(server, `/_user/location/shares/${share.json.data.share.shareId}`, { method: 'DELETE', cookie: companionCookie });
  assert.equal(revoked.status, 200);
  const denied = await apiFetch(server, `/_user/location/history/usr_companion?${range}`, { cookie: requesterCookie });
  assert.equal(denied.status, 403);
});

test('hypothetical administrator journey: overview, dispatch board, alerts, settings and exports', async () => {
  const overview = await apiFetch(server, '/_admin/overview', { cookie: adminCookie });
  assert.equal(overview.status, 200);
  assert.ok(overview.json.data.kpis.requestsToday >= 1);
  const active = await apiFetch(server, '/_admin/alerts?includeResolved=true', { cookie: adminCookie });
  assert.ok(active.json.data.items.length >= 1);
  const resolved = await apiFetch(server, `/_admin/alerts/${active.json.data.items[0].id}/resolve`, { method: 'POST', cookie: adminCookie });
  assert.equal(resolved.status, 200);
  const settings = await apiFetch(server, '/_admin/settings', {
    method: 'PUT', cookie: adminCookie,
    body: { sos_auto_dispatch: '0', default_dispatch_radius_m: '3500', mission_ready_required: '1', maintenance_mode: '0' }
  });
  assert.equal(settings.status, 200);
  const users = await apiFetch(server, '/_admin/users.csv', { cookie: adminCookie });
  assert.match(users.text, /id,username,role,active/);
  const audit = await apiFetch(server, '/_admin/audit.csv', { cookie: adminCookie });
  assert.match(audit.text, /id,createdAt,actorUsername/);
});
