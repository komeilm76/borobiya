// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Mission offers are the contract between an SOS dispatch and a responder's readiness:
 * named responders get offers gated by their job-type policy, acceptance flips a Policy A
 * responder ready inside the same transaction, and an immediate dispatch bypasses the offer
 * step entirely. Each test here anchors one of those rules end to end against a real server.
 */

let server: TestServer;
let requesterCookie: string;
let adminCookie: string;
let repo: { run: (sql: string, ...params: unknown[]) => { changes: number }; one: <T>(sql: string, ...params: unknown[]) => T | undefined };

/** Creates a responder account, optionally typed by a catalog job type, with repo-side readiness. */
async function createResponder(username: string, jobTypeId: string | null, ready: boolean): Promise<string> {
  const created = await apiFetch(server, '/_admin/users', {
    method: 'POST', cookie: adminCookie,
    body: { username, password: 'Responder!2026x', role: 'responder', ...(jobTypeId ? { jobTypeId } : {}) }
  });
  expect(created.status, created.text).toBe(201);
  const userId = created.json.data.userId as string;
  if (jobTypeId) repo.run('UPDATE users SET job_type_id=? WHERE id=?', jobTypeId, userId);
  if (ready) repo.run('UPDATE users SET ready_for_mission=1 WHERE id=?', userId);
  return userId;
}

const BASE_SOS = {
  incidentTypeId: 'inc_medical', severity: 'high',
  description: 'Mission offers fixture incident.',
  latitude: 35.7219, longitude: 51.3347, accuracy: 12, isManual: false
};

async function createSos(): Promise<string> {
  const response = await apiFetch(server, '/_user/sos', { method: 'POST', cookie: requesterCookie, body: BASE_SOS });
  expect(response.status, response.text).toBe(201);
  return response.json.data.sos.id as string;
}

async function dispatch(sosId: string, responderIds: string[], mode?: 'offer' | 'immediate') {
  return apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds, ...(mode ? { mode } : {}) }
  });
}

beforeAll(async () => {
  server = await createTestServer();
  repo = server.app.context.repo as typeof repo;
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

afterAll(async () => { await server?.close(); });

describe('offer dispatch and policies', () => {
  it('creates one pending offer per responder and leaves assigned_responder_id null for multi-recipient offers', async () => {
    const a = await createResponder('offers.fire', 'job_fire', false);
    const b = await createResponder('offers.medi', 'job_medical', true);
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: a, role: 'member' } });
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: b, role: 'member' } });

    const sosId = await createSos();
    const response = await dispatch(sosId, [a, b]);
    expect(response.status, response.text).toBe(200);

    const offers = repo.one<{ c: number }>("SELECT COUNT(*) AS c FROM mission_offers WHERE sos_id=? AND status='pending'", sosId);
    expect(Number(offers?.c)).toBe(2);
    expect(repo.one<Record<string, unknown>>('SELECT assigned_responder_id FROM sos_requests WHERE id=?', sosId)?.assigned_responder_id).toBeNull();

    // Both named responders see the offer; a bystander does not.
    const aCookie = await login(server, 'offers.fire', 'Responder!2026x');
    const listed = await apiFetch(server, '/_user/mission-offers', { cookie: aCookie });
    expect(listed.json.data.items.some((entry: any) => entry.id === sosId)).toBe(true);
    const reza = await login(server, 'reza.m', 'DemoPass!2026');
    const bystander = await apiFetch(server, '/_user/mission-offers', { cookie: reza });
    expect(bystander.json.data.items.some((entry: any) => entry.id === sosId)).toBe(false);
    // The admin projection lists both offers with the policy each was created under.
    const admin = await apiFetch(server, '/_admin/mission-offers?status=pending&limit=100', { cookie: adminCookie });
    const mine = admin.json.data.items.filter((entry: any) => entry.sosId === sosId);
    expect(mine.map((entry: any) => entry.status)).toEqual(['pending', 'pending']);
    expect(new Set(mine.map((entry: any) => entry.policy))).toEqual(new Set(['all']));
  });

  it('sets assigned_responder_id for a named single-responder offer', async () => {
    const solo = await createResponder('offers.solo', 'job_fire', false);
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: solo, role: 'member' } });
    const sosId = await createSos();
    expect((await dispatch(sosId, [solo])).status).toBe(200);
    expect(repo.one<Record<string, unknown>>('SELECT assigned_responder_id FROM sos_requests WHERE id=?', sosId)?.assigned_responder_id).toBe(solo);
  });

  it('refuses a ready_only responder who is not on standby and names them', async () => {
    const busy = await createResponder('offers.busy', 'job_maintenance', false);
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: busy, role: 'member' } });
    const sosId = await createSos();
    const response = await dispatch(sosId, [busy]);
    expect(response.status).toBe(400);
    expect(response.json.error.details.userIds).toContain(busy);
    expect(repo.one<{ c: number }>("SELECT COUNT(*) AS c FROM mission_offers WHERE sos_id=?", sosId)?.c).toBe(0);
  });

  it('declines an offer and refuses the later acceptance', async () => {
    const decliner = await createResponder('offers.dec', 'job_fire', false);
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: decliner, role: 'member' } });
    const sosId = await createSos();
    expect((await dispatch(sosId, [decliner])).status).toBe(200);
    const cookie = await login(server, 'offers.dec', 'Responder!2026x');
    expect((await apiFetch(server, `/_user/sos/${sosId}/decline`, { method: 'POST', cookie })).status).toBe(200);
    // The offer no longer appears for the responder.
    const listed = await apiFetch(server, '/_user/mission-offers', { cookie });
    expect(listed.json.data.items.some((entry: any) => entry.id === sosId)).toBe(false);
    // A declined offer cannot be accepted afterwards.
    const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie });
    expect(accepted.status).toBe(409);
    // Declining twice is a conflict, not a silent success.
    expect((await apiFetch(server, `/_user/sos/${sosId}/decline`, { method: 'POST', cookie })).status).toBe(404);
  });

  it('accepting a Policy A offer flips the responder ready inside the same transaction', async () => {
    const policyA = await createResponder('offers.polA', 'job_fire', false);
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: policyA, role: 'member' } });
    const sosId = await createSos();
    expect((await dispatch(sosId, [policyA])).status).toBe(200);
    const cookie = await login(server, 'offers.polA', 'Responder!2026x');
    const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie });
    expect(accepted.status, accepted.text).toBe(200);
    expect(Number(repo.one<Record<string, unknown>>('SELECT ready_for_mission FROM users WHERE id=?', policyA)?.ready_for_mission)).toBe(1);
  });

  it('accepting a Policy B offer requires readiness at accept time', async () => {
    const policyB = await createResponder('offers.polB', 'job_maintenance', true);
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: policyB, role: 'member' } });
    const sosId = await createSos();
    expect((await dispatch(sosId, [policyB])).status).toBe(200);
    // The dispatcher sees a ready worker at dispatch time; by accept time they have gone off standby.
    repo.run('UPDATE users SET ready_for_mission=0 WHERE id=?', policyB);
    const cookie = await login(server, 'offers.polB', 'Responder!2026x');
    const accepted = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie });
    expect(accepted.status).toBe(409);
  });
});

describe('immediate dispatch', () => {
  it('assigns exactly one responder with no acceptance step; the mission starts ASSIGNED', async () => {
    const responder = await createResponder('offers.imm', 'job_fire', false);
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: responder, role: 'member' } });
    const sosId = await createSos();
    const response = await dispatch(sosId, [responder], 'immediate');
    expect(response.status, response.text).toBe(200);
    // Option A: the SOS stays dispatched; no acceptance is recorded anywhere.
    expect(response.json.data.status).toBe('dispatched');
    expect(response.json.data.missionStatus).toBe('assigned');

    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('dispatched');
    expect(repo.one<Record<string, unknown>>('SELECT status FROM missions WHERE id=?', response.json.data.missionId)?.status).toBe('assigned');
    // No offer rows and no acceptance event: the responder was assigned, not offered.
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM mission_offers WHERE sos_id=?', sosId)?.c).toBe(0);
    expect(repo.one<{ c: number }>("SELECT COUNT(*) AS c FROM mission_events WHERE mission_id=? AND action='accept'", response.json.data.missionId)?.c).toBe(0);

    // The worker presses start: the mission ASSIGNED -> IN_PROGRESS and the SOS follows to in_progress.
    const cookie = await login(server, 'offers.imm', 'Responder!2026x');
    const progress = await apiFetch(server, `/_user/missions/${response.json.data.missionId}/progress`, {
      method: 'POST', cookie, body: { action: 'start' }
    });
    expect(progress.status, progress.text).toBe(200);
    expect(progress.json.data.status).toBe('in_progress');
    expect(progress.json.data.sosStatus).toBe('in_progress');
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('in_progress');
  });

  it('refuses an immediate dispatch carrying more than one responder', async () => {
    const first = await createResponder('offers.i1', 'job_fire', false);
    const second = await createResponder('offers.i2', 'job_fire', false);
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: first, role: 'member' } });
    await apiFetch(server, '/_admin/groups/grp_medical/members', { method: 'POST', cookie: adminCookie, body: { userId: second, role: 'member' } });
    const sosId = await createSos();
    const response = await dispatch(sosId, [first, second], 'immediate');
    expect(response.status).toBe(400);
    expect(response.json.error.details.field).toBe('responderIds');
  });
});

describe('job types and nearest endpoint', () => {
  it('lists, creates and updates job types', async () => {
    const listed = await apiFetch(server, '/_admin/job-types', { cookie: adminCookie });
    expect(listed.status, listed.text).toBe(200);
    expect(listed.json.data.items.map((entry: any) => entry.id)).toContain('job_fire');

    const created = await apiFetch(server, '/_admin/job-types', {
      method: 'POST', cookie: adminCookie, body: { label: 'امداد ریلی تستی', offerPolicy: 'ready_only' }
    });
    expect(created.status, created.text).toBe(201);
    const jobTypeId = created.json.data.jobType.id;

    const flipped = await apiFetch(server, `/_admin/job-types/${jobTypeId}`, {
      method: 'PATCH', cookie: adminCookie, body: { offerPolicy: 'all' }
    });
    expect(flipped.status, flipped.text).toBe(200);
    expect(flipped.json.data.jobType.offerPolicy).toBe('all');

    expect((await apiFetch(server, `/_admin/job-types/${jobTypeId}`, {
      method: 'PATCH', cookie: adminCookie, body: { offerPolicy: 'nope' }
    })).status).toBe(400);
    expect((await apiFetch(server, '/_admin/job-types/job_missing', {
      method: 'PATCH', cookie: adminCookie, body: { active: false }
    })).status).toBe(404);
    // Deactivated job types disappear from the create-account validation path.
    await apiFetch(server, `/_admin/job-types/${jobTypeId}`, { method: 'PATCH', cookie: adminCookie, body: { active: false } });
    const rejected = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie, body: { username: 'offers.inactive', password: 'Inactive!2026x', role: 'responder', jobTypeId }
    });
    expect(rejected.status).toBe(400);
  });

  it('rejects an unknown job type on user creation and accepts a known one', async () => {
    const bad = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie, body: { username: 'offers.badjt', password: 'BadJobType!2026', role: 'responder', jobTypeId: 'job_nope' }
    });
    expect(bad.status).toBe(400);
    const good = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie, body: { username: 'offers.goodjt', password: 'GoodJobType!2026', role: 'responder', jobTypeId: 'job_medical' }
    });
    expect(good.status, good.text).toBe(201);
    const listed = await apiFetch(server, '/_admin/users?q=offers.goodjt&limit=5', { cookie: adminCookie });
    expect(listed.json.data.items[0].jobTypeId).toBe('job_medical');
    expect(listed.json.data.items[0].jobTypeLabel).toBeTruthy();
  });

  it('answers 404 for an unknown SOS id on the nearest endpoint', async () => {
    const response = await apiFetch(server, '/_admin/sos/sos_missing/nearest', { cookie: adminCookie });
    expect(response.status).toBe(404);
  });
});
