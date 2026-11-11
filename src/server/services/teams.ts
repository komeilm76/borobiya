import type { AuthIdentity } from '../core/router.ts';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.ts';
import { newId } from '../core/crypto.ts';
import type { Transaction } from '../db/unit-of-work.ts';
import {
  HTTP_EVENTS, MISSION_STATUS, MISSION_MEMBER_ROLES, ROLES, SOS_STATUS, SUPPORT_REQUEST_STATUS
} from '../../shared/protocol.ts';
import { readinessGate } from '../domain/eligibility.ts';
import { transitionSos } from '../domain/state.ts';
import type { AppContext } from './context.ts';

/** Shape of a support-request staffing line as stored in mission_requirements / support_request_items. */
export interface RequirementLine {
  jobTypeId: string;
  quantity: number;
}

const FINISHED_MISSIONS = new Set<string>([MISSION_STATUS.COMPLETED, MISSION_STATUS.CANCELLED]);

/** Shared membership-row insert; callers own transactions and audit/event writes. */
export function insertMissionMembership(tx: Transaction, input: {
  missionId: string;
  userId: string;
  role: 'leader' | 'member';
  source: string;
  assignedBy: string | null;
  supportRequestId?: string | null;
  now: number;
}): void {
  tx.repo.run(
    `INSERT INTO mission_members(id, mission_id, user_id, role, assignment_source, assignment_status, assigned_by, support_request_id, created_at, updated_at)
     VALUES(?,?,?,?,?,'active',?,?,?,?)`,
    newId('mm'), input.missionId, input.userId, input.role, input.source,
    input.assignedBy, input.supportRequestId ?? null, input.now, input.now);
}

/**
 * Portuguese-free notes: the service layer never renders UI copy; it returns stable
 * machine-readable projections that the client localizes.
 */
export class TeamService {
  constructor(private readonly ctx: AppContext) {}

  // ---------- shared lookups ----------

  private missionRow(missionId: string): Record<string, any> | undefined {
    return this.ctx.repo.one<Record<string, any>>(
      `SELECT m.*, s.id AS sosId, s.status AS sosStatus, s.severity, s.assigned_group_id, s.requester_id,
              i.label AS incidentLabel
       FROM missions m
       JOIN sos_requests s ON s.id = m.sos_id
       JOIN incident_types i ON i.id = s.incident_type_id
       WHERE m.id = ?`, missionId);
  }

  private activeMember(missionId: string, userId: string): Record<string, any> | undefined {
    return this.ctx.repo.one<Record<string, any>>(
      `SELECT * FROM mission_members WHERE mission_id=? AND user_id=? AND assignment_status='active'`,
      missionId, userId);
  }

  private memberRows(missionId: string): Array<Record<string, any>> {
    return this.ctx.repo.all<Record<string, any>>(
      `SELECT mm.*, u.username, u.ready_for_mission, jt.id AS jobTypeId, jt.label AS jobTypeLabel
       FROM mission_members mm
       JOIN users u ON u.id = mm.user_id
       LEFT JOIN job_types jt ON jt.id = u.job_type_id
       WHERE mm.mission_id=?
       ORDER BY (mm.role = '${MISSION_MEMBER_ROLES.LEADER}' AND mm.assignment_status = 'active') DESC, mm.created_at`, missionId);
  }

  private requirementRows(missionId: string): Array<Record<string, any>> {
    return this.ctx.repo.all<Record<string, any>>(
      `SELECT r.job_type_id AS jobTypeId, jt.label AS jobTypeLabel, r.quantity
       FROM mission_requirements r JOIN job_types jt ON jt.id = r.job_type_id
       WHERE r.mission_id=? ORDER BY jt.rank`, missionId);
  }

  private teamProjection(mission: Record<string, any>, identity: AuthIdentity): Record<string, unknown> {
    const missionId = String(mission.id);
    const isAdmin = identity.role === ROLES.ADMIN;
    const rows = this.memberRows(missionId);
    const viewer = rows.find((row) => String(row.user_id) === identity.userId && row.assignment_status === 'active');
    const filledByType = new Map<string, number>();
    for (const row of rows) {
      if (row.assignment_status !== 'active') continue;
      const key = String(row.jobTypeId ?? '');
      filledByType.set(key, (filledByType.get(key) ?? 0) + 1);
    }
    const leaderRow = rows.find((row) => row.role === MISSION_MEMBER_ROLES.LEADER && row.assignment_status === 'active');
    const memberProjection = (row: Record<string, any>) => ({
      userId: String(row.user_id),
      username: String(row.username),
      role: String(row.role),
      jobTypeId: row.jobTypeId ? String(row.jobTypeId) : null,
      jobTypeLabel: row.jobTypeLabel ? String(row.jobTypeLabel) : null,
      readyForMission: Boolean(Number(row.ready_for_mission ?? 0)),
      assignmentSource: String(row.assignment_source),
      assignmentStatus: String(row.assignment_status),
      supportRequestId: row.support_request_id ? String(row.support_request_id) : null,
      joinedAt: Number(row.created_at),
      removedAt: row.removed_at ? Number(row.removed_at) : null,
      ...(isAdmin && row.removal_reason ? { removalReason: String(row.removal_reason) } : {})
    });
    const members = rows.map(memberProjection);
    const requirements = this.requirementRows(missionId).map((row) => ({
      jobTypeId: String(row.jobTypeId),
      jobTypeLabel: String(row.jobTypeLabel),
      quantity: Number(row.quantity),
      filled: filledByType.get(String(row.jobTypeId)) ?? 0
    }));
    const pendingSupportRequests = this.ctx.repo.one<Record<string, any>>(
      `SELECT COUNT(*) AS count FROM support_requests WHERE mission_id=? AND status='pending'`, missionId);
    return {
      missionId,
      sosId: String(mission.sosId),
      status: String(mission.status),
      incidentLabel: String(mission.incidentLabel),
      severity: String(mission.severity),
      createdAt: Number(mission.created_at),
      viewerRole: isAdmin ? 'admin' : viewer ? String(viewer.role) : null,
      leader: leaderRow ? memberProjection(leaderRow) : null,
      members,
      memberCount: rows.filter((row) => row.assignment_status === 'active').length,
      requirements,
      pendingSupportRequestCount: Number(pendingSupportRequests?.count ?? 0)
    };
  }

  private requireAdmin(identity: AuthIdentity): void {
    if (identity.role !== ROLES.ADMIN) throw forbidden('Administrator permission is required.');
  }

  private requireMissionAccess(mission: Record<string, any>, identity: AuthIdentity): void {
    if (identity.role === ROLES.ADMIN) return;
    const member = this.activeMember(String(mission.id), identity.userId);
    if (!member) throw forbidden('Only mission members can open this team.');
  }

  private requireFinishedGuard(mission: Record<string, any>): void {
    if (FINISHED_MISSIONS.has(String(mission.status))) {
      throw conflict('This mission is finished; its composition is frozen.', { status: String(mission.status) });
    }
  }

  // ---------- team views ----------

  /** Team projection; visible to mission members and administrators only. */
  getTeam(identity: AuthIdentity, missionId: string): Record<string, unknown> {
    const mission = this.missionRow(missionId);
    if (!mission) throw notFound('Mission not found.');
    this.requireMissionAccess(mission, identity);
    return this.teamProjection(mission, identity);
  }

  // ---------- membership management (admin) ----------

  /** Admin staffing decision: attach already-selected workers to the SAME parent mission. */
  addMembers(identity: AuthIdentity, missionId: string, userIds: string[]): Record<string, unknown> {
    this.requireAdmin(identity);
    const mission = this.missionRow(missionId);
    if (!mission) throw notFound('Mission not found.');
    this.requireFinishedGuard(mission);
    const ids = [...new Set(userIds)];
    const rows = ids.map((id) => this.ctx.repo.one<Record<string, any>>(
      `SELECT u.id, u.username, u.active, u.role, u.ready_for_mission,
              jt.id AS jobTypeId, jt.label AS jobTypeLabel, jt.active AS job_type_active, jt.offer_policy
       FROM users u LEFT JOIN job_types jt ON jt.id = u.job_type_id WHERE u.id = ?`, id));
    for (const [index, row] of rows.entries()) {
      if (!row) throw badRequest('Unknown user id.', { field: 'userIds', userId: ids[index] });
      if (String(row.role) !== ROLES.RESPONDER) throw badRequest('Only responder accounts can join a mission team.', { field: 'userIds', userId: String(row.id) });
      if (!Number(row.active)) throw badRequest('An inactive account cannot join a mission team.', { field: 'userIds', userId: String(row.id) });
    }
    const blocked = rows.filter((row) => !readinessGate(row as any).ok).map((row) => String(row!.id));
    if (blocked.length) {
      throw badRequest('Some workers are not on standby and their job type only receives assignments while ready.', { field: 'userIds', userIds: blocked });
    }
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const existing = new Set(tx.repo.all<Record<string, any>>(
        `SELECT user_id FROM mission_members WHERE mission_id=? AND assignment_status='active'`, missionId)
        .map((row) => String(row.user_id)));
      const skipped = ids.filter((id) => existing.has(id)).map((userId) => ({ userId, reason: 'already_on_mission' }));
      const toAdd = rows.filter((row) => row && !existing.has(String(row.id)));
      for (const row of toAdd) {
        insertMissionMembership(tx, {
          missionId, userId: String(row!.id), role: MISSION_MEMBER_ROLES.MEMBER,
          source: 'admin_assignment', assignedBy: identity.userId, now
        });
        tx.repo.run('INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
          identity.userId, 'mission_member.added', `missions:${missionId}`, identity.ip,
          JSON.stringify({ userId: String(row!.id), source: 'admin_assignment' }), now);
      }
      // Re-check duplicates landed in this transaction (defensive; unique index is the backstop).
      if (toAdd.length) {
        tx.event(HTTP_EVENTS.MISSION_TEAM_UPDATED, {
          missionId, added: toAdd.map((row) => String(row!.id)), actorId: identity.userId, createdAt: now
        }, [`mission:${missionId}`, 'role:admin', ...toAdd.map((row) => `user:${String(row!.id)}`)]);
      }
      return { ...this.teamProjection(this.missionRow(missionId)!, identity), added: toAdd.map((row) => String(row!.id)), skipped };
    });
  }

  /** Removes an active member. The active leader can only be removed after someone else is designated. */
  removeMember(identity: AuthIdentity, missionId: string, userId: string, reason: string | undefined): Record<string, unknown> {
    this.requireAdmin(identity);
    const mission = this.missionRow(missionId);
    if (!mission) throw notFound('Mission not found.');
    const member = this.activeMember(missionId, userId);
    if (!member) throw notFound('This user is not an active member of the mission.');
    if (String(member.role) === MISSION_MEMBER_ROLES.LEADER) {
      throw conflict('Designate a new leader before removing the current one.');
    }
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      tx.repo.run(
        `UPDATE mission_members SET assignment_status='removed', removed_at=?, removed_by=?, removal_reason=?, updated_at=?
         WHERE id=? AND assignment_status='active'`,
        now, identity.userId, reason ?? null, now, String(member.id));
      tx.repo.run('INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
        identity.userId, 'mission_member.removed', `missions:${missionId}`, identity.ip,
        JSON.stringify({ userId, reason: reason ?? null }), now);
      tx.event(HTTP_EVENTS.MISSION_TEAM_UPDATED, {
        missionId, removed: [userId], actorId: identity.userId, createdAt: now
      }, [`mission:${missionId}`, 'role:admin', `user:${userId}`]);
      return this.teamProjection(this.missionRow(missionId)!, identity);
    });
  }

  /** Promotes an active member to leader; the previous active leader atomically becomes a member. */
  designateLeader(identity: AuthIdentity, missionId: string, userId: string): Record<string, unknown> {
    this.requireAdmin(identity);
    const mission = this.missionRow(missionId);
    if (!mission) throw notFound('Mission not found.');
    this.requireFinishedGuard(mission);
    const target = this.activeMember(missionId, userId);
    if (!target) throw conflict('Only an active mission member can be designated leader.', { field: 'userId' });
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const previous = tx.repo.one<Record<string, any>>(
        `SELECT id, user_id FROM mission_members WHERE mission_id=? AND role='leader' AND assignment_status='active'`, missionId);
      if (previous) {
        tx.repo.run(
          `UPDATE mission_members SET role='member', updated_at=? WHERE id=? AND assignment_status='active'`,
          now, String(previous.id));
      }
      tx.repo.run(
        `UPDATE mission_members SET role='leader', updated_at=? WHERE id=? AND assignment_status='active'`,
        now, String(target.id));
      tx.repo.run('INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
        identity.userId, 'mission_leader.designated', `missions:${missionId}`, identity.ip,
        JSON.stringify({ userId, previousLeaderId: previous ? String(previous.user_id) : null }), now);
      tx.event(HTTP_EVENTS.MISSION_TEAM_UPDATED, {
        missionId, leaderId: userId, actorId: identity.userId, createdAt: now
      }, [`mission:${missionId}`, 'role:admin', `user:${userId}`]);
      return this.teamProjection(this.missionRow(missionId)!, identity);
    });
  }

  /** Sets (or clears, with an empty array) the target composition of a mission. */
  setRequirements(identity: AuthIdentity, missionId: string, requirements: RequirementLine[]): Record<string, unknown> {
    this.requireAdmin(identity);
    const mission = this.missionRow(missionId);
    if (!mission) throw notFound('Mission not found.');
    this.requireFinishedGuard(mission);
    const lines = this.validateRequirementLines(requirements);
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      tx.repo.run('DELETE FROM mission_requirements WHERE mission_id=?', missionId);
      for (const line of lines) {
        tx.repo.run('INSERT INTO mission_requirements(mission_id, job_type_id, quantity) VALUES(?,?,?)',
          missionId, line.jobTypeId, line.quantity);
      }
      tx.repo.run('INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
        identity.userId, 'mission_requirements.updated', `missions:${missionId}`, identity.ip,
        JSON.stringify({ requirements: lines }), now);
      tx.event(HTTP_EVENTS.MISSION_TEAM_UPDATED, {
        missionId, requirements: lines, actorId: identity.userId, createdAt: now
      }, [`mission:${missionId}`, 'role:admin']);
      return this.teamProjection(this.missionRow(missionId)!, identity);
    });
  }

  /**
   * Team from the start: creates the parent mission, the leader membership, target
   * composition and (optionally) immediate members in one transaction. SOS is dispatched
   * exactly like a normal dispatch; membership reuses the staffing machinery.
   */
  teamDispatch(identity: AuthIdentity, sosId: string, input: { groupId: string; leaderId: string; requirements: RequirementLine[]; memberIds?: string[] }): Record<string, unknown> {
    this.requireAdmin(identity);
    const sos = this.ctx.repo.one<Record<string, any>>('SELECT * FROM sos_requests WHERE id=?', sosId);
    if (!sos) throw notFound('SOS request not found.');
    const group = this.ctx.repo.one<Record<string, any>>('SELECT * FROM service_groups WHERE id=? AND status=?', input.groupId, 'active');
    if (!group) throw badRequest('Unknown active service group.', { field: 'groupId' });
    const lines = this.validateRequirementLines(input.requirements);
    if (!lines.length) throw badRequest('A team mission requires at least one job type line.', { field: 'requirements' });
    const loadResponder = (id: string) => this.ctx.repo.one<Record<string, any>>(
      `SELECT u.id, u.username, u.active, u.role, u.ready_for_mission,
              jt.id AS jobTypeId, jt.label AS jobTypeLabel, jt.active AS job_type_active, jt.offer_policy
       FROM users u LEFT JOIN job_types jt ON jt.id = u.job_type_id WHERE u.id=?`, id);
    const leader = loadResponder(input.leaderId);
    if (!leader) throw badRequest('Unknown user id.', { field: 'leaderId' });
    if (String(leader.role) !== ROLES.RESPONDER || !Number(leader.active)) {
      throw badRequest('The mission leader must be an active responder account.', { field: 'leaderId' });
    }
    const inGroup = (userId: string) => Boolean(this.ctx.repo.one(
      'SELECT user_id FROM group_members WHERE group_id=? AND user_id=?', input.groupId, userId));
    if (!inGroup(String(leader.id))) throw badRequest('The mission leader must be an active member of the selected group.', { field: 'leaderId' });
    const leaderGate = readinessGate(leader as any);
    if (!leaderGate.ok) {
      throw badRequest('The designated leader is not on standby and their job type only receives assignments while ready.', { field: 'leaderId', userId: String(leader.id) });
    }
    const memberIds = [...new Set(input.memberIds ?? [])].filter((id) => id !== input.leaderId);
    const members = memberIds.map((id) => loadResponder(id));
    for (const [index, row] of members.entries()) {
      if (!row) throw badRequest('Unknown user id.', { field: 'memberIds', userId: memberIds[index] });
      if (String(row.role) !== ROLES.RESPONDER || !Number(row.active)) {
        throw badRequest('Every member must be an active responder account.', { field: 'memberIds', userId: String(row.id) });
      }
      if (!inGroup(String(row.id))) throw badRequest('Every member must belong to the selected group.', { field: 'memberIds', userId: String(row.id) });
      const gate = readinessGate(row as any);
      if (!gate.ok) throw badRequest('Some members are not on standby and their job type only receives assignments while ready.', { field: 'memberIds', userId: String(row.id) });
    }
    const dispatchTransition = transitionSos(String(sos.status), 'dispatch', ROLES.ADMIN);
    if (!dispatchTransition.ok) throw conflict('This request cannot be dispatched as a team.', { reason: dispatchTransition.reason });
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const missionId = newId('mis');
      // Re-checked inside the transaction: a concurrent dispatch/cancel wins cleanly.
      const dispatched = tx.repo.run(
        'UPDATE sos_requests SET status=?, assigned_group_id=?, assigned_responder_id=?, updated_at=? WHERE id=? AND status=?',
        SOS_STATUS.DISPATCHED, input.groupId, input.leaderId, now, sosId, SOS_STATUS.PENDING);
      if (!dispatched.changes) throw conflict('This request can no longer be dispatched as a team.', { status: String(sos.status) });
      tx.repo.run('INSERT INTO missions(id,sos_id,responder_id,status,created_at,updated_at) VALUES(?,?,?,?,?,?)',
        missionId, sosId, input.leaderId, MISSION_STATUS.ASSIGNED, now, now);
      tx.repo.run('INSERT INTO mission_events(mission_id,actor_id,action,from_status,to_status,note,created_at) VALUES(?,?,?,?,?,?,?)',
        missionId, identity.userId, 'assign', '', MISSION_STATUS.ASSIGNED, 'Team dispatch', now);
      insertMissionMembership(tx, {
        missionId, userId: input.leaderId, role: MISSION_MEMBER_ROLES.LEADER,
        source: 'team_dispatch', assignedBy: identity.userId, now
      });
      for (const member of members) {
        insertMissionMembership(tx, {
          missionId, userId: String(member!.id), role: MISSION_MEMBER_ROLES.MEMBER,
          source: 'team_dispatch', assignedBy: identity.userId, now
        });
      }
      for (const line of lines) {
        tx.repo.run('INSERT INTO mission_requirements(mission_id, job_type_id, quantity) VALUES(?,?,?)',
          missionId, line.jobTypeId, line.quantity);
      }
      tx.repo.run('INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
        identity.userId, 'mission_team.dispatched', `missions:${missionId}`, identity.ip,
        JSON.stringify({ sosId, groupId: input.groupId, leaderId: input.leaderId, memberIds, requirements: lines }), now);
      tx.event(HTTP_EVENTS.SOS_DISPATCHED, {
        sosId, status: SOS_STATUS.DISPATCHED, groupId: input.groupId, responderIds: [input.leaderId, ...memberIds],
        dispatchedBy: identity.userId, mode: 'team', createdAt: now
      }, [`user:${sos.requester_id}`, 'role:admin', `sos:${sosId}`, `user:${input.leaderId}`, ...memberIds.map((id) => `user:${id}`)]);
      tx.event(HTTP_EVENTS.MISSION_UPDATED, { missionId, sosId, status: MISSION_STATUS.ASSIGNED, sosStatus: SOS_STATUS.DISPATCHED, action: 'assign', actorId: identity.userId, createdAt: now },
        [`user:${sos.requester_id}`, `user:${input.leaderId}`, 'role:admin', `mission:${missionId}`, `sos:${sosId}`]);
      tx.event(HTTP_EVENTS.MISSION_TEAM_UPDATED, { missionId, leaderId: input.leaderId, added: [input.leaderId, ...memberIds], createdAt: now },
        [`mission:${missionId}`, 'role:admin', `user:${input.leaderId}`, ...memberIds.map((id) => `user:${id}`)]);
      const projection = this.teamProjection(this.missionRow(missionId)!, identity);
      return { ok: true, missionId, missionStatus: MISSION_STATUS.ASSIGNED, sosStatus: SOS_STATUS.DISPATCHED, ...projection };
    });
  }

  private validateRequirementLines(requirements: RequirementLine[]): RequirementLine[] {
    const merged = new Map<string, number>();
    for (const line of requirements) {
      const jobTypeId = String(line.jobTypeId);
      const quantity = Number(line.quantity);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw badRequest('Each requirement quantity must be an integer between 1 and 20.', { field: 'requirements', jobTypeId });
      }
      merged.set(jobTypeId, (merged.get(jobTypeId) ?? 0) + quantity);
    }
    for (const jobTypeId of merged.keys()) {
      const jobType = this.ctx.repo.one<Record<string, any>>('SELECT active FROM job_types WHERE id=?', jobTypeId);
      if (!jobType) throw badRequest('Unknown job type.', { field: 'requirements', jobTypeId });
      if (!Number(jobType.active)) throw badRequest('A deactivated job type cannot be required.', { field: 'requirements', jobTypeId });
    }
    return [...merged.entries()].map(([jobTypeId, quantity]) => ({ jobTypeId, quantity }));
  }

  // ---------- support requests ----------

  private supportRequestRow(requestId: string): Record<string, any> | undefined {
    return this.ctx.repo.one<Record<string, any>>(
      `SELECT sr.*, r.username AS requestedByUsername, rb.username AS reviewedByUsername
       FROM support_requests sr
       JOIN users r ON r.id = sr.requested_by
       LEFT JOIN users rb ON rb.id = sr.reviewed_by
       WHERE sr.id = ?`, requestId);
  }

  private requestItems(requestId: string): Array<Record<string, any>> {
    return this.ctx.repo.all<Record<string, any>>(
      `SELECT i.job_type_id AS jobTypeId, jt.label AS jobTypeLabel, i.quantity, i.approved_quantity AS approvedQuantity
       FROM support_request_items i JOIN job_types jt ON jt.id = i.job_type_id
       WHERE i.request_id=? ORDER BY jt.rank`, requestId);
  }

  private requestDecisions(requestId: string, includeNote: boolean): Array<Record<string, unknown>> {
    if (!includeNote) return [];
    return this.ctx.repo.all<Record<string, any>>(
      `SELECT d.decision, d.note, d.created_at, a.username AS adminUsername
       FROM support_request_decisions d LEFT JOIN users a ON a.id = d.admin_id
       WHERE d.request_id=? ORDER BY d.created_at`, requestId)
      .map((row) => ({
        decision: String(row.decision),
        note: row.note ? String(row.note) : null,
        adminUsername: row.adminUsername ? String(row.adminUsername) : null,
        createdAt: Number(row.created_at)
      }));
  }

  private supportRequestProjection(request: Record<string, any>, viewer: AuthIdentity, includeDecisions = true): Record<string, unknown> {
    const isAdmin = viewer.role === ROLES.ADMIN;
    const isRequester = String(request.requested_by) === viewer.userId;
    const seesInternal = isAdmin || isRequester;
    return {
      id: String(request.id),
      missionId: String(request.mission_id),
      requestedBy: String(request.requested_by),
      requestedByUsername: String(request.requestedByUsername),
      reason: String(request.reason),
      note: request.note ? String(request.note) : null,
      status: String(request.status),
      items: this.requestItems(String(request.id)).map((item) => ({
        jobTypeId: String(item.jobTypeId),
        jobTypeLabel: String(item.jobTypeLabel),
        quantity: Number(item.quantity),
        approvedQuantity: Number(item.approvedQuantity)
      })),
      ...(seesInternal
        ? {
            adminNote: request.admin_note ? String(request.admin_note) : null,
            reviewedBy: request.reviewed_by ? String(request.reviewed_by) : null,
            reviewedByUsername: request.reviewedByUsername ? String(request.reviewedByUsername) : null,
            reviewedAt: request.reviewed_at ? Number(request.reviewed_at) : null,
            ...(includeDecisions ? { decisions: this.requestDecisions(String(request.id), true) } : {})
          }
        : {}),
      createdAt: Number(request.created_at),
      updatedAt: Number(request.updated_at),
      cancelledAt: request.cancelled_at ? Number(request.cancelled_at) : null
    };
  }

  /** Leader-only creation for THAT mission. */
  createSupportRequest(identity: AuthIdentity, missionId: string, input: { items: RequirementLine[]; reason: string; note?: string }): Record<string, unknown> {
    const mission = this.missionRow(missionId);
    if (!mission) throw notFound('Mission not found.');
    const membership = this.activeMember(missionId, identity.userId);
    if (!membership || String(membership.role) !== MISSION_MEMBER_ROLES.LEADER) {
      throw forbidden('Only the mission leader can request support.');
    }
    this.requireFinishedGuard(mission);
    const reason = String(input.reason ?? '').trim();
    if (reason.length < 10) throw badRequest('Explain why support is requested (at least 10 characters).', { field: 'reason' });
    // Merge duplicate lines for the same job type; validate ids and readiness of the catalog.
    const lines = this.validateRequirementLines(input.items);
    if (!lines.length) throw badRequest('Request at least one job type with a quantity.', { field: 'items' });
    if (lines.length > 10) throw badRequest('Too many distinct job types in one request.', { field: 'items' });
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const requestId = newId('srq');
      tx.repo.run(
        `INSERT INTO support_requests(id, mission_id, requested_by, reason, note, status, created_at, updated_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        requestId, missionId, identity.userId, reason, input.note?.trim() || null, SUPPORT_REQUEST_STATUS.PENDING, now, now);
      for (const line of lines) {
        tx.repo.run('INSERT INTO support_request_items(request_id, job_type_id, quantity, approved_quantity) VALUES(?,?,?,0)',
          requestId, line.jobTypeId, line.quantity);
      }
      tx.event(HTTP_EVENTS.SUPPORT_REQUEST_CREATED, {
        requestId, missionId, requestedBy: identity.userId, itemCount: lines.length, createdAt: now
      }, [`mission:${missionId}`, 'role:admin']);
      tx.repo.run('INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
        identity.userId, 'support_request.created', `support_requests:${requestId}`, identity.ip,
        JSON.stringify({ missionId, items: lines }), now);
      return this.supportRequestProjection(this.supportRequestRow(requestId)!, identity);
    });
  }

  /** Requests for one mission; visible to mission members and administrators. */
  listSupportRequests(identity: AuthIdentity, missionId: string, limit: number): Record<string, unknown> {
    const mission = this.missionRow(missionId);
    if (!mission) throw notFound('Mission not found.');
    this.requireMissionAccess(mission, identity);
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT sr.*, r.username AS requestedByUsername, rb.username AS reviewedByUsername
       FROM support_requests sr JOIN users r ON r.id = sr.requested_by LEFT JOIN users rb ON rb.id = sr.reviewed_by
       WHERE sr.mission_id=? ORDER BY sr.created_at DESC LIMIT ?`, missionId, Math.min(50, limit));
    return { items: rows.map((row) => this.supportRequestProjection(row, identity)), total: rows.length };
  }

  /** Leader cancels their own pending request; nobody else may. */
  cancelSupportRequest(identity: AuthIdentity, missionId: string, requestId: string): Record<string, unknown> {
    const mission = this.missionRow(missionId);
    if (!mission) throw notFound('Mission not found.');
    const membership = this.activeMember(missionId, identity.userId);
    if (!membership || String(membership.role) !== MISSION_MEMBER_ROLES.LEADER) {
      throw forbidden('Only the mission leader can cancel this request.');
    }
    const request = this.supportRequestRow(requestId);
    if (!request || String(request.mission_id) !== missionId) throw notFound('Support request not found.');
    if (String(request.status) !== SUPPORT_REQUEST_STATUS.PENDING) {
      throw conflict('Only a pending request can be cancelled.', { status: String(request.status) });
    }
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const result = tx.repo.run(
        `UPDATE support_requests SET status='cancelled', cancelled_at=?, updated_at=? WHERE id=? AND status='pending'`,
        now, now, requestId);
      if (!result.changes) throw conflict('Only a pending request can be cancelled.');
      tx.event(HTTP_EVENTS.SUPPORT_REQUEST_CANCELLED, {
        requestId, missionId, cancelledBy: identity.userId, createdAt: now
      }, [`mission:${missionId}`, 'role:admin']);
      tx.repo.run('INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
        identity.userId, 'support_request.cancelled', `support_requests:${requestId}`, identity.ip,
        JSON.stringify({ missionId }), now);
      return this.supportRequestProjection(this.supportRequestRow(requestId)!, identity);
    });
  }

  /** Administrator list of support requests, filterable by status/mission. */
  listSupportRequestsAdmin(identity: AuthIdentity, status: string | undefined, missionId: string | undefined, limit: number): Record<string, unknown> {
    this.requireAdmin(identity);
    const known = Object.values(SUPPORT_REQUEST_STATUS) as string[];
    const filter = status && known.includes(status) ? status : null;
    const clauses: string[] = [];
    const params: Array<string | number> = [];
    if (filter) { clauses.push('sr.status = ?'); params.push(filter); }
    if (missionId) { clauses.push('sr.mission_id = ?'); params.push(missionId); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT sr.*, r.username AS requestedByUsername, rb.username AS reviewedByUsername,
              m.status AS missionStatus, i.label AS incidentLabel, s.severity
       FROM support_requests sr
       JOIN users r ON r.id = sr.requested_by
       LEFT JOIN users rb ON rb.id = sr.reviewed_by
       JOIN missions m ON m.id = sr.mission_id
       JOIN sos_requests s ON s.id = m.sos_id
       JOIN incident_types i ON i.id = s.incident_type_id
       ${where}
       ORDER BY sr.created_at DESC LIMIT ?`, ...params, Math.min(200, limit));
    return {
      items: rows.map((row) => ({
        ...this.supportRequestProjection(row, identity, false),
        missionStatus: String(row.missionStatus),
        incidentLabel: String(row.incidentLabel),
        severity: String(row.severity)
      })),
      total: rows.length
    };
  }

  /** Full review context for one request, including decision history and composition. */
  supportRequestDetail(identity: AuthIdentity, requestId: string): Record<string, unknown> {
    const request = this.supportRequestRow(requestId);
    if (!request) throw notFound('Support request not found.');
    const missionId = String(request.mission_id);
    if (identity.role !== ROLES.ADMIN) {
      const membership = this.activeMember(missionId, identity.userId);
      if (!membership) throw forbidden('Only mission members can open this request.');
    }
    const mission = this.missionRow(missionId)!;
    const leader = this.memberRows(missionId).find((row) => row.role === MISSION_MEMBER_ROLES.LEADER && row.assignment_status === 'active');
    return {
      ...this.supportRequestProjection(request, identity),
      mission: {
        missionId, sosId: String(mission.sosId), incidentLabel: String(mission.incidentLabel),
        severity: String(mission.severity), status: String(mission.status)
      },
      leader: leader
        ? { userId: String(leader.user_id), username: String(leader.username) }
        : null
    };
  }

  /**
   * Eligibility for staffing a request. Reuses the shared offer-policy machinery: an
   * active responder whose job type requires standby is ineligible while off standby;
   * missing/inactive job types are strictest. Never auto-assigns; the admin decides.
   */
  candidates(identity: AuthIdentity, requestId: string, input: { jobTypeId?: string; q?: string; includeIneligible?: boolean; limit?: number }): Record<string, unknown> {
    this.requireAdmin(identity);
    const request = this.supportRequestRow(requestId);
    if (!request) throw notFound('Support request not found.');
    const missionId = String(request.mission_id);
    const params: Array<string | number> = [missionId, missionId];
    let jobTypeFilter = '';
    if (input.jobTypeId) { jobTypeFilter = ' AND u.job_type_id = ?'; params.push(input.jobTypeId); }
    let qFilter = '';
    if (input.q) { qFilter = " AND u.username LIKE ? ESCAPE '\\'"; params.push(`%${input.q.replace(/[\\%_]/g, (m) => `\\${m}`)}%`); }
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT u.id, u.username, u.active, u.ready_for_mission, u.average_rating, u.job_type_id AS jobTypeId,
              jt.label AS jobTypeLabel, jt.active AS job_type_active, jt.offer_policy,
              (SELECT COUNT(*) FROM mission_members mm JOIN missions m ON m.id = mm.mission_id
                WHERE mm.user_id = u.id AND mm.assignment_status='active' AND mm.mission_id <> ?
                  AND m.status NOT IN ('completed','cancelled')) AS otherActiveMissions,
              (SELECT COUNT(*) FROM mission_members mm
                WHERE mm.user_id = u.id AND mm.mission_id = ? AND mm.assignment_status='active') AS alreadyOnMission
       FROM users u LEFT JOIN job_types jt ON jt.id = u.job_type_id
       WHERE u.role='responder'${jobTypeFilter}${qFilter}
       ORDER BY u.username`, ...params);
    const items = rows.map((row) => {
      const gate = readinessGate(row as any);
      let ineligibleReason: string | null = null;
      if (!row.jobTypeId) ineligibleReason = 'no_job_type';
      else if (!Number(row.job_type_active)) ineligibleReason = 'job_type_inactive';
      else if (!gate.ok) ineligibleReason = gate.reason;
      else if (Number(row.alreadyOnMission) > 0) ineligibleReason = 'already_on_mission';
      return {
        id: String(row.id),
        username: String(row.username),
        jobTypeId: row.jobTypeId ? String(row.jobTypeId) : null,
        jobTypeLabel: row.jobTypeLabel ? String(row.jobTypeLabel) : null,
        readyForMission: Boolean(Number(row.ready_for_mission ?? 0)),
        averageRating: Number(row.average_rating ?? 0),
        otherActiveMissions: Number(row.otherActiveMissions ?? 0),
        alreadyOnMission: Number(row.alreadyOnMission ?? 0) > 0,
        onActiveMission: Number(row.otherActiveMissions ?? 0) > 0,
        eligible: ineligibleReason === null,
        ineligibleReason
      };
    });
    const eligible = items.filter((item) => item.eligible);
    const visible = input.includeIneligible ? items : eligible;
    return { items: visible.slice(0, Math.min(100, input.limit ?? 50)), total: visible.length, eligibleTotal: eligible.length };
  }

  /**
   * The administrator's final staffing decision. Valid only while the request is pending
   * (concurrent reviewers lose cleanly). Approved quantities must match the assigned
   * workers per line hand-count-for-hand; approved assignments are inserted in the same
   * transaction as the decision, so a request can never claim more than it assigned.
   */
  reviewSupportRequest(identity: AuthIdentity, requestId: string, input: {
    decision: 'approved' | 'partially_approved' | 'rejected';
    adminNote?: string;
    items?: Array<{ jobTypeId: string; approvedQuantity: number }>;
    userIds?: string[];
  }): Record<string, unknown> {
    this.requireAdmin(identity);
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const request = tx.repo.one<Record<string, any>>('SELECT * FROM support_requests WHERE id=?', requestId);
      if (!request) throw notFound('Support request not found.');
      if (String(request.status) !== SUPPORT_REQUEST_STATUS.PENDING) {
        throw conflict('This request has already been reviewed.', { status: String(request.status) });
      }
      const missionId = String(request.mission_id);
      const mission = tx.repo.one<Record<string, any>>('SELECT * FROM missions WHERE id=?', missionId);
      if (!mission) throw notFound('Mission not found.');
      const requestedItems = tx.repo.all<Record<string, any>>(
        'SELECT job_type_id AS jobTypeId, quantity FROM support_request_items WHERE request_id=?', requestId);
      const requestedByType = new Map(requestedItems.map((item) => [String(item.jobTypeId), Number(item.quantity)]));
      const saveNote = input.adminNote?.trim() || null;

      if (input.decision === 'rejected') {
        if ((input.userIds?.length ?? 0) > 0 || (input.items ?? []).some((item) => item.approvedQuantity > 0)) {
          throw badRequest('A rejected request assigns nobody; omit workers and approved quantities.', { field: 'decision' });
        }
        tx.repo.run('UPDATE support_requests SET status=?, admin_note=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=? AND status=?',
          SUPPORT_REQUEST_STATUS.REJECTED, saveNote, identity.userId, now, now, requestId, SUPPORT_REQUEST_STATUS.PENDING);
        tx.repo.run('UPDATE support_request_items SET approved_quantity=0 WHERE request_id=?', requestId);
        this.recordDecision(tx, requestId, identity.userId, 'rejected', saveNote, now, identity.ip);
        this.finishReview(tx, request, missionId, identity, 'rejected', now);
        return this.supportRequestProjection(this.supportRequestRow(requestId)!, identity);
      }

      const approvedByType = new Map<string, number>();
      for (const item of input.items ?? []) {
        const jobTypeId = String(item.jobTypeId);
        const requested = requestedByType.get(jobTypeId);
        if (requested === undefined) throw badRequest('An approved line is not part of this request.', { field: 'items', jobTypeId });
        const approvedQuantity = Number(item.approvedQuantity);
        if (!Number.isInteger(approvedQuantity) || approvedQuantity < 0 || approvedQuantity > requested) {
          throw badRequest('Approved quantity must be an integer between 0 and the requested quantity.', { field: 'items', jobTypeId });
        }
        approvedByType.set(jobTypeId, approvedQuantity);
      }
      for (const [jobTypeId, requested] of requestedByType) {
        if (!approvedByType.has(jobTypeId)) approvedByType.set(jobTypeId, requested); // omitted line = keep requested (full approval)
      }
      const sumApproved = [...approvedByType.values()].reduce((sum, value) => sum + value, 0);
      const sumRequested = [...requestedByType.values()].reduce((sum, value) => sum + value, 0);
      const shortLine = [...approvedByType.entries()].some(([jobTypeId, approved]) => approved < (requestedByType.get(jobTypeId) ?? 0));
      if (input.decision === 'approved' && sumApproved !== sumRequested) {
        throw badRequest('A full approval must staff every requested unit; use a partial approval otherwise.', { field: 'items' });
      }
      if (input.decision === 'partially_approved' && !shortLine) {
        throw badRequest('A partial approval must approve fewer units than requested on at least one line.', { field: 'items' });
      }

      // Workers explicitly selected by the administrator — the final decision.
      const userIds = [...new Set(input.userIds ?? [])];
      const rows = userIds.map((id) => tx.repo.one<Record<string, any>>(
        `SELECT u.id, u.username, u.active, u.role, u.ready_for_mission,
                jt.id AS jobTypeId, jt.active AS job_type_active, jt.offer_policy
         FROM users u LEFT JOIN job_types jt ON jt.id = u.job_type_id WHERE u.id=?`, id));
      for (const [index, row] of rows.entries()) {
        if (!row) throw badRequest('Unknown user id.', { field: 'userIds', userId: userIds[index] });
        if (String(row.role) !== ROLES.RESPONDER || !Number(row.active)) {
          throw badRequest('Every assigned worker must be an active responder.', { field: 'userIds', userId: String(row.id) });
        }
        const gate = readinessGate(row as any);
        if (!gate.ok) {
          throw badRequest('An assigned worker is not on standby and their job type only receives assignments while ready.', { field: 'userIds', userId: String(row.id) });
        }
      }
      const assignedByType = new Map<string, number>();
      for (const row of rows) {
        const key = String(row!.jobTypeId ?? '');
        assignedByType.set(key, (assignedByType.get(key) ?? 0) + 1);
      }
      for (const [jobTypeId, approved] of approvedByType) {
        const assigned = assignedByType.get(jobTypeId) ?? 0;
        if (assigned !== approved) {
          throw badRequest('Assign exactly as many workers per job type as you approve (including zero).', {
            field: 'userIds', jobTypeId, approvedQuantity: approved, assigned
          });
        }
        assignedByType.delete(jobTypeId);
      }
      if (assignedByType.size) {
        throw badRequest('Some selected workers belong to a job type this request does not cover.', { field: 'userIds', jobTypeIds: [...assignedByType.keys()] });
      }
      const already = new Set(tx.repo.all<Record<string, any>>(
        `SELECT user_id FROM mission_members WHERE mission_id=? AND assignment_status='active'`, missionId)
        .map((row) => String(row.user_id)));
      const duplicated = userIds.filter((id) => already.has(id));
      if (duplicated.length) throw badRequest('Some selected workers are already active members of this mission.', { field: 'userIds', userIds: duplicated });

      for (const row of rows) {
        insertMissionMembership(tx, {
          missionId, userId: String(row!.id), role: MISSION_MEMBER_ROLES.MEMBER,
          source: 'support_request', assignedBy: identity.userId, supportRequestId: requestId, now
        });
      }
      for (const [jobTypeId, approved] of approvedByType) {
        tx.repo.run('UPDATE support_request_items SET approved_quantity=? WHERE request_id=? AND job_type_id=?', approved, requestId, jobTypeId);
      }
      const status = input.decision === 'approved' ? SUPPORT_REQUEST_STATUS.APPROVED : SUPPORT_REQUEST_STATUS.PARTIALLY_APPROVED;
      tx.repo.run('UPDATE support_requests SET status=?, admin_note=?, reviewed_by=?, reviewed_at=?, updated_at=? WHERE id=? AND status=?',
        status, saveNote, identity.userId, now, now, requestId, SUPPORT_REQUEST_STATUS.PENDING);
      this.recordDecision(tx, requestId, identity.userId, input.decision, saveNote, now, identity.ip);
      this.finishReview(tx, request, missionId, identity, input.decision, now, rows.length ? userIds : []);
      return this.supportRequestProjection(this.supportRequestRow(requestId)!, identity);
    });
  }

  private recordDecision(tx: Transaction, requestId: string, adminId: string, decision: string, note: string | null, now: number, ip: string): void {
    tx.repo.run('INSERT INTO support_request_decisions(id, request_id, admin_id, decision, note, created_at) VALUES(?,?,?,?,?,?)',
      newId('dec'), requestId, adminId, decision, note, now);
    tx.repo.run('INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
      adminId, 'support_request.reviewed', `support_requests:${requestId}`, ip,
      JSON.stringify({ decision, note }), now);
  }

  private finishReview(tx: Transaction, request: Record<string, any>, missionId: string, identity: AuthIdentity, decision: string, now: number, assigned: string[] = []): void {
    tx.event(HTTP_EVENTS.SUPPORT_REQUEST_REVIEWED, {
      requestId: String(request.id), missionId, decision, reviewedBy: identity.userId, createdAt: now
    }, [`user:${String(request.requested_by)}`, `mission:${missionId}`, 'role:admin']);
    if (assigned.length) {
      tx.event(HTTP_EVENTS.MISSION_TEAM_UPDATED, {
        missionId, added: assigned, actorId: identity.userId, supportRequestId: String(request.id), createdAt: now
      }, [`mission:${missionId}`, 'role:admin', ...assigned.map((id) => `user:${id}`)]);
    }
  }
}
