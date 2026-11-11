// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  apiFetch, closeSocket, createTestServer, issueTicket, login, openSocketWithHello,
  sendJson, waitForMessage, websocketUrl, type TestServer
} from './helpers.ts';
import { WS_EVENTS } from '../src/shared/protocol.ts';

/**
 * Mission-room realtime authorization (F3). Every active member of a mission — ordinary member or
 * designated leader — may subscribe to `mission:<id>`; removed members, unrelated accounts and the
 * requester's privacy boundaries are preserved; administrators keep access. Mission events published
 * to the room (support-request lifecycle, team composition) therefore reach the whole team.
 */

let server: TestServer;
let requesterCookie: string;
let adminCookie: string;
let repo: { run: (sql: string, ...params: unknown[]) => { changes: number }; one: <T>(sql: string, ...params: unknown[]) => T | undefined };

const sockets: WebSocket[] = [];

async function connect(cookie: string): Promise<(WebSocket & { close?: () => void }) | any> {
  const ticket = await issueTicket(server, cookie);
  const connection = await openSocketWithHello(websocketUrl(server, ticket.ticket));
  sockets.push(connection.socket);
  return connection;
}

describe('F3 — mission room authorization', () => {
  let unrelatedCookie = '';
  let missionId = '';
  let leaderAgent: { id: string; cookie: string };
  let memberAgent: { id: string; cookie: string };

  async function createResponder(username: string, jobTypeId: string): Promise<{ id: string; cookie: string }> {
    const created = await apiFetch(server, '/_admin/users', {
      method: 'POST', cookie: adminCookie,
      body: { username, password: 'Responder!2026x', role: 'responder', jobTypeId }
    });
    expect(created.status, created.text).toBe(201);
    const id = created.json.data.userId as string;
    repo.run('UPDATE users SET job_type_id=? WHERE id=?', jobTypeId, id);
    repo.run('UPDATE users SET ready_for_mission=1 WHERE id=?', id);
    const membership = await apiFetch(server, '/_admin/groups/grp_medical/members', {
      method: 'POST', cookie: adminCookie, body: { userId: id, role: 'member' }
    });
    expect(membership.status, membership.text).toBeLessThan(300);
    return { id, cookie: await login(server, username, 'Responder!2026x') };
  }

  beforeAll(async () => {
    server = await createTestServer();
    repo = server.app.context.repo as typeof repo;
    requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
    adminCookie = await login(server, 'admin', 'AdminPass!2026');
    leaderAgent = await createResponder('room.leader', 'job_fire');
    memberAgent = await createResponder('room.member', 'job_medical');
    const unrelated = await createResponder('room.unrelated', 'job_fire');
    unrelatedCookie = unrelated.cookie;

    const created = await apiFetch(server, '/_user/sos', {
      method: 'POST', cookie: requesterCookie,
      body: {
        incidentTypeId: 'inc_medical', severity: 'high',
        description: 'Mission room fixture incident.',
        latitude: 35.7219, longitude: 51.3347, accuracy: 12, isManual: false
      }
    });
    expect(created.status, created.text).toBe(201);
    const sosId = created.json.data.sos.id as string;
    const dispatch = await apiFetch(server, `/_admin/sos/${sosId}/dispatch`, {
      method: 'POST', cookie: adminCookie, body: { groupId: 'grp_medical', responderIds: [leaderAgent.id], mode: 'immediate' }
    });
    expect(dispatch.status, dispatch.text).toBe(200);
    missionId = dispatch.json.data.missionId as string;
    const added = await apiFetch(server, `/_admin/missions/${missionId}/members`, {
      method: 'POST', cookie: adminCookie, body: { userIds: [memberAgent.id] }
    });
    expect(added.status, added.text).toBe(200);
  }, 30_000);

  beforeEach(() => { server.app.context.limiters.clear(); });

  afterAll(async () => {
    for (const socket of sockets) await closeSocket(socket);
    await server?.close();
  });

  it('an active ordinary member can subscribe to the mission room and receives support-request events', async () => {
    const connection = await connect(memberAgent.cookie);
    const acknowledged = waitForMessage(connection.socket,
      (m: any) => m.type === WS_EVENTS.ACK && m.kind === WS_EVENTS.SUBSCRIBE && m.requestId === 'room-sub-m');
    sendJson(connection.socket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'room-sub-m', room: `mission:${missionId}` });
    expect((await acknowledged).accepted).toBe(true);

    // The leader files a support request; the member must see the room event.
    const eventPromise = waitForMessage(connection.socket,
      (m: any) => m.type === WS_EVENTS.EVENT && m.event?.type === 'support.request.created');
    const filed = await apiFetch(server, `/_user/missions/${missionId}/support-requests`, {
      method: 'POST', cookie: leaderAgent.cookie,
      body: { items: [{ jobTypeId: 'job_medical', quantity: 1 }], reason: 'Need a nurse on standby now.' }
    });
    expect(filed.status, filed.text).toBe(201);
    expect((await eventPromise).event.payload.missionId).toBe(missionId);
  });

  it('the active leader can subscribe to the mission room', async () => {
    const connection = await connect(leaderAgent.cookie);
    const acknowledged = waitForMessage(connection.socket,
      (m: any) => m.type === WS_EVENTS.ACK && m.kind === WS_EVENTS.SUBSCRIBE && m.requestId === 'room-sub-l');
    sendJson(connection.socket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'room-sub-l', room: `mission:${missionId}` });
    expect((await acknowledged).accepted).toBe(true);
  });

  it('the requester of the underlying SOS keeps access (existing privacy rule)', async () => {
    const connection = await connect(requesterCookie);
    const acknowledged = waitForMessage(connection.socket,
      (m: any) => m.type === WS_EVENTS.ACK && m.kind === WS_EVENTS.SUBSCRIBE && m.requestId === 'room-sub-r');
    sendJson(connection.socket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'room-sub-r', room: `mission:${missionId}` });
    expect((await acknowledged).accepted).toBe(true);
  });

  it('an unrelated account cannot subscribe', async () => {
    const connection = await connect(unrelatedCookie);
    const denied = waitForMessage(connection.socket,
      (m: any) => m.type === WS_EVENTS.ERROR && m.requestId === 'room-sub-u' && m.code === 'FORBIDDEN');
    sendJson(connection.socket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'room-sub-u', room: `mission:${missionId}` });
    expect((await denied).code).toBe('FORBIDDEN');
  });

  it('a removed member loses room access for fresh subscriptions', async () => {
    const removed = await apiFetch(server, `/_admin/missions/${missionId}/members/${memberAgent.id}`, {
      method: 'DELETE', cookie: adminCookie, body: { reason: 'rotated out of the team' }
    });
    expect(removed.status, removed.text).toBe(200);
    const connection = await connect(memberAgent.cookie);
    const denied = waitForMessage(connection.socket,
      (m: any) => m.type === WS_EVENTS.ERROR && m.requestId === 'room-sub-x' && m.code === 'FORBIDDEN');
    sendJson(connection.socket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'room-sub-x', room: `mission:${missionId}` });
    expect((await denied).code).toBe('FORBIDDEN');
  });

  it('leadership replacement does not break realtime authorization', async () => {
    // Re-add the previously removed member and designate them leader: they can subscribe
    // to the room and the operational owner references agree on them.
    const readded = await apiFetch(server, `/_admin/missions/${missionId}/members`, {
      method: 'POST', cookie: adminCookie, body: { userIds: [memberAgent.id] }
    });
    expect(readded.status, readded.text).toBe(200);
    const designated = await apiFetch(server, `/_admin/missions/${missionId}/leader`, {
      method: 'POST', cookie: adminCookie, body: { userId: memberAgent.id }
    });
    expect(designated.status, designated.text).toBe(200);

    const connection = await connect(memberAgent.cookie);
    const acknowledged = waitForMessage(connection.socket,
      (m: any) => m.type === WS_EVENTS.ACK && m.kind === WS_EVENTS.SUBSCRIBE && m.requestId === 'room-sub-n');
    sendJson(connection.socket, { type: WS_EVENTS.SUBSCRIBE, requestId: 'room-sub-n', room: `mission:${missionId}` });
    expect((await acknowledged).accepted).toBe(true);

    const mission = repo.one<Record<string, unknown>>('SELECT responder_id FROM missions WHERE id=?', missionId)!;
    expect(String(mission.responder_id)).toBe(memberAgent.id);
  });
});
