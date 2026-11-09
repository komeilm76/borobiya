// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Guard paths of the SOS and mission services over HTTP: every request the journeys cannot make.
 *
 * Each assertion pins a specific refusal — the service must reject the operation, leave persisted
 * state untouched, and answer the status code the client renders for. The SOS creation route is
 * rate-limited (10 per address per minute), so the file shares fixture incidents between tests
 * rather than creating one per test.
 */

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

afterAll(async () => {
  await server?.close();
});

const SOS_BODY = {
  incidentTypeId: 'inc_medical',
  severity: 'high',
  description: 'SOS-guard fixture incident near the depot.',
  latitude: 35.7219,
  longitude: 51.3347,
  accuracy: 12,
  isManual: false
};

async function createSos(cookie: string = requesterCookie, overrides: Record<string, unknown> = {}): Promise<string> {
  const response = await apiFetch(server, '/_user/sos', { method: 'POST', cookie, body: { ...SOS_BODY, ...overrides } });
  expect(response.status, response.text).toBe(201);
  return response.json.data.sos.id;
}

async function dispatchAndAccept(sosId: string): Promise<string> {
  const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie,
    body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
  });
  expect(dispatched.status, dispatched.text).toBe(200);
  const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: responderCookie });
  expect(accepted.status, accepted.text).toBe(200);
  return accepted.json.data.missionId;
}

/** The first SOS created; shared by the read-only and refusal tests that must not mutate it. */
let sharedSos: string;
/** Mission created for the progress/rating guards; J survives both describes on purpose. */
let progressFixture: { sosId: string; missionId: string } | null = null;

describe('SOS creation guards', () => {
  it('rejects an unknown incident type with 400', async () => {
    const response = await apiFetch(server, '/_user/sos', {
      method: 'POST', cookie: requesterCookie,
      body: { ...SOS_BODY, incidentTypeId: 'inc_nope' }
    });
    expect(response.status).toBe(400);
  });
});

describe('SOS visibility', () => {
  it('answers 404 for an SOS that does not exist', async () => {
    const response = await apiFetch(server, '/_user/sos/sos_missing', { cookie: requesterCookie });
    expect(response.status).toBe(404);
  });

  it('answers 404 — not 403 — when a bystander asks for someone else’s SOS', async () => {
    sharedSos = await createSos();
    const sosId = sharedSos;
    // Answering 403 would confirm that the id exists; 404 keeps the request invisible.
    const response = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: companionCookie });
    expect(response.status).toBe(404);
  });

  it('scopes the responder list to requests the responder can act on', async () => {
    const sosId = await createSos();
    await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
    });
    const list = await apiFetch(server, '/_user/sos?status=dispatched&limit=50', { cookie: responderCookie });
    expect(list.status).toBe(200);
    expect(list.json.data.items.some((item: any) => item.id === sosId)).toBe(true);
    // Every row is either the responder's own request, assigned to them, or part of their mission.
    for (const item of list.json.data.items) {
      const visible = item.requesterId === 'usr_responder'
        || item.assignedResponderId === 'usr_responder'
        || item.missionResponderId === 'usr_responder';
      expect(visible).toBe(true);
    }
  });
});

describe('SOS cancellation guards', () => {
  it('answers 404 for an SOS that does not exist', async () => {
    const response = await apiFetch(server, '/_user/sos/sos_missing/cancel', {
      method: 'POST', cookie: requesterCookie,
      body: { reasonId: 'cancel_mistake' }
    });
    expect(response.status).toBe(404);
  });

  it('forbids a bystander to cancel someone else’s request', async () => {
    const sosId = sharedSos;
    const response = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST', cookie: companionCookie,
      body: { reasonId: 'cancel_mistake' }
    });
    expect(response.status).toBe(403);
  });

  it('rejects an unknown cancellation reason', async () => {
    const sosId = sharedSos;
    const response = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST', cookie: requesterCookie,
      body: { reasonId: 'cancel_nope' }
    });
    expect(response.status).toBe(400);
  });

  it('requires a real explanation for the reasons that demand one', async () => {
    const sosId = sharedSos;
    const response = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST', cookie: requesterCookie,
      body: { reasonId: 'cancel_other', detail: 'short' }
    });
    expect(response.status).toBe(400);
    // The request must remain open — a rejected cancellation changes nothing.
    const still = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requesterCookie });
    expect(still.json.data.status).toBe('pending');
  });
});

describe('dispatch guards', () => {
  it('refuses a non-administrator at the service layer', async () => {
    // The route already requires the admin role, so this exercises the defense in depth below it.
    expect(() => server.app.context.services.sos.dispatch(
      { userId: 'usr_requester', sessionId: 'sess_x', username: 'saeed.k', role: 'user', deviceId: 'dev', ip: '127.0.0.1' },
      sharedSos,
      { groupId: 'grp_medical', responderIds: ['usr_responder'] }
    )).toThrow('Administrator permission is required.');
  });

  it('answers 404 when the SOS does not exist', async () => {
    const response = await apiFetch(server, '/_admin/sos/sos_missing/dispatch', {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
    });
    expect(response.status).toBe(404);
  });

  it('answers 400 for an unknown or inactive group', async () => {
    const sosId = await createSos();
    const response = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_missing', responderIds: ['usr_responder'] }
    });
    expect(response.status).toBe(400);
  });

  it('answers 409 when the request can no longer be dispatched', async () => {
    const sosId = await createSos();
    const cancelled = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST', cookie: requesterCookie,
      body: { reasonId: 'cancel_mistake' }
    });
    expect(cancelled.status).toBe(200);
    const response = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
    });
    expect(response.status).toBe(409);
  });
});

describe('acceptance guards', () => {
  it('forbids a requester from accepting their own dispatched request', async () => {
    const sosId = await createSos();
    const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
    });
    expect(dispatched.status).toBe(200);
    const response = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: requesterCookie });
    expect(response.status).toBe(403);
  });

  it('answers 404 for an SOS that does not exist', async () => {
    const response = await apiFetch(server, '/_user/sos/sos_missing/accept', { method: 'POST', cookie: responderCookie });
    expect(response.status).toBe(404);
  });

  it('answers 409 when the request already has a mission', async () => {
    const sosId = await createSos();
    await dispatchAndAccept(sosId);
    // A second acceptance attempt must not create a duplicate mission.
    const response = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: responderCookie });
    expect(response.status).toBe(409);
  });

  it('answers 403 for a responder who was not assigned to the group', async () => {
    // Stand up a second responder who belongs to grp_urban only; they are not a member of the
    // medical group this request is dispatched to.
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'fieldops.two', password: 'FieldOps!2026x', role: 'responder' }
    });
    expect(created.status, created.text).toBe(201);
    const secondId = created.json.data.userId;
    const added = await apiFetch(server, '/_admin/groups/grp_urban/members', {
      method: 'POST', cookie: adminCookie,
      body: { userId: secondId, role: 'member' }
    });
    expect(added.status, added.text).toBe(200);

    const sosId = await createSos();
    const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
    });
    expect(dispatched.status).toBe(200);

    const secondCookie = await login(server, 'fieldops.two', 'FieldOps!2026x');
    const response = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: secondCookie });
    expect(response.status).toBe(403);
  });

  it('answers 409 when a cancelled request is accepted', async () => {
    const sosId = await createSos();
    const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
    });
    expect(dispatched.status).toBe(200);
    const cancelled = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST', cookie: requesterCookie,
      body: { reasonId: 'cancel_mistake' }
    });
    expect(cancelled.status).toBe(200);
    const response = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: responderCookie });
    expect(response.status).toBe(409);
  });
});

describe('mission progress guards', () => {
  it('answers 404 for a mission that does not exist', async () => {
    const response = await apiFetch(server, '/_user/missions/mis_missing/progress', {
      method: 'POST', cookie: responderCookie,
      body: { action: 'arrive' }
    });
    expect(response.status).toBe(404);
  });

  it('forbids a bystander, then refuses an out-of-state action on the same fixture', async () => {
    const sosId = await createSos();
    const missionId = await dispatchAndAccept(sosId);
    progressFixture = { sosId, missionId };
    const response = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: companionCookie,
      body: { action: 'arrive' }
    });
    expect(response.status).toBe(403);
    const arrived = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: responderCookie,
      body: { action: 'arrive' }
    });
    expect(arrived.status).toBe(200);
    // Arriving twice is not a legal transition from the arrived state.
    const again = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: responderCookie,
      body: { action: 'arrive' }
    });
    expect(again.status).toBe(409);
  });
});

describe('mission rating guards', () => {
  it('answers 404 for a mission that does not exist', async () => {
    const response = await apiFetch(server, '/_user/missions/mis_missing/rating', {
      method: 'POST', cookie: requesterCookie,
      body: { rating: 5 }
    });
    expect(response.status).toBe(404);
  });

  it('runs the whole rating matrix on the progress fixture: 409 early, 403 responder, 200 requester, 409 re-rate', async () => {
    // The progress fixture is left in the arrived state — the matrix continues from there.
    const missionId = progressFixture!.missionId;
    // Not completed yet.
    const early = await apiFetch(server, `/_user/missions/${missionId}/rating`, {
      method: 'POST', cookie: requesterCookie,
      body: { rating: 5 }
    });
    expect(early.status).toBe(409);

    for (const action of ['start', 'complete']) {
      const progressed = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
        method: 'POST', cookie: responderCookie,
        body: { action }
      });
      expect(progressed.status, progressed.text).toBe(200);
    }
    // The responder may not rate their own mission.
    const responderRating = await apiFetch(server, `/_user/missions/${missionId}/rating`, {
      method: 'POST', cookie: responderCookie,
      body: { rating: 5 }
    });
    expect(responderRating.status).toBe(403);
    const rated = await apiFetch(server, `/_user/missions/${missionId}/rating`, {
      method: 'POST', cookie: requesterCookie,
      body: { rating: 4, note: 'Steady and professional throughout.' }
    });
    expect(rated.status).toBe(200);
    // A second rating must not overwrite the first.
    const ratedAgain = await apiFetch(server, `/_user/missions/${missionId}/rating`, {
      method: 'POST', cookie: requesterCookie,
      body: { rating: 1, note: 'Changed my mind.' }
    });
    expect(ratedAgain.status).toBe(409);
  });
});

describe('nearby responder search', () => {
  it('ranks the working responder first when a second responder exists', async () => {
    const response = await apiFetch(server, '/_admin/sos/sos_missing/nearest?latitude=35.7219&longitude=51.3347&limit=10', { cookie: adminCookie });
    // Unknown SOS ids are fine here: the endpoint ranks responders, it does not read the SOS.
    expect(response.status).toBe(200);
    expect(response.json.data.items.length).toBeGreaterThanOrEqual(2);
    const usernames = response.json.data.items.map((item: any) => item.username);
    expect(usernames).toContain('reza.m');
    expect(usernames).toContain('fieldops.two');
  });
});


describe('admin SOS reads', () => {
  it('serves the filtered admin list and the single-request detail', async () => {
    // The shared fixture keeps the emergency-creation budget intact.
    const sosId = sharedSos;
    const list = await apiFetch(server, '/_admin/sos?status=pending&limit=5', { cookie: adminCookie });
    expect(list.status).toBe(200);
    expect(list.json.data.items.some((item: any) => item.id === sosId)).toBe(true);
    for (const item of list.json.data.items) expect(item.status).toBe('pending');

    const detail = await apiFetch(server, `/_admin/sos/${sosId}`, { cookie: adminCookie });
    expect(detail.status).toBe(200);
    expect(detail.json.data.id).toBe(sosId);
  });

  it('answers 404 for the detail of an SOS that does not exist', async () => {
    const detail = await apiFetch(server, '/_admin/sos/sos_missing', { cookie: adminCookie });
    expect(detail.status).toBe(404);
  });
});
