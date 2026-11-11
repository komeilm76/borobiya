// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiFetch, createTestServer, login, type TestServer } from './helpers.ts';

/**
 * Trip domain (Stage 5): creation with ranked stops, leader-only mutation, the invitation and
 * explicit acceptance policy, saved trips, status transitions and the authorization boundaries
 * (a non-member learns nothing, a member cannot act as leader, the leader cannot be a nobody).
 */

let server: TestServer;
let requesterCookie: string;
let companionCookie: string;
let responderCookie: string;

beforeAll(async () => {
  server = await createTestServer();
  requesterCookie = await login(server, 'saeed.k', 'DemoPass!2026');
  companionCookie = await login(server, 'maryam.a', 'DemoPass!2026');
  responderCookie = await login(server, 'reza.m', 'DemoPass!2026');
}, 30_000);

beforeEach(() => { server.app.context.limiters.clear(); });

afterAll(async () => {
  if (server) await server.close();
});

const STOPS = [
  { label: 'میدان انقلاب', latitude: 35.7219, longitude: 51.4047 },
  { label: 'بیمارستان امید', latitude: 35.7231, longitude: 51.4122 },
  { label: 'خانه', latitude: 35.7192, longitude: 51.3314 }
];

async function createTrip(cookie: string, overrides: Record<string, unknown> = {}) {
  const response = await apiFetch(server, '/_user/trips', {
    method: 'POST', cookie,
    body: { name: 'مسیر روزانه', stops: STOPS, ...overrides }
  });
  expect(response.status, response.text).toBe(201);
  return response.json.data;
}

describe('trip creation and reads', () => {
  it('creates a trip with ranked stops and a leader membership for the creator', async () => {
    const trip = await createTrip(requesterCookie);
    expect(trip.status).toBe('planned');
    expect(trip.role).toBe('leader');
    expect(trip.ownerUsername).toBe('saeed.k');
    expect(trip.stops.map((stop: any) => [stop.rank, stop.label])).toEqual([
      [1, 'میدان انقلاب'], [2, 'بیمارستان امید'], [3, 'خانه']
    ]);
    expect(trip.members).toHaveLength(1);
    expect(trip.members[0]).toMatchObject({ userId: 'usr_requester', role: 'leader' });
    expect(trip.invitations).toEqual([]);
  });

  it('lists the trip with counts and honours the saved filter', async () => {
    const trip = await createTrip(requesterCookie);
    const listed = await apiFetch(server, '/_user/trips', { cookie: requesterCookie });
    const row = (listed.json.data.items as Array<any>).find((item) => item.id === trip.id);
    expect(row).toMatchObject({ stopCount: 3, memberCount: 1, role: 'leader', saved: false });

    const savedOnlyBefore = await apiFetch(server, '/_user/trips?saved=true', { cookie: requesterCookie });
    expect((savedOnlyBefore.json.data.items as Array<any>).some((item) => item.id === trip.id)).toBe(false);

    const saved = await apiFetch(server, `/_user/trips/${trip.id}/save`, {
      method: 'POST', cookie: requesterCookie, body: { saved: true }
    });
    expect(saved.status).toBe(200);
    const savedOnlyAfter = await apiFetch(server, '/_user/trips?saved=true', { cookie: requesterCookie });
    expect((savedOnlyAfter.json.data.items as Array<any>).some((item) => item.id === trip.id)).toBe(true);

    const unsaved = await apiFetch(server, `/_user/trips/${trip.id}/save`, {
      method: 'POST', cookie: requesterCookie, body: { saved: false }
    });
    expect(unsaved.status).toBe(200);
  });

  it('rejects a trip without stops, an invalid coordinate and a foreign saved place', async () => {
    const empty = await apiFetch(server, '/_user/trips', {
      method: 'POST', cookie: requesterCookie, body: { name: 'بدون توقف', stops: [] }
    });
    expect(empty.status).toBe(400);

    const outOfRange = await apiFetch(server, '/_user/trips', {
      method: 'POST', cookie: requesterCookie,
      body: { name: 'خراب', stops: [{ label: 'x', latitude: 91, longitude: 51.4 }] }
    });
    expect(outOfRange.status).toBe(400);

    const foreignPlaceOther = await apiFetch(server, '/_user/trips', {
      method: 'POST', cookie: companionCookie,
      body: { name: 'x', stops: [{ label: 'x', latitude: 35.7, longitude: 51.4, placeId: 'plc_demo_home' }] }
    });
    expect(foreignPlaceOther.status).toBe(400);
  });

  it('references a saved place owned by the creator', async () => {
    const place = await apiFetch(server, '/_user/places', {
      method: 'POST', cookie: requesterCookie,
      body: { name: 'مقصد کار', label: 'کار', latitude: 35.7281, longitude: 51.3422, address: 'خیابان شریعتی', icon: 'briefcase-outline' }
    });
    expect(place.status).toBe(201);
    const trip = await createTrip(requesterCookie, {
      stops: [{ label: 'محل کار', latitude: 35.7281, longitude: 51.3422, placeId: place.json.data.place?.id ?? place.json.data.id }]
    });
    expect(trip.stops[0].placeId).toBeTruthy();
  });
});

describe('trip mutation and lifecycle', () => {
  it('lets the leader rename and rewrite stops with fresh ranks', async () => {
    const trip = await createTrip(requesterCookie);
    const updated = await apiFetch(server, `/_user/trips/${trip.id}`, {
      method: 'PATCH', cookie: requesterCookie,
      body: { name: 'مسیر ویرایش‌شده', stops: [STOPS[2], STOPS[0]] }
    });
    expect(updated.status, updated.text).toBe(200);
    expect(updated.json.data.name).toBe('مسیر ویرایش‌شده');
    expect(updated.json.data.stops.map((stop: any) => stop.rank)).toEqual([1, 2]);
    expect(updated.json.data.stops.map((stop: any) => stop.label)).toEqual(['خانه', 'میدان انقلاب']);
  });

  it('walks planned -> active -> completed and refuses edits and jumps elsewhere', async () => {
    const trip = await createTrip(requesterCookie);
    const completeTooEarly = await apiFetch(server, `/_user/trips/${trip.id}/complete`, { method: 'POST', cookie: requesterCookie });
    expect(completeTooEarly.status).toBe(409);

    const started = await apiFetch(server, `/_user/trips/${trip.id}/start`, { method: 'POST', cookie: requesterCookie });
    expect(started.status, started.text).toBe(200);
    expect(started.json.data.status).toBe('active');
    expect(started.json.data.startedAt).not.toBeNull();

    const startAgain = await apiFetch(server, `/_user/trips/${trip.id}/start`, { method: 'POST', cookie: requesterCookie });
    expect(startAgain.status).toBe(409);

    const cancelled = await apiFetch(server, `/_user/trips/${trip.id}/cancel`, { method: 'POST', cookie: requesterCookie });
    expect(cancelled.status).toBe(200);
    expect(cancelled.json.data.status).toBe('cancelled');

    const edited = await apiFetch(server, `/_user/trips/${trip.id}`, {
      method: 'PATCH', cookie: requesterCookie, body: { name: 'نباید' }
    });
    expect(edited.status).toBe(409);

    const completed = await apiFetch(server, `/_user/trips/${trip.id}/complete`, { method: 'POST', cookie: requesterCookie });
    expect(completed.status).toBe(409);
  });

  it('completes an active trip and records the close time', async () => {
    const trip = await createTrip(requesterCookie);
    await apiFetch(server, `/_user/trips/${trip.id}/start`, { method: 'POST', cookie: requesterCookie });
    const completed = await apiFetch(server, `/_user/trips/${trip.id}/complete`, { method: 'POST', cookie: requesterCookie });
    expect(completed.status).toBe(200);
    expect(completed.json.data.status).toBe('completed');
    expect(completed.json.data.completedAt).not.toBeNull();
  });
});

describe('group trips: invitation and explicit acceptance', () => {
  it('invites, listed for the invitee only while pending, and accept creates membership', async () => {
    const trip = await createTrip(requesterCookie);
    const invited = await apiFetch(server, `/_user/trips/${trip.id}/invitations`, {
      method: 'POST', cookie: requesterCookie, body: { inviteeId: 'usr_companion' }
    });
    expect(invited.status, invited.text).toBe(200);
    expect(invited.json.data.invitations).toHaveLength(1);
    expect(invited.json.data.invitations[0]).toMatchObject({ inviteeId: 'usr_companion', status: 'pending' });

    const inbox = await apiFetch(server, '/_user/trips/invitations', { cookie: companionCookie });
    const mine = (inbox.json.data.items as Array<any>).find((item) => item.tripId === trip.id);
    expect(mine).toMatchObject({ tripName: 'مسیر روزانه', inviterUsername: 'saeed.k' });

    // A pending invitee is not a member yet.
    const detailBefore = await apiFetch(server, `/_user/trips/${trip.id}`, { cookie: companionCookie });
    expect(detailBefore.status).toBe(404);

    const accepted = await apiFetch(server, `/_user/trips/invitations/${mine.id}/accept`, { method: 'POST', cookie: companionCookie });
    expect(accepted.status, accepted.text).toBe(200);

    const detailAfter = await apiFetch(server, `/_user/trips/${trip.id}`, { cookie: companionCookie });
    expect(detailAfter.status).toBe(200);
    expect(detailAfter.json.data.role).toBe('member');
    expect(detailAfter.json.data.memberCount).toBe(2);
    // Members never see the invitation list.
    expect(detailAfter.json.data.invitations).toBeUndefined();

    const leaderInbox = await apiFetch(server, '/_user/trips/invitations', { cookie: requesterCookie });
    expect((leaderInbox.json.data.items as Array<any>).length).toBe(0);
  });

  it('lets the invitee decline and the leader re-invite', async () => {
    const trip = await createTrip(requesterCookie);
    await apiFetch(server, `/_user/trips/${trip.id}/invitations`, {
      method: 'POST', cookie: requesterCookie, body: { inviteeId: 'usr_companion' }
    });
    const inbox = await apiFetch(server, '/_user/trips/invitations', { cookie: companionCookie });
    const mine = (inbox.json.data.items as Array<any>).find((item) => item.tripId === trip.id);

    const declined = await apiFetch(server, `/_user/trips/invitations/${mine.id}/decline`, { method: 'POST', cookie: companionCookie });
    expect(declined.status).toBe(200);

    const reinvited = await apiFetch(server, `/_user/trips/${trip.id}/invitations`, {
      method: 'POST', cookie: requesterCookie, body: { inviteeId: 'usr_companion' }
    });
    expect(reinvited.status, reinvited.text).toBe(200);
    expect(reinvited.json.data.invitations[0].status).toBe('pending');
  });

  it('keeps invitations idempotent and lets the leader cancel a pending one', async () => {
    const trip = await createTrip(requesterCookie);
    const first = await apiFetch(server, `/_user/trips/${trip.id}/invitations`, {
      method: 'POST', cookie: requesterCookie, body: { inviteeId: 'usr_companion' }
    });
    expect(first.status).toBe(200);
    const dupe = await apiFetch(server, `/_user/trips/${trip.id}/invitations`, {
      method: 'POST', cookie: requesterCookie, body: { inviteeId: 'usr_companion' }
    });
    expect(dupe.status).toBe(409);

    const inbox = await apiFetch(server, '/_user/trips/invitations', { cookie: companionCookie });
    const mine = (inbox.json.data.items as Array<any>).find((item) => item.tripId === trip.id);
    const cancelled = await apiFetch(server, `/_user/trips/invitations/${mine.id}`, { method: 'DELETE', cookie: requesterCookie });
    expect(cancelled.status).toBe(200);

    const inboxAfter = await apiFetch(server, '/_user/trips/invitations', { cookie: companionCookie });
    expect((inboxAfter.json.data.items as Array<any>).some((item) => item.tripId === trip.id)).toBe(false);
  });

  it('stops a member from acting as leader but lets them leave', async () => {
    const trip = await createTrip(requesterCookie);
    await apiFetch(server, `/_user/trips/${trip.id}/invitations`, {
      method: 'POST', cookie: requesterCookie, body: { inviteeId: 'usr_companion' }
    });
    const inbox = await apiFetch(server, '/_user/trips/invitations', { cookie: companionCookie });
    const mine = (inbox.json.data.items as Array<any>).find((item) => item.tripId === trip.id);
    await apiFetch(server, `/_user/trips/invitations/${mine.id}/accept`, { method: 'POST', cookie: companionCookie });

    const rename = await apiFetch(server, `/_user/trips/${trip.id}`, {
      method: 'PATCH', cookie: companionCookie, body: { name: 'نفوذ عضو' }
    });
    expect(rename.status).toBe(403);

    const start = await apiFetch(server, `/_user/trips/${trip.id}/start`, { method: 'POST', cookie: companionCookie });
    expect(start.status).toBe(403);

    const invite = await apiFetch(server, `/_user/trips/${trip.id}/invitations`, {
      method: 'POST', cookie: companionCookie, body: { inviteeId: 'usr_responder' }
    });
    expect(invite.status).toBe(403);

    const leaderLeave = await apiFetch(server, `/_user/trips/${trip.id}/leave`, { method: 'POST', cookie: requesterCookie });
    expect(leaderLeave.status).toBe(409);

    const leave = await apiFetch(server, `/_user/trips/${trip.id}/leave`, { method: 'POST', cookie: companionCookie });
    expect(leave.status).toBe(200);
    const detailAfter = await apiFetch(server, `/_user/trips/${trip.id}`, { cookie: companionCookie });
    expect(detailAfter.status).toBe(404);

    // A former member can be invited again.
    const reinvited = await apiFetch(server, `/_user/trips/${trip.id}/invitations`, {
      method: 'POST', cookie: requesterCookie, body: { inviteeId: 'usr_companion' }
    });
    expect(reinvited.status).toBe(200);
  });

  it('never leaks trip existence to non-members', async () => {
    const trip = await createTrip(requesterCookie);
    const detail = await apiFetch(server, `/_user/trips/${trip.id}`, { cookie: responderCookie });
    expect(detail.status).toBe(404);
    const start = await apiFetch(server, `/_user/trips/${trip.id}/start`, { method: 'POST', cookie: responderCookie });
    expect(start.status).toBe(404);
    const save = await apiFetch(server, `/_user/trips/${trip.id}/save`, {
      method: 'POST', cookie: responderCookie, body: { saved: true }
    });
    expect(save.status).toBe(404);
  });
});
