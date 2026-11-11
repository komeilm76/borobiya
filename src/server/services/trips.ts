import type { AuthIdentity } from '../core/router.ts';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.ts';
import { newId } from '../core/crypto.ts';
import { isValidPoint } from '../domain/geo.ts';
import {
  HTTP_EVENTS, TRIP_INVITATION_STATUS, TRIP_MEMBER_ROLES, TRIP_STATUS
} from '../../shared/protocol.ts';
import type { AppContext } from './context.ts';

export interface StopInput {
  label: string;
  latitude: number;
  longitude: number;
  placeId?: string | null;
}

export interface StopProjection {
  id: string;
  rank: number;
  label: string;
  latitude: number;
  longitude: number;
  placeId: string | null;
}

export interface TripProjection {
  [key: string]: unknown;
  id: string;
  name: string;
  status: string;
  saved: boolean;
  role: 'leader' | 'member';
  ownerId: string;
  ownerUsername: string;
  stopCount: number;
  memberCount: number;
  stops: StopProjection[];
  members?: Array<Record<string, unknown>>;
  invitations?: Array<Record<string, unknown>>;
  createdAt: number;
  updatedAt: number;
  startedAt: number | null;
  completedAt: number | null;
}

const MAX_STOPS = 25;
const FINISHED_STATUSES = new Set<string>([TRIP_STATUS.COMPLETED, TRIP_STATUS.CANCELLED]);

/**
 * Trips and group rides, Stage 5. A trip is an ordered list of stops owned by one leader; other
 * accounts join only by accepting an invitation (invitation/acceptance policy, confirmed product
 * decision). The leader alone may rename the trip and rewrite its stops. Status transitions:
 * planned -> active -> completed, planned|active -> cancelled. Finished trips are immutable.
 */
export class TripsService {
  constructor(private readonly ctx: AppContext) {}

  // ---------- shared lookups ----------

  private tripRow(tripId: string): Record<string, any> | undefined {
    return this.ctx.repo.one<Record<string, any>>(
      `SELECT t.*, u.username AS ownerUsername
       FROM trips t JOIN users u ON u.id = t.owner_id
       WHERE t.id = ?`, tripId);
  }

  private membership(tripId: string, userId: string): Record<string, any> | undefined {
    return this.ctx.repo.one<Record<string, any>>(
      'SELECT * FROM group_trips WHERE trip_id=? AND user_id=?', tripId, userId);
  }

  private stopRows(tripId: string): Array<Record<string, any>> {
    return this.ctx.repo.all<Record<string, any>>(
      'SELECT * FROM trip_stops WHERE trip_id=? ORDER BY rank', tripId);
  }

  private memberRows(tripId: string): Array<Record<string, any>> {
    return this.ctx.repo.all<Record<string, any>>(
      `SELECT g.*, u.username FROM group_trips g JOIN users u ON u.id = g.user_id
       WHERE g.trip_id=? ORDER BY (g.role = '${TRIP_MEMBER_ROLES.LEADER}') DESC, g.joined_at`, tripId);
  }

  private invitationRows(tripId: string): Array<Record<string, any>> {
    return this.ctx.repo.all<Record<string, any>>(
      `SELECT i.*, u.username AS inviteeUsername, inv.username AS invitedByUsername
       FROM trip_invitations i
       JOIN users u ON u.id = i.invitee_id
       JOIN users inv ON inv.id = i.invited_by
       WHERE i.trip_id=? ORDER BY i.created_at DESC`, tripId);
  }

  private savedBy(tripIds: string[], userId: string): Set<string> {
    if (!tripIds.length) return new Set();
    const rows = this.ctx.repo.all<{ trip_id: string }>(
      `SELECT trip_id FROM saved_trips WHERE user_id=? AND trip_id IN (${tripIds.map(() => '?').join(',')})`,
      userId, ...tripIds);
    return new Set(rows.map((row) => String(row.trip_id)));
  }

  private stopProjection(row: Record<string, any>): StopProjection {
    return {
      id: String(row.id),
      rank: Number(row.rank),
      label: String(row.label),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      placeId: row.place_id ? String(row.place_id) : null
    };
  }

  private baseProjection(trip: Record<string, any>, membership: Record<string, any>, saved: Set<string>, viewerIsLeader: boolean): TripProjection {
    const tripId = String(trip.id);
    const stops = this.stopRows(tripId);
    const members = this.memberRows(tripId);
    const projection: TripProjection = {
      id: tripId,
      name: String(trip.name),
      status: String(trip.status),
      saved: saved.has(tripId),
      role: String(membership.role) as 'leader' | 'member',
      ownerId: String(trip.owner_id),
      ownerUsername: String(trip.ownerUsername),
      stopCount: stops.length,
      memberCount: members.length,
      stops: stops.map((row) => this.stopProjection(row)),
      createdAt: Number(trip.created_at),
      updatedAt: Number(trip.updated_at),
      startedAt: trip.started_at === null || trip.started_at === undefined ? null : Number(trip.started_at),
      completedAt: trip.completed_at === null || trip.completed_at === undefined ? null : Number(trip.completed_at)
    };
    projection.members = members.map((row) => ({
      userId: String(row.user_id),
      username: String(row.username),
      role: String(row.role),
      joinedAt: Number(row.joined_at)
    }));
    // Invitations are sensitive to the leader only: members never learn who else was invited.
    if (viewerIsLeader) {
      projection.invitations = this.invitationRows(tripId).map((row) => ({
        id: String(row.id),
        inviteeId: String(row.invitee_id),
        inviteeUsername: String(row.inviteeUsername),
        invitedByUsername: String(row.invitedByUsername),
        status: String(row.status),
        createdAt: Number(row.created_at),
        respondedAt: row.responded_at === null || row.responded_at === undefined ? null : Number(row.responded_at)
      }));
    }
    return projection;
  }

  private requireMember(tripId: string, identity: AuthIdentity): { trip: Record<string, any>; membership: Record<string, any> } {
    const trip = this.tripRow(tripId);
    const membership = trip ? this.membership(tripId, identity.userId) : undefined;
    // A non-member gets the same 404 as a missing trip; existence is not leaked.
    if (!trip || !membership) throw notFound('Trip not found.');
    return { trip, membership };
  }

  private requireLeader(tripId: string, identity: AuthIdentity): { trip: Record<string, any>; membership: Record<string, any> } {
    const { trip, membership } = this.requireMember(tripId, identity);
    if (String(membership.role) !== TRIP_MEMBER_ROLES.LEADER) {
      throw forbidden('Only the trip leader can do that.');
    }
    return { trip, membership };
  }

  private audience(tripId: string): string[] {
    const rows = this.ctx.repo.all<{ user_id: string }>('SELECT user_id FROM group_trips WHERE trip_id=?', tripId);
    return rows.map((row) => `user:${String(row.user_id)}`);
  }

  // ---------- reads ----------

  listTrips(identity: AuthIdentity, savedOnly = false): Record<string, unknown> {
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT t.*, u.username AS ownerUsername, g.role AS membershipRole
       FROM trips t
       JOIN users u ON u.id = t.owner_id
       JOIN group_trips g ON g.trip_id = t.id AND g.user_id = ?
       ${savedOnly ? 'JOIN saved_trips s ON s.trip_id = t.id AND s.user_id = ?' : ''}
       ORDER BY t.updated_at DESC LIMIT 100`,
      ...(savedOnly ? [identity.userId, identity.userId] : [identity.userId]));
    const saved = this.savedBy(rows.map((row) => String(row.id)), identity.userId);
    const items = rows.map((row) => {
      const tripId = String(row.id);
      const stopCount = Number(this.ctx.repo.one<{ count: number }>(
        'SELECT COUNT(*) AS count FROM trip_stops WHERE trip_id=?', tripId)?.count ?? 0);
      const memberCount = Number(this.ctx.repo.one<{ count: number }>(
        'SELECT COUNT(*) AS count FROM group_trips WHERE trip_id=?', tripId)?.count ?? 0);
      return {
        id: tripId,
        name: String(row.name),
        status: String(row.status),
        saved: saved.has(tripId),
        role: String(row.membershipRole),
        ownerId: String(row.owner_id),
        ownerUsername: String(row.ownerUsername),
        stopCount,
        memberCount,
        createdAt: Number(row.created_at),
        updatedAt: Number(row.updated_at),
        startedAt: row.started_at === null || row.started_at === undefined ? null : Number(row.started_at),
        completedAt: row.completed_at === null || row.completed_at === undefined ? null : Number(row.completed_at)
      };
    });
    return { items, total: items.length };
  }

  tripDetail(identity: AuthIdentity, tripId: string): Record<string, unknown> {
    const { trip, membership } = this.requireMember(tripId, identity);
    const saved = this.savedBy([tripId], identity.userId);
    return this.baseProjection(trip, membership, saved, String(membership.role) === TRIP_MEMBER_ROLES.LEADER);
  }

  myInvitations(identity: AuthIdentity): Record<string, unknown> {
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT i.*, t.name AS tripName, t.status AS tripStatus, u.username AS inviterUsername
       FROM trip_invitations i
       JOIN trips t ON t.id = i.trip_id
       JOIN users u ON u.id = i.invited_by
       WHERE i.invitee_id=? AND i.status='${TRIP_INVITATION_STATUS.PENDING}'
       ORDER BY i.created_at DESC LIMIT 50`, identity.userId);
    return {
      items: rows.map((row) => ({
        id: String(row.id),
        tripId: String(row.trip_id),
        tripName: String(row.tripName),
        tripStatus: String(row.tripStatus),
        inviterUsername: String(row.inviterUsername),
        createdAt: Number(row.created_at)
      })),
      total: rows.length
    };
  }

  // ---------- writes ----------

  private validatedStops(identity: AuthIdentity, input: StopInput[]): StopInput[] {
    if (!Array.isArray(input) || input.length < 1) throw badRequest('A trip needs at least one stop.');
    if (input.length > MAX_STOPS) throw badRequest(`A trip cannot have more than ${MAX_STOPS} stops.`, { field: 'stops' });
    return input.map((stop, index) => {
      const label = String(stop.label ?? '').trim();
      if (!label) throw badRequest('Every stop needs a label.', { field: `stops[${index}].label` });
      const point = { latitude: Number(stop.latitude), longitude: Number(stop.longitude) };
      if (!isValidPoint(point)) throw badRequest('A stop is outside the valid coordinate range.', { field: `stops[${index}]` });
      if (stop.placeId) {
        const place = this.ctx.repo.one<Record<string, any>>(
          'SELECT id FROM saved_places WHERE id=? AND user_id=?', String(stop.placeId), identity.userId);
        if (!place) throw badRequest('A stop references a saved place that does not belong to you.', { field: `stops[${index}].placeId` });
      }
      return { label: label.slice(0, 120), latitude: point.latitude, longitude: point.longitude, placeId: stop.placeId ? String(stop.placeId) : null };
    });
  }

  createTrip(identity: AuthIdentity, input: { name: string; stops: StopInput[] }): Record<string, unknown> {
    const name = String(input.name ?? '').trim();
    if (!name) throw badRequest('The trip needs a name.', { field: 'name' });
    const stops = this.validatedStops(identity, input.stops);
    const now = this.ctx.clock();
    const id = newId('trp');
    this.ctx.uow.commit((tx) => {
      tx.repo.run(
        `INSERT INTO trips(id,owner_id,name,status,created_at,updated_at) VALUES(?,?,?,?,?,?)`,
        id, identity.userId, name.slice(0, 80), TRIP_STATUS.PLANNED, now, now);
      stops.forEach((stop, index) => {
        tx.repo.run(
          `INSERT INTO trip_stops(id,trip_id,rank,label,latitude,longitude,place_id) VALUES(?,?,?,?,?,?,?)`,
          newId('tstp'), id, index + 1, stop.label, stop.latitude, stop.longitude, stop.placeId ?? null);
      });
      tx.repo.run(
        `INSERT INTO group_trips(trip_id,user_id,role,joined_at) VALUES(?,?,?,?)`,
        id, identity.userId, TRIP_MEMBER_ROLES.LEADER, now);
      tx.event(HTTP_EVENTS.TRIP_UPDATED, { tripId: id, status: TRIP_STATUS.PLANNED, actorId: identity.userId }, [`user:${identity.userId}`]);
    });
    return this.tripDetail(identity, id);
  }

  updateTrip(identity: AuthIdentity, tripId: string, input: { name?: string; stops?: StopInput[] }): Record<string, unknown> {
    const { trip } = this.requireLeader(tripId, identity);
    if (FINISHED_STATUSES.has(String(trip.status))) throw conflict('A finished trip cannot be edited.');
    const name = input.name === undefined ? String(trip.name) : String(input.name).trim();
    if (!name) throw badRequest('The trip needs a name.', { field: 'name' });
    const stops = input.stops === undefined ? undefined : this.validatedStops(identity, input.stops);
    const now = this.ctx.clock();
    this.ctx.uow.commit((tx) => {
      tx.repo.run('UPDATE trips SET name=?, updated_at=? WHERE id=?', name.slice(0, 80), now, tripId);
      if (stops) {
        tx.repo.run('DELETE FROM trip_stops WHERE trip_id=?', tripId);
        stops.forEach((stop, index) => {
          tx.repo.run(
            `INSERT INTO trip_stops(id,trip_id,rank,label,latitude,longitude,place_id) VALUES(?,?,?,?,?,?,?)`,
            newId('tstp'), tripId, index + 1, stop.label, stop.latitude, stop.longitude, stop.placeId ?? null);
        });
      }
      tx.event(HTTP_EVENTS.TRIP_UPDATED, { tripId, status: String(trip.status), actorId: identity.userId }, this.audience(tripId));
    });
    return this.tripDetail(identity, tripId);
  }

  setSaved(identity: AuthIdentity, tripId: string, saved: boolean): Record<string, unknown> {
    this.requireMember(tripId, identity);
    const now = this.ctx.clock();
    if (saved) {
      this.ctx.repo.run(
        'INSERT OR IGNORE INTO saved_trips(trip_id,user_id,created_at) VALUES(?,?,?)', tripId, identity.userId, now);
    } else {
      this.ctx.repo.run('DELETE FROM saved_trips WHERE trip_id=? AND user_id=?', tripId, identity.userId);
    }
    return { ok: true, tripId, saved: Boolean(saved) };
  }

  private transition(identity: AuthIdentity, tripId: string, from: readonly string[], to: string, fields: Record<string, number>): Record<string, unknown> {
    const { trip } = this.requireLeader(tripId, identity);
    const status = String(trip.status);
    if (!from.includes(status)) {
      throw conflict(`A ${status} trip cannot become ${to}.`, { field: 'status' });
    }
    const now = this.ctx.clock();
    this.ctx.uow.commit((tx) => {
      const assignments = ['status=?', 'updated_at=?', ...Object.keys(fields).map((key) => `${key}=?`)];
      tx.repo.run(
        `UPDATE trips SET ${assignments.join(', ')} WHERE id=?`,
        to, now, ...Object.values(fields), tripId);
      tx.event(HTTP_EVENTS.TRIP_UPDATED, { tripId, status: to, actorId: identity.userId }, this.audience(tripId));
    });
    return this.tripDetail(identity, tripId);
  }

  startTrip(identity: AuthIdentity, tripId: string): Record<string, unknown> {
    return this.transition(identity, tripId, [TRIP_STATUS.PLANNED], TRIP_STATUS.ACTIVE, { started_at: this.ctx.clock() });
  }

  completeTrip(identity: AuthIdentity, tripId: string): Record<string, unknown> {
    return this.transition(identity, tripId, [TRIP_STATUS.ACTIVE], TRIP_STATUS.COMPLETED, { completed_at: this.ctx.clock() });
  }

  cancelTrip(identity: AuthIdentity, tripId: string): Record<string, unknown> {
    return this.transition(identity, tripId, [TRIP_STATUS.PLANNED, TRIP_STATUS.ACTIVE], TRIP_STATUS.CANCELLED, { completed_at: this.ctx.clock() });
  }

  invite(identity: AuthIdentity, tripId: string, inviteeId: string): Record<string, unknown> {
    const { trip } = this.requireLeader(tripId, identity);
    if (FINISHED_STATUSES.has(String(trip.status))) throw conflict('A finished trip cannot invite anyone.');
    if (inviteeId === identity.userId) throw badRequest('You are already the leader of this trip.');
    const invitee = this.ctx.repo.one<Record<string, any>>('SELECT id, active FROM users WHERE id=?', inviteeId);
    if (!invitee || !Number(invitee.active)) throw notFound('Invitee not found.');
    if (this.membership(tripId, inviteeId)) throw conflict('That account is already in this trip.', { field: 'inviteeId' });
    const now = this.ctx.clock();
    const id = newId('tinv');
    this.ctx.uow.commit((tx) => {
      // Re-inviting a declined/cancelled invitee resets the row to pending; an accepted
      // invitation is never silently reopened (membership exists by then anyway).
      const existing = tx.repo.one<Record<string, any>>(
        'SELECT * FROM trip_invitations WHERE trip_id=? AND invitee_id=?', tripId, inviteeId);
      if (existing && String(existing.status) === TRIP_INVITATION_STATUS.PENDING) {
        throw conflict('An invitation is already pending for that account.', { field: 'inviteeId' });
      }
      if (existing) {
        tx.repo.run(
          `UPDATE trip_invitations SET status='${TRIP_INVITATION_STATUS.PENDING}', invited_by=?, created_at=?, responded_at=NULL WHERE id=?`,
          identity.userId, now, String(existing.id));
      } else {
        tx.repo.run(
          `INSERT INTO trip_invitations(id,trip_id,invited_by,invitee_id,status,created_at) VALUES(?,?,?,?,?,?)`,
          id, tripId, identity.userId, inviteeId, TRIP_INVITATION_STATUS.PENDING, now);
      }
      tx.event(HTTP_EVENTS.TRIP_INVITATION, {
        tripId, inviteeId, status: TRIP_INVITATION_STATUS.PENDING, actorId: identity.userId
      }, [`user:${inviteeId}`, ...this.audience(tripId)]);
    });
    return this.tripDetail(identity, tripId);
  }

  private invitationFor(invitationId: string): Record<string, any> {
    const row = this.ctx.repo.one<Record<string, any>>(
      'SELECT * FROM trip_invitations WHERE id=?', invitationId);
    if (!row) throw notFound('Invitation not found.');
    return row;
  }

  private respondToInvitation(identity: AuthIdentity, invitationId: string, status: 'accepted' | 'declined'): Record<string, unknown> {
    const row = this.invitationFor(invitationId);
    if (String(row.invitee_id) !== identity.userId) throw forbidden('That invitation is not yours.');
    if (String(row.status) !== TRIP_INVITATION_STATUS.PENDING) {
      throw conflict('Only a pending invitation can be answered.', { field: 'status' });
    }
    const tripId = String(row.trip_id);
    const now = this.ctx.clock();
    this.ctx.uow.commit((tx) => {
      tx.repo.run(
        `UPDATE trip_invitations SET status=?, responded_at=? WHERE id=? AND status='${TRIP_INVITATION_STATUS.PENDING}'`,
        status, now, invitationId);
      if (status === TRIP_INVITATION_STATUS.ACCEPTED) {
        const trip = this.tripRow(tripId);
        if (!trip || FINISHED_STATUSES.has(String(trip.status))) {
          throw conflict('This trip is already finished.', { field: 'status' });
        }
        tx.repo.run(
          'INSERT OR IGNORE INTO group_trips(trip_id,user_id,role,joined_at) VALUES(?,?,?,?)',
          tripId, identity.userId, TRIP_MEMBER_ROLES.MEMBER, now);
      }
      tx.event(HTTP_EVENTS.TRIP_INVITATION, {
        tripId, inviteeId: identity.userId, status, actorId: identity.userId
      }, this.audience(tripId));
      tx.event(HTTP_EVENTS.TRIP_UPDATED, { tripId, actorId: identity.userId }, this.audience(tripId));
    });
    return { ok: true, invitationId, status, tripId };
  }

  acceptInvitation(identity: AuthIdentity, invitationId: string): Record<string, unknown> {
    return this.respondToInvitation(identity, invitationId, TRIP_INVITATION_STATUS.ACCEPTED);
  }

  declineInvitation(identity: AuthIdentity, invitationId: string): Record<string, unknown> {
    return this.respondToInvitation(identity, invitationId, TRIP_INVITATION_STATUS.DECLINED);
  }

  cancelInvitation(identity: AuthIdentity, invitationId: string): Record<string, unknown> {
    const row = this.invitationFor(invitationId);
    const tripId = String(row.trip_id);
    this.requireLeader(tripId, identity);
    if (String(row.status) !== TRIP_INVITATION_STATUS.PENDING) {
      throw conflict('Only a pending invitation can be cancelled.', { field: 'status' });
    }
    const now = this.ctx.clock();
    this.ctx.uow.commit((tx) => {
      tx.repo.run(
        `UPDATE trip_invitations SET status='${TRIP_INVITATION_STATUS.CANCELLED}', responded_at=? WHERE id=?`,
        now, invitationId);
      tx.event(HTTP_EVENTS.TRIP_INVITATION, {
        tripId, inviteeId: String(row.invitee_id), status: TRIP_INVITATION_STATUS.CANCELLED, actorId: identity.userId
      }, [`user:${String(row.invitee_id)}`, ...this.audience(tripId)]);
    });
    return { ok: true, invitationId, status: TRIP_INVITATION_STATUS.CANCELLED };
  }

  leaveTrip(identity: AuthIdentity, tripId: string): Record<string, unknown> {
    const { trip, membership } = this.requireMember(tripId, identity);
    if (String(membership.role) === TRIP_MEMBER_ROLES.LEADER) {
      throw conflict('The leader cannot leave their own trip; complete or cancel it instead.');
    }
    if (FINISHED_STATUSES.has(String(trip.status))) {
      throw conflict('A finished trip cannot be left.', { field: 'status' });
    }
    this.ctx.uow.commit((tx) => {
      tx.repo.run('DELETE FROM group_trips WHERE trip_id=? AND user_id=?', tripId, identity.userId);
      tx.event(HTTP_EVENTS.TRIP_UPDATED, { tripId, actorId: identity.userId }, this.audience(tripId));
    });
    return { ok: true, tripId };
  }
}
