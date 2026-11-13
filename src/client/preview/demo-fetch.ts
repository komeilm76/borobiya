/**
 * Deterministic fetch mock backing the visual preview server.
 *
 * Installed only in the preview bundle (`VITE_PREVIEW_DEMO=true`) and always before the
 * Vue app is created. Every handler reads from the fictional world in `demo-data*.ts`;
 * anything unmatched returns an explicit 404 envelope with code `PREVIEW_UNMOCKED` so a
 * missing fixture surfaces as a visible error instead of silent fake success.
 *
 * Two knobs:
 * - persona (`user` | `admin`), chosen by the catalog links via `?persona=admin`;
 * - a session flag so `POST /_auth/logout` honestly signs the demo session out.
 */

import * as D from './demo-data.ts';
import * as A from './demo-data-admin.ts';

export type PreviewPersona = 'user' | 'admin';

export type PreviewPersonaFull = 'user' | 'admin' | 'onboarding';

const state = {
  persona: 'user' as PreviewPersonaFull,
  sessionActive: true,
  onboarded: false
};

/** Selects which demo account `/_user/me` resolves to. */
export function setPreviewPersona(persona: PreviewPersonaFull): void {
  state.persona = persona;
}

/** Signs the demo session out (used by `?anon=1` so guest pages are reachable). */
export function setPreviewSession(active: boolean): void {
  state.sessionActive = active;
}

/** Restores the pristine demo state; used by the smoke test between pages. */
export function resetPreviewState(): void {
  state.persona = 'user';
  state.sessionActive = true;
  state.onboarded = false;
}

const envelope = (data: unknown, init?: ResponseInit): Response =>
  new Response(JSON.stringify({ ok: true, requestId: 'preview-request', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    ...init
  });

const failure = (status: number, code: string, message: string): Response =>
  new Response(JSON.stringify({ ok: false, error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });

function currentUser(): Record<string, unknown> {
  if (state.persona === 'admin') return D.demoAdmin;
  if (state.persona === 'onboarding') {
    const leila = D.users.find((u) => u.id === 'usr_leila') as unknown as Record<string, unknown>;
    return state.onboarded ? { ...leila, mustCompleteSecurityQuestions: false, securityReady: true } : leila;
  }
  return D.demoUser;
}

/* ------------------------------------------------------------------- */

type Handler = (params: { args: string[]; query: URLSearchParams; body: Record<string, unknown> }) => Response;

const items = (list: unknown[], extra: Record<string, unknown> = {}): Response =>
  envelope({ items: list, total: list.length, ...extra });

const csvList = <T extends { username?: string }>(list: T[]): T[] => list;

const routes: Array<[method: string, pattern: RegExp, handler: Handler]> = [
  /* ------------------------------------------------------ auth */
  ['POST', /^\/_auth\/login$/, ({ body }) => {
    state.sessionActive = true;
    const username = String(body.username ?? '').trim().toLowerCase();
    if (username === 'admin') state.persona = 'admin';
    else if (username === 'leila.n') state.persona = 'onboarding';
    else state.persona = 'user';
    return envelope({ ok: true });
  }],
  ['POST', /^\/_auth\/logout$/, () => {
    state.sessionActive = false;
    return envelope({});
  }],
  ['POST', /^\/_auth\/register$/, () => envelope({ ok: true })],
  ['POST', /^\/_user\/security-questions$/, () => {
    state.onboarded = true;
    return envelope({ ok: true });
  }],
  ['POST', /^\/_auth\/onboarding$/, () => envelope({ ok: true })],
  ['POST', /^\/_auth\/recovery\/start$/, () =>
    envelope({ recoveryId: 'rec_preview', questions: D.securityQuestions.slice(0, 3), expiresAt: Date.now() + 15 * 60_000 })],
  ['POST', /^\/_auth\/recovery\/answers$/, () => envelope({ ok: true })],
  ['POST', /^\/_auth\/recovery\/reset$/, () => envelope({ ok: true })],

  /* ------------------------------------------------- public data */
  ['GET', /^\/_public\/incident-types$/, () => items([...D.incidentTypes])],
  ['GET', /^\/_public\/cancellation-reasons$/, () => items([...D.cancellationReasons])],
  ['GET', /^\/_public\/security-questions$/, () => items([...D.securityQuestions])],
  ['GET', /^\/_public\/map\/config$/, () => envelope(D.mapConfig)],

  /* ------------------------------------------------------ user: me */
  ['GET', /^\/_user\/me$/, () => (state.sessionActive ? envelope(currentUser()) : failure(401, 'UNAUTHORIZED', 'نشستی یافت نشد.'))],
  ['PATCH', /^\/_user\/me$/, ({ body }) => envelope({ ...currentUser(), ...(body.username ? { username: String(body.username) } : {}), ...(body.recordTrack !== undefined ? { recordTrack: Boolean(body.recordTrack) } : {}) })],
  ['POST', /^\/_user\/ready$/, ({ body }) => {
    D.demoUser.readyForMission = Boolean(body.ready);
    return envelope({});
  }],
  ['GET', /^\/_user\/devices$/, () =>
    items([
      { sessionId: 'sess_current', deviceId: 'web-client', deviceName: 'مرورگر این دستگاه', ip: '10.0.0.55', createdAt: D.T0 - 40 * 86_400_000, lastActiveAt: D.T0 - 60_000, expiresAt: D.T0 + 25 * 86_400_000, isCurrentDevice: true, isOnline: true },
      { sessionId: 'sess_phone', deviceId: 'pwa-android', deviceName: 'گوشی اندروید', ip: '10.0.0.71', createdAt: D.T0 - 90 * 86_400_000, lastActiveAt: D.T0 - 3 * 3_600_000, expiresAt: D.T0 + 12 * 86_400_000, isCurrentDevice: false, isOnline: false }
    ])],
  ['DELETE', /^\/_user\/devices\/[^/]+$/, () => envelope({})],
  ['GET', /^\/_user\/logins$/, () =>
    items([
      { id: 31, ip: '10.0.0.55', deviceName: 'مرورگر این دستگاه', success: true, loginAt: D.T0 - 20 * 60_000 },
      { id: 30, ip: '10.0.0.55', deviceName: 'مرورگر این دستگاه', success: true, loginAt: D.T0 - 2 * 86_400_000 },
      { id: 29, ip: '10.0.0.71', deviceName: 'گوشی اندروید', success: true, loginAt: D.T0 - 3 * 86_400_000 },
      { id: 28, ip: '185.12.44.7', deviceName: null, success: false, loginAt: D.T0 - 4 * 86_400_000 },
      { id: 27, ip: '10.0.0.55', deviceName: 'مرورگر این دستگاه', success: true, loginAt: D.T0 - 6 * 86_400_000 }
    ])],

  /* --------------------------------------------------- user: places */
  ['GET', /^\/_user\/places$/, () => items([...D.savedPlaces])],
  ['POST', /^\/_user\/places$/, ({ body }) =>
    envelope({ id: `plc_demo_${Date.now()}`, rank: 99, icon: 'map-marker', ...body })],
  ['PATCH', /^\/_user\/places\/([^/]+)$/, ({ args, body }) =>
    envelope({ id: args[0], name: 'مکان', label: 'مکان', address: '', icon: 'map-marker', rank: 1, latitude: D.LAT, longitude: D.LNG, ...body })],
  ['DELETE', /^\/_user\/places\/[^/]+$/, () => envelope({})],

  /* ------------------------------------- user: people search + shares */
  ['GET', /^\/_user\/users\/search$/, ({ query }) => {
    const q = (query.get('q') ?? '').trim().toLowerCase();
    const pool = D.users
      .filter((u) => u.id !== D.DEMO_USER_ID)
      .map((u) => ({ id: u.id, username: u.username, role: u.role, readyForMission: u.readyForMission, averageRating: u.averageRating, online: u.id === 'usr_reza' || u.id === 'usr_maryam' }));
    const matched = q ? pool.filter((u) => u.username.includes(q)) : pool;
    const limit = Number(query.get('limit') ?? 10);
    return items(matched.slice(0, limit));
  }],
  ['GET', /^\/_user\/location\/shares$/, ({ query }) => {
    const includeAll = query.get('include') === 'all';
    const list = D.demoShares.filter((s) => includeAll || s.state === 'active');
    return items(list);
  }],
  ['POST', /^\/_user\/location\/shares$/, ({ body }) =>
    envelope({
      id: `shr_demo_${Date.now()}`,
      ownerId: D.DEMO_USER_ID,
      recipientId: body.recipientId ?? 'unknown',
      recipientUsername: body.recipientId === 'usr_reza' ? 'reza.m' : 'کاربر',
      kind: body.kind ?? 'live',
      expiresAt: body.expiresAt ?? Date.now() + 3_600_000,
      historyFrom: body.historyFrom ?? null,
      historyTo: body.historyTo ?? null,
      createdAt: Date.now(),
      state: 'active'
    })],
  ['DELETE', /^\/_user\/location\/shares\/[^/]+$/, () => envelope({})],

  /* -------------------------------------- user: SOS and missions feed */
  ['GET', /^\/_user\/sos$/, () => items([...D.userRequests])],
  ['GET', /^\/_user\/sos\/([^/]+)$/, ({ args }) => {
    const id = args[0];
    const all: Record<string, { sos: Record<string, unknown>; timeline: unknown }> = {
      sos_active_req: { sos: D.activeRequest, timeline: D.activeRequestTimeline },
      sos_single: { sos: D.singleSos, timeline: D.singleSosTimeline },
      sos_hist_req: { sos: D.requesterCompletedSos, timeline: D.requesterSosTimeline },
      sos_hist_cancelled: { sos: D.cancelledSos, timeline: [] },
      sos_team: { sos: { ...D.singleSos, id: 'sos_team', trackingCode: 918, incidentLabel: 'آتش‌سوزی', incidentTypeId: 'inc_fire', status: 'in_progress' }, timeline: [] }
    };
    const hit = all[id];
    return hit ? envelope({ ...hit.sos, timeline: hit.timeline }) : failure(404, 'NOT_FOUND', 'درخواستی با این شناسه وجود ندارد.');
  }],
  ['POST', /^\/_user\/sos$/, ({ body }) =>
    envelope({ sos: { id: `sos_demo_${Date.now()}`, trackingCode: 978, requesterId: D.DEMO_USER_ID, incidentLabel: 'درخواست جدید', incidentTypeId: String(body.incidentTypeId ?? 'inc_rescue'), severity: String(body.severity ?? 'medium'), description: String(body.description ?? ''), latitude: Number(body.latitude ?? D.LAT), longitude: Number(body.longitude ?? D.LNG), accuracy: Number(body.accuracy ?? 10), isManual: Boolean(body.isManual), status: 'pending', createdAt: Date.now(), updatedAt: Date.now() } })],
  ['POST', /^\/_user\/sos\/[^/]+\/cancel$/, () => envelope({ ok: true })],
  ['POST', /^\/_user\/sos\/[^/]+\/accept$/, () => envelope({ missionId: 'mis_single', missionStatus: 'accepted' })],
  ['POST', /^\/_user\/sos\/[^/]+\/decline$/, () => envelope({ ok: true })],

  ['GET', /^\/_user\/missions$/, () => items([...D.userMissions])],
  ['GET', /^\/_user\/mission-offers$/, () => items([D.pendingOfferSos])],
  ['POST', /^\/_user\/missions\/[^/]+\/progress$/, () => envelope({ ok: true })],
  ['POST', /^\/_user\/missions\/[^/]+\/rating$/, () => envelope({ ok: true })],

  /* ----------------------------------- user: teams / support requests */
  ['GET', /^\/_user\/missions\/([^/]+)\/team$/, ({ args }) => {
    const id = args[0];
    if (id === 'mis_team') return envelope(D.teamMission);
    return envelope({
      missionId: id, sosId: 'sos_single', status: 'on_the_way', incidentLabel: 'پزشکی', severity: 'medium',
      createdAt: D.T0 - 31 * 60_000, viewerRole: 'leader',
      leader: D.teamMission.members[0],
      members: [D.teamMission.members[0]],
      memberCount: 1, requirements: [], pendingSupportRequestCount: 0
    });
  }],
  ['GET', /^\/_user\/missions\/([^/]+)\/support-requests$/, ({ args }) =>
    items(args[0] === 'mis_team' ? [...D.supportRequestsForTeam] : [])],
  ['POST', /^\/_user\/missions\/[^/]+\/support-requests$/, ({ body }) =>
    envelope({ id: `spr_demo_${Date.now()}`, missionId: 'mis_team', requestedBy: D.DEMO_USER_ID, requestedByUsername: D.DEMO_USERNAME, reason: String(body.reason ?? ''), note: body.note ?? null, status: 'pending', items: Array.isArray(body.items) ? body.items : [], createdAt: Date.now(), updatedAt: Date.now(), cancelledAt: null })],
  ['POST', /^\/_user\/missions\/[^/]+\/support-requests\/[^/]+\/cancel$/, () => envelope({ ok: true })],

  /* ------------------------------------------------------ user: trips */
  ['GET', /^\/_user\/trips$/, ({ query }) => {
    const savedOnly = query.get('saved') === 'true';
    return items(D.demoTrips.filter((t) => !savedOnly || t.saved).map(({ ...t }) => t));
  }],
  ['POST', /^\/_user\/trips$/, ({ body }) =>
    envelope({ id: `trp_demo_${Date.now()}`, name: String(body.name ?? 'سفر جدید'), status: 'planned', saved: false, role: 'leader', ownerId: D.DEMO_USER_ID, ownerUsername: D.DEMO_USERNAME, stopCount: Array.isArray(body.stops) ? body.stops.length : 0, memberCount: 1, createdAt: Date.now(), updatedAt: Date.now(), startedAt: null, completedAt: null, stops: (Array.isArray(body.stops) ? body.stops : []).map((s, i) => ({ id: `stp_demo_${i}`, rank: i + 1, label: String((s as { label?: string }).label ?? `توقف ${i + 1}`), latitude: Number((s as { latitude?: number }).latitude ?? D.LAT), longitude: Number((s as { longitude?: number }).longitude ?? D.LNG), placeId: (s as { placeId?: string | null }).placeId ?? null })) })],
  ['GET', /^\/_user\/trips\/invitations$/, () => items([...D.demoTripInvitations])],
  ['POST', /^\/_user\/trips\/invitations\/[^/]+\/(accept|decline)$/, () => envelope({ ok: true })],
  ['DELETE', /^\/_user\/trips\/invitations\/[^/]+$/, () => envelope({ ok: true })],
  ['GET', /^\/_user\/trips\/([^/]+)$/, ({ args }) =>
    args[0] === 'trp_target' ? envelope(D.demoTripDetail) : failure(404, 'NOT_FOUND', 'سفری با این شناسه وجود ندارد.')],
  ['PATCH', /^\/_user\/trips\/[^/]+$/, ({ args, body }) => envelope({ ...D.demoTripDetail, ...(body.name ? { name: String(body.name) } : {}), id: args[0] })],
  ['POST', /^\/_user\/trips\/[^/]+\/start$/, () => envelope({ ...D.demoTripDetail, status: 'active', startedAt: Date.now() })],
  ['POST', /^\/_user\/trips\/[^/]+\/complete$/, () => envelope({ ...D.demoTripDetail, status: 'completed', completedAt: Date.now() })],
  ['POST', /^\/_user\/trips\/[^/]+\/cancel$/, () => envelope({ ...D.demoTripDetail, status: 'cancelled' })],
  ['POST', /^\/_user\/trips\/[^/]+\/save$/, ({ body }) => envelope({ ...D.demoTripDetail, saved: Boolean(body.saved) })],
  ['POST', /^\/_user\/trips\/[^/]+\/invitations$/, () => envelope(D.demoTripDetail)],
  ['POST', /^\/_user\/trips\/[^/]+\/leave$/, () => envelope({ ok: true })],

  /* ----------------------------------- user: track recording (Stage D) */
  ['POST', /^\/_user\/trips\/[^/]+\/track-consent$/, () => envelope({ ok: true })],
  ['POST', /^\/_user\/missions\/[^/]+\/track-consent$/, () => envelope({ ok: true })],
  ['GET', /^\/_user\/trips\/([^/]+)\/track$/, ({ args }) =>
    args[0] === 'trp_target' ? envelope(D.demoTripTrack) : failure(404, 'NOT_FOUND', 'سفری با این شناسه وجود ندارد.')],
  ['GET', /^\/_user\/missions\/([^/]+)\/track$/, ({ args }) =>
    args[0] === 'mis_hist' ? envelope(D.demoMissionTrack) : failure(404, 'NOT_FOUND', 'مأموریتی با این شناسه وجود ندارد.')],
  ['GET', /^\/_admin\/tracks\/(trip|mission)\/([^/]+)$/, ({ args }) => {
    if (args[0] === 'trip' && args[1] === 'trp_target') return envelope(D.demoTripTrack);
    if (args[0] === 'mission' && args[1] === 'mis_hist') return envelope(D.demoMissionTrack);
    return failure(404, 'NOT_FOUND', 'مسیری ثبت نشده است.');
  }],

  /* ----------------------------------------------- user: realtime */
  ['POST', /^\/_user\/realtime\/ticket$/, () =>
    envelope({ ticket: 'preview-ticket', expiresAt: Date.now() + 60_000, path: '/ws', heartbeatMs: 25_000, protocol: 1 })],

  /* ----------------------------------------------------- admin: read */
  ['GET', /^\/_admin\/overview$/, () => envelope(A.adminOverview)],
  ['GET', /^\/_admin\/reports$/, ({ query }) =>
    envelope(A.adminReportsFor(Number(query.get('days') ?? '30')))],
  ['GET', /^\/_admin\/groups\/([^/]+)\/members$/, ({ args }) =>
    items((A.adminGroupMembers[args[0]] ?? []).map((member) => ({ ...member })))],
  ['POST', /^\/_admin\/groups\/([^/]+)\/members$/, ({ args, body }) =>
    envelope({ ok: true, groupId: args[0], userId: String(body.userId ?? '') })],
  ['DELETE', /^\/_admin\/groups\/([^/]+)\/members\/([^/]+)$/, ({ args }) =>
    envelope({ ok: true, groupId: args[0], userId: args[1] })],
  ['GET', /^\/_admin\/dispatch$/, () =>
    envelope({
      queue: { items: [...A.dispatchQueue], total: A.dispatchQueue.length, page: 1, limit: 50 },
      groups: { items: [...A.adminGroups], total: A.adminGroups.length },
      incidentTypes: { items: [...D.incidentTypes], total: D.incidentTypes.length }
    })],
  ['GET', /^\/_admin\/users$/, ({ query }) => {
    const q = (query.get('q') ?? '').trim().toLowerCase();
    const role = query.get('role') ?? '';
    const active = query.get('active');
    const page = Math.max(1, Number(query.get('page') ?? 1));
    const limit = Math.max(1, Number(query.get('limit') ?? 20));
    let list = [...A.adminUsers];
    if (q) list = list.filter((u) => u.username.includes(q));
    if (role) list = list.filter((u) => u.role === role);
    if (active !== null && active !== '') list = list.filter((u) => u.active === (active === 'true'));
    const total = list.length;
    return envelope({ items: list.slice((page - 1) * limit, page * limit), total, page, limit });
  }],
  ['POST', /^\/_admin\/users$/, () => envelope({ ok: true })],
  ['PATCH', /^\/_admin\/users\/[^/]+$/, () => envelope({ ok: true })],
  ['GET', /^\/_admin\/groups$/, () => items(A.adminGroups.map((g) => ({ ...g })))],
  ['POST', /^\/_admin\/groups$/, () => envelope({ ok: true })],
  ['PATCH', /^\/_admin\/groups\/[^/]+$/, () => envelope({ ok: true })],
  ['GET', /^\/_admin\/incident-types$/, () => items([...A.adminIncidentTypes])],
  ['GET', /^\/_admin\/job-types$/, () => items(A.adminJobTypes.map((j) => ({ ...j })))],
  ['POST', /^\/_admin\/job-types$/, () => envelope({ ok: true })],
  ['PATCH', /^\/_admin\/job-types\/[^/]+$/, () => envelope({ ok: true })],
  ['GET', /^\/_admin\/mission-offers$/, ({ query }) => {
    const status = query.get('status');
    const all = A.adminOffers.filter((o) => !status || o.status === status);
    const limit = Number(query.get('limit') ?? 100);
    return items(all.slice(0, limit));
  }],
  ['GET', /^\/_admin\/alerts$/, ({ query }) => {
    const resolved = query.get('includeResolved') === 'true' || query.get('includeResolved') === '1';
    return items(A.adminAlerts.filter((a) => resolved || !a.resolvedAt));
  }],
  ['POST', /^\/_admin\/alerts\/[^/]+\/resolve$/, () => envelope({ ok: true })],
  ['GET', /^\/_admin\/audit$/, ({ query }) => {
    const q = (query.get('q') ?? '').trim().toLowerCase();
    const action = query.get('action');
    const limit = Number(query.get('limit') ?? 100);
    let list = [...A.adminAudit];
    if (q) list = list.filter((row) => `${row.action} ${row.actorUsername ?? ''} ${row.target}`.toLowerCase().includes(q));
    if (action) list = list.filter((row) => row.action === action);
    return envelope({ items: list.slice(0, limit), total: list.length, page: 1, limit });
  }],
  ['GET', /^\/_admin\/settings$/, () => items(A.adminSettings.map((s) => ({ ...s })))],
  ['PUT', /^\/_admin\/settings$/, () => envelope({ ok: true })],
  ['GET', /^\/_admin\/system\/health$/, () => envelope(A.systemHealth)],
  ['GET', /^\/_admin\/support-requests$/, ({ query }) => {
    const status = query.get('status');
    const missionId = query.get('missionId');
    const limit = Number(query.get('limit') ?? 100);
    let list = [...A.adminSupportRequests];
    if (status) list = list.filter((row) => row.status === status);
    if (missionId) list = list.filter((row) => row.missionId === missionId);
    const total = list.length;
    return envelope({ items: list.slice(0, limit), total, page: 1, limit });
  }],
  ['GET', /^\/_admin\/support-requests\/([^/]+)$/, ({ args }) =>
    args[0] === A.adminSupportRequestDetail.id
      ? envelope(A.adminSupportRequestDetail)
      : envelope({ ...A.adminSupportRequests.find((r) => r.id === args[0]) ?? A.adminSupportRequestDetail, mission: { missionId: 'mis_single2', sosId: 'sos_a4', incidentLabel: 'نجات و امداد', severity: 'medium', status: 'in_progress' }, leader: { userId: 'usr_reza', username: 'reza.m' } })],
  ['GET', /^\/_admin\/support-requests\/([^/]+)\/candidates$/, ({ args }) => {
    const list = A.adminSupportRequestCandidates[args[0]] ?? [];
    return envelope({ items: list, total: list.length, eligibleTotal: list.filter((c) => c.eligible).length });
  }],
  ['POST', /^\/_admin\/support-requests\/[^/]+\/review$/, () => envelope({ ok: true })],

  /* -------------------------------- admin: mission team + dispatch */
  ['GET', /^\/_admin\/missions\/([^/]+)\/team$/, () => envelope(D.teamMission)],
  ['POST', /^\/_admin\/missions\/[^/]+\/members$/, () => envelope(D.teamMission)],
  ['DELETE', /^\/_admin\/missions\/[^/]+\/members\/[^/]+$/, () => envelope(D.teamMission)],
  ['POST', /^\/_admin\/missions\/[^/]+\/leader$/, () => envelope(D.teamMission)],
  ['PUT', /^\/_admin\/missions\/[^/]+\/requirements$/, () => envelope(D.teamMission)],
  ['GET', /^\/_admin\/sos\/[^/]+\/nearest$/, ({ query }) => {
    const limit = Number(query.get('limit') ?? 10);
    return envelope({ items: A.nearestResponders.slice(0, limit), total: A.nearestResponders.length });
  }],
  ['POST', /^\/_admin\/sos\/[^/]+\/dispatch$/, ({ body }) => envelope({ mode: String(body.mode ?? 'offer') })],
  ['POST', /^\/_admin\/sos\/[^/]+\/team-dispatch$/, () => envelope({ missionId: 'mis_team' })]
];

/**
 * Installs the mock on `window.fetch`. Relative URLs are resolved against a fixed internal
 * origin so `new URL` works; the origin never leaves the sandbox because the mock answers
 * synchronously.
 */
export function installDemoFetch(): void {
  const inner = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const parsed = new URL(url, 'http://preview.internal');
    if (!parsed.pathname.startsWith('/_')) return inner(input, init);
    const method = (init?.method ?? (typeof input === 'object' && 'method' in input ? (input as Request).method : 'GET')).toUpperCase();
    let body: Record<string, unknown> = {};
    if (typeof init?.body === 'string' && init.body) {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = {};
      }
    }
    for (const [routeMethod, pattern, handler] of routes) {
      if (routeMethod !== method) continue;
      const match = pattern.exec(parsed.pathname);
      if (!match) continue;
      // eslint-disable-next-line no-console
      console.info(`[preview] ${method} ${parsed.pathname}`);
      return handler({ args: match.slice(1), query: parsed.searchParams, body });
    }
    console.warn(`[preview] unmocked ${method} ${parsed.pathname}`);
    return failure(404, 'PREVIEW_UNMOCKED', `پیش‌نمایش برای ${method} ${parsed.pathname} ساخته نشده است.`);
  };
}

export const __demo = { state, routes, csvList };
