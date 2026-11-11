// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Stage 3 — mission teams, leadership and support requests.
 * Mission: one parent mission identity per incident; leadership is explicit (never inferred);
 * membership rows are the single source of truth for who is on the team; only the mission
 * leader may file a support request; only administrators review them; approved workers join
 * the SAME parent mission transactionally with the decision.
 */

let server: TestServer;
let requesterCookie: string;
let adminCookie: string;
let repo: { run: (sql: string, ...params: unknown[]) => { changes: number }; one: <T>(sql: string, ...params: unknown[]) => T | undefined; all: <T>(sql: string, ...params: unknown[]) => T[] };

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
  incidentTypeId: 'inc_medical', severity: 'high',
  description: 'Mission teams fixture incident.',
  latitude: 35.7219, longitude: 51.3347, accuracy: 12, isManual: false
};

async function createSos(): Promise<string> {
  const response = await apiFetch(server, '/_user/sos', { method: 'POST', cookie: requesterCookie, body: BASE_SOS });
  expect(response.status, response.text).toBe(201);
  return response.json.data.sos.id as string;
}

async function immediateDispatch(sosId: string, responderId: string) {
  return apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds: [responderId], mode: 'immediate' }
  });
}

async function team(sosId: string) {
  // The mission for an SOS is reachable through the admin team endpoint.
  const missionId = repo.one<Record<string, unknown>>('SELECT id FROM missions WHERE sos_id=?', sosId)?.id as string;
  return { missionId, response: await apiFetch(server, `/_admin/missions/${missionId}/team`, { cookie: adminCookie }) };
}

beforeAll(async () => {
  server = await createTestServer();
  repo = server.app.context.repo as typeof repo;
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

// The emergency rate limiter is per IP+path; each test gets a fresh bucket so the
// fixture-heavy suite stays deterministic without touching production limits.
beforeEach(() => { server.app.context.limiters.clear(); });

afterAll(async () => { await server?.close(); });

describe('membership and leadership by default', () => {
  it('an immediate dispatch attaches the assignee as the team leader (same mission, same identity)', async () => {
    const leader = await createResponder('team.imm', 'job_fire', false);
    const sosId = await createSos();
    const dispatch = await immediateDispatch(sosId, leader);
    expect(dispatch.status, dispatch.text).toBe(200);
    const missionId = dispatch.json.data.missionId as string;

    const response = await apiFetch(server, `/_user/missions/${missionId}/team`, { cookie: await login(server, 'team.imm', 'Responder!2026x') });
    expect(response.status, response.text).toBe(200);
    expect(response.json.data.missionId).toBe(missionId); // same parent mission identity
    expect(response.json.data.leader?.userId).toBe(leader);
    expect(response.json.data.members).toHaveLength(1);
    expect(response.json.data.members[0]).toMatchObject({ userId: leader, role: 'leader', assignmentSource: 'immediate_dispatch', assignmentStatus: 'active' });
    expect(response.json.data.viewerRole).toBe('leader');
  });

  it('an offer acceptance makes the acceptor the default leader of the single mission', async () => {
    const acceptor = await createResponder('team.offer', 'job_fire', true);
    const sosId = await createSos();
    const dispatch = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds: [acceptor] }
    });
    expect(dispatch.status).toBe(200);
    const cookie = await login(server, 'team.offer', 'Responder!2026x');
    const accept = await apiFetch(server, `/_user/sos/${sosId}/accept`, { method: 'POST', cookie });
    expect(accept.status).toBe(200);
    const missionId = accept.json.data.missionId as string;
    const membership = repo.one<Record<string, unknown>>(
      'SELECT role, assignment_source FROM mission_members WHERE mission_id=? AND user_id=?', missionId, acceptor);
    expect(membership).toMatchObject({ role: 'leader', assignment_source: 'offer_accept' });
  });

  it('team-dispatch creates the mission with the designated leader and composition in one transaction', async () => {
    const leader = await createResponder('team.tdl', 'job_fire', false);
    const member = await createResponder('team.tdm', 'job_medical', true);
    const sosId = await createSos();
    const response = await apiFetch(server, `/_admin/sos/${sosId}/team-dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: {
        groupId: 'grp_medical', leaderId: leader,
        requirements: [{ jobTypeId: 'job_fire', quantity: 1 }, { jobTypeId: 'job_medical', quantity: 2 }],
        memberIds: [member]
      }
    });
    expect(response.status, response.text).toBe(201);
    expect(response.json.data.missionStatus).toBe('assigned');
    expect(response.json.data.sosStatus).toBe('dispatched');
    expect(response.json.data.leader?.userId).toBe(leader);
    expect(response.json.data.memberCount).toBe(2);
    expect(response.json.data.requirements).toEqual([
      { jobTypeId: 'job_fire', jobTypeLabel: expect.any(String), quantity: 1, filled: 1 },
      { jobTypeId: 'job_medical', jobTypeLabel: expect.any(String), quantity: 2, filled: 1 }
    ]);
    // SOS and mission share the transition semantics of a normal dispatch.
    expect(repo.one<Record<string, unknown>>('SELECT status FROM sos_requests WHERE id=?', sosId)?.status).toBe('dispatched');
    // Starting the mission follows the independent machines.
    const cookie = await login(server, 'team.tdl', 'Responder!2026x');
    const progress = await apiFetch(server, `/_user/missions/${response.json.data.missionId}/progress`, {
      method: 'POST', cookie, body: { action: 'start' }
    });
    expect(progress.json.data.status).toBe('in_progress');
  });

  it('team-dispatch refuses an undispatchable request and an unknown leader', async () => {
    const leader = await createResponder('team.td2', 'job_fire', false);
    const sosId = await createSos();
    await immediateDispatch(sosId, leader);
    const refused = await apiFetch(server, `/_admin/sos/${sosId}/team-dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', leaderId: leader, requirements: [{ jobTypeId: 'job_fire', quantity: 1 }] }
    });
    expect(refused.status).toBe(409);
    const badSos = await createSos();
    const unknownLeader = await apiFetch(server, `/_admin/sos/${badSos}/team-dispatch`, {
      method: 'POST', cookie: adminCookie,
      body: { groupId: 'grp_medical', leaderId: 'usr_nope', requirements: [{ jobTypeId: 'job_fire', quantity: 1 }] }
    });
    expect(unknownLeader.status).toBe(400);
  });

  it('individual missions gain a composition later without a new mission, via requirements', async () => {
    const leader = await createResponder('team.req', 'job_fire', false);
    const sosId = await createSos();
    const dispatch = await immediateDispatch(sosId, leader);
    const missionId = dispatch.json.data.missionId as string;
    const set = await apiFetch(server, `/_admin/missions/${missionId}/requirements`, {
      method: 'PUT', cookie: adminCookie,
      body: { requirements: [{ jobTypeId: 'job_medical', quantity: 2 }] }
    });
    expect(set.status, set.text).toBe(200);
    expect(set.json.data.requirements).toEqual([
      { jobTypeId: 'job_medical', jobTypeLabel: expect.any(String), quantity: 2, filled: 0 }
    ]);
    const invalid = await apiFetch(server, `/_admin/missions/${missionId}/requirements`, {
      method: 'PUT', cookie: adminCookie, body: { requirements: [{ jobTypeId: 'job_nope', quantity: 1 }] }
    });
    expect(invalid.status).toBe(400);
  });
});

describe('membership invariants', () => {
  it('adding the same worker twice reports a skip and never duplicates an active membership', async () => {
    const leader = await createResponder('team.dup1', 'job_fire', false);
    const extra = await createResponder('team.dup2', 'job_medical', true);
    const sosId = await createSos();
    const dispatch = await immediateDispatch(sosId, leader);
    const missionId = dispatch.json.data.missionId as string;

    const first = await apiFetch(server, `/_admin/missions/${missionId}/members`, {
      method: 'POST', cookie: adminCookie, body: { userIds: [extra] }
    });
    expect(first.status, first.text).toBe(200);
    expect(first.json.data.added).toEqual([extra]);
    expect(first.json.data.skipped).toEqual([]);

    const second = await apiFetch(server, `/_admin/missions/${missionId}/members`, {
      method: 'POST', cookie: adminCookie, body: { userIds: [extra] }
    });
    expect(second.status).toBe(200);
    expect(second.json.data.added).toEqual([]);
    expect(second.json.data.skipped).toEqual([{ userId: extra, reason: 'already_on_mission' }]);
    expect(repo.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM mission_members WHERE mission_id=? AND user_id=? AND assignment_status='active'",
      missionId, extra)!.c).toBe(1);
    // The leadership invariant: exactly one active leader.
    expect(repo.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM mission_members WHERE mission_id=? AND role='leader' AND assignment_status='active'",
      missionId)!.c).toBe(1);
  });

  it('the active leader cannot be removed; a member can, and stops counting toward the team', async () => {
    const leader = await createResponder('team.rem1', 'job_fire', false);
    const member = await createResponder('team.rem2', 'job_medical', true);
    const sosId = await createSos();
    const dispatch = await immediateDispatch(sosId, leader);
    const missionId = dispatch.json.data.missionId as string;
    await apiFetch(server, `/_admin/missions/${missionId}/members`, {
      method: 'POST', cookie: adminCookie, body: { userIds: [member] }
    });
    const leaderRemoved = await apiFetch(server, `/_admin/missions/${missionId}/members/${leader}`, {
      method: 'DELETE', cookie: adminCookie, body: { reason: 'test' }
    });
    expect(leaderRemoved.status).toBe(409);
    const memberRemoved = await apiFetch(server, `/_admin/missions/${missionId}/members/${member}`, {
      method: 'DELETE', cookie: adminCookie, body: { reason: 'task complete' }
    });
    expect(memberRemoved.status, memberRemoved.text).toBe(200);
    expect(memberRemoved.json.data.members.find((m: any) => m.userId === member)?.assignmentStatus).toBe('removed');
    expect(memberRemoved.json.data.memberCount).toBe(1);
  });

  it('designating a new leader atomically demotes the previous one', async () => {
    const leader = await createResponder('team.lead1', 'job_fire', false);
    const member = await createResponder('team.lead2', 'job_medical', true);
    const sosId = await createSos();
    const dispatch = await immediateDispatch(sosId, leader);
    const missionId = dispatch.json.data.missionId as string;
    await apiFetch(server, `/_admin/missions/${missionId}/members`, {
      method: 'POST', cookie: adminCookie, body: { userIds: [member] }
    });
    const promoted = await apiFetch(server, `/_admin/missions/${missionId}/leader`, {
      method: 'POST', cookie: adminCookie, body: { userId: member }
    });
    expect(promoted.status, promoted.text).toBe(200);
    expect(promoted.json.data.leader?.userId).toBe(member);
    const roles = repo.all<Record<string, unknown>>(
      "SELECT user_id, role FROM mission_members WHERE mission_id=? AND assignment_status='active'", missionId);
    expect(roles.find((row) => row.user_id === leader)?.role).toBe('member');
    expect(roles.find((row) => row.user_id === member)?.role).toBe('leader');
    expect(repo.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM mission_members WHERE mission_id=? AND role='leader' AND assignment_status='active'",
      missionId)!.c).toBe(1);
    // Not-a-member cannot be designated.
    const outsider = await apiFetch(server, `/_admin/missions/${missionId}/leader`, {
      method: 'POST', cookie: adminCookie, body: { userId: 'usr_responder' }
    });
    expect(outsider.status).toBe(409);
  });
});

describe('access control and projections', () => {
  it('only members and admins can view the team; the requester alone cannot', async () => {
    const leader = await createResponder('team.view1', 'job_fire', false);
    const sosId = await createSos();
    const dispatch = await immediateDispatch(sosId, leader);
    const missionId = dispatch.json.data.missionId as string;
    const asRequester = await apiFetch(server, `/_user/missions/${missionId}/team`, { cookie: requesterCookie });
    expect(asRequester.status).toBe(403);
    const asAdmin = await apiFetch(server, `/_user/missions/${missionId}/team`, { cookie: adminCookie });
    expect(asAdmin.status).toBe(200);
    expect(asAdmin.json.data.viewerRole).toBe('admin');
  });
});

describe('support requests — creation and review', () => {
  async function setupMission(): Promise<{ missionId: string; leader: string; leaderCookie: string }> {
    const leader = await createResponder(`team.sr${Math.floor(Math.random() * 1e9)}`, 'job_fire', true);
    const sosId = await createSos();
    const dispatch = await immediateDispatch(sosId, leader);
    const missionId = dispatch.json.data.missionId as string;
    return { missionId, leader, leaderCookie: await login(server, (await apiFetch(server, `/_admin/missions/${missionId}/team`, { cookie: adminCookie })).json.data.leader.username, 'Responder!2026x') };
  }

  it('only the mission leader may file; the request captures job types, quantities, reason and note', async () => {
    const { missionId, leaderCookie } = await setupMission();
    const asMemberless = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: requesterCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Need medical support for the rescue operation.' }
    });
    expect(asMemberless.status).toBe(403);
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 2 }], reason: 'Two medics needed for advanced life support.', note: 'Bring stretchers' }
    });
    expect(created.status, created.text).toBe(201);
    expect(created.json.data).toMatchObject({ reason: 'Two medics needed for advanced life support.', note: 'Bring stretchers', status: 'pending' });
    expect(created.json.data.items).toEqual([
      { jobTypeId: 'job_medical', jobTypeLabel: expect.any(String), quantity: 2, approvedQuantity: 0 }
    ]);
    const listed = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, { cookie: leaderCookie });
    expect(listed.status).toBe(200);
    expect(listed.json.data.total).toBe(1);
    // Admin sees the pending request in the queue.
    const pending = await apiFetch(server, '/_admin/support-requests?status=pending', { cookie: adminCookie });
    expect(pending.json.data.items.some((item: any) => item.id === created.json.data.id)).toBe(true);
  });

  it('approved request assigns workers to the SAME parent mission transactionally', async () => {
    const { missionId, leaderCookie } = await setupMission();
    const medic = await createResponder('team.srm1', 'job_medical', true);
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Need one medic for wound care during evacuation.' }
    });
    const requestId = created.json.data.id as string;
    const candidates = await apiFetch(server, `/_admin/support-requests/${requestId}/candidates?jobTypeId=job_medical`, { cookie: adminCookie });
    expect(candidates.status, candidates.text).toBe(200);
    const candidate = candidates.json.data.items.find((item: any) => item.id === medic);
    expect(candidate).toMatchObject({ eligible: true, readyForMission: true });

    const reviewed = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie,
      body: { decision: 'approved', adminNote: 'Approved full.', userIds: [medic] }
    });
    expect(reviewed.status, reviewed.text).toBe(200);
    expect(reviewed.json.data.status).toBe('approved');

    // Same parent mission identity; provenance records request + approving admin.
    const membership = repo.one<Record<string, unknown>>(
      'SELECT role, assignment_source, support_request_id, assigned_by FROM mission_members WHERE mission_id=? AND user_id=?',
      missionId, medic);
    expect(membership).toMatchObject({ role: 'member', assignment_source: 'support_request', support_request_id: requestId });
    expect(membership?.assigned_by).toBeTruthy();
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM missions')!.c).toBeGreaterThan(0);
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM missions WHERE sos_id=(SELECT sos_id FROM missions WHERE id=?)', missionId)!.c).toBe(1);
    // Decision is recorded in history.
    const detail = await apiFetch(server, `/_admin/support-requests/${requestId}`, { cookie: adminCookie });
    expect(detail.json.data.decisions).toEqual([
      expect.objectContaining({ decision: 'approved', note: 'Approved full.' })
    ]);
    // Double review is refused.
    const twice = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'approved', userIds: [medic] }
    });
    expect(twice.status).toBe(409);
  });

  it('full approval refuses mismatched quantities; partial approval records per-line approved quantities', async () => {
    const { missionId, leaderCookie } = await setupMission();
    const medic = await createResponder('team.srp1', 'job_medical', true);
    const firefighter = await createResponder('team.srp2', 'job_fire', true);
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 2 }, { jobTypeId: 'job_fire', quantity: 1 }], reason: 'Need two medics and one extra firefighter for the site.' }
    });
    const requestId = created.json.data.id as string;

    // Full approval but nobody selected -> rejected with guidance.
    const underAssigned = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie,
      body: { decision: 'approved', userIds: [medic] }
    });
    expect(underAssigned.status).toBe(400);

    // Partial approval: one medic only, the firefighter line untouched.
    const partial = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie,
      body: {
        decision: 'partially_approved', adminNote: 'Only one medic available.',
        items: [{ jobTypeId: 'job_medical', approvedQuantity: 1 }, { jobTypeId: 'job_fire', approvedQuantity: 0 }],
        userIds: [medic]
      }
    });
    expect(partial.status, partial.text).toBe(200);
    expect(partial.json.data.status).toBe('partially_approved');
    expect(partial.json.data.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ jobTypeId: 'job_medical', quantity: 2, approvedQuantity: 1 }),
      expect.objectContaining({ jobTypeId: 'job_fire', quantity: 1, approvedQuantity: 0 })
    ]));
    void firefighter;
  });

  it('approving with a worker of the wrong job type is refused atomically', async () => {
    const { missionId, leaderCookie } = await setupMission();
    const firefighter = await createResponder('team.srw1', 'job_fire', true);
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Need a medic urgently for trauma care.' }
    });
    const requestId = created.json.data.id as string;
    const wrong = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'approved', userIds: [firefighter] }
    });
    expect(wrong.status).toBe(400);
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM mission_members WHERE mission_id=?', missionId)!.c).toBe(1);
    expect(repo.one<Record<string, unknown>>('SELECT status FROM support_requests WHERE id=?', requestId)?.status).toBe('pending');
  });

  it('rejection assigns nobody and records the decision', async () => {
    const { missionId, leaderCookie } = await setupMission();
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Need a medic for field triage at the incident.' }
    });
    const requestId = created.json.data.id as string;
    const rejected = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'rejected', adminNote: 'Cannot release staff.' }
    });
    expect(rejected.status, rejected.text).toBe(200);
    expect(rejected.json.data.status).toBe('rejected');
    expect(repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM mission_members WHERE mission_id=?', missionId)!.c).toBe(1);
    const detail = await apiFetch(server, `/_admin/support-requests/${requestId}`, { cookie: adminCookie });
    expect(detail.json.data.decisions).toEqual([expect.objectContaining({ decision: 'rejected', note: 'Cannot release staff.' })]);
  });

  it('the leader can cancel their own pending request; non-leaders and non-pending requests cannot', async () => {
    const { missionId, leaderCookie } = await setupMission();
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Need a medic for overnight monitoring.' }
    });
    const requestId = created.json.data.id as string;
    expect((await apiFetch(server, `/_user/missions/${missionId}/support-requests/${requestId}/cancel`, { method: 'POST', cookie: requesterCookie })).status).toBe(403);
    expect((await apiFetch(server, `/_user/missions/${missionId}/support-requests/${requestId}/cancel`, { method: 'POST', cookie: leaderCookie })).status).toBe(200);
    expect((await apiFetch(server, `/_user/missions/${missionId}/support-requests/${requestId}/cancel`, { method: 'POST', cookie: leaderCookie })).status).toBe(409);
    // Cancelling a request that belongs to a DIFFERENT mission via this path is a 404, not a leak.
    const other = await setupMission();
    const otherCreated = await apiFetch(server, `/_user/missions/${other.missionId}/support-requests`, {
      method: 'POST', cookie: other.leaderCookie,
      body: { items: [{ jobTypeId: 'job_fire', quantity: 1 }], reason: 'Need an additional firefighter for pumping.' }
    });
    const cross = await apiFetch(server, `/_user/missions/${missionId}/support-requests/${otherCreated.json.data.id}/cancel`, { method: 'POST', cookie: leaderCookie });
    expect(cross.status).toBe(404);
  });
});

describe('eligibility engine', () => {
  it('ready-only job types require standby; policy `all` workers may be offered while not ready', async () => {
    const { missionId, leaderCookie } = await setupMission();
    const notReady = await createResponder('team.elig1', 'job_maintenance', false); // ready_only
    const notReadyFire = await createResponder('team.elig2', 'job_fire', false);     // policy all
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_maintenance', quantity: 1 }], reason: 'Need a maintenance specialist for equipment.' }
    });
    const requestId = created.json.data.id as string;
    const listed = await apiFetch(server, `/_admin/support-requests/${requestId}/candidates?includeIneligible=true`, { cookie: adminCookie });
    const maintenance = listed.json.data.items.find((item: any) => item.id === notReady);
    expect(maintenance).toMatchObject({ eligible: false, ineligibleReason: 'not_ready' });
    // job_fire seeker under question: not requested type but visible without filter; policy all stays eligible.
    const fire = listed.json.data.items.find((item: any) => item.id === notReadyFire);
    expect(fire).toMatchObject({ eligible: true });
    // Selecting the not-ready ready_only worker fails the review atomically.
    const review = await apiFetch(server, `/_admin/support-requests/${requestId}/review`, {
      method: 'POST', cookie: adminCookie, body: { decision: 'approved', userIds: [notReady] }
    });
    expect(review.status).toBe(400);
  });

  it('workers already on the mission are ineligible for the same assignment; other missions are flagged', async () => {
    const leader = await createResponder('team.elig3', 'job_fire', true);
    const sosId = await createSos();
    const dispatch = await immediateDispatch(sosId, leader);
    const missionId = dispatch.json.data.missionId as string;
    const leaderCookie = await login(server, 'team.elig3', 'Responder!2026x');
    const created = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderCookie,
      body: { items: [{ jobTypeId: 'job_fire', quantity: 1 }], reason: 'Need one more firefighter for the second line.' }
    });
    const requestId = created.json.data.id as string;
    const listed = await apiFetch(server, `/_admin/support-requests/${requestId}/candidates?includeIneligible=true`, { cookie: adminCookie });
    const leaderCandidate = listed.json.data.items.find((item: any) => item.id === leader);
    expect(leaderCandidate).toMatchObject({ eligible: false, ineligibleReason: 'already_on_mission' });
  });
});

describe('membership identity', () => {
  it('a user may lead one mission while being a member of another', async () => {
    const shared = await createResponder('team.share', 'job_fire', true);
    const other = await createResponder('team.share2', 'job_fire', true);
    const sosOne = await createSos();
    const first = await immediateDispatch(sosOne, shared);
    const missionOne = first.json.data.missionId as string;
    const sosTwo = await createSos();
    const second = await immediateDispatch(sosTwo, other);
    const missionTwo = second.json.data.missionId as string;
    // Join mission two as a plain member through the staffing endpoint.
    const added = await apiFetch(server, `/_admin/missions/${missionTwo}/members`, {
      method: 'POST', cookie: adminCookie, body: { userIds: [shared] }
    });
    expect(added.status, added.text).toBe(200);
    expect(added.json.data.members.find((m: any) => m.userId === shared)?.role).toBe('member');
    const one = await apiFetch(server, `/_admin/missions/${missionOne}/team`, { cookie: adminCookie });
    const two = await apiFetch(server, `/_admin/missions/${missionTwo}/team`, { cookie: adminCookie });
    expect(one.json.data.members.find((m: any) => m.userId === shared)?.role).toBe('leader');
    expect(two.json.data.members.find((m: any) => m.userId === shared)?.role).toBe('member');
    // No uniqueness leaks across missions.
    const total = repo.one<{ c: number }>(
      "SELECT COUNT(*) AS c FROM mission_members WHERE user_id=? AND assignment_status='active'", shared)!.c;
    expect(total).toBe(2);
  });
});

async function setupMission() {
  const leader = await createResponder(`team.gen${Math.floor(Math.random() * 1e9)}`, 'job_fire', true);
  const sosId = await createSos();
  const dispatch = await immediateDispatch(sosId, leader);
  const missionId = dispatch.json.data.missionId as string;
  const teamView = await apiFetch(server, `/_admin/missions/${missionId}/team`, { cookie: adminCookie });
  const leaderCookie = await login(server, teamView.json.data.leader.username, 'Responder!2026x');
  return { missionId, leader, leaderCookie };
}
