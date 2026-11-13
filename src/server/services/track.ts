import type { AuthIdentity } from '../core/router.ts';
import { badRequest, notFound } from '../core/errors.ts';
import { haversineMeters } from '../../shared/geo.ts';
import { MISSION_STATUS, ROLES, TRIP_STATUS } from '../../shared/protocol.ts';
import { parseScope, SHARE_SCOPE_DETAILS, type ShareScopeDetail } from './location.ts';
import type { LiveFixInput, TrackRecordContext } from './location.ts';
import type { AppContext } from './context.ts';

export type TrackContextType = 'trip' | 'mission';
export type TrackAvailability = 'available' | 'expired' | 'none';

/** Mission statuses in which the assigned responder is on route and may record. */
const MISSION_RECORDABLE = new Set<string>([
  MISSION_STATUS.ASSIGNED,
  MISSION_STATUS.ON_THE_WAY,
  MISSION_STATUS.ARRIVED,
  MISSION_STATUS.IN_PROGRESS
]);
/** Segments implying a speed above this are rejected as GPS teleports, never summed. */
const MAX_SEGMENT_SPEED_MPS = 83;
/** Fixes with worse horizontal accuracy than this are never persisted as track points. */
const MAX_TRACK_ACCURACY_M = 100;
/** Hard cap on points returned by one track read; larger windows are rejected, not truncated. */
const MAX_POINTS_OUT = 5000;
/** Track windows may not exceed 31 days; anything bigger is a caller bug, surfaced loudly. */
const MAX_WINDOW_MS = 31 * 86_400_000;

interface SummaryProjection {
  userId: string;
  username: string;
  distanceM: number | null;
  durationMs: number | null;
  pointCount: number;
  firstPointAt: number;
  lastPointAt: number;
  quality: string;
}

interface ShareGrant {
  id: string;
  owner_id: string;
  scope: unknown;
  expires_at: number | null;
}

/**
 * Stage D — trip and mission track recording. Privacy model: opt-in per account (users.record_track,
 * default off), an explicit per-context consent decision (track_consents), active-context gating,
 * member/participant replay, share-scoped replay for history grantees, audit-logged admin reads.
 * Raw points are the only data ever purged by retention; trips, missions and persisted summaries
 * (track_summaries) are kept, so distance/duration survive the 180-day point horizon. The purge is
 * fail-closed: a context whose summaries cannot be persisted is skipped, never silently emptied.
 */
export class TrackService {
  constructor(private readonly ctx: AppContext) {}

  // ---------- lookups ----------

  private tripRow(tripId: string): Record<string, any> | undefined {
    return this.ctx.repo.one<Record<string, any>>(
      'SELECT id, owner_id, status, created_at, started_at, completed_at FROM trips WHERE id=?', tripId);
  }

  private tripMembership(tripId: string, userId: string): Record<string, any> | undefined {
    return this.ctx.repo.one<Record<string, any>>(
      'SELECT role FROM group_trips WHERE trip_id=? AND user_id=?', tripId, userId);
  }

  private missionRow(missionId: string): Record<string, any> | undefined {
    return this.ctx.repo.one<Record<string, any>>(
      `SELECT m.id, m.responder_id, m.status, m.created_at, m.completed_at, m.cancelled_at, s.requester_id
       FROM missions m JOIN sos_requests s ON s.id = m.sos_id WHERE m.id=?`, missionId);
  }

  private teamMembership(missionId: string, userId: string): Record<string, any> | undefined {
    return this.ctx.repo.one<Record<string, any>>(
      "SELECT 1 AS role FROM mission_members WHERE mission_id=? AND user_id=? AND assignment_status='active'",
      missionId, userId);
  }

  private consentDecision(type: TrackContextType, contextId: string, userId: string): 'accepted' | 'declined' | null {
    const row = this.ctx.repo.one<{ decision: string }>(
      'SELECT decision FROM track_consents WHERE context_type=? AND context_id=? AND user_id=?',
      type, contextId, userId);
    return row ? (String(row.decision) === 'accepted' ? 'accepted' : 'declined') : null;
  }

  /** Caller-facing consent state, embedded in trip/mission projections to drive the prompt. */
  callerConsent(identity: AuthIdentity, type: TrackContextType, contextId: string): 'accepted' | 'declined' | null {
    return this.consentDecision(type, contextId, identity.userId);
  }

  // ---------- recording ----------

  /**
   * Records one fix against an active, consented context. Best-effort by contract: returns false
   * (never throws) whenever the caller or context is not eligible, so the live socket path is
   * unaffected. Callers may still try/catch defensively around this method.
   */
  recordPoint(identity: AuthIdentity, fix: LiveFixInput & { recordedAt?: number }, context: TrackRecordContext): boolean {
    if (!this.ctx.config.tripTrackEnabled) return false;
    const user = this.ctx.repo.one<Record<string, any>>(
      'SELECT record_track FROM users WHERE id=?', identity.userId);
    if (!user || !Number(user.record_track)) return false;
    if (!Number.isFinite(fix.accuracy) || fix.accuracy < 0 || fix.accuracy > MAX_TRACK_ACCURACY_M) return false;
    const type: TrackContextType = context.type;
    if (this.consentDecision(type, context.id, identity.userId) !== 'accepted') return false;
    if (type === 'trip') {
      const trip = this.tripRow(context.id);
      if (!trip || String(trip.status) !== TRIP_STATUS.ACTIVE) return false;
      if (!this.tripMembership(context.id, identity.userId)) return false;
    } else {
      const mission = this.missionRow(context.id);
      if (!mission) return false;
      const isAssigned = String(mission.responder_id) === identity.userId;
      if (!isAssigned && !this.teamMembership(context.id, identity.userId)) return false;
      if (!MISSION_RECORDABLE.has(String(mission.status))) return false;
    }
    const now = this.ctx.clock();
    const recordedAt = Math.min(fix.recordedAt ?? now, now + 5_000);
    this.ctx.repo.run(
      `INSERT INTO track_points(context_type,context_id,user_id,latitude,longitude,accuracy,heading,speed,recorded_at,created_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      type, context.id, identity.userId, fix.latitude, fix.longitude, fix.accuracy,
      fix.heading ?? null, fix.speed ?? null, recordedAt, now);
    return true;
  }

  /** Records the caller's per-context consent. Recording requires an explicit `accepted`. */
  setConsent(identity: AuthIdentity, type: TrackContextType, contextId: string, decision: 'accepted' | 'declined'): Record<string, unknown> {
    this.requireContextParticipant(identity, type, contextId);
    const now = this.ctx.clock();
    this.ctx.uow.commit((tx) => {
      tx.repo.run(
        `INSERT INTO track_consents(context_type,context_id,user_id,decision,decided_at) VALUES(?,?,?,?,?)
         ON CONFLICT(context_type,context_id,user_id) DO UPDATE SET decision=excluded.decision, decided_at=excluded.decided_at`,
        type, contextId, identity.userId, decision, now);
      tx.repo.run(
        'INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
        identity.userId, 'track.consent', `${type}:${contextId}`, identity.ip,
        JSON.stringify({ contextType: type, contextId, decision }), now);
    });
    return { ok: true, contextType: type, contextId, decision };
  }

  /** Consent is personal to the recording party; a non-participant cannot consent. */
  private requireContextParticipant(identity: AuthIdentity, type: TrackContextType, contextId: string): void {
    if (type === 'trip') {
      const trip = this.tripRow(contextId);
      if (!trip || !this.tripMembership(contextId, identity.userId)) throw notFound('Trip not found.');
      return;
    }
    const mission = this.missionRow(contextId);
    if (!mission) throw notFound('Mission not found.');
    const isAssigned = String(mission.responder_id) === identity.userId;
    if (!isAssigned && !this.teamMembership(contextId, identity.userId)) throw notFound('Mission not found.');
  }

  // ---------- summaries and availability ----------

  /**
   * Computes and persists the per-user summary for a context. HONEST BY CONSTRUCTION: fewer than
   * two usable points or an entirely teleporting trace stores `insufficient_data` with NULL
   * distance/duration — never an estimate. Idempotent (upsert), so it is safe to call on every
   * terminal transition and again before any purge.
   */
  ensureSummary(type: TrackContextType, contextId: string, userId: string): Record<string, unknown> | null {
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT latitude, longitude, recorded_at FROM track_points
       WHERE context_type=? AND context_id=? AND user_id=? ORDER BY recorded_at ASC, id ASC`,
      type, contextId, userId);
    if (!rows.length) return null;
    const first = Number(rows[0].recorded_at);
    const last = Number(rows[rows.length - 1].recorded_at);
    let distance = 0;
    let validSegments = 0;
    for (let index = 1; index < rows.length; index += 1) {
      const a = rows[index - 1];
      const b = rows[index];
      const dt = Number(b.recorded_at) - Number(a.recorded_at);
      if (!(dt > 0)) continue;
      const d = haversineMeters({ latitude: Number(a.latitude), longitude: Number(a.longitude) },
        { latitude: Number(b.latitude), longitude: Number(b.longitude) });
      if (d / (dt / 1000) > MAX_SEGMENT_SPEED_MPS) continue;
      distance += d;
      validSegments += 1;
    }
    const reliable = rows.length >= 2 && validSegments > 0;
    const quality = reliable ? 'ok' : 'insufficient_data';
    const now = this.ctx.clock();
    this.ctx.repo.run(
      `INSERT INTO track_summaries(context_type,context_id,user_id,distance_m,duration_ms,point_count,first_point_at,last_point_at,quality,computed_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(context_type,context_id,user_id) DO UPDATE SET
         distance_m=excluded.distance_m, duration_ms=excluded.duration_ms, point_count=excluded.point_count,
         first_point_at=excluded.first_point_at, last_point_at=excluded.last_point_at,
         quality=excluded.quality, computed_at=excluded.computed_at`,
      type, contextId, userId, reliable ? distance : null, reliable ? last - first : null,
      rows.length, first, last, quality, now);
    return {
      userId, contextType: type, contextId,
      distanceM: reliable ? distance : null,
      durationMs: reliable ? last - first : null,
      pointCount: rows.length, firstPointAt: first, lastPointAt: last, quality
    };
  }

  /** Computes summaries for every user present in the context; invoked on terminal transitions. */
  finalizeContext(type: TrackContextType, contextId: string): { finalized: number } {
    const users = this.ctx.repo.all<{ user_id: string }>(
      'SELECT DISTINCT user_id FROM track_points WHERE context_type=? AND context_id=?', type, contextId);
    let finalized = 0;
    for (const row of users) {
      this.ensureSummary(type, contextId, String(row.user_id));
      finalized += 1;
    }
    return { finalized };
  }

  /** Availability for one context (context-level, used by projections and the replay affordance). */
  trackStatus(type: TrackContextType, contextId: string): TrackAvailability {
    const point = this.ctx.repo.one('SELECT 1 AS x FROM track_points WHERE context_type=? AND context_id=? LIMIT 1', type, contextId);
    if (point) return 'available';
    const summary = this.ctx.repo.one('SELECT 1 AS x FROM track_summaries WHERE context_type=? AND context_id=? LIMIT 1', type, contextId);
    return summary ? 'expired' : 'none';
  }

  /** Batch availability for list projections: one point query and one summary query for all ids. */
  statusesFor(type: TrackContextType, ids: string[]): Map<string, TrackAvailability> {
    const statuses = new Map<string, TrackAvailability>();
    if (!ids.length) return statuses;
    const placeholders = ids.map(() => '?').join(',');
    const pointRows = this.ctx.repo.all<{ context_id: string }>(
      `SELECT DISTINCT context_id FROM track_points WHERE context_type=? AND context_id IN (${placeholders})`, type, ...ids);
    const summaryRows = this.ctx.repo.all<{ context_id: string }>(
      `SELECT DISTINCT context_id FROM track_summaries WHERE context_type=? AND context_id IN (${placeholders})`, type, ...ids);
    const withPoints = new Set(pointRows.map((row) => String(row.context_id)));
    const withSummaries = new Set(summaryRows.map((row) => String(row.context_id)));
    for (const id of ids) {
      statuses.set(id, withPoints.has(id) ? 'available' : withSummaries.has(id) ? 'expired' : 'none');
    }
    return statuses;
  }

  // ---------- reads ----------

  private contextBounds(type: TrackContextType, contextId: string): { from: number; to: number } {
    const now = this.ctx.clock();
    if (type === 'trip') {
      const trip = this.tripRow(contextId);
      if (!trip) throw notFound('Trip not found.');
      const from = Number(trip.started_at ?? trip.created_at);
      const to = trip.completed_at === null || trip.completed_at === undefined ? now : Number(trip.completed_at);
      // Keep the window non-empty even when start and now share a millisecond.
      return { from, to: Math.max(to, from + 1) };
    }
    const mission = this.missionRow(contextId);
    if (!mission) throw notFound('Mission not found.');
    const from = Number(mission.created_at);
    const end = mission.completed_at ?? mission.cancelled_at;
    return { from, to: end === null || end === undefined ? Math.max(now, from + 1) : Math.max(Number(end), from + 1) };
  }

  private isParticipant(identity: AuthIdentity, type: TrackContextType, contextId: string, mission?: Record<string, any>): boolean {
    if (type === 'trip') return Boolean(this.tripMembership(contextId, identity.userId));
    const row = mission ?? this.missionRow(contextId);
    if (!row) return false;
    if (String(row.responder_id) === identity.userId) return true;
    if (String(row.requester_id) === identity.userId) return true;
    return Boolean(this.teamMembership(contextId, identity.userId));
  }

  private findCoveringGrant(recipientId: string, participantIds: string[], from: number, to: number): ShareGrant | null {
    if (!participantIds.length) return null;
    const now = this.ctx.clock();
    const placeholders = participantIds.map(() => '?').join(',');
    return this.ctx.repo.one<ShareGrant>(
      `SELECT id, owner_id, scope, expires_at FROM location_shares
       WHERE recipient_id=? AND kind='history' AND revoked_at IS NULL
         AND (expires_at IS NULL OR expires_at > ?)
         AND history_from <= ? AND history_to >= ?
         AND owner_id IN (${placeholders})
       ORDER BY created_at DESC LIMIT 1`,
      recipientId, now, from, to, ...participantIds) ?? null;
  }

  private participantIdsWithData(type: TrackContextType, contextId: string): string[] {
    const rows = this.ctx.repo.all<{ user_id: string }>(
      'SELECT DISTINCT user_id FROM track_points WHERE context_type=? AND context_id=?', type, contextId);
    return rows.map((row) => String(row.user_id));
  }

  private summariesFor(type: TrackContextType, contextId: string, userIds: string[]): SummaryProjection[] {
    if (!userIds.length) return [];
    // Users with points but no summary yet get one now (terminal hook may have been unavailable).
    for (const userId of userIds) {
      try {
        const hasPoints = this.ctx.repo.one(
          'SELECT 1 AS x FROM track_points WHERE context_type=? AND context_id=? AND user_id=? LIMIT 1', type, contextId, userId);
        const hasSummary = this.ctx.repo.one(
          'SELECT 1 AS x FROM track_summaries WHERE context_type=? AND context_id=? AND user_id=? LIMIT 1', type, contextId, userId);
        if (hasPoints && !hasSummary) this.ensureSummary(type, contextId, userId);
      } catch (error) {
        console.error('[track] on-read summary failed', { contextType: type, contextId, userId, error });
      }
    }
    const placeholders = userIds.map(() => '?').join(',');
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT s.*, u.username FROM track_summaries s JOIN users u ON u.id = s.user_id
       WHERE s.context_type=? AND s.context_id=? AND s.user_id IN (${placeholders})
       ORDER BY u.username`, type, contextId, ...userIds);
    return rows.map((row) => ({
      userId: String(row.user_id),
      username: String(row.username),
      distanceM: row.distance_m === null || row.distance_m === undefined ? null : Number(row.distance_m),
      durationMs: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms),
      pointCount: Number(row.point_count),
      firstPointAt: Number(row.first_point_at),
      lastPointAt: Number(row.last_point_at),
      quality: String(row.quality)
    }));
  }

  private buildTrack(identity: AuthIdentity, type: TrackContextType, contextId: string,
    fromRaw: number | undefined, toRaw: number | undefined, forcedAccess?: 'admin'): Record<string, unknown> {
    const bounds = this.contextBounds(type, contextId);
    const from = Math.max(fromRaw ?? bounds.from, bounds.from);
    const to = Math.min(toRaw ?? bounds.to, bounds.to);
    if (!(from < to)) throw badRequest('Track window must be chronological.', { field: 'from' });
    if (to - from > MAX_WINDOW_MS) throw badRequest('Track window is limited to 31 days.', { field: 'to' });
    const mission = type === 'mission' ? this.missionRow(contextId) : undefined;
    if (type === 'mission' && !mission) throw notFound('Mission not found.');
    let access: 'member' | 'participant' | 'share' | 'admin';
    let grant: ShareGrant | null = null;
    if (forcedAccess === 'admin' || identity.role === ROLES.ADMIN) {
      access = 'admin';
    } else if (this.isParticipant(identity, type, contextId, mission)) {
      access = type === 'trip' ? 'member' : 'participant';
    } else {
      const participants = this.participantIdsWithData(type, contextId);
      grant = this.findCoveringGrant(identity.userId, participants, from, to);
      if (!grant) throw notFound(type === 'trip' ? 'Trip not found.' : 'Mission not found.');
      access = 'share';
    }
    const sharerId = access === 'share' && grant ? String(grant.owner_id) : null;
    const params: Array<string | number> = [type, contextId, from, to];
    let pointsSql =
      `SELECT user_id, latitude, longitude, accuracy, heading, speed, recorded_at FROM track_points
       WHERE context_type=? AND context_id=? AND recorded_at>=? AND recorded_at<=?`;
    if (sharerId) {
      pointsSql += ' AND user_id=?';
      params.push(sharerId);
    }
    pointsSql += ' ORDER BY recorded_at ASC, id ASC LIMIT ?';
    params.push(MAX_POINTS_OUT + 1);
    const rows = this.ctx.repo.all<Record<string, any>>(pointsSql, ...params);
    const truncated = rows.length > MAX_POINTS_OUT;
    const windowRows = truncated ? rows.slice(0, MAX_POINTS_OUT) : rows;
    const scope: ShareScopeDetail[] = access === 'share' && grant
      ? parseScope(grant.scope)
      : [...SHARE_SCOPE_DETAILS];
    const includeMotion = scope.includes('motion');
    const includeAccuracy = scope.includes('accuracy');
    const points = windowRows.map((row) => ({
      userId: String(row.user_id),
      latitude: Number(row.latitude),
      longitude: Number(row.longitude),
      accuracy: includeAccuracy && row.accuracy !== null ? Number(row.accuracy) : null,
      heading: includeMotion && row.heading !== null && row.heading !== undefined ? Number(row.heading) : null,
      speed: includeMotion && row.speed !== null && row.speed !== undefined ? Number(row.speed) : null,
      recordedAt: Number(row.recorded_at)
    }));
    const shareHistoryIds = sharerId ? [sharerId]
      : [...new Set(windowRows.map((row) => String(row.user_id)))]
        .concat(this.ctx.repo.all<{ user_id: string }>(
          'SELECT DISTINCT user_id FROM track_summaries WHERE context_type=? AND context_id=?', type, contextId)
          .map((row) => String(row.user_id)))
        .filter((value, index, arr) => arr.indexOf(value) === index);
    const summaries = this.summariesFor(type, contextId, shareHistoryIds);
    const now = this.ctx.clock();
    if (access === 'admin') {
      this.ctx.repo.run(
        'INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
        identity.userId, 'admin.track.read', `${type}:${contextId}`, identity.ip,
        JSON.stringify({ contextType: type, contextId, from, to, pointCount: points.length, truncated }), now);
    }
    return {
      contextType: type,
      contextId,
      availability: this.trackStatus(type, contextId),
      access,
      scope: access === 'share' ? scope : null,
      authorizedUntil: access === 'share' && grant && grant.expires_at !== null && grant.expires_at !== undefined
        ? Number(grant.expires_at) : null,
      retentionDays: this.ctx.config.tripTrackRetentionDays,
      window: { from, to },
      points,
      summaries,
      truncated
    };
  }

  /** Member/participant track read (members replay the whole context; recipients are share-scoped). */
  readTrack(identity: AuthIdentity, type: TrackContextType, contextId: string,
    from?: number, to?: number): Record<string, unknown> {
    return this.buildTrack(identity, type, contextId, from, to);
  }

  /** Audit-logged administrator read; capability exists for safeguarding, never silently used. */
  adminReadTrack(identity: AuthIdentity, type: TrackContextType, contextId: string): Record<string, unknown> {
    return this.buildTrack(identity, type, contextId, undefined, undefined, 'admin');
  }

  // ---------- retention ----------

  /**
   * Deletes raw tracking points older than TRIP_TRACK_RETENTION_DAYS. Efficient batched deletes on
   * the existing hourly maintenance pass. Fail-closed per context: summaries are persisted BEFORE
   * any point of that context is removed; a context whose summary cannot be persisted keeps every
   * point and is retried next pass. Never touches trips, missions, consents or summaries.
   */
  purgeExpiredTrackPoints(): { deleted: number; blocked: number; contexts: number } {
    const now = this.ctx.clock();
    const cutoff = now - this.ctx.config.tripTrackRetentionDays * 86_400_000;
    const contexts = this.ctx.repo.all<{ context_type: string; context_id: string }>(
      'SELECT DISTINCT context_type, context_id FROM track_points WHERE recorded_at < ?', cutoff);
    let deleted = 0;
    let blocked = 0;
    for (const context of contexts) {
      const type = String(context.context_type) as TrackContextType;
      const contextId = String(context.context_id);
      const users = this.ctx.repo.all<{ user_id: string }>(
        'SELECT DISTINCT user_id FROM track_points WHERE context_type=? AND context_id=?', type, contextId);
      let ready = true;
      for (const row of users) {
        try {
          this.ensureSummary(type, contextId, String(row.user_id));
        } catch (error) {
          console.error('[track] summary before purge failed; points kept', { type, contextId, userId: String(row.user_id), error });
          ready = false;
        }
      }
      if (!ready) {
        blocked += 1;
        continue;
      }
      for (;;) {
        const { changes } = this.ctx.repo.run(
          `DELETE FROM track_points WHERE id IN
           (SELECT id FROM track_points WHERE context_type=? AND context_id=? AND recorded_at < ? LIMIT 500)`,
          type, contextId, cutoff);
        deleted += changes;
        if (changes === 0) break;
      }
    }
    return { deleted, blocked, contexts: contexts.length };
  }
}
