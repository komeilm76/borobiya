// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Offer expiration (DF-02): every pending offer carries a TTL (central server config,
 * MISSION_OFFER_TTL_SECONDS, default 900s). Expiry is recorded with the actual expired_at,
 * enforced at retrieval and at acceptance (a delayed sweep cannot let a stale offer through),
 * re-running is a no-op, and a request whose offers all lapse is requeued for explicit
 * admin redispatch instead of silently dead-ending.
 */

let server: TestServer;
let requesterCookie: string;
let adminCookie: string;
let repo: { run: (sql: string, ...params: unknown[]) => { changes: number }; one: <T>(sql: string, ...params: unknown[]) => T | undefined; all: <T>(sql: string, ...params: unknown[]) => T[] };

const OFFER_TTL_SECONDS = 60;

async function createResponder(username: string, jobTypeId: string, ready: boolean): Promise<string> {
  const created = await apiFetch(server, '/_admin/users', {
    method: 'POST', cookie: adminCookie,
    body: { username, password: 'Responder!2026x', role: 'responder', jobTypeId }
  });
  expect(created.status, created.text).toBe(201);
  const userId = created.json.data.userId as string;
  repo.run('UPDATE users SET job_type_id=? WHERE id=?', jobTypeId, userId);
  if (ready) repo.run('UPDATE users SET ready_for_mission=1 WHERE id=?', userId);
  const membership = await apiFetch(server, '/_admin/groups/grp_medical/members', {
    method: 'POST', cookie: adminCookie, body: { userId, role: 'member' }
  });
  expect(membership.status, membership.text).toBeLessThan(300);
  return userId;
}

const BASE_SOS = {
  incidentTypeId: 'inc_medical', severity: 'high',
  description: 'Offer expiration fixture incident.',
  latitude: 35.7219, longitude: 51.3347, accuracy: 12, isManual: false
};

async function createSos(): Promise<string> {
  const response = await apiFetch(server, '/_user/sos', { method: 'POST', cookie: requesterCookie, body: BASE_SOS });
  expect(response.status, response.text).toBe(201);
  return response.json.data.sos.id as string;
}

async function dispatchOffers(sosId: string, responderIds: string[]) {
  return apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds }
  });
}

function backdateOffers(sosId: string, responderId: string | null, seconds: number): void {
  if (responderId) {
    repo.run('UPDATE mission_offers SET created_at = created_at - ? WHERE sos_id=? AND responder_id=?', seconds * 1000, sosId, responderId);
  } else {
    repo.run('UPDATE mission_offers SET created_at = created_at - ? WHERE sos_id=?', seconds * 1000, sosId);
  }
}

function expireSweep(): number {
  return server.app.context.services.sos.expireDueOffers(server.app.context.clock());
}

beforeAll(async () => {
  server = await createTestServer({ missionOfferTtlSeconds: OFFER_TTL_SECONDS });
  repo = server.app.context.repo as typeof repo;
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

afterAll(async () => { await server?.close(); });

describe('offer expiration lifecycle', () => {
  it('expires due offers, records expired_at and requeues the dry request for admin redispatch', async () => {
    const a = await createResponder('expiry.a', 'job_fire', true);
    const b = await createResponder('expiry.b', 'job_medical', true);
    const sosId = await createSos();
    expect((await dispatchOffers(sosId, [a, b])).status).toBe(200);
    backdateOffers(sosId, null, OFFER_TTL_SECONDS + 5);

    const expired = expireSweep();
    expect(expired).toBe(2);

    const rows = repo.all<Record<string, unknown>>('SELECT status, expired_at, responded_at FROM mission_offers WHERE sos_id=?', sosId);
    expect(rows.length).toBe(2);
    for (const row of rows) {
      expect(row.status).toBe('expired');
      expect(Number(row.expired_at)).toBeGreaterThan(0);
      expect(row.responded_at).toBeNull();
    }
    // Nobody accepted or holds an active mission: the SOS is actionable again (requeued to pending).
    expect(repo.one<Record<string, unknown>>('SELECT status, assigned_responder_id FROM sos_requests WHERE id=?', sosId)).toMatchObject({ status: 'pending', assigned_responder_id: null });
    // An admin-visible alert explains the redispatch need.
    expect(repo.one<{ c: number }>("SELECT COUNT(*) AS c FROM alerts WHERE kind='sos' AND severity='warning' AND resolved_at IS NULL")!.c).toBeGreaterThan(0);
    expect(repo.one<{ c: number }>("SELECT COUNT(*) AS c FROM audit_log WHERE action='sos.requeued' AND target=?", `sos_requests:${sosId}`)!.c).toBe(1);
  });

  it('expired offers can no longer be accepted (409), enforced at the backend', async () => {
    const a = await createResponder('expiry.c', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatchOffers(sosId, [a])).status).toBe(200);
    backdateOffers(sosId, a, OFFER_TTL_SECONDS + 5);

    const cookie = await login(server, 'expiry.c', 'Responder!2026x');
    const accept = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie });
    expect(accept.status).toBe(409);
    expect(String(accept.json.error.message)).toContain('expired');
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM missions WHERE sos_id=?', sosId)!.c).toBe(0);
  });

  it('re-processing is idempotent: a second sweep expires nothing and emits no duplicate work', async () => {
    const a = await createResponder('expiry.d', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatchOffers(sosId, [a])).status).toBe(200);
    backdateOffers(sosId, a, OFFER_TTL_SECONDS + 5);

    expect(expireSweep()).toBe(1);
    const auditBefore = repo.one<{ c: number }>("SELECT COUNT(*) AS c FROM audit_log WHERE action='mission_offer.expired' AND target LIKE ?", `mission_offers:%`)!.c;
    expect(expireSweep()).toBe(0);
    const auditAfter = repo.one<{ c: number }>("SELECT COUNT(*) AS c FROM audit_log WHERE action='mission_offer.expired' AND target LIKE ?", `mission_offers:%`)!.c;
    expect(auditAfter).toBe(auditBefore);
  });

  it('an already-accepted offer is never overwritten by the expiry sweep', async () => {
    const a = await createResponder('expiry.e', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatchOffers(sosId, [a])).status).toBe(200);
    const cookie = await login(server, 'expiry.e', 'Responder!2026x');
    expect((await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie })).status).toBe(200);

    // Even a backdate cannot resurrect an accepted offer into the expiry path.
    repo.run("UPDATE mission_offers SET created_at = created_at - ? WHERE sos_id=? AND responder_id=? AND status='accepted'", (OFFER_TTL_SECONDS + 5) * 1000, sosId, a);
    expect(expireSweep()).toBe(0);
    expect(repo.one<Record<string, unknown>>('SELECT status FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, a)?.status).toBe('accepted');
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('accepted');
  });

  it('one responder’s expired offer does not affect a teammate with a still-valid offer', async () => {
    const a = await createResponder('expiry.f', 'job_fire', true);
    const b = await createResponder('expiry.g', 'job_medical', true);
    const sosId = await createSos();
    expect((await dispatchOffers(sosId, [a, b])).status).toBe(200);
    backdateOffers(sosId, a, OFFER_TTL_SECONDS + 5);

    expect(expireSweep()).toBe(1);
    // B still holds a live offer and is not requeued away from the request.
    expect(repo.one<Record<string, unknown>>('SELECT status FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, b)?.status).toBe('pending');
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('dispatched');
    const cookieB = await login(server, 'expiry.g', 'Responder!2026x');
    expect((await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: cookieB })).status).toBe(200);
    // Mixed outcome: A expired, B accepted — the mission proceeds and is never requeued.
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('accepted');
    expect(expireSweep()).toBe(0);
  });

  it('expiry never disturbs a completed mission', async () => {
    const a = await createResponder('expiry.h', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatchOffers(sosId, [a])).status).toBe(200);
    const cookie = await login(server, 'expiry.h', 'Responder!2026x');
    const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie });
    const missionId = accepted.json.data.missionId as string;
    for (const [action, status] of [['arrive', 'arrived'], ['start', 'in_progress'], ['complete', 'completed']]) {
      const progress = await apiFetch(server, `/_user/missions/${missionId}/progress`, { method: 'POST', cookie, body: { action } });
      expect(progress.status, progress.text).toBe(200);
      expect(progress.json.data.status).toBe(status);
    }
    backdateOffers(sosId, a, OFFER_TTL_SECONDS + 5);
    expect(expireSweep()).toBe(0);
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('completed');
  });

  it('a declined-to-empty request is also requeued rather than left in limbo', async () => {
    const a = await createResponder('expiry.i', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatchOffers(sosId, [a])).status).toBe(200);
    const cookie = await login(server, 'expiry.i', 'Responder!2026x');
    expect((await apiFetch(server, `/_user/sos/${sosId}/decline`, { method: 'POST', cookie })).status).toBe(200);
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('pending');
  });

  it('immediate dispatch creates no offers, so the expiry sweep ignores it', async () => {
    const a = await createResponder('expiry.j', 'job_fire', false);
    const sosId = await createSos();
    const dispatch = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds: [a], mode: 'immediate' }
    });
    expect(dispatch.status, dispatch.text).toBe(200);
    expect(expireSweep()).toBe(0);
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('dispatched');
    expect(repo.one<Record<string, unknown>>('SELECT status FROM missions WHERE id=?', dispatch.json.data.missionId)?.status).toBe('assigned');
  });

  it('expired offers surface in the admin offer view with expired_at', async () => {
    const a = await createResponder('expiry.k', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatchOffers(sosId, [a])).status).toBe(200);
    backdateOffers(sosId, a, OFFER_TTL_SECONDS + 5);
    expireSweep();
    const adminOffers = await apiFetch(server, '/_admin/mission-offers?status=expired', { cookie: adminCookie });
    expect(adminOffers.status).toBe(200);
    const mine = adminOffers.json.data.items.find((item: any) => item.sosId === sosId);
    expect(mine).toBeTruthy();
    expect(Number(mine.expiredAt)).toBeGreaterThan(0);
  });
});
