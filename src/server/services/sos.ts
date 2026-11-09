import type { AuthIdentity } from '../core/router.ts';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.ts';
import { newId, sha256 } from '../core/crypto.ts';
import { haversineMeters, type Point } from '../domain/geo.ts';
import { transitionMission, transitionSos } from '../domain/state.ts';
import type { SqlValue } from '../db/repository.ts';
import { HTTP_EVENTS, MISSION_STATUS, ROLES, SOS_STATUS } from '../../shared/protocol.ts';
import type { AppContext } from './context.ts';

export interface SosInput {
  incidentTypeId: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  isManual: boolean;
  photoDataUrl?: string;
}

export interface DispatchInput { groupId: string; responderIds: string[] }

const SOS_SELECT = `
  SELECT s.*, i.label AS incidentLabel, i.icon AS incidentIcon, i.color AS incidentColor,
    m.id AS missionId, m.status AS missionStatus, m.responder_id AS missionResponderId, m.rating AS missionRating
  FROM sos_requests s
  JOIN incident_types i ON i.id = s.incident_type_id
  LEFT JOIN missions m ON m.sos_id = s.id`;

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
      clauses.push('(s.requester_id = ? OR s.assigned_responder_id = ? OR m.responder_id = ?)');
      params.push(identity.userId, identity.userId, identity.userId);
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

  dispatch(identity: AuthIdentity, sosId: string, input: DispatchInput): Record<string, unknown> {
    if (identity.role !== ROLES.ADMIN) throw forbidden('Administrator permission is required.');
    const sos = this.ctx.repo.one<Record<string, any>>('SELECT * FROM sos_requests WHERE id=?', sosId);
    if (!sos) throw notFound('SOS request not found.');
    const group = this.ctx.repo.one<Record<string, any>>('SELECT * FROM service_groups WHERE id=? AND status=?', input.groupId, 'active');
    if (!group) throw badRequest('Unknown active service group.', { field: 'groupId' });
    const responderIds = [...new Set(input.responderIds)];
    const responders = responderIds.map((id) => this.ctx.repo.one<Record<string, any>>(
      `SELECT u.id, u.username, u.ready_for_mission FROM users u JOIN group_members gm ON gm.user_id=u.id
       WHERE u.id=? AND u.role=? AND u.active=1 AND gm.group_id=?`, id, ROLES.RESPONDER, input.groupId));
    if (responders.some((responder) => !responder)) throw badRequest('Every responder must be an active member of the selected group.', { field: 'responderIds' });
    const transition = transitionSos(String(sos.status), 'dispatch', identity.role);
    if (!transition.ok) throw conflict('This request cannot be dispatched.', { reason: transition.reason });
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      tx.repo.run('UPDATE sos_requests SET status=?, assigned_group_id=?, assigned_responder_id=?, updated_at=? WHERE id=?',
        transition.next, input.groupId, responderIds[0] ?? null, now, sosId);
      tx.event(HTTP_EVENTS.SOS_DISPATCHED, {
        sosId, status: transition.next, groupId: input.groupId, responderIds, dispatchedBy: identity.userId, createdAt: now
      }, [`user:${sos.requester_id}`, 'role:admin', `sos:${sosId}`, ...responderIds.map((id) => `user:${id}`)]);
      return { ok: true, sosId, status: transition.next, groupId: input.groupId, responderIds };
    });
  }

  acceptSos(identity: AuthIdentity, sosId: string): Record<string, unknown> {
    if (identity.role !== ROLES.RESPONDER) throw forbidden('Responder permission is required.');
    const sos = this.ctx.repo.one<Record<string, any>>('SELECT * FROM sos_requests WHERE id=?', sosId);
    if (!sos) throw notFound('SOS request not found.');
    const existing = this.ctx.repo.one('SELECT id FROM missions WHERE sos_id=?', sosId);
    if (existing) throw conflict('This request already has a mission.');
    const assigned = !sos.assigned_responder_id || String(sos.assigned_responder_id) === identity.userId ||
      this.ctx.repo.one('SELECT user_id FROM group_members WHERE group_id=? AND user_id=?', String(sos.assigned_group_id), identity.userId);
    if (!assigned) throw forbidden('This responder was not assigned to the request.');
    const transition = transitionSos(String(sos.status), 'accept', identity.role);
    if (!transition.ok) throw conflict('This request cannot be accepted.', { reason: transition.reason });
    const missionId = newId('mis');
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      tx.repo.run('UPDATE sos_requests SET status=?, assigned_responder_id=?, updated_at=? WHERE id=?',
        transition.next, identity.userId, now, sosId);
      tx.repo.run(
        `INSERT INTO missions(id,sos_id,responder_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)`,
        missionId, sosId, identity.userId, MISSION_STATUS.ON_THE_WAY, now, now);
      tx.repo.run(
        `INSERT INTO mission_events(mission_id,actor_id,action,from_status,to_status,note,created_at) VALUES(?,?,?,?,?,?,?)`,
        missionId, identity.userId, 'accept', MISSION_STATUS.PENDING, MISSION_STATUS.ON_THE_WAY, null, now);
      tx.event(HTTP_EVENTS.SOS_ACCEPTED, {
        sosId, missionId, status: transition.next, responderId: identity.userId, createdAt: now
      }, [`user:${sos.requester_id}`, `user:${identity.userId}`, 'role:admin', `sos:${sosId}`, `mission:${missionId}`]);
      return { ok: true, sosId, missionId, status: transition.next, missionStatus: MISSION_STATUS.ON_THE_WAY };
    });
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
    return identity.role === ROLES.ADMIN ||
      String(row.requester_id) === identity.userId ||
      String(row.assigned_responder_id ?? '') === identity.userId ||
      String(row.missionResponderId ?? '') === identity.userId;
  }

  private publicSos(row: Record<string, any>): Record<string, unknown> {
    const id = String(row.id ?? row.sosId);
    return {
      id, sosId: id, trackingCode: Number(row.trackingCode ?? trackingCode(id)),
      requesterId: String(row.requester_id ?? row.requesterId),
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
        id: String(row.missionId), status: String(row.missionStatus), responderId: String(row.missionResponderId), rating: row.missionRating === null ? null : Number(row.missionRating)
      } : null
    };
  }

  private publicMission(row: Record<string, any>): Record<string, unknown> {
    return {
      id: String(row.missionId), sosId: String(row.id), trackingCode: trackingCode(String(row.id)),
      status: String(row.missionStatus), responderId: String(row.missionResponderId),
      requesterId: String(row.requester_id), incidentLabel: String(row.incidentLabel),
      rating: row.missionRating === null || row.missionRating === undefined ? null : Number(row.missionRating),
      createdAt: Number(row.created_at), updatedAt: Number(row.updated_at)
    };
  }
}
