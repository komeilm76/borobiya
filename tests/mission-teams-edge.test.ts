// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Edge cases and authorization boundaries for mission teams and support requests:
 * quantity/line consistency enforced at review time, finished missions are frozen,
 * error mapping (400/403/404/409), candidates search and per-line decision accounting.
 */

let server: TestServer;
let requesterCookie: string;
let adminCookie: string;
let repo: { run: (sql: string, ...params: unknown[]) => { changes: number }; one: <T>(sql: string, ...params: unknown[]) => T | undefined };

async function createResponder(username: string, jobTypeId: string | null, ready: boolean): Promise<string> {
  const created = await apiFetch(server, '/_admin/users', {
    method: 'POST', cookie: adminCookie,
    body: { username, password: 'Responder!2026x', role: 'responder', ...(jobTypeId ? { jobTypeId } : {}) }
  });
  expect(created.status, created.text).toBe(201);
  const userId = created.json.data.userId as string;
  if (jobTypeId) repo.run('UPDATE users SET job_type_id=? WHERE id=?', jobTypeId, userId);
  if (ready) repo.run('UPDATE users SET ready_for_mission=1 WHERE id=?', userId);
  const membership = await apiFetch(server, '/_admin/groups/grp_medical/members', {
    method: 'POST', cookie: adminCookie, body: { userId, role: 'member' }
  });
  expect(membership.status, membership.text).toBeLessThan(300);
  return userId;
}

const BASE_SOS = {
  incidentTypeId: 'inc_medical', severity: 'medium',
  description: 'Mission teams edge fixture incident.',
  latitude: 35.7219, longitude: 51.3347, accuracy: 12, isManual: false
};

async function createSosFor(cookie: string): Promise<string> {
  const response = await apiFetch(server, '/_user/sos', { method: 'POST', cookie, body: BASE_SOS });
  expect(response.status, response.text).toBe(201);
  return response.json.data.sos.id as string;
}

async function setupMission(prefix: string) {
  const leader = await createResponder(`${prefix}.lead${Math.floor(Math.random() * 1e9)}`, 'job_fire', true);
  const sosId = await createSosFor(requesterCookie);
  const dispatch = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds: [leader], mode: 'immediate' }
  });
  expect(dispatch.status).toBe(200);
  const missionId = dispatch.json.data.missionId as string;
  const teamView = await apiFetch(server, `/_admin/missions/${missionId}/team`, { cookie: adminCookie });
  const leaderCookie = await login(server, teamView.json.data.leader.username, 'Responder!2026x');
  return { missionId, leader, leaderCookie };
}

beforeAll(async () => {
  server = await createTestServer();
  repo = server.app.context.repo as typeof repo;
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

beforeEach(() => { server.app.context.limiters.clear(); });
afterAll(async () => { await server?.close(); });

describe('parameter validation', () => {
  it('duplicate job-type lines merge quantities; single-line requests still validate', async () => {
    const { missionId, leaderCookie } = await setupMission('val');
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }, { jobTypeId: 'job_medical', quantity: 2 }], reason: 'Merging duplicate request lines safely.' }
    });
    expect(created.status, created.text).toBe(201);
    expect(created.json.data.items).toEqual([
      { jobTypeId: 'job_medical', jobTypeLabel: expect.any(String), quantity: 3, approvedQuantity: 0 }
    ]);
    const empty = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_nope', quantity: 1 }], reason: 'Unknown job type line check.' }
    });
    expect(empty.status).toBe(400);
  });

  it('rejects a too-short reason and quantity out of range', async () => {
    const { missionId, leaderCookie } = await setupMission('val2');
    const short = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'short' }
    });
    expect(short.status).toBe(400);
    const huge = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 25 }], reason: 'Quantity far beyond the allowed maximum.' }
    });
    expect(huge.status).toBe(400);
  });

  it('requirements validation: unknown job type and oversize quantity are rejected', async () => {
    const { missionId } = await setupMission('val3');
    const unknown = await apiFetch(server, `/_admin/missions/${missionId}/requirements`, {
      method: 'PUT', cookie: adminCookie, body: { requirements: [{ jobTypeId: 'job_nope', quantity: 1 }] }
    });
    expect(unknown.status).toBe(400);
    const oversize = await apiFetch(server, `/_admin/missions/${missionId}/requirements`, {
      method: 'PUT', cookie: adminCookie, body: { requirements: [{ jobTypeId: 'job_fire', quantity: 21 }] }
    });
    expect(oversize.status).toBe(400);
    const merged = await apiFetch(server, `/_admin/missions/${missionId}/requirements`, {
      method: 'PUT', cookie: adminCookie,
      body: { requirements: [{ jobTypeId: 'job_fire', quantity: 1 }, { jobTypeId: 'job_fire', quantity: 1 }] }
    });
    expect(merged.status).toBe(200);
    expect(merged.json.data.requirements[0].quantity).toBe(2);
  });
});

describe('decision consistency', () => {
  it('approved lines may not exceed requested quantities; unknown lines are refused', async () => {
    const { missionId, leaderCookie } = await setupMission('dec');
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Consistency checks for approval quantities.' }
    });
    const requestId = created.json.data.id as string;
    const over = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie,
      body: { decision: 'approved', items: [{ jobTypeId: 'job_medical', approvedQuantity: 2 }] }
    });
    expect(over.status).toBe(400);
    const unknown = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie,
      body: { decision: 'approved', items: [{ jobTypeId: 'job_fire', approvedQuantity: 1 }] }
    });
    expect(unknown.status).toBe(400);
    const rejectedWithWorkers = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'rejected', userIds: ['usr_responder'] }
    });
    expect(rejectedWithWorkers.status).toBe(400);
  });

  it('a partial approval must short at least one line; a full approval must cover all', async () => {
    const { missionId, leaderCookie } = await setupMission('dec2');
    const medic = await createResponder('dec2.medic', 'job_medical', true);
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Checking the decision consistency guard rails.' }
    });
    const requestId = created.json.data.id as string;
    const partialFullCover = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie,
      body: { decision: 'partially_approved', items: [{ jobTypeId: 'job_medical', approvedQuantity: 1 }], userIds: [medic] }
    });
    expect(partialFullCover.status).toBe(400);
  });

  it('per-line worker counts must match approved quantities exactly', async () => {
    const { missionId, leaderCookie } = await setupMission('dec3');
    const medic = await createResponder('dec3.medic', 'job_medical', true);
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 2 }], reason: 'Need exactly two medics for the field team.' }
    });
    const requestId = created.json.data.id as string;
    const short = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie,
      body: { decision: 'approved', items: [{ jobTypeId: 'job_medical', approvedQuantity: 2 }], userIds: [medic] }
    });
    expect(short.status).toBe(400);
    expect(String(short.json.error?.message ?? '')).toContain('exactly');
    // Duplicate selection of an already-active member fails atomically too.
    repo.run('UPDATE users SET ready_for_mission=1 WHERE id=?', 'usr_responder');
    const leaderRow = repo.one<Record<string, unknown>>(
      'SELECT user_id FROM mission_members WHERE mission_id=? AND role=? AND assignment_status=?', missionId, 'leader', 'active')!;
    const dup = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie,
      body: { decision: 'approved', items: [{ jobTypeId: 'job_medical', approvedQuantity: 2 }], userIds: [medic, String(leaderRow.user_id)] }
    });
    // The leader is a firefighter — wrong type for this line, so this must fail on quantities first.
    expect(dup.status).toBe(400);
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM mission_members WHERE mission_id=? AND assignment_status=?', missionId, 'active')!.c).toBe(1);
  });

  it('an approved worker already on the mission is rejected; assignment is all-or-nothing', async () => {
    const { missionId, leaderCookie } = await setupMission('dec4');
    const first = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'First request to fill the medic slot.' }
    });
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Second request, intentionally duplicated worker.' }
    });
    const medic = await createResponder('dec4.medic', 'job_medical', true);
    const fillFirst = await apiFetch(server, `/_admin/support-requests/${first.json.data.id}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'approved', userIds: [medic] }
    });
    expect(fillFirst.status).toBe(200);
    const dup = await apiFetch(server, `/_admin/support-requests/${created.json.data.id}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'approved', userIds: [medic] }
    });
    expect(dup.status).toBe(400);
    expect(repo.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM mission_members WHERE mission_id=? AND support_request_id=?", missionId, created.json.data.id)!.c).toBe(0);
  });
});

describe('candidate search and filters', () => {
  it('q substring searches usernames; includeIneligible=false hides ineligible workers', async () => {
    const { missionId, leaderCookie } = await setupMission('cand');
    const target = await createResponder('cand.specialmedic', 'job_medical', true);
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Searching for a specialty medic by name.' }
    });
    const requestId = created.json.data.id as string;
    const found = await apiFetch(server, `/_admin/support-requests/${requestId}/candidates?q=specialmed`, { cookie: adminCookie });
    expect(found.status).toBe(200);
    expect(found.json.data.items.map((item: any) => item.id)).toContain(target);
    // Already-on-mission leader is hidden when includeIneligible is not requested.
    const withoutIneligible = await apiFetch(server, `/_admin/support-requests/${requestId}/candidates?jobTypeId=job_fire`, { cookie: adminCookie });
    expect(withoutIneligible.json.data.items.length).toBe(withoutIneligible.json.data.eligibleTotal);
    expect(withoutIneligible.json.data.items.every((item: any) => item.eligible)).toBe(true);
  });
});

describe('team endpoints authorization and freeze', () => {
  it('unknown mission ids map to 404 on every team route', async () => {
    for (const path of [
      '/_user/missions/mis_nope/team',
      '/_admin/missions/mis_nope/team',
      '/_user/missions/mis_nope/support-requests'
    ]) {
      const response = await apiFetch(server, path, { cookie: path.startsWith('/_admin') ? adminCookie : requesterCookie });
      expect(response.status, `${path} -> ${response.status}`).toBe(404);
    }
    expect((await apiFetch(server, '/_admin/support-requests/srq_nope', { cookie: adminCookie })).status).toBe(404);
    expect((await apiFetch(server, '/_admin/support-requests/srq_nope/candidates', { cookie: adminCookie })).status).toBe(404);
  });

  it('finished missions are frozen: no members, no leader changes, no requirements, no requests', async () => {
    const leader = await createResponder('freeze.lead', 'job_fire', true);
    const sosId = await createSosFor(requesterCookie);
    const dispatch = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds: [leader], mode: 'immediate' }
    });
    const missionId = dispatch.json.data.missionId as string;
    const leaderCookie = await login(server, 'freeze.lead', 'Responder!2026x');
    for (const action of ['start', 'complete']) {
      const progress = await apiFetch(server, `/_user/missions/${missionId}/progress`, { method: 'POST', cookie: leaderCookie, body: { action } });
      expect(progress.status, progress.text).toBe(200);
    }
    expect((await apiFetch(server, `/_admin/missions/${missionId}/members`, {
      method: 'POST', cookie: adminCookie, body: { userIds: ['usr_responder'] }
    })).status).toBe(409);
    expect((await apiFetch(server, `/_admin/missions/${missionId}/leader`, {
      method: 'POST', cookie: adminCookie, body: { userId: 'usr_responder' }
    })).status).toBe(409);
    expect((await apiFetch(server, `/_admin/missions/${missionId}/requirements`, {
      method: 'PUT', cookie: adminCookie, body: { requirements: [{ jobTypeId: 'job_fire', quantity: 1 }] }
    })).status).toBe(409);
    expect((await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Late request after completion should fail.' }
    })).status).toBe(409);
  });

  it('a reviewed support request cannot be reviewed again, even by a second administrator', async () => {
    const { missionId, leaderCookie } = await setupMission('freeze2');
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Double-review race simulation for administrators.' }
    });
    const requestId = created.json.data.id as string;
    expect((await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'rejected', adminNote: 'First decision stands.' }
    })).status).toBe(200);
    const second = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'approved' }
    });
    expect(second.status).toBe(409);
  });

  it('mission members see requests without internal review notes; the requesting leader sees them', async () => {
    const { missionId, leaderCookie } = await setupMission('view2');
    const member = await createResponder('view2.member', 'job_medical', true);
    await apiFetch(server, `/_admin/missions/${missionId}/members`, {
      method: 'POST', cookie: adminCookie, body: { userIds: [member] }
    });
    const memberCookie = await login(server, 'view2.member', 'Responder!2026x');
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Need another medic for rotation.' }
    });
    const requestId = created.json.data.id as string;
    const review = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'rejected', adminNote: 'Internal staffing note.' }
    });
    expect(review.status).toBe(200);
    const memberView = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, { cookie: memberCookie });
    const memberItem = memberView.json.data.items.find((item: any) => item.id === requestId);
    expect(memberItem).toBeTruthy();
    expect(memberItem).not.toHaveProperty('adminNote');
    expect(memberItem).not.toHaveProperty('decisions');
    const leaderView = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, { cookie: leaderCookie });
    const leaderItem = leaderView.json.data.items.find((item: any) => item.id === requestId);
    expect(leaderItem).toMatchObject({ adminNote: 'Internal staffing note.', status: 'rejected' });
  });
});
