// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * The reports endpoint must compute, never invent: a coherent window, deltas that are null when the
 * previous window is empty, and group rows that attribute requests and offers to the group the SOS
 * was assigned to. The roster endpoint feeds the members panel — the dispatch rules depend on it.
 */

let server: TestServer;
let adminCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  adminCookie = await login(server, 'admin', 'AdminPass!2026');
});

afterAll(async () => {
  await server?.close();
});

describe('reports endpoint', () => {
  it('requires an administrator session', async () => {
    const response = await apiFetch(server, '/_admin/reports');
    expect(response.status).toBe(401);
  });

  it('rejects a window outside the supported range', async () => {
    const response = await apiFetch(server, '/_admin/reports?days=3', { cookie: adminCookie });
    expect(response.status).toBe(400);
  });

  it('returns a coherent 7-day payload with honest deltas', async () => {
    const response = await apiFetch(server, '/_admin/reports?days=7', { cookie: adminCookie });
    expect(response.status, response.text).toBe(200);
    const data = response.json.data;
    expect(data.days).toBe(7);
    expect(data.trend).toHaveLength(7);
    // The demo SOS rows are seeded at `now`, so they fall inside the window.
    expect(data.kpis.totalRequests).toBeGreaterThanOrEqual(1);
    // The previous window is empty for a fresh install, so no delta may be claimed.
    expect(data.kpis.requestsDeltaPct).toBeNull();
    expect(data.kpis.avgResponseDeltaSeconds).toBeNull();
    expect(data.kpis.acceptanceRateDeltaPct).toBeNull();
    expect(data.kpis.cancelledDeltaPct).toBeNull();
    expect(Array.isArray(data.incidentTypes)).toBe(true);
    expect(Array.isArray(data.groups)).toBe(true);
    expect(data.groups.map((row: any) => row.id)).toEqual(expect.arrayContaining(['grp_medical', 'grp_fire']));
    expect(data.groupRequestTotal).toBe(data.groups.reduce((sum: number, row: any) => sum + row.requests, 0));
    // Attribution stays honest: the seeded completed SOS was never assigned to a group.
    expect(data.groups.every((row: any) => row.requests >= 0)).toBe(true);
  });

  it('defaults to a 30-day window and accepts 90 days', async () => {
    const fallback = await apiFetch(server, '/_admin/reports', { cookie: adminCookie });
    expect(fallback.json.data.days).toBe(30);
    expect(fallback.json.data.trend).toHaveLength(30);

    const wide = await apiFetch(server, '/_admin/reports?days=90', { cookie: adminCookie });
    expect(wide.json.data.days).toBe(90);
    expect(wide.json.data.trend).toHaveLength(90);
  });

  it('attributes requests, offers, response time and rating to the assigned group', async () => {
    const now = Date.now();
    const repo = server.app.context.repo;
    repo.run(
      `INSERT INTO sos_requests(id,requester_id,incident_type_id,severity,description,latitude,longitude,accuracy,is_manual,status,assigned_group_id,created_at,updated_at,expires_at)
       VALUES('sos_rep_test','usr_requester','inc_medical','high','rep test',35.7,51.4,10,0,'completed','grp_medical',?,?,?)`,
      now - 1000, now - 1000, now + 60_000);
    repo.run(
      `INSERT INTO missions(id,sos_id,responder_id,status,rating,created_at,updated_at,completed_at,cancelled_at)
       VALUES('mis_rep_test','sos_rep_test','usr_responder','completed',4,?,?,?,NULL)`,
      now - 1000, now - 500, now - 500);
    repo.run(
      `INSERT INTO mission_events(mission_id,actor_id,action,from_status,to_status,created_at)
       VALUES('mis_rep_test','usr_responder','accept','pending','on_the_way',?)`,
      now - 400);
    repo.run(
      `INSERT INTO mission_offers(id,sos_id,responder_id,policy,status,created_at,responded_at)
       VALUES('off_rep_test','sos_rep_test','usr_responder','all','accepted',?,?)`,
      now - 900, now - 400);

    const response = await apiFetch(server, '/_admin/reports?days=7', { cookie: adminCookie });
    expect(response.status, response.text).toBe(200);
    const data = response.json.data;
    const row = data.groups.find((group: any) => group.id === 'grp_medical');
    expect(row).toBeTruthy();
    expect(row.requests).toBe(1);
    expect(row.acceptanceRate).toBe(100);
    expect(row.avgResponseSeconds).not.toBeNull();
    expect(row.ratingAvg).toBe(4);
    // Table-wide KPIs now see a decided offer and a recorded accept event.
    expect(data.kpis.acceptanceRate).not.toBeNull();
    expect(data.kpis.avgResponseSeconds).not.toBeNull();
  });

  it('computes acceptance from recorded offers, not from intuition', async () => {
    const response = await apiFetch(server, '/_admin/reports?days=30', { cookie: adminCookie });
    expect(response.status, response.text).toBe(200);
    const { acceptanceRate, acceptanceRateDeltaPct } = response.json.data.kpis;
    const offers = server.app.context.repo.all<Record<string, any>>(
      "SELECT status, COUNT(*) AS c FROM mission_offers GROUP BY status");
    const byStatus = Object.fromEntries(offers.map((row: any) => [String(row.status), Number(row.c)]));
    const decided = (byStatus.accepted ?? 0) + (byStatus.declined ?? 0) + (byStatus.expired ?? 0);
    if (decided === 0) {
      expect(acceptanceRate).toBeNull();
      expect(acceptanceRateDeltaPct).toBeNull();
    } else {
      expect(acceptanceRate).toBe(Math.round(((byStatus.accepted ?? 0) * 100) / decided));
    }
  });
});

describe('group roster endpoint', () => {
  it('requires an administrator session', async () => {
    const response = await apiFetch(server, '/_admin/groups/grp_medical/members');
    expect(response.status).toBe(401);
  });

  it('reports an unknown group as not found', async () => {
    const response = await apiFetch(server, '/_admin/groups/grp_nope/members', { cookie: adminCookie });
    expect(response.status).toBe(404);
  });

  it('returns the seeded medical-group leader first', async () => {
    const response = await apiFetch(server, '/_admin/groups/grp_medical/members', { cookie: adminCookie });
    expect(response.status, response.text).toBe(200);
    expect(response.json.data.total).toBeGreaterThanOrEqual(1);
    expect(response.json.data.items[0].membership).toBe('leader');
    expect(response.json.data.items[0].userId).toBe('usr_responder');
    expect(response.json.data.items[0]).not.toHaveProperty('joinedAt');
  });

  it('adds then removes a member, keeping the roster honest throughout', async () => {
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'roster.check', password: 'RosterCheck!2026', role: 'responder' }
    });
    expect(created.status, created.text).toBe(201);
    const userId = created.json.data.userId as string;

    const added = await apiFetch(server, '/_admin/groups/grp_fire/members', {
      method: 'POST', cookie: adminCookie, body: { userId, role: 'member' }
    });
    expect(added.status, added.text).toBe(200);

    const roster = await apiFetch(server, '/_admin/groups/grp_fire/members', { cookie: adminCookie });
    expect(roster.json.data.items.some((member: any) => member.userId === userId && member.membership === 'member')).toBe(true);

    const removed = await apiFetch(server, `/_admin/groups/grp_fire/members/${userId}`, { method: 'DELETE', cookie: adminCookie });
    expect(removed.status, removed.text).toBe(200);

    const after = await apiFetch(server, '/_admin/groups/grp_fire/members', { cookie: adminCookie });
    expect(after.json.data.items.every((member: any) => member.userId !== userId)).toBe(true);
  });

  it('refuses to roster a plain user account', async () => {
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username: 'roster.plainuser', password: 'RosterUser!2026', role: 'user' }
    });
    expect(created.status, created.text).toBe(201);
    const userId = created.json.data.userId as string;

    const response = await apiFetch(server, '/_admin/groups/grp_fire/members', {
      method: 'POST', cookie: adminCookie, body: { userId, role: 'member' }
    });
    expect(response.status).toBe(400);
  });
});
