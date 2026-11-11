// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Leadership transfer (F2). designateLeader used to flip mission_members.role only; the
 * operational owner references (missions.responder_id, sos_requests.assigned_responder_id) and
 * every authorization path keyed off them stayed with the previous leader. The transfer now
 * happens atomically in one transaction and every path agrees on the current leader.
 */

let server: TestServer;
let requesterCookie: string;
let adminCookie: string;
let repo: { run: (sql: string, ...params: unknown[]) => { changes: number }; one: <T>(sql: string, ...params: unknown[]) => T | undefined; all: <T>(sql: string, ...params: unknown[]) => T[] };

async function createResponder(username: string, jobTypeId: string, ready: boolean): Promise<{ id: string; cookie: string }> {
  const created = await apiFetch(server, '/_admin/users', {
    method: 'POST', cookie: adminCookie,
    body: { username, password: 'Responder!2026x', role: 'responder', jobTypeId }
  });
  expect(created.status, created.text).toBe(201);
  const id = created.json.data.userId as string;
  repo.run('UPDATE users SET job_type_id=? WHERE id=?', jobTypeId, id);
  if (ready) repo.run('UPDATE users SET ready_for_mission=1 WHERE id=?', id);
  const membership = await apiFetch(server, '/_admin/groups/grp_medical/members', {
    method: 'POST', cookie: adminCookie, body: { userId: id, role: 'member' }
  });
  expect(membership.status, membership.text).toBeLessThan(300);
  return { id, cookie: await login(server, username, 'Responder!2026x') };
}

const BASE_SOS = {
  incidentTypeId: 'inc_medical', severity: 'high',
  description: 'Leader replacement fixture incident.',
  latitude: 35.7219, longitude: 51.3347, accuracy: 12, isManual: false
};

async function createSos(): Promise<string> {
  const response = await apiFetch(server, '/_user/sos', { method: 'POST', cookie: requesterCookie, body: BASE_SOS });
  expect(response.status, response.text).toBe(201);
  return response.json.data.sos.id as string;
}

async function immediateDispatch(leaderId: string): Promise<string> {
  const sosId = await createSos();
  const dispatch = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
    method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds: [leaderId], mode: 'immediate' }
  });
  expect(dispatch.status, dispatch.text).toBe(200);
  return dispatch.json.data.missionId as string;
}

async function addMember(missionId: string, userId: string): Promise<void> {
  const added = await apiFetch(server, `/_admin/missions/${missionId}/members`, {
    method: 'POST', cookie: adminCookie, body: { userIds: [userId] }
  });
  expect(added.status, added.text).toBe(200);
}

async function designate(missionId: string, userId: string) {
  return apiFetch(server, `/_admin/missions/${missionId}/leader`, {
    method: 'POST', cookie: adminCookie, body: { userId }
  });
}

beforeAll(async () => {
  server = await createTestServer();
  repo = server.app.context.repo as typeof repo;
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

beforeEach(() => { server.app.context.limiters.clear(); });

afterAll(async () => { await server?.close(); });

describe('F2 — mission leader replacement', () => {
  it('transfers the mission-driving authority to the designated leader atomically', async () => {
    const original = await createResponder('lead.a', 'job_fire', true);
    const promoted = await createResponder('lead.b', 'job_medical', true);
    const missionId = await immediateDispatch(original.id);
    await addMember(missionId, promoted.id);

    const designated = await designate(missionId, promoted.id);
    expect(designated.status, designated.text).toBe(200);

    // Operational owner references moved together.
    const mission = repo.one<Record<string, unknown>>('SELECT responder_id FROM missions WHERE id=?', missionId)!;
    const sosId = String(repo.one<Record<string, unknown>>('SELECT sos_id FROM missions WHERE id=?', missionId)!.sos_id);
    const sos = repo.one<Record<string, unknown>>('SELECT assigned_responder_id FROM sos_requests WHERE id=?', sosId)!;
    expect(String(mission.responder_id)).toBe(promoted.id);
    expect(String(sos.assigned_responder_id)).toBe(promoted.id);

    // The new leader can drive the mission: start, and complete after in_progress.
    const start = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: promoted.cookie, body: { action: 'start' }
    });
    expect(start.status, start.text).toBe(200);
    expect(start.json.data.status).toBe('in_progress');

    // The previous leader's mission-driving authority is gone.
    const forbidden = await apiFetch(server, `/_user/missions/${missionId}/progress`, {
      method: 'POST', cookie: original.cookie, body: { action: 'complete' }
    });
    expect(forbidden.status).toBe(403);

    // The previous leader remains an ordinary active member.
    const team = await apiFetch(server, `/_user/missions/${missionId}/team`, { cookie: original.cookie });
    expect(team.status).toBe(200);
    const rows = team.json.data.members as Array<Record<string, unknown>>;
    expect(rows.find((m) => m.userId === original.id)?.role).toBe('member');
    expect(rows.find((m) => m.userId === promoted.id)?.role).toBe('leader');
  });

  it('the designated leader sees the mission in their list and the previous leader does not lose member access', async () => {
    const original = await createResponder('lead.c', 'job_fire', true);
    const promoted = await createResponder('lead.d', 'job_medical', true);
    const missionId = await immediateDispatch(original.id);
    await addMember(missionId, promoted.id);
    expect((await designate(missionId, promoted.id)).status).toBe(200);

    const promotedList = await apiFetch(server, '/_user/missions?limit=50', { cookie: promoted.cookie });
    expect((promotedList.json.data.items as Array<any>).some((item) => item.id === missionId)).toBe(true);
    // The previous leader remains a member of the mission and can open the team projection.
    const team = await apiFetch(server, `/_user/missions/${missionId}/team`, { cookie: original.cookie });
    expect(team.status).toBe(200);
    expect(team.json.data.viewerRole).toBe('member');
  });

  it('a member removed before designation cannot be designated leader', async () => {
    const original = await createResponder('lead.e', 'job_fire', true);
    const promoted = await createResponder('lead.f', 'job_medical', true);
    const missionId = await immediateDispatch(original.id);
    await addMember(missionId, promoted.id);
    const removed = await apiFetch(server, `/_admin/missions/${missionId}/members/${promoted.id}`, {
      method: 'DELETE', cookie: adminCookie, body: { reason: 'Audit says rotation' }
    });
    expect(removed.status, removed.text).toBe(200);
    const designated = await designate(missionId, promoted.id);
    expect(designated.status).toBe(409);
  });

  it('keeps exactly one active leader across sequential replacements', async () => {
    const first = await createResponder('lead.g', 'job_fire', true);
    const second = await createResponder('lead.h', 'job_medical', true);
    const third = await createResponder('lead.i', 'job_fire', true);
    const missionId = await immediateDispatch(first.id);
    await addMember(missionId, second.id);
    await addMember(missionId, third.id);
    expect((await designate(missionId, second.id)).status).toBe(200);
    expect((await designate(missionId, third.id)).status).toBe(200);

    const leaders = repo.all<Record<string, unknown>>(
      "SELECT user_id FROM mission_members WHERE mission_id=? AND role='leader' AND assignment_status='active'", missionId);
    expect(leaders).toHaveLength(1);
    expect(String(leaders[0].user_id)).toBe(third.id);
    expect(String(repo.one<Record<string, unknown>>('SELECT responder_id FROM missions WHERE id=?', missionId)!.responder_id)).toBe(third.id);
  });

  it('designation is auditable: previous assignee references are recorded', async () => {
    const original = await createResponder('lead.j', 'job_fire', true);
    const promoted = await createResponder('lead.k', 'job_medical', true);
    const missionId = await immediateDispatch(original.id);
    await addMember(missionId, promoted.id);
    expect((await designate(missionId, promoted.id)).status).toBe(200);

    const audit = repo.one<Record<string, unknown>>(
      "SELECT * FROM audit_log WHERE action='mission_leader.designated' AND target=? ORDER BY id DESC LIMIT 1", `missions:${missionId}`);
    expect(audit).toBeTruthy();
    const meta = JSON.parse(String(audit!.meta_json));
    expect(meta.previousLeaderId).toBe(original.id);
    expect(meta.previousMissionResponderId).toBe(original.id);
    expect(meta.userId).toBe(promoted.id);
  });

  it('concurrent designations converge on one leader and consistent references', async () => {
    const first = await createResponder('lead.l', 'job_fire', true);
    const second = await createResponder('lead.m', 'job_medical', true);
    const third = await createResponder('lead.n', 'job_fire', true);
    const missionId = await immediateDispatch(first.id);
    await addMember(missionId, second.id);
    await addMember(missionId, third.id);

    const [a, b] = await Promise.allSettled([designate(missionId, second.id), designate(missionId, third.id)]);
    for (const result of [a, b]) expect(result.status).toBe('fulfilled');
    const leaders = repo.all<Record<string, unknown>>(
      "SELECT user_id FROM mission_members WHERE mission_id=? AND role='leader' AND assignment_status='active'", missionId);
    expect(leaders).toHaveLength(1);
    const mission = repo.one<Record<string, unknown>>('SELECT responder_id, sos_id FROM missions WHERE id=?', missionId)!;
    expect(String(mission.responder_id)).toBe(String(leaders[0].user_id));
    const sos = repo.one<Record<string, unknown>>('SELECT assigned_responder_id FROM sos_requests WHERE id=?', String(mission.sos_id))!;
    expect(String(sos.assigned_responder_id)).toBe(String(leaders[0].user_id));
  });

  it('re-designating the current leader is a safe no-op', async () => {
    const first = await createResponder('lead.o', 'job_fire', true);
    const missionId = await immediateDispatch(first.id);
    const before = repo.one<Record<string, unknown>>('SELECT updated_at FROM missions WHERE id=?', missionId)!.updated_at;
    const again = await designate(missionId, first.id);
    expect(again.status).toBe(200);
    const after = repo.one<Record<string, unknown>>('SELECT updated_at FROM missions WHERE id=?', missionId)!.updated_at;
    expect(after).toEqual(before);
  });
});
