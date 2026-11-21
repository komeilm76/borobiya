// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Offer re-dispatch after terminal states (F1). The offers table keeps
 * UNIQUE(sos_id, responder_id); a plain INSERT made every re-offer of a previously offered
 * responder fail with HTTP 500 after a decline or an expiration. The dispatch path now
 * resurrects terminal rows in place (same offer id) instead of inserting blindly, writes a
 * `mission_offer.superseded` audit entry so the prior decision is not lost, and refuses
 * pending/accepted duplicates with a meaningful 409.
 */

const OFFER_TTL_SECONDS = 60;

let server: TestServer;
let requesterCookie: string;
let adminCookie: string;
let repo: { run: (sql: string, ...params: unknown[]) => { changes: number }; one: <T>(sql: string, ...params: unknown[]) => T | undefined; all: <T>(sql: string, ...params: unknown[]) => T[] };

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
  description: 'Re-dispatch fixture incident for closed offers.',
  latitude: 35.7219, longitude: 51.3347, accuracy: 12, isManual: false
};

async function createSos(): Promise<string> {
  const response = await apiFetch(server, '/_user/sos', { method: 'POST', cookie: requesterCookie, body: BASE_SOS });
  expect(response.status, response.text).toBe(201);
  return response.json.data.sos.id as string;
}

function dispatch(sosId: string, responderIds: string[], mode: 'offer' | 'immediate' = 'offer') {
  return apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds, mode }
  });
}

function backdateOffer(sosId: string, responderId: string, seconds: number): void {
  repo.run('UPDATE mission_offers SET created_at = created_at - ? WHERE sos_id=? AND responder_id=?', seconds * 1000, sosId, responderId);
}

beforeAll(async () => {
  server = await createTestServer({ missionOfferTtlSeconds: OFFER_TTL_SECONDS });
  repo = server.app.context.repo as typeof repo;
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

beforeEach(() => { server.app.context.limiters.clear(); });

afterAll(async () => { await server?.close(); });

describe('F1 — offer re-dispatch after terminal states', () => {
  it('re-dispatch after expiration succeeds and mints a fresh pending offer', async () => {
    const a = await createResponder('redis.exp', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatch(sosId, [a])).status).toBe(200);
    backdateOffer(sosId, a, OFFER_TTL_SECONDS + 5);
    expect(server.app.context.services.sos.expireDueOffers(server.app.context.clock())).toBe(1);
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('pending');

    const first = repo.one<Record<string, unknown>>('SELECT id FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, a);
    const redispatched = await dispatch(sosId, [a]);
    expect(redispatched.status, redispatched.text).toBe(200);

    const row = repo.one<Record<string, unknown>>('SELECT * FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, a)!;
    expect(row.status).toBe('pending');
    // Same row id (audit linkage), but behaving as a brand-new offer.
    expect(row.id).toBe(first?.id);
    expect(Number(row.created_at)).toBeGreaterThan(0);
    expect(row.responded_at).toBeNull();
    expect(row.expired_at).toBeNull();
    // Exactly one active offer exists for the pair.
    expect(repo.one<{ c: number }>("SELECT COUNT(*) AS c FROM mission_offers WHERE sos_id=? AND responder_id=? AND status='pending'", sosId, a)!.c).toBe(1);
  });

  it('re-dispatch after a decline succeeds', async () => {
    const a = await createResponder('redis.dec', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatch(sosId, [a])).status).toBe(200);
    const cookie = await login(server, 'redis.dec', 'Responder!2026x');
    expect((await apiFetch(server, `/_user/sos/${sosId}/decline`, { method: 'POST', cookie })).status).toBe(200);
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('pending');

    const first = repo.one<Record<string, unknown>>('SELECT id FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, a);
    expect((await dispatch(sosId, [a])).status).toBe(200);
    const row = repo.one<Record<string, unknown>>('SELECT * FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, a)!;
    expect(row.status).toBe('pending');
    expect(row.id).toBe(first?.id);
    expect(row.responded_at).toBeNull();
  });

  it('a pending duplicate can never be created twice (409, not 500)', async () => {
    const a = await createResponder('redis.dup', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatch(sosId, [a])).status).toBe(200);
    // Force the state a requeued queue rejects today; the guard must hold even then.
    repo.run("UPDATE sos_requests SET status='pending' WHERE id=?", sosId);
    const again = await dispatch(sosId, [a]);
    expect(again.status).toBe(409);
    expect(String(again.json.error.message)).toMatch(/pending offer/i);
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, a)!.c).toBe(1);
  });

  it('an accepted offer cannot be resurrected by re-dispatch (409) and stays accepted', async () => {
    const a = await createResponder('redis.acc', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatch(sosId, [a])).status).toBe(200);
    const cookie = await login(server, 'redis.acc', 'Responder!2026x');
    expect((await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie })).status).toBe(200);
    // Simulate a corrupted/pending read state: the guard, not luck, must refuse.
    repo.run("UPDATE sos_requests SET status='pending' WHERE id=?", sosId);
    const again = await dispatch(sosId, [a]);
    expect(again.status).toBe(409);
    expect(String(again.json.error.message)).toMatch(/accepted/i);
    expect(repo.one<Record<string, unknown>>('SELECT status FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, a)?.status).toBe('accepted');
  });

  it('the superseded decision is preserved in the audit log across a re-offer', async () => {
    const a = await createResponder('redis.aud', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatch(sosId, [a])).status).toBe(200);
    backdateOffer(sosId, a, OFFER_TTL_SECONDS + 5);
    expect(server.app.context.services.sos.expireDueOffers(server.app.context.clock())).toBe(1);
    const first = repo.one<Record<string, unknown>>('SELECT id FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, a)!;

    expect((await dispatch(sosId, [a])).status).toBe(200);
    const audit = repo.one<Record<string, unknown>>(
      "SELECT * FROM audit_log WHERE action='mission_offer.superseded' AND target=? ORDER BY id DESC LIMIT 1", `mission_offers:${String(first.id)}`);
    expect(audit).toBeTruthy();
    const meta = JSON.parse(String(audit!.meta_json));
    expect(meta.supersededStatus).toBe('expired');
    expect(meta.responderId).toBe(a);
    expect(meta.previousExpiredAt).toBeGreaterThan(0);
    expect(String(meta.sosId)).toBe(sosId);
  });

  it('re-offer then accept works end to end and yields exactly one mission', async () => {
    const a = await createResponder('redis.e2e', 'job_fire', true);
    const sosId = await createSos();
    expect((await dispatch(sosId, [a])).status).toBe(200);
    const cookieA = await login(server, 'redis.e2e', 'Responder!2026x');
    expect((await apiFetch(server, `/_user/sos/${sosId}/decline`, { method: 'POST', cookie: cookieA })).status).toBe(200);

    // The responder changed their mind: admin re-offers, worker accepts this time.
    expect((await dispatch(sosId, [a])).status).toBe(200);
    const accept = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie: cookieA });
    expect(accept.status, accept.text).toBe(200);
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM missions WHERE sos_id=?', sosId)!.c).toBe(1);
    expect(repo.one<Record<string, unknown>>('SELECT status FROM mission_offers WHERE sos_id=? AND responder_id=?', sosId, a)?.status).toBe('accepted');
  });

  it('concurrent dispatch attempts race safely: exactly one wins, no double offers', async () => {
    const a = await createResponder('redis.r1', 'job_fire', true);
    const b = await createResponder('redis.r2', 'job_medical', true);
    const sosId = await createSos();
    const [first, second] = await Promise.allSettled([dispatch(sosId, [a, b]), dispatch(sosId, [a, b])]);
    const statuses = (res: PromiseSettledResult<{ status: number }>) => (res.status === 'fulfilled' ? res.value.status : 0);
    const results = [statuses(first), statuses(second)].sort();
    expect(results).toEqual([200, 409]);
    const pending = repo.one<{ c: number }>("SELECT COUNT(*) AS c FROM mission_offers WHERE sos_id=? AND status='pending'", sosId)!.c;
    expect(pending).toBe(2);
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM sos_requests WHERE id=? AND status=?', sosId, 'dispatched')!.c).toBe(1);
  });
});
