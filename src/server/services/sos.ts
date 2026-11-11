import type { AuthIdentity } from '../core/router.ts';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.ts';
import { newId, sha256 } from '../core/crypto.ts';
import { haversineMeters, type Point } from '../../shared/geo.ts';
import { transitionMission, transitionSos } from '../domain/state.ts';
import type { SqlValue } from '../db/repository.ts';
import { HTTP_EVENTS, MISSION_STATUS, ROLES, SOS_STATUS } from '../../shared/protocol.ts';
import type { AppContext } from './context.ts';

interface SosInput {
  incidentTypeId: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  isManual: boolean;
  photoDataUrl?: string;
}

interface DispatchInput { groupId: string; responderIds: string[]; mode?: 'offer' | 'immediate' }

const SOS_SELECT = `
  SELECT s.*, i.label AS incidentLabel, i.icon AS incidentIcon, i.color AS incidentColor,
    m.id AS missionId, m.status AS missionStatus, m.responder_id AS missionResponderId, m.rating AS missionRating, m.rating_note AS missionRatingNote,
    ru.username AS requesterUsername
  FROM sos_requests s
  JOIN incident_types i ON i.id = s.incident_type_id
  LEFT JOIN missions m ON m.sos_id = s.id
  LEFT JOIN users ru ON ru.id = s.requester_id`;

function trackingCode(id: string): number {
  return 1000 + Number.parseInt(sha256(id).slice(0, 4), 16) % 9000;
}

export class SosService {
  constructor(private readonly ctx: AppContext) {}

  createSos(identity: AuthIdentity, input: SosInput): Record<string, unknown> {
    const incident = this.ctx.repo.one('SELECT id FROM incident_types WHERE id=?', input.incidentTypeId);
    if (!incident) throw badRequest('Unknown incident type.', { field: 'incidentTypeId' });
    const id = newId('sos');
    const now = this.ctx.clock();
    const expiresAt = now + 2 * 60 * 60_000;
    return this.ctx.uow.commit((tx) => {
      tx.repo.run(
        `INSERT INTO sos_requests(id,requester_id,incident_type_id,severity,description,photo_data_url,latitude,longitude,accuracy,is_manual,status,created_at,updated_at,expires_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, identity.userId, input.incidentTypeId, input.severity,
        input.description, input.photoDataUrl ?? null, input.latitude, input.longitude, input.accuracy, input.isManual ? 1 : 0,
        SOS_STATUS.PENDING, now, now, expiresAt);
      const payload = {
        sosId: id, trackingCode: trackingCode(id), requesterId: identity.userId,
        incidentTypeId: input.incidentTypeId, severity: input.severity,
        latitude: input.latitude, longitude: input.longitude, status: SOS_STATUS.PENDING, createdAt: now
      };
      tx.event(HTTP_EVENTS.SOS_CREATED, payload, [`user:${identity.userId}`, 'role:admin', `sos:${id}`]);
      return { ok: true, sos: this.publicSos({ ...payload, description: input.description,
        photo_data_url: input.photoDataUrl ?? null, accuracy: input.accuracy,
        is_manual: input.isManual ? 1 : 0, updated_at: now, expires_at: expiresAt, incidentLabel: null, missionId: null }) };
    });
  }

  listSos(identity: AuthIdentity, status: string | undefined, limit: number): Record<string, unknown> {
    const clauses: string[] = [];
    const params: SqlValue[] = [];
    if (identity.role === ROLES.USER) {
      clauses.push('s.requester_id = ?');
      params.push(identity.userId);
    } else if (identity.role === ROLES.RESPONDER) {
      // Offer visibility mirrors the offer rows: a named dispatch is visible to that worker
      // alone; an unnamed multi-recipient dispatch only to the workers it offers to; rows from
      // before the offers table keep the legacy group-membership rule.
      clauses.push(`(s.requester_id = ? OR s.assigned_responder_id = ? OR m.responder_id = ?
        OR EXISTS (SELECT 1 FROM mission_offers o WHERE o.sos_id = s.id AND o.responder_id = ?)
        OR (NOT EXISTS (SELECT 1 FROM mission_offers o WHERE o.sos_id = s.id)
            AND s.assigned_group_id IN (SELECT group_id FROM group_members WHERE user_id = ?)))`);
      params.push(identity.userId, identity.userId, identity.userId, identity.userId, identity.userId);
    } else if (identity.role !== ROLES.ADMIN) {
      // Fail closed: any role that is not one of the three known ones sees nothing, not everything.
      clauses.push('1 = 0');
    }
    if (status) { clauses.push('s.status = ?'); params.push(status); }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.ctx.repo.all<Record<string, any>>(`${SOS_SELECT}${where} ORDER BY s.created_at DESC LIMIT ?`, ...params, Math.min(100, limit));
    return { items: rows.map((row) => this.publicSos(row)), total: rows.length };
  }

  getSos(identity: AuthIdentity, sosId: string): Record<string, unknown> {
    const row = this.ctx.repo.one<Record<string, any>>(`${SOS_SELECT} WHERE s.id = ?`, sosId);
    if (!row) throw notFound('SOS request not found.');
    if (!this.canView(identity, row)) throw notFound('SOS request not found.');
    const timeline = this.ctx.repo.all<Record<string, any>>(
      `SELECT me.action, me.from_status, me.to_status, me.note, me.created_at, u.username AS actorUsername
       FROM mission_events me JOIN users u ON u.id=me.actor_id
       WHERE me.mission_id = ? ORDER BY me.created_at`, String(row.missionId ?? ''));
    return {
      ...this.publicSos(row),
      timeline: timeline.map((event) => ({
        action: String(event.action), fromStatus: String(event.from_status), toStatus: String(event.to_status),
        note: event.note ? String(event.note) : null, createdAt: Number(event.created_at), actorUsername: String(event.actorUsername)
      }))
    };
  }

  cancelSos(identity: AuthIdentity, sosId: string, reasonId: string, detail: string | undefined): Record<string, unknown> {
    const row = this.ctx.repo.one<Record<string, any>>('SELECT * FROM sos_requests WHERE id=?', sosId);
    if (!row) throw notFound('SOS request not found.');
    if (String(row.requester_id) !== identity.userId && identity.role !== ROLES.ADMIN) throw forbidden('Only the requester or an administrator can cancel this request.');
    const reason = this.ctx.repo.one<Record<string, any>>('SELECT * FROM cancellation_reasons WHERE id=?', reasonId);
    if (!reason) throw badRequest('Unknown cancellation reason.', { field: 'reasonId' });
    if (Number(reason.requires_text) && (!detail || detail.trim().length < 10)) throw badRequest('This reason requires a detail of at least 10 characters.', { field: 'detail' });
    const transition = transitionSos(String(row.status), 'cancel', identity.role);
    if (!transition.ok) throw conflict('This request can no longer be cancelled.', { reason: transition.reason });
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      tx.repo.run(
        `UPDATE sos_requests SET status=?, cancellation_reason_id=?, cancellation_detail=?, updated_at=?, completed_at=?
         WHERE id=?`, transition.next, reasonId, detail ?? null, now, now, sosId);
      tx.repo.run('UPDATE missions SET status=?, cancelled_at=?, updated_at=? WHERE sos_id=? AND status<>?',
        MISSION_STATUS.CANCELLED, now, now, sosId, MISSION_STATUS.COMPLETED);
      tx.event(HTTP_EVENTS.SOS_CANCELLED, {
        sosId, status: transition.next, reasonId, cancelledBy: identity.userId, createdAt: now
      }, [`user:${row.requester_id}`, 'role:admin', `sos:${sosId}`, ...(row.assigned_responder_id ? [`user:${row.assigned_responder_id}`] : [])]);
      return { ok: true, sosId, status: transition.next };
    });
  }

  /**
   * Offer-based or direct ("Immediate Dispatch") assignment.
   *
   * Offer mode creates one pending offer per selected responder, gated by each worker's
   * job-type readiness policy (`ready_only` workers must be on standby; `all` workers receive
   * offers regardless). The named worker alone carries `assigned_responder_id` when exactly one
   * responder is selected; multi-recipient offers are identified by the offers table instead.
   *
   * Immediate Dispatch assigns exactly one worker with no acceptance step: the mission is created
   * in ASSIGNED state and the worker drives the state machine from there.
   */
  dispatch(identity: AuthIdentity, sosId: string, input: DispatchInput): Record<string, unknown> {
    if (identity.role !== ROLES.ADMIN) throw forbidden('Administrator permission is required.');
    const sos = this.ctx.repo.one<Record<string, any>>('SELECT * FROM sos_requests WHERE id=?', sosId);
    if (!sos) throw notFound('SOS request not found.');
    const mode = input.mode ?? 'offer';
    const responderIds = [...new Set(input.responderIds)];
    if (mode === 'immediate' && responderIds.length !== 1) {
      throw badRequest('Immediate dispatch assigns exactly one responder; use offer mode for a team.', { field: 'responderIds' });
    }
    const group = this.ctx.repo.one<Record<string, any>>('SELECT * FROM service_groups WHERE id=? AND status=?', input.groupId, 'active');
    if (!group) throw badRequest('Unknown active service group.', { field: 'groupId' });
    const responders = responderIds.map((id) => this.ctx.repo.one<Record<string, any>>(
      `SELECT u.id, u.username, u.ready_for_mission, u.active, u.role, u.job_type_id,
              jt.offer_policy, jt.active AS job_type_active
       FROM users u
       JOIN group_members gm ON gm.user_id = u.id AND gm.group_id = ?
       LEFT JOIN job_types jt ON jt.id = u.job_type_id
       WHERE u.id = ?`, input.groupId, id));
    if (responders.some((responder) => !responder || String(responder.role) !== ROLES.RESPONDER || !Number(responder.active))) {
      throw badRequest('Every responder must be an active member of the selected group.', { field: 'responderIds' });
    }
    const eligible = responders as Array<Record<string, any>>;
    /** Missing or disabled job types fall back to the strictest policy. */
    const policyOf = (row: Record<string, any>): string =>
      row.offer_policy && Number(row.job_type_active) ? String(row.offer_policy) : 'ready_only';
    const blocked = eligible.filter((row) => policyOf(row) === 'ready_only' && !Number(row.ready_for_mission));
    if (blocked.length) {
      throw badRequest('Some responders are not on standby and their job type only receives offers while ready.', {
        field: 'responderIds', userIds: blocked.map((row) => String(row.id))
      });
    }
    const dispatchTransition = transitionSos(String(sos.status), 'dispatch', identity.role);
    if (!dispatchTransition.ok) throw conflict('This request cannot be dispatched.', { reason: dispatchTransition.reason });
    // Immediate dispatch (Option A): the responder is directly ASSIGNED, never "accepting".
    // The SOS stays 'dispatched'; the mission remains ASSIGNED until the worker presses start,
    // which moves both the mission and the SOS to in_progress. No offer row is created.
    const targetSosStatus = dispatchTransition.next;
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const namedOffer = mode === 'offer' && responderIds.length === 1 ? responderIds[0] : null;
      tx.repo.run('UPDATE sos_requests SET status=?, assigned_group_id=?, assigned_responder_id=?, updated_at=? WHERE id=?',
        targetSosStatus, input.groupId, mode === 'immediate' ? responderIds[0] : namedOffer, now, sosId);
      let missionId: string | undefined;
      if (mode === 'offer') {
        for (const responder of eligible) {
          tx.repo.run(
            `INSERT INTO mission_offers(id, sos_id, responder_id, policy, status, created_at) VALUES(?,?,?,?,?,?)`,
            newId('off'), sosId, String(responder.id), policyOf(responder), 'pending', now);
        }
      } else {
        missionId = newId('mis');
        tx.repo.run(`INSERT INTO missions(id,sos_id,responder_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)`,
          missionId, sosId, responderIds[0], MISSION_STATUS.ASSIGNED, now, now);
        tx.repo.run(`INSERT INTO mission_events(mission_id,actor_id,action,from_status,to_status,note,created_at) VALUES(?,?,?,?,?,?,?)`,
          missionId, identity.userId, 'assign', '', MISSION_STATUS.ASSIGNED, 'Immediate dispatch', now);
      }
      tx.event(HTTP_EVENTS.SOS_DISPATCHED, {
        sosId, status: targetSosStatus, groupId: input.groupId, responderIds, dispatchedBy: identity.userId, mode, createdAt: now
      }, [`user:${sos.requester_id}`, 'role:admin', `sos:${sosId}`, ...responderIds.map((id) => `user:${id}`)]);
      if (missionId) {
        tx.event(HTTP_EVENTS.MISSION_UPDATED, { missionId, sosId, status: MISSION_STATUS.ASSIGNED, sosStatus: targetSosStatus, action: 'assign', actorId: identity.userId, createdAt: now },
          [`user:${sos.requester_id}`, `user:${responderIds[0]}`, 'role:admin', `mission:${missionId}`, `sos:${sosId}`]);
      }
      return {
        ok: true, sosId, status: targetSosStatus, groupId: input.groupId, responderIds, mode,
        ...(missionId ? { missionId, missionStatus: MISSION_STATUS.ASSIGNED } : {})
      };
    });
  }

  acceptSos(identity: AuthIdentity, sosId: string): Record<string, unknown> {
    if (identity.role !== ROLES.RESPONDER) throw forbidden('Responder permission is required.');
    const sos = this.ctx.repo.one<Record<string, any>>('SELECT * FROM sos_requests WHERE id=?', sosId);
    if (!sos) throw notFound('SOS request not found.');
    const offers = this.ctx.repo.all<Record<string, any>>('SELECT * FROM mission_offers WHERE sos_id=?', sosId);
    if (offers.length) {
      // The offer set is authoritative: only an addressed worker with a pending offer may accept.
      const mine = offers.find((offer) => String(offer.responder_id) === identity.userId);
      if (!mine) throw forbidden('This offer is not addressed to you.');
      if (String(mine.status) !== 'pending') throw conflict('This offer is no longer pending.');
    } else {
      // Legacy rows dispatched before the offers table: fall back to the named/group rule.
      const named = sos.assigned_responder_id ? String(sos.assigned_responder_id) : null;
      const allowed = named
        ? named === identity.userId
        : Boolean(sos.assigned_group_id && this.ctx.repo.one('SELECT user_id FROM group_members WHERE group_id=? AND user_id=?', String(sos.assigned_group_id), identity.userId));
      if (!allowed) throw forbidden('This responder was not assigned to the request.');
    }
    // Server-enforced readiness policy: ready_only may never accept while off standby; under
    // policy `all`, accepting flips readiness to ready in the same transaction.
    const me = this.ctx.repo.one<Record<string, any>>(
      `SELECT u.ready_for_mission, jt.offer_policy, jt.active AS job_type_active
       FROM users u LEFT JOIN job_types jt ON jt.id = u.job_type_id WHERE u.id=?`, identity.userId);
    const policy = me?.offer_policy && Number(me.job_type_active) ? String(me.offer_policy) : 'ready_only';
    const ready = Boolean(Number(me?.ready_for_mission ?? 0));
    if (policy === 'ready_only' && !ready) {
      throw conflict('Your job type may only receive missions while you are on standby.');
    }
    const autoReady = policy === 'all' && !ready;
    const transition = transitionSos(String(sos.status), 'accept', identity.role);
    if (!transition.ok) throw conflict('This request cannot be accepted.', { reason: transition.reason });
    const missionId = newId('mis');
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      // Re-checked inside the transaction; missions.sos_id UNIQUE is the hard invariant.
      const existing = tx.repo.one('SELECT id FROM missions WHERE sos_id=?', sosId);
      if (existing) throw conflict('This request already has a mission.');
      tx.repo.run('UPDATE sos_requests SET status=?, assigned_responder_id=?, updated_at=? WHERE id=?',
        transition.next, identity.userId, now, sosId);
      if (autoReady) {
        tx.repo.run('UPDATE users SET ready_for_mission=1, updated_at=? WHERE id=?', now, identity.userId);
        tx.event(HTTP_EVENTS.PRESENCE_CHANGED, { userId: identity.userId, readyForMission: true }, [`user:${identity.userId}`, 'role:admin']);
      }
      tx.repo.run(
        `INSERT INTO missions(id,sos_id,responder_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)`,
        missionId, sosId, identity.userId, MISSION_STATUS.ON_THE_WAY, now, now);
      tx.repo.run(
        `INSERT INTO mission_events(mission_id,actor_id,action,from_status,to_status,note,created_at) VALUES(?,?,?,?,?,?,?)`,
        missionId, identity.userId, 'accept', MISSION_STATUS.PENDING, MISSION_STATUS.ON_THE_WAY, null, now);
      if (offers.length) {
        tx.repo.run(`UPDATE mission_offers SET status='accepted', responded_at=? WHERE sos_id=? AND responder_id=?`, now, sosId, identity.userId);
        tx.repo.run(`UPDATE mission_offers SET status='cancelled', responded_at=? WHERE sos_id=? AND status='pending' AND responder_id<>?`, now, sosId, identity.userId);
      }
      tx.event(HTTP_EVENTS.SOS_ACCEPTED, {
        sosId, missionId, status: transition.next, responderId: identity.userId, createdAt: now
      }, [`user:${sos.requester_id}`, `user:${identity.userId}`, 'role:admin', `sos:${sosId}`, `mission:${missionId}`]);
      return { ok: true, sosId, missionId, status: transition.next, missionStatus: MISSION_STATUS.ON_THE_WAY, readyForMission: autoReady ? true : undefined };
    });
  }

  /** Declines the caller's own pending offer. */
  declineOffer(identity: AuthIdentity, sosId: string): Record<string, unknown> {
    if (identity.role !== ROLES.RESPONDER) throw forbidden('Responder permission is required.');
    const sos = this.ctx.repo.one('SELECT id FROM sos_requests WHERE id=?', sosId);
    if (!sos) throw notFound('SOS request not found.');
    const changed = this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const result = tx.repo.run(
        `UPDATE mission_offers SET status='declined', responded_at=? WHERE sos_id=? AND responder_id=? AND status='pending'`,
        now, sosId, identity.userId);
      return result.changes;
    });
    if (!changed) throw notFound('No pending offer addressed to you.');
    return { ok: true, sosId };
  }

  /** Pending offers addressed to the caller, projected like the SOS list. */
  listOffers(identity: AuthIdentity, limit: number): Record<string, unknown> {
    if (identity.role !== ROLES.RESPONDER) return { items: [], total: 0 };
    const rows = this.ctx.repo.all<Record<string, any>>(
      `${SOS_SELECT} JOIN mission_offers o ON o.sos_id = s.id
       WHERE o.responder_id = ? AND o.status = 'pending' AND s.status = ?
       ORDER BY s.created_at DESC LIMIT ?`, identity.userId, SOS_STATUS.DISPATCHED, Math.min(50, limit));
    return { items: rows.map((row) => this.publicSos(row)), total: rows.length };
  }

  /** Administrator view of offers (all statuses) for dispatch-board monitoring. */
  listAllOffers(status: string | undefined, limit: number): Record<string, unknown> {
    const filter = status && ['pending', 'accepted', 'declined', 'expired', 'cancelled'].includes(status) ? status : null;
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT o.id, o.sos_id AS sosId, o.responder_id AS responderId, u.username AS responderUsername,
              o.policy, o.status, o.created_at AS createdAt, o.responded_at AS respondedAt,
              i.label AS incidentLabel, s.severity, s.status AS sosStatus
       FROM mission_offers o
       JOIN users u ON u.id = o.responder_id
       JOIN sos_requests s ON s.id = o.sos_id
       JOIN incident_types i ON i.id = s.incident_type_id
       ${filter ? 'WHERE o.status = ?' : ''}
       ORDER BY o.created_at DESC LIMIT ?`, ...(filter ? [filter] : []), Math.min(200, limit));
    return { items: rows, total: rows.length };
  }

  /** Nearest responders to the SOS identified by `:id` (the record is the source of truth). */
  nearestForSos(sosId: string, limit: number): Record<string, unknown> {
    const sos = this.ctx.repo.one<Record<string, any>>('SELECT latitude, longitude, incident_type_id FROM sos_requests WHERE id=?', sosId);
    if (!sos) throw notFound('SOS request not found.');
    return this.nearestResponders({ latitude: Number(sos.latitude), longitude: Number(sos.longitude) },
      limit, String(sos.incident_type_id));
  }

  progressMission(identity: AuthIdentity, missionId: string, action: string, note: string | undefined): Record<string, unknown> {
    const mission = this.ctx.repo.one<Record<string, any>>(
      `SELECT m.*, s.requester_id, s.status AS sosStatus, s.assigned_responder_id FROM missions m
       JOIN sos_requests s ON s.id=m.sos_id WHERE m.id=?`, missionId);
    if (!mission) throw notFound('Mission not found.');
    if (String(mission.responder_id) !== identity.userId && identity.role !== ROLES.ADMIN) throw forbidden('Only the assigned responder can update this mission.');
    const transition = transitionMission(String(mission.status), action);
    if (!transition.ok) throw conflict('This mission transition is not allowed.', { reason: transition.reason });
    const sosAction = action === 'arrive' ? null : action;
    const sosTransition = sosAction ? transitionSos(String(mission.sosStatus), sosAction, identity.role) : null;
    if (sosTransition && !sosTransition.ok) throw conflict('The SOS state cannot follow this mission transition.', { reason: sosTransition.reason });
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const completedAt = transition.next === MISSION_STATUS.COMPLETED ? now : null;
      const cancelledAt = transition.next === MISSION_STATUS.CANCELLED ? now : null;
      tx.repo.run('UPDATE missions SET status=?, updated_at=?, completed_at=COALESCE(?,completed_at), cancelled_at=COALESCE(?,cancelled_at) WHERE id=?',
        transition.next, now, completedAt, cancelledAt, missionId);
      if (sosTransition?.next) {
        tx.repo.run('UPDATE sos_requests SET status=?, updated_at=?, completed_at=CASE WHEN ?=? THEN ? ELSE completed_at END WHERE id=?',
          sosTransition.next, now, sosTransition.next, SOS_STATUS.COMPLETED, completedAt, String(mission.sos_id));
      }
      tx.repo.run(
        `INSERT INTO mission_events(mission_id,actor_id,action,from_status,to_status,note,created_at) VALUES(?,?,?,?,?,?,?)`,
        missionId, identity.userId, action, String(mission.status), String(transition.next), note ?? null, now);
      tx.event(HTTP_EVENTS.MISSION_UPDATED, {
        missionId, sosId: String(mission.sos_id), status: transition.next, sosStatus: sosTransition?.next ?? String(mission.sosStatus),
        action, actorId: identity.userId, createdAt: now
      }, [`user:${mission.requester_id}`, `user:${mission.responder_id}`, 'role:admin', `mission:${missionId}`, `sos:${mission.sos_id}`]);
      return { ok: true, missionId, status: transition.next, sosStatus: sosTransition?.next ?? String(mission.sosStatus) };
    });
  }

  rateMission(identity: AuthIdentity, missionId: string, rating: number, note: string | undefined): Record<string, unknown> {
    const mission = this.ctx.repo.one<Record<string, any>>(
      `SELECT m.*, s.requester_id FROM missions m JOIN sos_requests s ON s.id=m.sos_id WHERE m.id=?`, missionId);
    if (!mission) throw notFound('Mission not found.');
    if (String(mission.requester_id) !== identity.userId) throw forbidden('Only the requester can rate this mission.');
    if (String(mission.status) !== MISSION_STATUS.COMPLETED) throw conflict('Only a completed mission can be rated.');
    if (Number(mission.rating ?? 0)) throw conflict('This mission is already rated.');
    return this.ctx.uow.commit((tx) => {
      tx.repo.run('UPDATE missions SET rating=?, rating_note=?, updated_at=? WHERE id=?', rating, note ?? null, this.ctx.clock(), missionId);
      tx.event(HTTP_EVENTS.MISSION_UPDATED, { missionId, rating, kind: 'rated' },
        [`user:${mission.requester_id}`, `user:${mission.responder_id}`, 'role:admin', `mission:${missionId}`]);
      return { ok: true, missionId, rating };
    });
  }

  listMissions(identity: AuthIdentity, limit: number): Record<string, unknown> {
    const rows = identity.role === ROLES.ADMIN
      ? this.ctx.repo.all<Record<string, any>>(`${SOS_SELECT} WHERE m.id IS NOT NULL ORDER BY s.created_at DESC LIMIT ?`, Math.min(100, limit))
      : this.ctx.repo.all<Record<string, any>>(`${SOS_SELECT} WHERE m.id IS NOT NULL AND (m.responder_id=? OR s.requester_id=?) ORDER BY s.created_at DESC LIMIT ?`,
        identity.userId, identity.userId, Math.min(100, limit));
    return { items: rows.map((row) => this.publicMission(row)), total: rows.length };
  }

  nearestResponders(point: Point, limit: number, incidentTypeId?: string): Record<string, unknown> {
    const rows = incidentTypeId
      ? this.ctx.repo.all<Record<string, any>>(
        `SELECT DISTINCT u.id, u.username, u.average_rating, u.ready_for_mission FROM users u
         JOIN group_members gm ON gm.user_id=u.id JOIN group_incident_types git ON git.group_id=gm.group_id
         WHERE u.role=? AND u.active=1 AND git.incident_type_id=?`, ROLES.RESPONDER, incidentTypeId)
      : this.ctx.repo.all<Record<string, any>>(
        `SELECT id, username, average_rating, ready_for_mission FROM users WHERE role=? AND active=1`, ROLES.RESPONDER);
    const items = rows.map((row) => {
      const userId = String(row.id);
      const fix = this.ctx.services.location.latestFix(userId) ?? this.lastStoredFix(userId);
      return {
        id: userId,
        username: String(row.username),
        averageRating: Number(row.average_rating),
        readyForMission: Boolean(row.ready_for_mission),
        latitude: fix?.latitude ?? null,
        longitude: fix?.longitude ?? null,
        distanceMeters: fix ? Math.round(haversineMeters(point, fix)) : null,
        recordedAt: fix?.recordedAt ?? null
      };
    }).sort((a, b) => (a.distanceMeters ?? Number.MAX_SAFE_INTEGER) - (b.distanceMeters ?? Number.MAX_SAFE_INTEGER));
    return { items: items.slice(0, Math.min(20, limit)), total: items.length };
  }

  private lastStoredFix(userId: string): Point & { recordedAt: number } | null {
    const row = this.ctx.repo.one<Record<string, any>>(
      'SELECT latitude,longitude,recorded_at FROM location_points WHERE user_id=? ORDER BY recorded_at DESC LIMIT 1', userId);
    return row ? { latitude: Number(row.latitude), longitude: Number(row.longitude), recordedAt: Number(row.recorded_at) } : null;
  }

  private canView(identity: AuthIdentity, row: Record<string, any>): boolean {
    if (identity.role === ROLES.ADMIN) return true;
    if (String(row.requester_id) === identity.userId) return true;
    if (String(row.assigned_responder_id ?? '') === identity.userId) return true;
    if (String(row.missionResponderId ?? '') === identity.userId) return true;
    if (identity.role === ROLES.RESPONDER) {
      if (this.ctx.repo.one('SELECT 1 FROM mission_offers WHERE sos_id = ? AND responder_id = ?', String(row.id), identity.userId)) return true;
      // Legacy rows without offers keep the group-membership rule.
      if (row.assigned_group_id && !this.ctx.repo.one('SELECT 1 FROM mission_offers WHERE sos_id = ?', String(row.id))) {
        return Boolean(this.ctx.repo.one('SELECT user_id FROM group_members WHERE group_id = ? AND user_id = ?',
          String(row.assigned_group_id), identity.userId));
      }
    }
    return false;
  }

  private publicSos(row: Record<string, any>): Record<string, unknown> {
    const id = String(row.id ?? row.sosId);
    return {
      id, sosId: id, trackingCode: Number(row.trackingCode ?? trackingCode(id)),
      requesterId: String(row.requester_id ?? row.requesterId),
      requesterUsername: row.requesterUsername ? String(row.requesterUsername) : null,
      incidentTypeId: String(row.incident_type_id ?? row.incidentTypeId),
      incidentLabel: row.incidentLabel ? String(row.incidentLabel) : null,
      incidentIcon: row.incidentIcon ? String(row.incidentIcon) : null,
      incidentColor: row.incidentColor ? String(row.incidentColor) : null,
      severity: String(row.severity), description: String(row.description),
      photoDataUrl: row.photo_data_url ? String(row.photo_data_url) : null,
      latitude: Number(row.latitude), longitude: Number(row.longitude), accuracy: Number(row.accuracy),
      isManual: Boolean(row.is_manual), status: String(row.status),
      cancellationReasonId: row.cancellation_reason_id ? String(row.cancellation_reason_id) : null,
      cancellationDetail: row.cancellation_detail ? String(row.cancellation_detail) : null,
      assignedGroupId: row.assigned_group_id ? String(row.assigned_group_id) : null,
      assignedResponderId: row.assigned_responder_id ? String(row.assigned_responder_id) : null,
      createdAt: Number(row.created_at ?? row.createdAt), updatedAt: Number(row.updated_at ?? row.updatedAt),
      expiresAt: Number(row.expires_at),
      completedAt: row.completed_at ? Number(row.completed_at) : null,
      mission: row.missionId ? {
        id: String(row.missionId), status: String(row.missionStatus), responderId: String(row.missionResponderId), rating: row.missionRating === null ? null : Number(row.missionRating),
        ratingNote: row.missionRatingNote ?? null
      } : null
    };
  }

  private publicMission(row: Record<string, any>): Record<string, unknown> {
    return {
      id: String(row.missionId), sosId: String(row.id), trackingCode: trackingCode(String(row.id)),
      status: String(row.missionStatus), responderId: String(row.missionResponderId),
      requesterId: String(row.requester_id), incidentLabel: String(row.incidentLabel),
      rating: row.missionRating === null || row.missionRating === undefined ? null : Number(row.missionRating),
      ratingNote: row.missionRatingNote ?? null,
      createdAt: Number(row.created_at), updatedAt: Number(row.updated_at)
    };
  }
}
