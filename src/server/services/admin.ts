import type { AuthIdentity } from '../core/router.ts';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.ts';
import { hashPassword, newId } from '../core/crypto.ts';
import type { SqlValue } from '../db/repository.ts';
import type { Repository } from '../db/repository.ts';
import { HTTP_EVENTS, MISSION_STATUS, ROLES } from '../../shared/protocol.ts';
import type { AppContext } from './context.ts';

export interface UserFilters { q?: string; role?: string; active?: boolean; page: number; limit: number }
export interface AuditFilters { from: number; to: number; action?: string; q?: string; limit: number }
interface GroupInput { name: string; color: string; capacity: number; incidentIds: string[]; status?: string }
interface NewUserInput { username: string; password: string; role: string; jobTypeId?: string | null }

const SETTINGS_KEYS = new Set(['sos_auto_dispatch', 'default_dispatch_radius_m', 'mission_ready_required', 'maintenance_mode']);

function csvEscape(value: unknown): string {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export class AdminService {
  constructor(private readonly ctx: AppContext) {}

  overview(): Record<string, unknown> {
    const now = this.ctx.clock();
    const dayStart = now - (now % 86_400_000);
    const kpis = {
      onlineResponders: this.ctx.services.realtime.onlineResponderCount(),
      requestsToday: Number(this.ctx.repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM sos_requests WHERE created_at >= ?', dayStart)?.c ?? 0),
      activeMissions: Number(this.ctx.repo.one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM missions WHERE status NOT IN (?,?)`, MISSION_STATUS.COMPLETED, MISSION_STATUS.CANCELLED)?.c ?? 0),
      averageResponseSeconds: this.averageResponseSeconds()
    };
    const statusRows = this.ctx.repo.all<Record<string, any>>('SELECT status, COUNT(*) AS count FROM sos_requests GROUP BY status');
    const statusCounts = Object.fromEntries(statusRows.map((row) => [String(row.status), Number(row.count)]));
    const groups = this.groups().items;
    const alerts = this.ctx.repo.all<Record<string, any>>(
      'SELECT * FROM alerts WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 8');
    const recentRequests = this.ctx.repo.all<Record<string, any>>(
      `SELECT s.id, s.status, s.severity, s.created_at, i.label AS incidentLabel, u.username AS requesterUsername
       FROM sos_requests s JOIN incident_types i ON i.id=s.incident_type_id JOIN users u ON u.id=s.requester_id
       ORDER BY s.created_at DESC LIMIT 8`);
    const created = this.ctx.repo.all<{ created_at: number }>('SELECT created_at FROM sos_requests WHERE created_at >= ?', now - 7 * 86_400_000);
    const trend = Array.from({ length: 7 }, (_, index) => {
      const dayIndex = 6 - index;
      const start = dayStart - dayIndex * 86_400_000;
      const end = start + 86_400_000;
      return { day: new Date(start).toISOString().slice(0, 10), count: created.filter((row) => Number(row.created_at) >= start && Number(row.created_at) < end).length };
    });
    return {
      kpis,
      statusCounts,
      trend,
      groups,
      alerts: alerts.map((alert) => this.publicAlert(alert)),
      recentRequests: recentRequests.map((row) => ({
        id: String(row.id), status: String(row.status), severity: String(row.severity),
        incidentLabel: String(row.incidentLabel), requesterUsername: String(row.requesterUsername), createdAt: Number(row.created_at)
      })),
      serverTime: now
    };
  }

  users(filters: UserFilters): Record<string, unknown> {
    const clauses: string[] = [];
    const params: SqlValue[] = [];
    if (filters.q) { clauses.push('instr(lower(users.username), lower(?)) > 0'); params.push(filters.q); }
    if (filters.role) { clauses.push('users.role = ?'); params.push(filters.role); }
    if (filters.active !== undefined) { clauses.push('users.active = ?'); params.push(filters.active ? 1 : 0); }
    const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
    const limit = Math.min(100, Math.max(1, filters.limit));
    const offset = Math.max(0, (filters.page - 1) * limit);
    const total = Number(this.ctx.repo.one<{ c: number }>(`SELECT COUNT(*) AS c FROM users${where}`, ...params)?.c ?? 0);
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT users.id, users.username, users.role, users.active, security_ready, must_complete_security_questions,
        ready_for_mission, average_rating, users.created_at, users.updated_at, users.job_type_id,
        jt.label AS jobTypeLabel,
        (SELECT COUNT(*) FROM sessions s WHERE s.user_id=users.id AND s.revoked_at IS NULL AND s.expires_at>?) AS sessionCount
       FROM users LEFT JOIN job_types jt ON jt.id = users.job_type_id${where} ORDER BY users.created_at DESC LIMIT ? OFFSET ?`, this.ctx.clock(), ...params, limit, offset);
    return {
      items: rows.map((row) => ({
        id: String(row.id), username: String(row.username), role: String(row.role), active: Boolean(row.active),
        securityReady: Boolean(row.security_ready), mustCompleteSecurityQuestions: Boolean(row.must_complete_security_questions),
        readyForMission: Boolean(row.ready_for_mission), averageRating: Number(row.average_rating),
        jobTypeId: row.job_type_id ? String(row.job_type_id) : null, jobTypeLabel: row.jobTypeLabel ? String(row.jobTypeLabel) : null,
        sessionCount: Number(row.sessionCount), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at),
        online: this.ctx.services.realtime.isUserOnline(String(row.id))
      })),
      total, page: filters.page, limit, hasMore: offset + rows.length < total
    };
  }

  async createUser(identity: AuthIdentity, input: NewUserInput): Promise<Record<string, unknown>> {
    if (this.ctx.repo.one('SELECT id FROM users WHERE username=?', input.username)) {
      throw conflict('Username is already taken.', { field: 'username', code: 'USERNAME_TAKEN' });
    }
    if (![ROLES.USER, ROLES.RESPONDER, ROLES.ADMIN].includes(input.role as typeof ROLES[keyof typeof ROLES])) {
      throw badRequest('Unknown account role.', { field: 'role' });
    }
    if (input.jobTypeId) {
      const jobType = this.ctx.repo.one('SELECT id FROM job_types WHERE id=? AND active=1', input.jobTypeId);
      if (!jobType) throw badRequest('Unknown active job type.', { field: 'jobTypeId' });
    }
    const passwordHash = await hashPassword(input.password);
    const id = newId('usr');
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      tx.repo.run(
        `INSERT INTO users(id,username,password_hash,role,active,security_ready,must_complete_security_questions,ready_for_mission,job_type_id,created_at,updated_at)
         VALUES(?,?,?,?,1,0,1,0,?,?,?)`, id, input.username, passwordHash, input.role, input.jobTypeId ?? null, now, now);
      this.audit(tx.repo, identity, 'user.create', id, { username: input.username, role: input.role });
      tx.event(HTTP_EVENTS.USER_UPDATED, { userId: id, created: true, role: input.role }, ['role:admin']);
      return { ok: true, userId: id, username: input.username, role: input.role, mustCompleteSecurityQuestions: true };
    });
  }

  usersCsv(filters: UserFilters): string {
    const rows = this.users({ ...filters, page: 1, limit: Math.min(100, filters.limit) }).items as Array<Record<string, unknown>>;
    const header = ['id', 'username', 'role', 'active', 'securityReady', 'readyForMission', 'averageRating', 'jobType', 'online', 'createdAt'];
    const lines = [header.join(',')];
    for (const row of rows) lines.push(header.map((key) => csvEscape(row[key])).join(','));
    return lines.join('\r\n');
  }

  userDetails(userId: string): Record<string, unknown> {
    const user = this.ctx.repo.one<Record<string, any>>('SELECT * FROM users WHERE id=?', userId);
    if (!user) throw notFound('User not found.');
    const sessions = this.ctx.repo.all<Record<string, any>>(
      'SELECT id,device_name,ip,created_at,last_seen_at,expires_at FROM sessions WHERE user_id=? AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 20', userId);
    const logins = this.ctx.repo.all<Record<string, any>>(
      'SELECT ip,device_name,success,created_at FROM login_history WHERE user_id=? ORDER BY created_at DESC LIMIT 20', userId);
    return {
      user: this.ctx.services.auth.publicUser(user),
      sessions: sessions.map((row) => ({ sessionId: String(row.id), deviceName: String(row.device_name), ip: String(row.ip),
        createdAt: Number(row.created_at), lastActiveAt: Number(row.last_seen_at), expiresAt: Number(row.expires_at) })),
      logins: logins.map((row) => ({ ip: String(row.ip), deviceName: String(row.device_name), success: Boolean(row.success), loginAt: Number(row.created_at) })),
      sosCount: Number(this.ctx.repo.one<{ c: number }>('SELECT COUNT(*) AS c FROM sos_requests WHERE requester_id=?', userId)?.c ?? 0)
    };
  }

  updateUser(identity: AuthIdentity, userId: string, input: { active?: boolean; role?: string; jobTypeId?: string | null }): Record<string, unknown> {
    const user = this.ctx.repo.one<Record<string, any>>('SELECT * FROM users WHERE id=?', userId);
    if (!user) throw notFound('User not found.');
    if (userId === identity.userId && (input.active === false || (input.role && input.role !== ROLES.ADMIN))) {
      throw forbidden('Administrators cannot suspend or demote their own active account.');
    }
    const losesAdmin = String(user.role) === ROLES.ADMIN && (input.active === false || (input.role && input.role !== ROLES.ADMIN));
    if (losesAdmin) {
      const otherAdmins = Number(this.ctx.repo.one<{ c: number }>(
        `SELECT COUNT(*) AS c FROM users WHERE role=? AND active=1 AND id<>?`, ROLES.ADMIN, userId)?.c ?? 0);
      if (!otherAdmins) throw conflict('The last active administrator cannot be removed.');
    }
    if (input.jobTypeId) {
      const jobType = this.ctx.repo.one('SELECT id FROM job_types WHERE id=? AND active=1', input.jobTypeId);
      if (!jobType) throw badRequest('Unknown active job type.', { field: 'jobTypeId' });
    }
    const active = input.active === undefined ? Number(user.active) : input.active ? 1 : 0;
    const role = input.role ?? String(user.role);
    const jobTypeId = input.jobTypeId === undefined ? (user.job_type_id ?? null) : input.jobTypeId;
    const result = this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      tx.repo.run('UPDATE users SET active=?, role=?, job_type_id=?, updated_at=? WHERE id=?', active, role, jobTypeId, now, userId);
      this.audit(tx.repo, identity, 'user.update', userId, { active, role, jobTypeId });
      tx.event(HTTP_EVENTS.USER_UPDATED, { userId, active: Boolean(active), role, actorId: identity.userId },
        [`user:${userId}`, 'role:admin']);
      return { ok: true, userId, active: Boolean(active), role, jobTypeId };
    });
    if (!active) this.ctx.services.auth.revokeAllSessions(userId);
    return result;
  }

  groups(): { items: Record<string, unknown>[]; total: number } {
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT g.*, COUNT(DISTINCT gm.user_id) AS memberCount, COUNT(DISTINCT git.incident_type_id) AS coverageCount
       FROM service_groups g
       LEFT JOIN group_members gm ON gm.group_id=g.id
       LEFT JOIN group_incident_types git ON git.group_id=g.id
       GROUP BY g.id ORDER BY g.rank`);
    const items = rows.map((row) => ({
      id: String(row.id), name: String(row.name), color: String(row.color), capacity: Number(row.capacity),
      status: String(row.status), rank: Number(row.rank), memberCount: Number(row.memberCount),
      coverageCount: Number(row.coverageCount),
      incidentIds: this.ctx.repo.all<{ incident_type_id: string }>(
        'SELECT incident_type_id FROM group_incident_types WHERE group_id=?', String(row.id)).map((item) => String(item.incident_type_id)),
      // Dispatch must name responders that belong to this group: the server rejects the whole
      // request otherwise, so the board cannot invent an id and hope.
      memberIds: this.ctx.repo.all<{ user_id: string }>(
        'SELECT user_id FROM group_members WHERE group_id=? ORDER BY role DESC, user_id', String(row.id))
        .map((item) => String(item.user_id))
    }));
    return { items, total: items.length };
  }

  incidentTypes(): Record<string, unknown> {
    const rows = this.ctx.repo.all<Record<string, any>>('SELECT * FROM incident_types ORDER BY rank');
    return { items: rows.map((row) => ({ id: String(row.id), label: String(row.label), icon: String(row.icon), color: String(row.color) })), total: rows.length };
  }

  createGroup(identity: AuthIdentity, input: GroupInput): Record<string, unknown> {
    this.assertIncidentIds(input.incidentIds);
    const id = newId('grp');
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      const rank = Number(tx.repo.one<{ c: number }>('SELECT COALESCE(MAX(rank),0)+1 AS c FROM service_groups')?.c ?? 1);
      tx.repo.run('INSERT INTO service_groups(id,name,color,capacity,status,rank,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)',
        id, input.name, input.color, input.capacity, input.status ?? 'active', rank, now, now);
      for (const incidentId of input.incidentIds) tx.repo.run('INSERT INTO group_incident_types(group_id,incident_type_id) VALUES(?,?)', id, incidentId);
      this.audit(tx.repo, identity, 'group.create', id, { name: input.name });
      tx.event(HTTP_EVENTS.SETTINGS_UPDATED, { kind: 'group-created', groupId: id }, ['role:admin']);
      return { ok: true, groupId: id };
    });
  }

  updateGroup(identity: AuthIdentity, groupId: string, input: GroupInput): Record<string, unknown> {
    const group = this.ctx.repo.one('SELECT id FROM service_groups WHERE id=?', groupId);
    if (!group) throw notFound('Service group not found.');
    this.assertIncidentIds(input.incidentIds);
    return this.ctx.uow.commit((tx) => {
      tx.repo.run('UPDATE service_groups SET name=?,color=?,capacity=?,status=?,updated_at=? WHERE id=?',
        input.name, input.color, input.capacity, input.status ?? 'active', this.ctx.clock(), groupId);
      tx.repo.run('DELETE FROM group_incident_types WHERE group_id=?', groupId);
      for (const incidentId of input.incidentIds) tx.repo.run('INSERT INTO group_incident_types(group_id,incident_type_id) VALUES(?,?)', groupId, incidentId);
      this.audit(tx.repo, identity, 'group.update', groupId, { name: input.name });
      tx.event(HTTP_EVENTS.SETTINGS_UPDATED, { kind: 'group-updated', groupId }, ['role:admin']);
      return { ok: true, groupId };
    });
  }

  addGroupMember(identity: AuthIdentity, groupId: string, userId: string, role: string): Record<string, unknown> {
    this.assertGroup(groupId);
    const user = this.ctx.repo.one<Record<string, any>>('SELECT id,role FROM users WHERE id=? AND active=1', userId);
    if (!user || String(user.role) === ROLES.USER) throw badRequest('Only active responders or administrators can join a service group.', { field: 'userId' });
    return this.ctx.uow.commit((tx) => {
      tx.repo.run(`INSERT INTO group_members(group_id,user_id,role) VALUES(?,?,?)
        ON CONFLICT(group_id,user_id) DO UPDATE SET role=excluded.role`, groupId, userId, role);
      this.audit(tx.repo, identity, 'group.member.add', groupId, { userId, role });
      tx.event(HTTP_EVENTS.SETTINGS_UPDATED, { kind: 'group-member-added', groupId, userId }, ['role:admin', `user:${userId}`]);
      return { ok: true, groupId, userId };
    });
  }

  removeGroupMember(identity: AuthIdentity, groupId: string, userId: string): Record<string, unknown> {
    this.assertGroup(groupId);
    return this.ctx.uow.commit((tx) => {
      tx.repo.run('DELETE FROM group_members WHERE group_id=? AND user_id=?', groupId, userId);
      this.audit(tx.repo, identity, 'group.member.remove', groupId, { userId });
      tx.event(HTTP_EVENTS.SETTINGS_UPDATED, { kind: 'group-member-removed', groupId, userId }, ['role:admin', `user:${userId}`]);
      return { ok: true, groupId, userId };
    });
  }

  auditLog(filters: AuditFilters): Record<string, unknown> {
    const clauses = ['a.created_at >= ?', 'a.created_at <= ?'];
    const params: SqlValue[] = [filters.from, filters.to];
    if (filters.action) { clauses.push('a.action = ?'); params.push(filters.action); }
    if (filters.q) { clauses.push('(instr(lower(a.target), lower(?)) > 0 OR instr(lower(a.action), lower(?)) > 0 OR instr(lower(COALESCE(u.username,\'\')), lower(?)) > 0)'); params.push(filters.q, filters.q, filters.q); }
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT a.*, u.username AS actorUsername FROM audit_log a LEFT JOIN users u ON u.id=a.actor_id
       WHERE ${clauses.join(' AND ')} ORDER BY a.created_at DESC LIMIT ?`, ...params, Math.min(500, filters.limit));
    return { items: rows.map((row) => this.publicAudit(row)), total: rows.length };
  }

  auditCsv(filters: AuditFilters): string {
    const rows = this.auditLog({ ...filters, limit: 500 }).items as Array<Record<string, unknown>>;
    const header = ['id', 'createdAt', 'actorUsername', 'action', 'target', 'ip', 'trackingCode'];
    const lines = [header.join(',')];
    for (const row of rows) lines.push(header.map((key) => csvEscape(row[key])).join(','));
    return lines.join('\r\n');
  }

  alerts(includeResolved: boolean): Record<string, unknown> {
    const rows = includeResolved
      ? this.ctx.repo.all<Record<string, any>>('SELECT * FROM alerts ORDER BY created_at DESC LIMIT 100')
      : this.ctx.repo.all<Record<string, any>>('SELECT * FROM alerts WHERE resolved_at IS NULL ORDER BY created_at DESC LIMIT 100');
    return { items: rows.map((row) => this.publicAlert(row)), total: rows.length };
  }

  resolveAlert(identity: AuthIdentity, alertId: string): Record<string, unknown> {
    return this.ctx.uow.commit((tx) => {
      const result = tx.repo.run('UPDATE alerts SET resolved_at=?, resolved_by=? WHERE id=? AND resolved_at IS NULL',
        this.ctx.clock(), identity.userId, alertId);
      if (!result.changes) throw notFound('Open alert not found.');
      this.audit(tx.repo, identity, 'alert.resolve', alertId, {});
      tx.event(HTTP_EVENTS.ADMIN_ALERT, { alertId, resolved: true }, ['role:admin']);
      return { ok: true, alertId };
    });
  }

  settings(): Record<string, unknown> {
    const rows = this.ctx.repo.all<{ key: string; value: string; updated_at: number }>('SELECT key,value,updated_at FROM settings ORDER BY key');
    return { items: rows.map((row) => ({ key: row.key, value: row.value, updatedAt: Number(row.updated_at) })), total: rows.length };
  }

  updateSettings(identity: AuthIdentity, settings: Record<string, string>): Record<string, unknown> {
    const keys = Object.keys(settings);
    if (!keys.length) throw badRequest('At least one setting is required.');
    for (const key of keys) if (!SETTINGS_KEYS.has(key)) throw badRequest('Unknown setting key.', { field: key });
    return this.ctx.uow.commit((tx) => {
      for (const [key, value] of Object.entries(settings)) {
        tx.repo.run(`INSERT INTO settings(key,value,updated_at,updated_by) VALUES(?,?,?,?)
          ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at, updated_by=excluded.updated_by`,
          key, value, this.ctx.clock(), identity.userId);
      }
      this.audit(tx.repo, identity, 'settings.update', 'system', { keys });
      tx.event(HTTP_EVENTS.SETTINGS_UPDATED, { keys, actorId: identity.userId }, ['role:admin']);
      return { ok: true, keys };
    });
  }

  systemHealth(): Record<string, unknown> {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor((this.ctx.clock() - this.ctx.startedAt) / 1000),
      database: this.ctx.repo.stats(),
      realtime: { ...this.ctx.hub.stats(), ...this.ctx.services.realtime.stats() },
      map: this.ctx.services.map.stats(),
      location: this.ctx.services.location.stats(),
      staticFiles: this.ctx.staticFiles.stats(),
      memory: process.memoryUsage(),
      serverTime: this.ctx.clock()
    };
  }

  private averageResponseSeconds(): number {
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT s.created_at AS requestedAt, me.created_at AS acceptedAt FROM missions m
       JOIN sos_requests s ON s.id=m.sos_id
       JOIN mission_events me ON me.mission_id=m.id AND me.action='accept'`);
    if (!rows.length) return 0;
    const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row.acceptedAt) - Number(row.requestedAt)), 0);
    return Math.round(total / rows.length / 1000);
  }

  private assertGroup(groupId: string): void {
    if (!this.ctx.repo.one('SELECT id FROM service_groups WHERE id=?', groupId)) throw notFound('Service group not found.');
  }

  private assertIncidentIds(ids: string[]): void {
    if (new Set(ids).size !== ids.length) throw badRequest('Incident types must be unique.', { field: 'incidentIds' });
    for (const id of ids) if (!this.ctx.repo.one('SELECT id FROM incident_types WHERE id=?', id)) throw badRequest('Unknown incident type.', { field: 'incidentIds' });
  }

  jobTypes(): Record<string, unknown> {
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT jt.*, (SELECT COUNT(*) FROM users u WHERE u.job_type_id = jt.id AND u.active = 1) AS memberCount
       FROM job_types jt ORDER BY rank ASC`);
    return {
      items: rows.map((row) => this.publicJobType(row)),
      total: rows.length
    };
  }

  createJobType(identity: AuthIdentity, input: { label: string; offerPolicy: string }): Record<string, unknown> {
    const label = input.label.trim();
    if (!label) throw badRequest('Job type label is required.', { field: 'label' });
    if (!['all', 'ready_only'].includes(input.offerPolicy)) throw badRequest('Unknown offer policy.', { field: 'offerPolicy' });
    const rank = Number(this.ctx.repo.one<{ value: number }>('SELECT COALESCE(MAX(rank),0) AS value FROM job_types')?.value ?? 0) + 1;
    const id = newId('job');
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      tx.repo.run('INSERT INTO job_types(id,label,offer_policy,rank,active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)',
        id, label, input.offerPolicy, rank, now, now);
      this.audit(tx.repo, identity, 'job-type.create', id, { label, offerPolicy: input.offerPolicy });
      return { ok: true, jobType: this.publicJobType({ id, label, offer_policy: input.offerPolicy, rank, active: 1, created_at: now, updated_at: now, memberCount: 0 }) };
    });
  }

  updateJobType(identity: AuthIdentity, jobTypeId: string, input: { label?: string; offerPolicy?: string; active?: boolean }): Record<string, unknown> {
    const jobType = this.ctx.repo.one<Record<string, any>>('SELECT * FROM job_types WHERE id=?', jobTypeId);
    if (!jobType) throw notFound('Job type not found.');
    if (input.offerPolicy !== undefined && !['all', 'ready_only'].includes(input.offerPolicy)) {
      throw badRequest('Unknown offer policy.', { field: 'offerPolicy' });
    }
    const label = input.label === undefined ? String(jobType.label) : input.label.trim();
    if (!label) throw badRequest('Job type label is required.', { field: 'label' });
    const offerPolicy = input.offerPolicy ?? String(jobType.offer_policy);
    const active = input.active === undefined ? Number(jobType.active) : input.active ? 1 : 0;
    return this.ctx.uow.commit((tx) => {
      const now = this.ctx.clock();
      tx.repo.run('UPDATE job_types SET label=?, offer_policy=?, active=?, updated_at=? WHERE id=?', label, offerPolicy, active, now, jobTypeId);
      this.audit(tx.repo, identity, 'job-type.update', jobTypeId, { label, offerPolicy, active });
      tx.event(HTTP_EVENTS.SETTINGS_UPDATED, { kind: 'job-type', jobTypeId, offerPolicy, active: Boolean(active) }, ['role:admin']);
      const row = tx.repo.one<Record<string, any>>(
        `SELECT jt.*, (SELECT COUNT(*) FROM users u WHERE u.job_type_id = jt.id AND u.active = 1) AS memberCount FROM job_types jt WHERE id=?`, jobTypeId);
      return { ok: true, jobType: this.publicJobType(row!) };
    });
  }

  private publicJobType(row: Record<string, any>): Record<string, unknown> {
    return {
      id: String(row.id), label: String(row.label), offerPolicy: String(row.offer_policy),
      rank: Number(row.rank), active: Boolean(row.active), memberCount: Number(row.memberCount ?? 0),
      createdAt: Number(row.created_at), updatedAt: Number(row.updated_at)
    };
  }

  private audit(repo: Repository, identity: AuthIdentity, action: string, target: string, meta: Record<string, unknown>): void {
    repo.run('INSERT INTO audit_log(actor_id,action,target,ip,meta_json,created_at) VALUES(?,?,?,?,?,?)',
      identity.userId, action, target, identity.ip, JSON.stringify(meta), this.ctx.clock());
  }

  private publicAlert(row: Record<string, any>): Record<string, unknown> {
    return {
      id: String(row.id), kind: String(row.kind), severity: String(row.severity), message: String(row.message),
      createdAt: Number(row.created_at), resolvedAt: row.resolved_at ? Number(row.resolved_at) : null,
      resolvedBy: row.resolved_by ? String(row.resolved_by) : null
    };
  }

  private publicAudit(row: Record<string, any>): Record<string, unknown> {
    return {
      id: Number(row.id), trackingCode: 1000 + Number.parseInt(String(row.id).padStart(8, '0')) % 9000,
      createdAt: Number(row.created_at), actorUsername: row.actorUsername ? String(row.actorUsername) : null,
      action: String(row.action), target: String(row.target), ip: String(row.ip)
    };
  }
}

