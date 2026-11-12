import type { AuthIdentity, RequestContext, Router } from '../core/router.ts';
import { created, ok, raw } from '../core/router.ts';
import { forbidden, notFound } from '../core/errors.ts';
import {
  accuracy, array, boolean, description, displayText, identifier, latitude, loginSecret, longitude,
  number, oneOf, optional, password, shape, text, username, type Validator
} from '../core/validate.ts';
import { APP_VERSION, ROLES, SOS_STATUS } from '../../shared/protocol.ts';
import type { AppContext } from '../services/context.ts';

const SOS_STATUSES = Object.values(SOS_STATUS) as string[];
const ROLE_VALUES = Object.values(ROLES) as string[];
const SEVERITIES = ['low', 'medium', 'high'] as const;
const SHARE_KINDS = ['live', 'history'] as const;
const MISSION_ACTIONS = ['arrive', 'start', 'complete', 'cancel'] as const;
const GROUP_STATUSES = ['active', 'paused'] as const;
const SETTINGS_BOOLEAN = ['0', '1'] as const;

const RATE = {
  auth: { name: 'auth', capacity: 8, refillPerSecond: 0.15, windowMs: 60_000 },
  recovery: { name: 'recovery', capacity: 5, refillPerSecond: 0.1, windowMs: 60_000 },
  ticket: { name: 'realtime-ticket', capacity: 20, refillPerSecond: 0.5, windowMs: 60_000 },
  mutation: { name: 'mutation', capacity: 40, refillPerSecond: 1, windowMs: 60_000 },
  emergency: { name: 'emergency', capacity: 10, refillPerSecond: 0.2, windowMs: 60_000 }
};

const optionalLimit = optional(number({ min: 1, max: 200, integer: true }));
const optionalTimestamp = optional(number({ min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }));
const trackContextTypeValidator = oneOf(['trip', 'mission'] as const);
const consentBody = shape({ decision: oneOf(['accepted', 'declined'] as const) });
const trackQuery = shape({ from: optionalTimestamp, to: optionalTimestamp }, { allowUnknown: true });
const nullableIdentifier: Validator<unknown> = (value, path) =>
  value === null ? null : (value === undefined ? undefined : identifier(value, path));

const securityAnswers = array(shape({
  questionId: identifier,
  answer: text({ min: 2, max: 100 })
}), { min: 5, max: 5 });
const recoveryAnswers = array(shape({
  questionId: identifier,
  answer: text({ min: 2, max: 100 })
}), { min: 3, max: 3 });
const registerBody = shape({ username, password, securityQuestions: securityAnswers });
const loginBody = shape({
  username, password: loginSecret,
  deviceId: optional(identifier),
  deviceName: optional(text({ max: 120, allowEmpty: true }))
});
const recoveryStartBody = shape({ username });
const recoveryAnswerBody = shape({ recoveryId: identifier, answers: recoveryAnswers });
const resetBody = shape({
  recoveryId: identifier,
  resetToken: text({ min: 20, max: 128, pattern: /^[A-Za-z0-9_-]+$/ }),
  newPassword: password
});
const placeBody = shape({
  name: displayText(1, 80), label: displayText(1, 80), latitude, longitude,
  address: displayText(1, 200), icon: text({ min: 2, max: 50, pattern: /^[a-z0-9-]+$/ }),
  rank: optional(number({ min: 1, max: 100, integer: true }))
});
const SHARE_SCOPE_KINDS = ['route', 'motion', 'accuracy'] as const;
const shareBody = shape({
  recipientId: identifier,
  kind: oneOf(SHARE_KINDS),
  durationSeconds: optional(number({ min: 0, max: 86400, integer: true })),
  historyFrom: optionalTimestamp,
  historyTo: optionalTimestamp,
  scope: optional(array(oneOf(SHARE_SCOPE_KINDS), { min: 1, max: 3 }))
});
const sosBody = shape({
  incidentTypeId: identifier,
  severity: oneOf(SEVERITIES),
  description,
  photoDataUrl: optional(text({ min: 20, max: 160000, pattern: /^data:image\/(?:jpeg|png);base64,[A-Za-z0-9+/=]+$/ })),
  latitude,
  longitude,
  accuracy,
  isManual: boolean()
});
const cancelBody = shape({
  reasonId: identifier,
  detail: optional(text({ min: 10, max: 200 }))
});
const groupBody = shape({
  name: displayText(2, 80),
  color: text({ min: 7, max: 7, pattern: /^#[0-9a-fA-F]{6}$/ }),
  capacity: number({ min: 1, max: 500, integer: true }),
  incidentIds: array(identifier, { min: 1, max: 20 }),
  status: optional(oneOf(GROUP_STATUSES))
});
const settingsBody = shape({
  sos_auto_dispatch: optional(oneOf(SETTINGS_BOOLEAN)),
  default_dispatch_radius_m: optional(text({ min: 2, max: 6, pattern: /^\d+$/ })),
  mission_ready_required: optional(oneOf(SETTINGS_BOOLEAN)),
  maintenance_mode: optional(oneOf(SETTINGS_BOOLEAN))
});

const tileQuery: Validator<unknown> = shape({ v: optional(text({ max: 80, allowEmpty: true })) }, { allowUnknown: true });
const limitQuery: Validator<unknown> = shape({ limit: optionalLimit }, { allowUnknown: true });
const sharesQuery: Validator<unknown> = shape({ include: optional(oneOf(['all'])) }, { allowUnknown: true });
const sosListQuery: Validator<unknown> = shape({ status: optional(oneOf(SOS_STATUSES)), limit: optionalLimit }, { allowUnknown: true });
const syncQuery: Validator<unknown> = shape({ since: optionalTimestamp, limit: optionalLimit }, { allowUnknown: true });
const loginsQuery: Validator<unknown> = shape({ from: optionalTimestamp, to: optionalTimestamp, limit: optionalLimit }, { allowUnknown: true });
const historyQuery: Validator<unknown> = shape({ from: optionalTimestamp, to: optionalTimestamp, limit: optionalLimit }, { allowUnknown: true });
const searchQuery: Validator<unknown> = shape({
  q: text({ min: 1, max: 32 }), role: optional(oneOf(ROLE_VALUES)), limit: optionalLimit
}, { allowUnknown: true });
const adminUsersQuery: Validator<unknown> = shape({
  q: optional(text({ min: 1, max: 32 })), role: optional(oneOf(ROLE_VALUES)),
  active: optional(boolean()), page: optional(number({ min: 1, max: 10000, integer: true })),
  limit: optional(number({ min: 1, max: 100, integer: true }))
}, { allowUnknown: true });
const auditQuery: Validator<unknown> = shape({
  from: optionalTimestamp, to: optionalTimestamp,
  action: optional(text({ min: 1, max: 80 })), q: optional(text({ min: 1, max: 80 })), limit: optionalLimit
}, { allowUnknown: true });
const alertsQuery: Validator<unknown> = shape({ includeResolved: optional(boolean()) }, { allowUnknown: true });
const nearestQuery: Validator<unknown> = shape({ limit: optionalLimit }, { allowUnknown: true });
const requirementItem = shape({ jobTypeId: identifier, quantity: number({ min: 1, max: 20, integer: true }) });
const requirementList = array(requirementItem, { min: 0, max: 10 });
const supportRequestBody = shape({
  items: array(requirementItem, { min: 1, max: 10 }),
  reason: text({ min: 10, max: 300 }),
  note: optional(text({ max: 200, allowEmpty: true }))
});
const memberAddBody = shape({ userIds: array(identifier, { min: 1, max: 10 }) });
const leaderBody = shape({ userId: identifier });
const memberRemoveBody = shape({ reason: optional(text({ max: 200, allowEmpty: true })) });
const requirementsBody = shape({ requirements: requirementList });
const teamDispatchBody = shape({
  groupId: identifier,
  leaderId: identifier,
  requirements: array(requirementItem, { min: 1, max: 10 }),
  memberIds: optional(array(identifier, { min: 0, max: 12 }))
});
const reviewBody = shape({
  decision: oneOf(['approved', 'partially_approved', 'rejected'] as const),
  adminNote: optional(text({ max: 500, allowEmpty: true })),
  items: optional(array(shape({ jobTypeId: identifier, approvedQuantity: number({ min: 0, max: 20, integer: true }) }), { min: 1, max: 10 })),
  userIds: optional(array(identifier, { min: 1, max: 20 }))
});
const candidatesQuery: Validator<unknown> = shape({
  jobTypeId: optional(identifier),
  q: optional(text({ min: 1, max: 32 })),
  includeIneligible: optional(boolean()),
  limit: optionalLimit
}, { allowUnknown: true });
const stopShape = shape({
  label: displayText(1, 120), latitude, longitude, placeId: optional(identifier)
});
const tripsQuery: Validator<unknown> = shape({ saved: optional(boolean()) }, { allowUnknown: true });
const tripCreateBody = shape({
  name: displayText(1, 80),
  stops: array(stopShape, { min: 1, max: 25 })
});
const tripUpdateBody = shape({
  name: optional(displayText(1, 80)),
  stops: optional(array(stopShape, { min: 1, max: 25 }))
}, { allowUnknown: false });
const tripInviteBody = shape({ inviteeId: identifier });
const tripSaveBody = shape({ saved: boolean() });

const supportRequestsQuery: Validator<unknown> = shape({
  status: optional(oneOf(['pending', 'partially_approved', 'approved', 'rejected', 'cancelled'])),
  missionId: optional(identifier),
  limit: optionalLimit
}, { allowUnknown: true });

function actor(ctx: RequestContext<AppContext>): AuthIdentity {
  if (!ctx.auth) throw forbidden('Authentication is required.');
  return ctx.auth;
}
function body<T>(ctx: RequestContext<AppContext>): T { return ctx.body as T; }
function query<T>(ctx: RequestContext<AppContext>): T { return ctx.query as T; }
function agent(ctx: RequestContext<AppContext>): string { return String(ctx.request.headers.get('user-agent') ?? ''); }
function sessionCookie(ctx: RequestContext<AppContext>): string | undefined { return ctx.cookies.bb_session; }
function withCookie(data: unknown, cookie: string) {
  return { status: 200, data, cookies: [cookie] };
}

export function registerRoutes(router: Router<AppContext>): void {
  // Public, cacheable and unauthenticated.
  router.add({ method: 'GET', path: '/_public/health', auth: 'none', tags: ['public'], summary: 'Health', handler: (ctx) =>
    ok({ status: 'ok', version: APP_VERSION, serverTime: ctx.app.clock(), dataVersion: ctx.app.config.dataVersion }) });
  router.add({ method: 'GET', path: '/_public/openapi.json', auth: 'none', tags: ['public'], summary: 'OpenAPI document', handler: (ctx) =>
    raw(JSON.stringify(ctx.app.router.openapi('Borobiya API', APP_VERSION), null, 2), 'application/json; charset=utf-8',
      { cacheControl: 'public, max-age=3600', compress: true }) });
  router.add({ method: 'GET', path: '/_public/security-questions', auth: 'none', tags: ['auth'], summary: 'Security question catalog', handler: (ctx) =>
    ok({ items: ctx.app.services.auth.securityCatalog() }) });
  router.add({ method: 'GET', path: '/_public/incident-types', auth: 'none', tags: ['catalog'], summary: 'Incident type catalog', handler: (ctx) =>
    ok(ctx.app.services.admin.incidentTypes()) });
  router.add({ method: 'GET', path: '/_public/cancellation-reasons', auth: 'none', tags: ['catalog'], summary: 'Cancellation reason catalog', handler: (ctx) =>
    ok({ items: ctx.app.repo.all('SELECT id,label,requires_text AS requiresText FROM cancellation_reasons ORDER BY rank')
      .map((row: Record<string, unknown>) => ({ id: String(row.id), label: String(row.label), requiresText: Boolean(row.requiresText) })) }) });
  router.add({ method: 'GET', path: '/_public/map/config', auth: 'none', tags: ['map'], summary: 'Vector map configuration', handler: (ctx) =>
    ok(ctx.app.services.map.config()) });
  router.add({ method: 'GET', path: '/_public/map/tiles/:z/:x/:y.svg', auth: 'none', query: tileQuery, tags: ['map'], summary: 'Deterministic vector tile', handler: (ctx) => {
    const tile = ctx.app.services.map.tile(Number(ctx.params.z), Number(ctx.params.x), Number(ctx.params.y));
    if (!tile) throw notFound('Map tile not found.');
    return raw(tile.svg, 'image/svg+xml', {
      etag: tile.etag, cacheControl: 'public, max-age=31536000, immutable', compress: true
    });
  } });

  // Authentication and recovery.
  router.add({ method: 'POST', path: '/_auth/register', auth: 'none', body: registerBody, rate: RATE.auth, tags: ['auth'], summary: 'Register', handler: async (ctx) =>
    created(await ctx.app.services.auth.register(body(ctx))) });
  router.add({ method: 'POST', path: '/_auth/login', auth: 'none', body: loginBody, rate: RATE.auth, tags: ['auth'], summary: 'Log in', handler: async (ctx) => {
    const result = await ctx.app.services.auth.login(body(ctx), ctx.ip, agent(ctx));
    return withCookie({ user: result.user, expiresAt: result.expiresAt }, result.cookie);
  } });
  router.add({ method: 'POST', path: '/_auth/refresh', auth: 'none', rate: RATE.auth, tags: ['auth'], summary: 'Rotate session', handler: (ctx) => {
    const result = ctx.app.services.auth.refresh(sessionCookie(ctx), ctx.ip, agent(ctx));
    return withCookie({ ok: true, expiresAt: result.expiresAt }, result.cookie);
  } });
  router.add({ method: 'POST', path: '/_auth/logout', auth: 'none', rate: RATE.auth, tags: ['auth'], summary: 'Log out', handler: (ctx) =>
    withCookie({ ok: true }, ctx.app.services.auth.logout(sessionCookie(ctx)).cookie) });
  router.add({ method: 'POST', path: '/_auth/recovery/start', auth: 'none', body: recoveryStartBody, rate: RATE.recovery, tags: ['auth'], summary: 'Start recovery', handler: async (ctx) =>
    ok(await ctx.app.services.auth.startRecovery(body<{ username: string }>(ctx).username)) });
  router.add({ method: 'POST', path: '/_auth/recovery/answers', auth: 'none', body: recoveryAnswerBody, rate: RATE.recovery, tags: ['auth'], summary: 'Answer recovery questions', handler: async (ctx) => {
    const input = body<{ recoveryId: string; answers: Array<{ questionId: string; answer: string }> }>(ctx);
    return ok(await ctx.app.services.auth.answerRecovery(input.recoveryId, input.answers));
  } });
  router.add({ method: 'POST', path: '/_auth/recovery/reset', auth: 'none', body: resetBody, rate: RATE.recovery, tags: ['auth'], summary: 'Reset password', handler: async (ctx) => {
    const input = body<{ recoveryId: string; resetToken: string; newPassword: string }>(ctx);
    return ok(await ctx.app.services.auth.resetPassword(input.recoveryId, input.resetToken, input.newPassword));
  } });

  // User account and catalog.
  router.add({ method: 'GET', path: '/_user/me', auth: 'user', tags: ['user'], summary: 'Current account', handler: (ctx) => ok(ctx.app.services.users.me(actor(ctx))) });
  router.add({ method: 'PATCH', path: '/_user/me', auth: 'user', body: shape({ username: optional(username), recordTrack: optional(boolean()) }), rate: RATE.mutation, tags: ['user'], summary: 'Change username or the track-recording preference', handler: (ctx) =>
    ok(ctx.app.services.users.updateMe(actor(ctx), body<{ username?: string; recordTrack?: boolean }>(ctx))) });
  router.add({ method: 'GET', path: '/_user/devices', auth: 'user', tags: ['user'], summary: 'Active devices', handler: (ctx) => ok(ctx.app.services.users.devices(actor(ctx))) });
  router.add({ method: 'DELETE', path: '/_user/devices/:sessionId', auth: 'user', rate: RATE.mutation, tags: ['user'], summary: 'Revoke device', handler: (ctx) =>
    ok(ctx.app.services.users.revokeDevice(actor(ctx), ctx.params.sessionId)) });
  router.add({ method: 'GET', path: '/_user/logins', auth: 'user', query: loginsQuery, tags: ['user'], summary: 'Login history', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx); const now = ctx.app.clock();
    return ok(ctx.app.services.users.loginHistory(actor(ctx), Number(input.from ?? now - 30 * 86_400_000), Number(input.to ?? now), Number(input.limit ?? 50)));
  } });
  router.add({ method: 'POST', path: '/_user/security-questions', auth: 'user', body: shape({ securityQuestions: securityAnswers }), rate: RATE.mutation, tags: ['user'], summary: 'Complete security questions', handler: async (ctx) =>
    ok(await ctx.app.services.auth.completeSecurityQuestions(actor(ctx), body<{ securityQuestions: any[] }>(ctx).securityQuestions)) });
  router.add({ method: 'GET', path: '/_user/users/search', auth: 'user', query: searchQuery, tags: ['user'], summary: 'Search users', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.users.searchUsers(actor(ctx), String(input.q), input.role ? String(input.role) : undefined, Number(input.limit ?? 20)));
  } });

  // Saved places.
  router.add({ method: 'GET', path: '/_user/places', auth: 'user', tags: ['places'], summary: 'Saved places', handler: (ctx) => ok(ctx.app.services.users.places(actor(ctx))) });
  router.add({ method: 'POST', path: '/_user/places', auth: 'user', body: placeBody, rate: RATE.mutation, tags: ['places'], summary: 'Create saved place', handler: (ctx) =>
    created(ctx.app.services.users.createPlace(actor(ctx), body<any>(ctx))) });
  router.add({ method: 'POST', path: '/_user/places/reorder', auth: 'user', body: shape({ ids: array(identifier, { min: 1, max: 50 }) }), rate: RATE.mutation, tags: ['places'], summary: 'Reorder saved places', handler: (ctx) =>
    ok(ctx.app.services.users.reorderPlaces(actor(ctx), body<{ ids: string[] }>(ctx).ids)) });
  router.add({ method: 'PATCH', path: '/_user/places/:placeId', auth: 'user', body: placeBody, rate: RATE.mutation, tags: ['places'], summary: 'Update saved place', handler: (ctx) =>
    ok(ctx.app.services.users.updatePlace(actor(ctx), ctx.params.placeId, body<any>(ctx))) });
  router.add({ method: 'DELETE', path: '/_user/places/:placeId', auth: 'user', rate: RATE.mutation, tags: ['places'], summary: 'Delete saved place', handler: (ctx) =>
    ok(ctx.app.services.users.deletePlace(actor(ctx), ctx.params.placeId)) });

  // Location sharing and reconnection.
  router.add({ method: 'GET', path: '/_user/location/shares', auth: 'user', query: sharesQuery, tags: ['location'], summary: 'Location shares', handler: (ctx) => {
    const input = query<Record<string, unknown>>(ctx);
    return ok(ctx.app.services.location.listShares(actor(ctx), input.include === 'all'));
  } });
  router.add({ method: 'POST', path: '/_user/location/shares', auth: 'user', body: shareBody, rate: RATE.mutation, tags: ['location'], summary: 'Create location share', handler: (ctx) =>
    created(ctx.app.services.location.createShare(actor(ctx), body<any>(ctx))) });
  router.add({ method: 'DELETE', path: '/_user/location/shares/:shareId', auth: 'user', rate: RATE.mutation, tags: ['location'], summary: 'Revoke location share', handler: (ctx) =>
    ok(ctx.app.services.location.revokeShare(actor(ctx), ctx.params.shareId)) });
  router.add({ method: 'GET', path: '/_user/location/snapshot', auth: 'user', tags: ['location'], summary: 'Live location snapshot', handler: (ctx) =>
    ok(ctx.app.services.location.snapshot(actor(ctx).userId)) });
  router.add({ method: 'GET', path: '/_user/location/history/:userId', auth: 'user', query: historyQuery, tags: ['location'], summary: 'Authorized location history', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx); const now = ctx.app.clock();
    return ok(ctx.app.services.location.history(actor(ctx), ctx.params.userId, Number(input.from ?? now - 86_400_000), Number(input.to ?? now), Number(input.limit ?? 200)));
  } });
  // Trips and group navigation (Stage 5).
  router.add({ method: 'GET', path: '/_user/trips/invitations', auth: 'user', tags: ['trips'], summary: 'My pending trip invitations', handler: (ctx) =>
    ok(ctx.app.services.trips.myInvitations(actor(ctx))) });
  router.add({ method: 'POST', path: '/_user/trips/invitations/:invitationId/accept', auth: 'user', rate: RATE.mutation, tags: ['trips'], summary: 'Accept a trip invitation', handler: (ctx) =>
    ok(ctx.app.services.trips.acceptInvitation(actor(ctx), ctx.params.invitationId)) });
  router.add({ method: 'POST', path: '/_user/trips/invitations/:invitationId/decline', auth: 'user', rate: RATE.mutation, tags: ['trips'], summary: 'Decline a trip invitation', handler: (ctx) =>
    ok(ctx.app.services.trips.declineInvitation(actor(ctx), ctx.params.invitationId)) });
  router.add({ method: 'DELETE', path: '/_user/trips/invitations/:invitationId', auth: 'user', rate: RATE.mutation, tags: ['trips'], summary: 'Cancel a trip invitation (leader)', handler: (ctx) =>
    ok(ctx.app.services.trips.cancelInvitation(actor(ctx), ctx.params.invitationId)) });
  router.add({ method: 'POST', path: '/_user/trips', auth: 'user', body: tripCreateBody, rate: RATE.mutation, tags: ['trips'], summary: 'Create a trip', handler: (ctx) =>
    created(ctx.app.services.trips.createTrip(actor(ctx), body<{ name: string; stops: any[] }>(ctx))) });
  router.add({ method: 'GET', path: '/_user/trips', auth: 'user', query: tripsQuery, tags: ['trips'], summary: 'My trips', handler: (ctx) => {
    const input = query<{ saved?: boolean }>(ctx);
    return ok(ctx.app.services.trips.listTrips(actor(ctx), input.saved === true));
  } });
  router.add({ method: 'GET', path: '/_user/trips/:tripId', auth: 'user', tags: ['trips'], summary: 'Trip detail', handler: (ctx) =>
    ok(ctx.app.services.trips.tripDetail(actor(ctx), ctx.params.tripId)) });
  router.add({ method: 'PATCH', path: '/_user/trips/:tripId', auth: 'user', body: tripUpdateBody, rate: RATE.mutation, tags: ['trips'], summary: 'Rename or rewrite a trip (leader)', handler: (ctx) =>
    ok(ctx.app.services.trips.updateTrip(actor(ctx), ctx.params.tripId, body<{ name?: string; stops?: any[] }>(ctx))) });
  router.add({ method: 'POST', path: '/_user/trips/:tripId/save', auth: 'user', body: tripSaveBody, rate: RATE.mutation, tags: ['trips'], summary: 'Save or unsave a trip', handler: (ctx) =>
    ok(ctx.app.services.trips.setSaved(actor(ctx), ctx.params.tripId, body<{ saved: boolean }>(ctx).saved)) });
  router.add({ method: 'POST', path: '/_user/trips/:tripId/start', auth: 'user', rate: RATE.mutation, tags: ['trips'], summary: 'Start a trip (leader)', handler: (ctx) =>
    ok(ctx.app.services.trips.startTrip(actor(ctx), ctx.params.tripId)) });
  router.add({ method: 'POST', path: '/_user/trips/:tripId/complete', auth: 'user', rate: RATE.mutation, tags: ['trips'], summary: 'Complete a trip (leader)', handler: (ctx) =>
    ok(ctx.app.services.trips.completeTrip(actor(ctx), ctx.params.tripId)) });
  router.add({ method: 'POST', path: '/_user/trips/:tripId/cancel', auth: 'user', rate: RATE.mutation, tags: ['trips'], summary: 'Cancel a trip (leader)', handler: (ctx) =>
    ok(ctx.app.services.trips.cancelTrip(actor(ctx), ctx.params.tripId)) });
  router.add({ method: 'POST', path: '/_user/trips/:tripId/leave', auth: 'user', rate: RATE.mutation, tags: ['trips'], summary: 'Leave a trip (member)', handler: (ctx) =>
    ok(ctx.app.services.trips.leaveTrip(actor(ctx), ctx.params.tripId)) });
  router.add({ method: 'POST', path: '/_user/trips/:tripId/track-consent', auth: 'user', body: consentBody, rate: RATE.mutation, tags: ['trips'], summary: 'Consent to recording this trip track', handler: (ctx) =>
    ok(ctx.app.services.track.setConsent(actor(ctx), 'trip', ctx.params.tripId, body<{ decision: 'accepted' | 'declined' }>(ctx).decision)) });
  router.add({ method: 'GET', path: '/_user/trips/:tripId/track', auth: 'user', query: trackQuery, tags: ['trips'], summary: 'Replay a trip track (members / share-scoped recipients)', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.track.readTrack(actor(ctx), 'trip', ctx.params.tripId,
      input.from !== undefined ? Number(input.from) : undefined, input.to !== undefined ? Number(input.to) : undefined));
  } });
  router.add({ method: 'POST', path: '/_user/trips/:tripId/invitations', auth: 'user', body: tripInviteBody, rate: RATE.mutation, tags: ['trips'], summary: 'Invite an account to a trip (leader)', handler: (ctx) =>
    ok(ctx.app.services.trips.invite(actor(ctx), ctx.params.tripId, body<{ inviteeId: string }>(ctx).inviteeId)) });
  router.add({ method: 'POST', path: '/_user/realtime/ticket', auth: 'user', rate: RATE.ticket, tags: ['realtime'], summary: 'Issue one-time WebSocket ticket', handler: (ctx) =>
    ok(ctx.app.services.users.ticket(actor(ctx), ctx.ip)) });
  router.add({ method: 'GET', path: '/_user/sync', auth: 'user', query: syncQuery, tags: ['realtime'], summary: 'Durable event catch-up', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.users.sync(actor(ctx), Number(input.since ?? 0), Number(input.limit ?? 100)));
  } });
  router.add({ method: 'POST', path: '/_user/ready', auth: 'user', body: shape({ ready: boolean() }), rate: RATE.mutation, tags: ['mission'], summary: 'Set mission readiness', handler: (ctx) =>
    ok(ctx.app.services.users.setReady(actor(ctx), body<{ ready: boolean }>(ctx).ready)) });

  // SOS and missions.
  router.add({ method: 'POST', path: '/_user/sos', auth: 'user', body: sosBody, rate: RATE.emergency, tags: ['sos'], summary: 'Create SOS request', handler: (ctx) =>
    created(ctx.app.services.sos.createSos(actor(ctx), body<any>(ctx))) });
  router.add({ method: 'GET', path: '/_user/sos', auth: 'user', query: sosListQuery, tags: ['sos'], summary: 'SOS requests visible to the user', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.sos.listSos(actor(ctx), input.status ? String(input.status) : undefined, Number(input.limit ?? 50)));
  } });
  router.add({ method: 'GET', path: '/_user/sos/:id', auth: 'user', tags: ['sos'], summary: 'SOS detail', handler: (ctx) =>
    ok(ctx.app.services.sos.getSos(actor(ctx), ctx.params.id)) });
  router.add({ method: 'POST', path: '/_user/sos/:id/cancel', auth: 'user', body: cancelBody, rate: RATE.emergency, tags: ['sos'], summary: 'Cancel SOS request', handler: (ctx) => {
    const input = body<{ reasonId: string; detail?: string }>(ctx);
    return ok(ctx.app.services.sos.cancelSos(actor(ctx), ctx.params.id, input.reasonId, input.detail));
  } });
  router.add({ method: 'POST', path: '/_user/sos/:id/decline', auth: 'user', rate: RATE.mutation, tags: ['mission'], summary: 'Decline offered SOS', handler: (ctx) =>
    ok(ctx.app.services.sos.declineOffer(actor(ctx), ctx.params.id)) });
  router.add({ method: 'GET', path: '/_user/mission-offers', auth: 'user', query: limitQuery, tags: ['mission'], summary: 'Pending mission offers for the caller', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.sos.listOffers(actor(ctx), Number(input.limit ?? 20)));
  } });
  router.add({ method: 'POST', path: '/_user/sos/:id/accept', auth: 'user', rate: RATE.emergency, tags: ['mission'], summary: 'Accept dispatched SOS', handler: (ctx) =>
    ok(ctx.app.services.sos.acceptSos(actor(ctx), ctx.params.id)) });
  router.add({ method: 'GET', path: '/_user/missions', auth: 'user', query: limitQuery, tags: ['mission'], summary: 'Mission history', handler: (ctx) =>
    ok(ctx.app.services.sos.listMissions(actor(ctx), Number(query<Record<string, any>>(ctx).limit ?? 50))) });
  router.add({ method: 'POST', path: '/_user/missions/:id/progress', auth: 'user', body: shape({ action: oneOf(MISSION_ACTIONS), note: optional(text({ max: 200, allowEmpty: true })) }), rate: RATE.mutation, tags: ['mission'], summary: 'Advance mission state', handler: (ctx) => {
    const input = body<{ action: string; note?: string }>(ctx);
    return ok(ctx.app.services.sos.progressMission(actor(ctx), ctx.params.id, input.action, input.note));
  } });
  router.add({ method: 'POST', path: '/_user/missions/:id/rating', auth: 'user', body: shape({ rating: number({ min: 1, max: 5, integer: true }), note: optional(text({ max: 200, allowEmpty: true })) }), rate: RATE.mutation, tags: ['mission'], summary: 'Rate completed mission', handler: (ctx) => {
    const input = body<{ rating: number; note?: string }>(ctx);
    return ok(ctx.app.services.sos.rateMission(actor(ctx), ctx.params.id, input.rating, input.note));
  } });
  router.add({ method: 'POST', path: '/_user/missions/:id/track-consent', auth: 'user', body: consentBody, rate: RATE.mutation, tags: ['mission'], summary: 'Consent to recording this mission track', handler: (ctx) =>
    ok(ctx.app.services.track.setConsent(actor(ctx), 'mission', ctx.params.id, body<{ decision: 'accepted' | 'declined' }>(ctx).decision)) });
  router.add({ method: 'GET', path: '/_user/missions/:id/track', auth: 'user', query: trackQuery, tags: ['mission'], summary: 'Replay a mission track (participants / share-scoped recipients)', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.track.readTrack(actor(ctx), 'mission', ctx.params.id,
      input.from !== undefined ? Number(input.from) : undefined, input.to !== undefined ? Number(input.to) : undefined));
  } });

  // Mission teams and support requests.
  router.add({ method: 'GET', path: '/_user/job-types', auth: 'user', tags: ['mission'], summary: 'Active job types (staffing forms)', handler: (ctx) =>
    ok(ctx.app.services.teams.jobTypesCatalog()) });
  router.add({ method: 'GET', path: '/_user/missions/:id/team', auth: 'user', tags: ['mission'], summary: 'Mission team', handler: (ctx) =>
    ok(ctx.app.services.teams.getTeam(actor(ctx), ctx.params.id)) });
  router.add({ method: 'GET', path: '/_user/missions/:id/support-requests', auth: 'user', query: limitQuery, tags: ['mission'], summary: 'Support requests for the mission', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.teams.listSupportRequests(actor(ctx), ctx.params.id, Number(input.limit ?? 50)));
  } });
  router.add({ method: 'POST', path: '/_user/missions/:id/support-requests', auth: 'user', body: supportRequestBody, rate: RATE.mutation, tags: ['mission'], summary: 'Request staff support (mission leader)', handler: (ctx) => {
    const input = body<{ items: Array<{ jobTypeId: string; quantity: number }>; reason: string; note?: string }>(ctx);
    return created(ctx.app.services.teams.createSupportRequest(actor(ctx), ctx.params.id, input));
  } });
  router.add({ method: 'POST', path: '/_user/missions/:id/support-requests/:requestId/cancel', auth: 'user', rate: RATE.mutation, tags: ['mission'], summary: 'Cancel own pending support request (mission leader)', handler: (ctx) =>
    ok(ctx.app.services.teams.cancelSupportRequest(actor(ctx), ctx.params.id, ctx.params.requestId)) });

  // Administration.
  router.add({ method: 'GET', path: '/_admin/overview', auth: 'admin', tags: ['admin'], summary: 'Operations overview', handler: (ctx) => ok(ctx.app.services.admin.overview()) });
  router.add({ method: 'GET', path: '/_admin/reports', auth: 'admin', tags: ['admin'], summary: 'Reports', handler: (ctx) => ok(ctx.app.services.admin.overview()) });
  router.add({ method: 'GET', path: '/_admin/tracks/:contextType/:contextId', auth: 'admin', tags: ['admin'], summary: 'Audit-logged administrator read of a track (safeguarding)', handler: (ctx) => {
    const parsed = trackContextTypeValidator(ctx.params.contextType, 'contextType');
    return ok(ctx.app.services.track.adminReadTrack(actor(ctx), parsed, ctx.params.contextId));
  } });
  router.add({ method: 'GET', path: '/_admin/dispatch', auth: 'admin', tags: ['admin'], summary: 'Dispatch board data', handler: (ctx) =>
    ok({ queue: ctx.app.services.sos.listSos(actor(ctx), SOS_STATUS.PENDING, 20), groups: ctx.app.services.admin.groups(), incidentTypes: ctx.app.services.admin.incidentTypes() }) });
  router.add({ method: 'GET', path: '/_admin/users', auth: 'admin', query: adminUsersQuery, tags: ['admin'], summary: 'Users', handler: (ctx) =>
    ok(ctx.app.services.admin.users(usersFilters(ctx))) });
  router.add({ method: 'POST', path: '/_admin/users', auth: 'admin', body: shape({ username, password, role: oneOf(ROLE_VALUES), jobTypeId: optional(identifier) }), rate: RATE.mutation, tags: ['admin'], summary: 'Create user', handler: async (ctx) =>
    created(await ctx.app.services.admin.createUser(actor(ctx), body<any>(ctx))) });
  router.add({ method: 'GET', path: '/_admin/users.csv', auth: 'admin', query: adminUsersQuery, tags: ['admin'], summary: 'Users CSV', handler: (ctx) =>
    raw(ctx.app.services.admin.usersCsv(usersFilters(ctx)), 'text/csv; charset=utf-8', {
      cacheControl: 'no-store', compress: true,
      headers: { 'Content-Disposition': 'attachment; filename="borobiya-users.csv"' }
    }) });
  router.add({ method: 'GET', path: '/_admin/users/:id', auth: 'admin', tags: ['admin'], summary: 'User detail', handler: (ctx) =>
    ok(ctx.app.services.admin.userDetails(ctx.params.id)) });
  router.add({ method: 'PATCH', path: '/_admin/users/:id', auth: 'admin', body: shape({ active: optional(boolean()), role: optional(oneOf(ROLE_VALUES)), jobTypeId: nullableIdentifier }), rate: RATE.mutation, tags: ['admin'], summary: 'Update user', handler: (ctx) =>
    ok(ctx.app.services.admin.updateUser(actor(ctx), ctx.params.id, body<any>(ctx))) });
  router.add({ method: 'GET', path: '/_admin/groups', auth: 'admin', tags: ['admin'], summary: 'Service groups', handler: (ctx) => ok(ctx.app.services.admin.groups()) });
  router.add({ method: 'POST', path: '/_admin/groups', auth: 'admin', body: groupBody, rate: RATE.mutation, tags: ['admin'], summary: 'Create service group', handler: (ctx) =>
    created(ctx.app.services.admin.createGroup(actor(ctx), body<any>(ctx))) });
  router.add({ method: 'PATCH', path: '/_admin/groups/:id', auth: 'admin', body: groupBody, rate: RATE.mutation, tags: ['admin'], summary: 'Update service group', handler: (ctx) =>
    ok(ctx.app.services.admin.updateGroup(actor(ctx), ctx.params.id, body<any>(ctx))) });
  router.add({ method: 'POST', path: '/_admin/groups/:id/members', auth: 'admin', body: shape({ userId: identifier, role: oneOf(['leader', 'member'] as const) }), rate: RATE.mutation, tags: ['admin'], summary: 'Add group member', handler: (ctx) => {
    const input = body<{ userId: string; role: string }>(ctx);
    return ok(ctx.app.services.admin.addGroupMember(actor(ctx), ctx.params.id, input.userId, input.role));
  } });
  router.add({ method: 'DELETE', path: '/_admin/groups/:id/members/:userId', auth: 'admin', rate: RATE.mutation, tags: ['admin'], summary: 'Remove group member', handler: (ctx) =>
    ok(ctx.app.services.admin.removeGroupMember(actor(ctx), ctx.params.id, ctx.params.userId)) });
  router.add({ method: 'GET', path: '/_admin/incident-types', auth: 'admin', tags: ['admin'], summary: 'Incident types', handler: (ctx) => ok(ctx.app.services.admin.incidentTypes()) });
  router.add({ method: 'GET', path: '/_admin/audit', auth: 'admin', query: auditQuery, tags: ['admin'], summary: 'Audit log', handler: (ctx) =>
    ok(ctx.app.services.admin.auditLog(auditFilters(ctx))) });
  router.add({ method: 'GET', path: '/_admin/audit.csv', auth: 'admin', query: auditQuery, tags: ['admin'], summary: 'Audit CSV', handler: (ctx) =>
    raw(ctx.app.services.admin.auditCsv(auditFilters(ctx)), 'text/csv; charset=utf-8', {
      cacheControl: 'no-store', compress: true,
      headers: { 'Content-Disposition': 'attachment; filename="borobiya-audit.csv"' }
    }) });
  router.add({ method: 'GET', path: '/_admin/alerts', auth: 'admin', query: alertsQuery, tags: ['admin'], summary: 'Alerts', handler: (ctx) =>
    ok(ctx.app.services.admin.alerts(Boolean(query<Record<string, any>>(ctx).includeResolved ?? false))) });
  router.add({ method: 'POST', path: '/_admin/alerts/:id/resolve', auth: 'admin', rate: RATE.mutation, tags: ['admin'], summary: 'Resolve alert', handler: (ctx) =>
    ok(ctx.app.services.admin.resolveAlert(actor(ctx), ctx.params.id)) });
  router.add({ method: 'GET', path: '/_admin/settings', auth: 'admin', tags: ['admin'], summary: 'System settings', handler: (ctx) => ok(ctx.app.services.admin.settings()) });
  router.add({ method: 'PUT', path: '/_admin/settings', auth: 'admin', body: settingsBody, rate: RATE.mutation, tags: ['admin'], summary: 'Update settings', handler: (ctx) => {
    const input = body<Record<string, string | undefined>>(ctx);
    const settings = Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined)) as Record<string, string>;
    return ok(ctx.app.services.admin.updateSettings(actor(ctx), settings));
  } });
  router.add({ method: 'GET', path: '/_admin/system/health', auth: 'admin', tags: ['admin'], summary: 'System health', handler: (ctx) => ok(ctx.app.services.admin.systemHealth()) });
  router.add({ method: 'GET', path: '/_admin/sos', auth: 'admin', query: sosListQuery, tags: ['admin'], summary: 'All SOS requests', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.sos.listSos(actor(ctx), input.status ? String(input.status) : undefined, Number(input.limit ?? 100)));
  } });
  router.add({ method: 'GET', path: '/_admin/sos/:id/nearest', auth: 'admin', query: nearestQuery, tags: ['admin'], summary: 'Nearest responders', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.sos.nearestForSos(ctx.params.id, Number(input.limit ?? 10)));
  } });
  router.add({ method: 'GET', path: '/_admin/sos/:id', auth: 'admin', tags: ['admin'], summary: 'SOS detail', handler: (ctx) =>
    ok(ctx.app.services.sos.getSos(actor(ctx), ctx.params.id)) });
  router.add({ method: 'GET', path: '/_admin/mission-offers', auth: 'admin', query: shape({ status: optional(oneOf(['pending', 'accepted', 'declined', 'expired', 'cancelled'])), limit: optionalLimit }, { allowUnknown: true }), tags: ['admin'], summary: 'Mission offers', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.sos.listAllOffers(input.status ? String(input.status) : undefined, Number(input.limit ?? 100)));
  } });
  router.add({ method: 'GET', path: '/_admin/job-types', auth: 'admin', tags: ['admin'], summary: 'Job types', handler: (ctx) => ok(ctx.app.services.admin.jobTypes()) });
  router.add({ method: 'POST', path: '/_admin/job-types', auth: 'admin', body: shape({ label: displayText(1, 80), offerPolicy: oneOf(['all', 'ready_only']) }), rate: RATE.mutation, tags: ['admin'], summary: 'Create job type', handler: (ctx) =>
    created(ctx.app.services.admin.createJobType(actor(ctx), body<any>(ctx))) });
  router.add({ method: 'PATCH', path: '/_admin/job-types/:id', auth: 'admin', body: shape({ label: optional(displayText(1, 80)), offerPolicy: optional(oneOf(['all', 'ready_only'])), active: optional(boolean()) }), rate: RATE.mutation, tags: ['admin'], summary: 'Update job type', handler: (ctx) =>
    ok(ctx.app.services.admin.updateJobType(actor(ctx), ctx.params.id, body<any>(ctx))) });
  router.add({ method: 'POST', path: '/_admin/sos/:id/dispatch', auth: 'admin', body: shape({ groupId: identifier, responderIds: array(identifier, { min: 1, max: 20 }), mode: optional(oneOf(['offer', 'immediate'])) }), rate: RATE.emergency, tags: ['admin'], summary: 'Dispatch SOS', handler: (ctx) => {
    const input = body<{ groupId: string; responderIds: string[]; mode?: 'offer' | 'immediate' }>(ctx);
    return ok(ctx.app.services.sos.dispatch(actor(ctx), ctx.params.id, input));
  } });
  router.add({ method: 'POST', path: '/_admin/sos/:id/team-dispatch', auth: 'admin', body: teamDispatchBody, rate: RATE.emergency, tags: ['admin'], summary: 'Create a team mission (leader + composition)', handler: (ctx) => {
    const input = body<{ groupId: string; leaderId: string; requirements: Array<{ jobTypeId: string; quantity: number }>; memberIds?: string[] }>(ctx);
    return created(ctx.app.services.teams.teamDispatch(actor(ctx), ctx.params.id, input));
  } });
  router.add({ method: 'GET', path: '/_admin/missions/:id/team', auth: 'admin', tags: ['mission'], summary: 'Mission team (admin)', handler: (ctx) =>
    ok(ctx.app.services.teams.getTeam(actor(ctx), ctx.params.id)) });
  router.add({ method: 'POST', path: '/_admin/missions/:id/members', auth: 'admin', body: memberAddBody, rate: RATE.mutation, tags: ['admin'], summary: 'Add workers to the mission', handler: (ctx) => {
    const input = body<{ userIds: string[] }>(ctx);
    return ok(ctx.app.services.teams.addMembers(actor(ctx), ctx.params.id, input.userIds));
  } });
  router.add({ method: 'DELETE', path: '/_admin/missions/:id/members/:userId', auth: 'admin', body: memberRemoveBody, rate: RATE.mutation, tags: ['admin'], summary: 'Remove a member from the mission', handler: (ctx) => {
    const input = body<{ reason?: string }>(ctx);
    return ok(ctx.app.services.teams.removeMember(actor(ctx), ctx.params.id, ctx.params.userId, input.reason));
  } });
  router.add({ method: 'POST', path: '/_admin/missions/:id/leader', auth: 'admin', body: leaderBody, rate: RATE.mutation, tags: ['admin'], summary: 'Designate the mission leader', handler: (ctx) => {
    const input = body<{ userId: string }>(ctx);
    return ok(ctx.app.services.teams.designateLeader(actor(ctx), ctx.params.id, input.userId));
  } });
  router.add({ method: 'PUT', path: '/_admin/missions/:id/requirements', auth: 'admin', body: requirementsBody, rate: RATE.mutation, tags: ['admin'], summary: 'Set the target composition of the mission', handler: (ctx) => {
    const input = body<{ requirements: Array<{ jobTypeId: string; quantity: number }> }>(ctx);
    return ok(ctx.app.services.teams.setRequirements(actor(ctx), ctx.params.id, input.requirements));
  } });
  router.add({ method: 'GET', path: '/_admin/support-requests', auth: 'admin', query: supportRequestsQuery, tags: ['admin'], summary: 'Support requests', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.teams.listSupportRequestsAdmin(actor(ctx), input.status ? String(input.status) : undefined, input.missionId ? String(input.missionId) : undefined, Number(input.limit ?? 50)));
  } });
  router.add({ method: 'GET', path: '/_admin/support-requests/:id', auth: 'admin', tags: ['admin'], summary: 'Support request detail', handler: (ctx) =>
    ok(ctx.app.services.teams.supportRequestDetail(actor(ctx), ctx.params.id)) });
  router.add({ method: 'GET', path: '/_admin/support-requests/:id/candidates', auth: 'admin', query: candidatesQuery, tags: ['admin'], summary: 'Eligible workers for a support request', handler: (ctx) => {
    const input = query<Record<string, any>>(ctx);
    return ok(ctx.app.services.teams.candidates(actor(ctx), ctx.params.id, {
      jobTypeId: input.jobTypeId ? String(input.jobTypeId) : undefined,
      q: input.q ? String(input.q) : undefined,
      includeIneligible: Boolean(input.includeIneligible ?? false),
      limit: input.limit === undefined ? undefined : Number(input.limit)
    }));
  } });
  router.add({ method: 'POST', path: '/_admin/support-requests/:id/review', auth: 'admin', body: reviewBody, rate: RATE.mutation, tags: ['admin'], summary: 'Review a support request and assign workers', handler: (ctx) => {
    const input = body<{ decision: 'approved' | 'partially_approved' | 'rejected'; adminNote?: string; items?: Array<{ jobTypeId: string; approvedQuantity: number }>; userIds?: string[] }>(ctx);
    return ok(ctx.app.services.teams.reviewSupportRequest(actor(ctx), ctx.params.id, input));
  } });
}

function usersFilters(ctx: RequestContext<AppContext>) {
  const input = query<Record<string, any>>(ctx);
  return {
    q: input.q ? String(input.q) : undefined,
    role: input.role ? String(input.role) : undefined,
    active: input.active === undefined ? undefined : Boolean(input.active),
    page: Number(input.page ?? 1),
    limit: Number(input.limit ?? 20)
  };
}

function auditFilters(ctx: RequestContext<AppContext>) {
  const input = query<Record<string, any>>(ctx);
  const now = ctx.app.clock();
  return {
    from: Number(input.from ?? now - 30 * 86_400_000),
    to: Number(input.to ?? now),
    action: input.action ? String(input.action) : undefined,
    q: input.q ? String(input.q) : undefined,
    limit: Number(input.limit ?? 100)
  };
}
