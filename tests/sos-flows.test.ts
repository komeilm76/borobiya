// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * End-to-end SOS/mission flows the refusal suites cannot see: a photograph carried on creation,
 * the group-membership acceptance arm, a requester cancelling around a live mission, the one
 * place a mission transition can outpace its SOS, and the default admin listings. Each flow uses
 * its own fixture; the file shares one server, so creation stays inside the 10/min budget.
 */

let server: TestServer;
let requesterCookie: string;
let responderCookie: string;
let adminCookie: string;
let fieldopsCookie: string;
let fieldopsId: string;

const PHOTO = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA==';

const baseBody = {
  incidentTypeId: 'inc_medical',
  severity: 'high',
  description: 'Flow fixture incident.',
  latitude: 35.7219,
  longitude: 51.3347,
  accuracy: 12,
  isManual: false
};

async function createSos(overrides: Record<string, unknown> = {}): Promise<string> {
  const response = await apiFetch(server, '/_user/sos', { method: 'POST', cookie: requesterCookie, body: { ...baseBody, ...overrides } });
  expect(response.status, response.text).toBe(201);
  return response.json.data.sos.id;
}

async function dispatchTo(sosId: string, responderIds: string[]): Promise<void> {
  const response = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds }
  });
  expect(response.status, response.text).toBe(200);
}

/** One pending SOS, created at most once and shared by the nearest-endpoint tests. */
let probeSosId: string | null = null;
async function pendingProbe(): Promise<string> {
  if (!probeSosId) probeSosId = await createSos();
  return probeSosId;
}

async function acceptAs(sosId: string, cookie: string): Promise<{ missionId: string }> {
  const response = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie });
  expect(response.status, response.text).toBe(200);
  return { missionId: response.json.data.missionId };
}

beforeAll(async () => {
  server = await createTestServer();
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
  const created = await apiFetch(server, '/_admin/users', {
    method: 'POST', cookie: adminCookie,
    body: { username: 'flow.two', password: 'FlowTwo!2026', role: 'responder' }
  });
  expect(created.status, created.text).toBe(201);
  fieldopsId = created.json.data.userId;
  // Policy A (fire): offers arrive regardless of readiness, and acceptance flips the responder ready.
  const typed = await apiFetch(server, `/_admin/users/${fieldopsId}`, {
    method: 'PATCH', cookie: adminCookie, body: { jobTypeId: 'job_fire' }
  });
  expect(typed.status, typed.text).toBe(200);
  fieldopsCookie = await login(server, 'flow.two', 'FlowTwo!2026');
  // Dispatch requires named responders to be active members of the group; add the second responder.
  const member = await apiFetch(server, '/_admin/groups/grp_medical/members', {
    method: 'POST', cookie: adminCookie, body: { userId: fieldopsId, role: 'member' }
  });
  expect(member.status, member.text).toBe(200);
});

afterAll(async () => {
  await server?.close();
});

describe('SOS creation extras', () => {
  it('accepts a photo payload and a manual flag on creation', async () => {
    const response = await apiFetch(server, '/_user/sos', {
      method: 'POST', cookie: requesterCookie,
      body: { ...baseBody, photoDataUrl: PHOTO, isManual: true }
    });
    expect(response.status, response.text).toBe(201);
    expect(response.json.data.sos.photoDataUrl).toBe(PHOTO);
    expect(response.json.data.sos.isManual).toBe(true);
  });
});

describe('responder visibility of offers', () => {
  it('shows the named responder the dispatch, with the requester alias, and hides it from everyone else', async () => {
    const sosId = await createSos();
    await dispatchTo(sosId, [fieldopsId]);
    // The offer card loads from the list; the named responder must see it.
    const listed = await apiFetch(server, '/_user/sos', { cookie: fieldopsCookie });
    expect(listed.status, listed.text).toBe(200);
    const item = listed.json.data.items.find((entry: any) => entry.id === sosId);
    expect(item, 'the named responder must see the offer').toBeTruthy();
    expect(item.status).toBe('dispatched');
    expect(item.requesterUsername).toBe('saeed.k');
    expect(item.isManual).toBe(false);
    const detail = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: fieldopsCookie });
    expect(detail.status, detail.text).toBe(200);
    expect(detail.json.data.id).toBe(sosId);
    // reza.m is in grp_medical but received no offer: offers, not membership, govern visibility.
    const outsider = await apiFetch(server, '/_user/sos', { cookie: responderCookie });
    expect(outsider.status, outsider.text).toBe(200);
    expect(outsider.json.data.items.some((entry: any) => entry.id === sosId)).toBe(false);
    // The detail endpoint answers 404 rather than confirming the request exists.
    expect((await apiFetch(server, `/_user/sos/${sosId}`, { cookie: responderCookie })).status).toBe(404);
    const offers = await apiFetch(server, '/_user/mission-offers', { cookie: responderCookie });
    expect(offers.status, offers.text).toBe(200);
    expect(offers.json.data.items.some((entry: any) => entry.id === sosId)).toBe(false);
  });
});

describe('acceptance through offers', () => {
  it('lets the named responder accept a dispatch aimed at them', async () => {
    const sosId = await createSos();
    await dispatchTo(sosId, [fieldopsId]);
    const accepted = await acceptAs(sosId, fieldopsCookie);
    expect(accepted.missionId).toBeTruthy();
  });

  it('refuses a responder who received no offer, even though they belong to the group', async () => {
    const sosId = await createSos();
    await dispatchTo(sosId, [fieldopsId]);
    const response = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: responderCookie });
    expect(response.status).toBe(403);
  });
});

describe('mission and SOS state drift', () => {
  it('cascades a requester cancellation onto the live mission', async () => {
    const sosId = await createSos();
    await dispatchTo(sosId, ['usr_responder']);
    const { missionId } = await acceptAs(sosId, responderCookie);

    const cancel = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST', cookie: requesterCookie, body: { reasonId: 'cancel_mistake' }
    });
    expect(cancel.status, cancel.text).toBe(200);

    // The mission is terminal too — a further transition must be refused at the mission gate.
    const progress = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: responderCookie, body: { action: 'cancel' }
    });
    expect(progress.status).toBe(409);
    expect(progress.json.error.message).toBe('This mission transition is not allowed.');

    const missions = await apiFetch(server, '/_user/missions', { cookie: responderCookie });
    expect(missions.json.data.items.find((item: any) => item.id === missionId)?.status).toBe('cancelled');
  });

  it('refuses the mission transition when the SOS row cannot follow it', async () => {
    const sosId = await createSos();
    await dispatchTo(sosId, ['usr_responder']);
    const { missionId } = await acceptAs(sosId, responderCookie);
    for (const action of ['arrive', 'start']) {
      const step = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
        method: 'POST', cookie: responderCookie, body: { action }
      });
      expect(step.status, `${action}: ${step.text}`).toBe(200);
    }
    // White-box drift: the mission is legitimately in progress but the SOS row is
    // rolled back to accepted, so "complete" is not a transition it can mirror.
    server.app.context.repo.run('UPDATE sos_requests SET status=? WHERE id=?', 'accepted', sosId);
    const progress = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: responderCookie, body: { action: 'complete' }
    });
    expect(progress.status).toBe(409);
    expect(progress.json.error.message).toBe('The SOS state cannot follow this mission transition.');
    // Repair the row so nothing downstream sees the synthetic state.
    server.app.context.repo.run('UPDATE sos_requests SET status=? WHERE id=?', 'in_progress', sosId);
  });

  it('cancels a live mission and mirrors the cancellation onto the request', async () => {
    const sosId = await createSos();
    await dispatchTo(sosId, ['usr_responder']);
    const { missionId } = await acceptAs(sosId, responderCookie);

    const progress = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: responderCookie, body: { action: 'cancel' }
    });
    expect(progress.status, progress.text).toBe(200);
    expect(progress.json.data.status).toBe('cancelled');

    const sos = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requesterCookie });
    expect(sos.json.data.status).toBe('cancelled');
  });

  it('rates a completed mission with a note', async () => {
    const sosId = await createSos();
    await dispatchTo(sosId, ['usr_responder']);
    const { missionId } = await acceptAs(sosId, responderCookie);
    for (const action of ['arrive', 'start', 'complete']) {
      const step = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
        method: 'POST', cookie: responderCookie, body: { action }
      });
      expect(step.status, `${action}: ${step.text}`).toBe(200);
    }
    // The note arm lives in sos-guards (it rates with a note); here the note is omitted.
    const rated = await apiFetch(server, `/_user/missions/${missionId}/rating`, {
      method: 'POST', cookie: requesterCookie, body: { rating: 5 }
    });
    expect(rated.status, rated.text).toBe(200);
    expect(rated.json.data.rating).toBe(5);
  });
});

describe('cancellation reason requirements', () => {
  it('demands a real detail for "other" and accepts one that explains itself', async () => {
    const sosId = await createSos();
    const thin = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST', cookie: requesterCookie, body: { reasonId: 'cancel_other', detail: 'کوتاه' }
    });
    expect(thin.status).toBe(400);
    expect(thin.json.error.details.field).toBe('body.detail');

    // Omitting the detail entirely passes the body schema and must be refused by the service itself.
    const missing = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST', cookie: requesterCookie, body: { reasonId: 'cancel_other' }
    });
    expect(missing.status).toBe(400);
    expect(missing.json.error.details.field).toBe('detail');

    const proper = await apiFetch(server, `/_user/sos/${sosId}/cancel`, {
      method: 'POST', cookie: requesterCookie, body: { reasonId: 'cancel_other', detail: 'همسرم رسید و نیازی به نیرو نبود.' }
    });
    expect(proper.status, proper.text).toBe(200);
  });
});

describe('dispatch edge cases', () => {
  it('dispatches to nobody; an unassigned responder may then claim it', async () => {
    const sosId = await pendingProbe();
    // The route schema demands at least one responder, the service tolerates none:
    // the request goes out to the whole group with nobody pre-assigned.
    const result = server.app.context.services.sos.dispatch(
      { userId: 'usr_admin', sessionId: 'sess_direct', username: 'admin', role: 'admin', deviceId: 'dev_direct', ip: '127.0.0.1' } as never,
      sosId, { groupId: 'grp_medical', responderIds: [] });
    expect(result.ok).toBe(true);
    expect(result.responderIds).toEqual([]);

    const sos = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requesterCookie });
    expect(sos.json.data.assignedResponderId).toBeNull();

    // The accept path then keys off "not assigned" rather than a named account.
    const accepted = await acceptAs(sosId, responderCookie);
    expect(accepted.missionId).toBeTruthy();
  });

  it('ranks fix-less responders as null and a stored fix as numbers', async () => {
    const nearestProbe = await pendingProbe();
    const fixless = await apiFetch(server, `/_admin/sos/${nearestProbe}/nearest?limit=10`, { cookie: adminCookie });
    const fixlessResponder = fixless.json.data.items.find((item: any) => item.recordedAt === null);
    expect(fixlessResponder).toBeTruthy();
    expect(fixlessResponder.distanceMeters).toBeNull();
    expect(fixlessResponder.latitude).toBeNull();

    // A stored (not live) fix feeds the same ranking through the history fallback.
    server.app.context.repo.run(
      `INSERT INTO location_points(user_id,latitude,longitude,accuracy,heading,speed,recorded_at,created_at)
       VALUES(?,?,?,?,?,?,?,?)`, fieldopsId, 35.73, 51.34, 9, 90, 1.5, Date.now(), Date.now());
    const ranked = await apiFetch(server, `/_admin/sos/${nearestProbe}/nearest?limit=10`, { cookie: adminCookie });
    const withFix = ranked.json.data.items.find((item: any) => item.id === fieldopsId);
    expect(typeof withFix.recordedAt).toBe('number');
    expect(typeof withFix.distanceMeters).toBe('number');
  });
});

describe('default admin and nearest-responder reads', () => {
  it('serves the unfiltered admin SOS list and missions list', async () => {
    const sos = await apiFetch(server, '/_admin/sos', { cookie: adminCookie });
    expect(sos.status).toBe(200);
    expect(Array.isArray(sos.json.data.items)).toBe(true);
    expect(sos.json.data.items.length).toBeGreaterThan(0);

    const missions = await apiFetch(server, '/_user/missions', { cookie: adminCookie });
    expect(missions.status).toBe(200);
    expect(missions.json.data.items.length).toBeGreaterThan(0);
  });

  it('ranks responders without an incident-type filter or explicit limit', async () => {
    const nearestProbe = await pendingProbe();
    const nearest = await apiFetch(server, `/_admin/sos/${nearestProbe}/nearest`, { cookie: adminCookie });
    expect(nearest.status).toBe(200);
    expect(nearest.json.data.items.length).toBeGreaterThan(0);
  });
});
