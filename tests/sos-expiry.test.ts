// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * SOS request expiry. A request carries `expires_at` (two hours after creation) and the
 * state machine defines `expire` from pending and dispatched — the lifecycle documented in
 * the plan — so a request nobody picks up must reach `expired` instead of sitting in the
 * dispatch queue forever. Offers addressed on a dispatched request die with it, and a
 * request that already has a mission (immediate dispatch) is never expired under the
 * worker's feet.
 */

let server: TestServer;
let requesterCookie: string;
let responderCookie: string;
let adminCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

beforeEach(() => {
  server.app.context.limiters.clear();
});

afterAll(async () => {
  await server?.close();
});

const SOS_BODY = {
  incidentTypeId: 'inc_medical',
  severity: 'high',
  description: 'Expiry fixture incident near the depot.',
  latitude: 35.7219,
  longitude: 51.3347,
  accuracy: 12,
  isManual: false
};

async function createSos(): Promise<string> {
  const response = await apiFetch(server, '/_user/sos', { method: 'POST', cookie: requesterCookie, body: SOS_BODY });
  expect(response.status, response.text).toBe(201);
  return response.json.data.sos.id as string;
}

/** Moves a request's expiry into the past, as if its two hours had elapsed. */
function forceExpired(sosId: string): void {
  server.app.context.repo.run('UPDATE sos_requests SET expires_at=? WHERE id=?', Date.now() - 1000, sosId);
}

describe('SOS request expiry', () => {
  it('expires a pending request whose two hours have elapsed', async () => {
    const sosId = await createSos();
    forceExpired(sosId);
    const detail = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requesterCookie });
    expect(detail.status, detail.text).toBe(200);
    expect(detail.json.data.status).toBe('expired');
    const adminList = await apiFetch(server, '/_admin/sos?status=expired&limit=10', { cookie: adminCookie });
    expect(adminList.json.data.items.some((item: any) => item.id === sosId)).toBe(true);
  });

  it('leaves a request inside its window untouched', async () => {
    const sosId = await createSos();
    const detail = await apiFetch(server, `/_user/sos/${sosId}`, { cookie: requesterCookie });
    expect(detail.json.data.status).toBe('pending');
  });

  it('expires a dispatched request and retires its pending offers with it', async () => {
    const sosId = await createSos();
    const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', responderIds: ['usr_responder'] }
    });
    expect(dispatched.status, dispatched.text).toBe(200);
    forceExpired(sosId);

    const detail = await apiFetch(server, `/_admin/sos/${sosId}`, { cookie: adminCookie });
    expect(detail.json.data.status).toBe('expired');
    // The offer is gone from the responder's pending list and can no longer be accepted.
    const offers = await apiFetch(server, '/_user/mission-offers', { cookie: responderCookie });
    expect(offers.json.data.items.some((item: any) => item.id === sosId)).toBe(false);
    const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: responderCookie });
    expect(accepted.status).toBe(409);
    const offerRow = server.app.context.repo.one<Record<string, any>>(
      'SELECT status FROM mission_offers WHERE sos_id=?', sosId);
    expect(String(offerRow?.status)).toBe('expired');
  });

  it('never expires a request that already has a mission (immediate dispatch)', async () => {
    const sosId = await createSos();
    const dispatched = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', responderIds: ['usr_responder'], mode: 'immediate' }
    });
    expect(dispatched.status, dispatched.text).toBe(200);
    expect(dispatched.json.data.missionId).toBeTruthy();
    forceExpired(sosId);

    const detail = await apiFetch(server, `/_admin/sos/${sosId}`, { cookie: adminCookie });
    expect(detail.json.data.status).toBe('dispatched');
  });
});
