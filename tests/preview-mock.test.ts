// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installDemoFetch, resetPreviewState, setPreviewPersona, setPreviewSession } from '../src/client/preview/demo-fetch.ts';

/**
 * Contract test for the deterministic preview mock: every registered handler is exercised at
 * least once (and answers without a 5xx or an unmocked 404), the persona/session knobs behave
 * like a tiny stateful server, and an unknown endpoint fails loudly with PREVIEW_UNMOCKED.
 */

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : String(input);
    return new Response(`unexpected external fetch: ${url}`, { status: 598 });
  }));
  installDemoFetch();
  resetPreviewState();
});

const call = (method: string, path: string, body?: unknown): Promise<Response> =>
  fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });

const ok200 = async (method: string, path: string, body?: unknown, expectStatus = 200) => {
  const response = await call(method, path, body);
  expect(response.status, `${method} ${path}`).toBe(expectStatus);
  return response.json();
};

describe('preview demo mock — every handler answers deterministically', () => {
  it('auth and recovery flows', async () => {
    await ok200('POST', '/_auth/login', { username: 'saeed.k', password: 'whatever' });
    await ok200('POST', '/_auth/register', { username: 'new.user', password: 'x', securityQuestions: [] });
    await ok200('POST', '/_user/security-questions', { securityQuestions: [{ questionId: 'sq_pet', answer: 'a' }] });
    await ok200('POST', '/_auth/onboarding', {});
    const started = await ok200('POST', '/_auth/recovery/start', { username: 'leila.n' });
    expect(started.data.recoveryId).toBe('rec_preview');
    expect(Array.isArray(started.data.questions)).toBe(true);
    await ok200('POST', '/_auth/recovery/answers', { recoveryId: 'rec_preview', answers: [] });
    await ok200('POST', '/_auth/recovery/reset', { recoveryId: 'rec_preview', password: 'y' });
    await ok200('POST', '/_auth/logout');
  });

  it('session state flips on logout and me becomes 401, login restores it', async () => {
    expect((await call('GET', '/_user/me')).status).toBe(200);
    await ok200('POST', '/_auth/logout');
    expect((await call('GET', '/_user/me')).status).toBe(401);
    setPreviewSession(true);
    expect((await call('GET', '/_user/me')).status).toBe(200);
  });

  it('onboarding persona completes questions and is then cleared', async () => {
    setPreviewPersona('onboarding');
    const before = await (await call('GET', '/_user/me')).json();
    expect(before.data.mustCompleteSecurityQuestions).toBe(true);
    await ok200('POST', '/_user/security-questions', { securityQuestions: [] });
    const after = await (await call('GET', '/_user/me')).json();
    expect(after.data.mustCompleteSecurityQuestions).toBe(false);
  });

  it('admin persona resolves the admin account; catalogs are stable', async () => {
    setPreviewPersona('admin');
    const me = await (await call('GET', '/_user/me')).json();
    expect(me.data.role).toBe('admin');
    for (const path of ['/_public/incident-types', '/_public/cancellation-reasons', '/_public/security-questions']) {
      const payload = await (await call('GET', path)).json();
      expect(Array.isArray(payload.data.items)).toBe(true);
      expect(payload.data.items.length).toBeGreaterThan(0);
    }
    await ok200('GET', '/_public/map/config');
  });

  it('user endpoints: me, devices, logins, places, search, shares', async () => {
    await ok200('GET', '/_user/me');
    await ok200('PATCH', '/_user/me', { username: 'saeed.k' });
    await ok200('POST', '/_user/ready', { ready: true });
    const devices = await ok200('GET', '/_user/devices');
    expect(devices.data.items.length).toBeGreaterThan(0);
    await ok200('DELETE', '/_user/devices/sess_phone');
    const logins = await ok200('GET', '/_user/logins');
    expect(logins.data.items.length).toBeGreaterThan(0);

    const places = await ok200('GET', '/_user/places');
    expect(places.data.items.map((p: { id: string }) => p.id)).toContain('plc_home');
    await ok200('POST', '/_user/places', { name: 'دفتر', latitude: 35.7, longitude: 51.3 });
    await ok200('PATCH', '/_user/places/plc_home', { name: 'خانه' });
    await ok200('DELETE', '/_user/places/plc_home');

    const search = await ok200('GET', '/_user/users/search?q=reza&limit=5');
    expect(search.data.items.every((u: { username: string }) => u.username.includes('reza'))).toBe(true);

    const shares = await ok200('GET', '/_user/location/shares?include=all');
    expect(shares.data.items.length).toBeGreaterThanOrEqual(4);
    const active = await ok200('GET', '/_user/location/shares');
    expect(active.data.items.every((s: { state: string }) => s.state === 'active')).toBe(true);
    await ok200('POST', '/_user/location/shares', { recipientId: 'usr_reza', kind: 'live' });
    await ok200('DELETE', '/_user/location/shares/shr_live_out');
  });

  it('user endpoints: sos, missions, offers, teams, support requests, trips', async () => {
    const sosList = await ok200('GET', '/_user/sos');
    expect(sosList.data.items.length).toBeGreaterThan(0);
    for (const id of ['sos_active_req', 'sos_single', 'sos_hist_req', 'sos_hist_cancelled', 'sos_team']) {
      await ok200('GET', `/_user/sos/${id}`);
    }
    expect((await call('GET', '/_user/sos/sos_nope')).status).toBe(404);
    await ok200('POST', '/_user/sos', { incidentTypeId: 'inc_fire', severity: 'medium', description: 'test', latitude: 35.7, longitude: 51.3 });
    await ok200('POST', '/_user/sos/sos_active_req/cancel', { reasonId: 'cr_mistake' });
    await ok200('POST', '/_user/sos/sos_offer/accept', {});
    await ok200('POST', '/_user/sos/sos_offer/decline', {});

    const missions = await ok200('GET', '/_user/missions');
    expect(missions.data.items.length).toBeGreaterThan(0);
    await ok200('GET', '/_user/mission-offers');
    await ok200('POST', '/_user/missions/mis_single/progress', { action: 'arrive' });
    await ok200('POST', '/_user/missions/mis_hist/rating', { rating: 5 });

    await ok200('GET', '/_user/missions/mis_team/team');
    await ok200('GET', '/_user/missions/mis_single/team');
    const teamRequests = await ok200('GET', '/_user/missions/mis_team/support-requests');
    expect(teamRequests.data.items).toHaveLength(1);
    await ok200('GET', '/_user/missions/mis_single/support-requests');
    await ok200('POST', '/_user/missions/mis_team/support-requests', { items: [{ jobTypeId: 'jt_med', quantity: 1 }], reason: 'نیاز فوری' });
    await ok200('POST', '/_user/missions/mis_team/support-requests/spr_pending/cancel', {});

    const trips = await ok200('GET', '/_user/trips');
    expect(trips.data.items.length).toBeGreaterThanOrEqual(4);
    const saved = await ok200('GET', '/_user/trips?saved=true');
    expect(saved.data.items.every((t: { saved: boolean }) => t.saved)).toBe(true);
    await ok200('POST', '/_user/trips', { name: 'سفر آزمایشی', stops: [{ label: 'خانه', latitude: 35.7, longitude: 51.3 }] });
    const invitations = await ok200('GET', '/_user/trips/invitations');
    expect(invitations.data.items).toHaveLength(1);
    await ok200('POST', '/_user/trips/invitations/inv_1/accept', {});
    await ok200('POST', '/_user/trips/invitations/inv_1/decline', {});
    await ok200('DELETE', '/_user/trips/invitations/inv_1');
    await ok200('GET', '/_user/trips/trp_target');
    expect((await call('GET', '/_user/trips/trp_nope')).status).toBe(404);
    await ok200('PATCH', '/_user/trips/trp_round', { name: 'گشت ویرایش‌شده' });
    await ok200('POST', '/_user/trips/trp_round/start', {});
    await ok200('POST', '/_user/trips/trp_round/complete', {});
    await ok200('POST', '/_user/trips/trp_round/cancel', {});
    await ok200('POST', '/_user/trips/trp_round/save', { saved: true });
    await ok200('POST', '/_user/trips/trp_round/invitations', { inviteeId: 'usr_reza' });
    await ok200('POST', '/_user/trips/trp_round/leave', {});

    await ok200('POST', '/_user/realtime/ticket');
  });

  it('admin endpoints: read surfaces and mutations', async () => {
    setPreviewPersona('admin');
    await ok200('GET', '/_admin/overview');
    const dispatch = await ok200('GET', '/_admin/dispatch');
    expect(dispatch.data.queue.items.length).toBeGreaterThan(0);
    expect(dispatch.data.groups.items.length).toBeGreaterThan(0);
    expect(dispatch.data.incidentTypes.items.length).toBeGreaterThan(0);

    const users = await ok200('GET', '/_admin/users?q=&role=&page=1&limit=20');
    expect(users.data.items.length).toBeGreaterThan(0);
    const filtered = await ok200('GET', '/_admin/users?q=leila&role=responder&active=true');
    expect(filtered.data.items.every((u: { username: string }) => u.username.includes('leila'))).toBe(true);
    await ok200('POST', '/_admin/users', { username: 'new.responder', password: 'x', role: 'responder' });
    await ok200('PATCH', '/_admin/users/usr_nima', { active: false });

    const groups = await ok200('GET', '/_admin/groups');
    expect(groups.data.items.length).toBeGreaterThan(0);
    await ok200('POST', '/_admin/groups', { name: 'گروه آزمایشی', color: '#0E6666', capacity: 6, incidentIds: ['inc_fire'] });
    await ok200('PATCH', '/_admin/groups/grp_north', { name: 'تیم شعله شمال', color: '#0E6666', capacity: 8, incidentIds: ['inc_fire'] });

    await ok200('GET', '/_admin/incident-types');
    const jobTypes = await ok200('GET', '/_admin/job-types');
    expect(jobTypes.data.items.length).toBeGreaterThan(0);
    await ok200('POST', '/_admin/job-types', { label: 'نوع آزمایشی', offerPolicy: 'all' });
    await ok200('PATCH', '/_admin/job-types/jt_med', { active: false });

    const offers = await ok200('GET', '/_admin/mission-offers?status=pending');
    expect(offers.data.items.every((o: { status: string }) => o.status === 'pending')).toBe(true);

    const openAlerts = await ok200('GET', '/_admin/alerts');
    expect(openAlerts.data.items.every((a: { resolvedAt: number | null }) => !a.resolvedAt)).toBe(true);
    const allAlerts = await ok200('GET', '/_admin/alerts?includeResolved=true');
    expect(allAlerts.data.items.length).toBeGreaterThan(openAlerts.data.items.length);
    await ok200('POST', '/_admin/alerts/alt_1/resolve');

    const audit = await ok200('GET', '/_admin/audit?q=admin&limit=10');
    expect(Array.isArray(audit.data.items)).toBe(true);

    const settings = await ok200('GET', '/_admin/settings');
    expect(settings.data.items.length).toBeGreaterThan(0);
    await ok200('PUT', '/_admin/settings', { dispatch_radius_m: '2500' });
    await ok200('GET', '/_admin/system/health');

    const pending = await ok200('GET', '/_admin/support-requests?status=pending&limit=1');
    expect(pending.data.total).toBe(2);
    expect(pending.data.items).toHaveLength(1);
    await ok200('GET', '/_admin/support-requests/spr_admin_1');
    await ok200('GET', '/_admin/support-requests/spr_admin_2');
    const candidates = await ok200('GET', '/_admin/support-requests/spr_admin_1/candidates');
    expect(candidates.data.eligibleTotal).toBe(1);
    await ok200('POST', '/_admin/support-requests/spr_admin_1/review', { decision: 'approved' });

    await ok200('GET', '/_admin/missions/mis_team/team');
    await ok200('POST', '/_admin/missions/mis_team/members', { userIds: ['usr_samira'] });
    await ok200('DELETE', '/_admin/missions/mis_team/members/usr_reza', { reason: 'جابه‌جایی' });
    await ok200('POST', '/_admin/missions/mis_team/leader', { userId: 'usr_maryam' });
    await ok200('PUT', '/_admin/missions/mis_team/requirements', { requirements: [{ jobTypeId: 'jt_med', quantity: 2 }] });
    const nearest = await ok200('GET', '/_admin/sos/sos_a1/nearest?limit=5');
    expect(nearest.data.items.length).toBeGreaterThan(0);
    await ok200('POST', '/_admin/sos/sos_a1/dispatch', { groupId: 'grp_central', responderIds: ['usr_reza'], mode: 'offer' });
    const teamDispatch = await ok200('POST', '/_admin/sos/sos_a3/team-dispatch', { groupId: 'grp_central', leaderId: 'usr_maryam', requirements: [{ jobTypeId: 'jt_med', quantity: 1 }] });
    expect(teamDispatch.data.missionId).toBe('mis_team');
  });

  it('an unknown endpoint fails loudly instead of faking success', async () => {
    const response = await call('GET', '/_user/definitely-not-here');
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error.code).toBe('PREVIEW_UNMOCKED');
  });
});
