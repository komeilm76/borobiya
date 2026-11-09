import type { AuthIdentity } from '../core/router.ts';
import { badRequest, conflict, forbidden, notFound } from '../core/errors.ts';
import { newId } from '../core/crypto.ts';
import { HTTP_EVENTS, ROLES } from '../../shared/protocol.ts';
import type { AppContext } from './context.ts';

interface PlaceInput {
  name: string;
  label: string;
  latitude: number;
  longitude: number;
  address: string;
  icon: string;
  rank?: number;
}

export class UserService {
  constructor(private readonly ctx: AppContext) {}

  me(identity: AuthIdentity): Record<string, unknown> {
    const user = this.ctx.repo.one<Record<string, any>>('SELECT * FROM users WHERE id = ?', identity.userId);
    if (!user) throw notFound('Account not found.');
    const groups = this.ctx.repo.all<Record<string, any>>(
      `SELECT g.id, g.name, g.color, gm.role FROM group_members gm JOIN service_groups g ON g.id = gm.group_id
       WHERE gm.user_id = ? ORDER BY g.rank`, identity.userId);
    return {
      ...this.ctx.services.auth.publicUser(user),
      groups: groups.map((group) => ({ id: String(group.id), name: String(group.name), color: String(group.color), role: String(group.role) })),
      session: { id: identity.sessionId, deviceId: identity.deviceId, ip: identity.ip }
    };
  }

  devices(identity: AuthIdentity): Record<string, unknown> {
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT id, device_id, device_name, ip, expires_at, created_at, last_seen_at, revoked_at
       FROM sessions WHERE user_id = ? AND revoked_at IS NULL ORDER BY last_seen_at DESC LIMIT 50`, identity.userId);
    return {
      items: rows.map((row) => ({
        sessionId: String(row.id),
        deviceId: String(row.device_id),
        deviceName: String(row.device_name),
        ip: String(row.ip),
        lastActiveAt: Number(row.last_seen_at),
        createdAt: Number(row.created_at),
        expiresAt: Number(row.expires_at),
        isCurrentDevice: row.id === identity.sessionId,
        isOnline: this.ctx.services.realtime.isSessionOnline(String(row.id))
      })),
      total: rows.length
    };
  }

  revokeDevice(identity: AuthIdentity, sessionId: string): Record<string, unknown> {
    const session = this.ctx.repo.one('SELECT id FROM sessions WHERE id=? AND user_id=? AND revoked_at IS NULL', sessionId, identity.userId);
    if (!session) throw notFound('Device session not found.');
    this.ctx.repo.run('UPDATE sessions SET revoked_at=? WHERE id=?', this.ctx.clock(), sessionId);
    this.ctx.services.auth.invalidateSession(sessionId);
    this.ctx.hub.disconnectSession(sessionId);
    return { ok: true, sessionId };
  }

  loginHistory(identity: AuthIdentity, from: number, to: number, limit: number): Record<string, unknown> {
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT id, username_attempt, ip, device_name, success, created_at FROM login_history
       WHERE user_id = ? AND created_at >= ? AND created_at <= ? ORDER BY created_at DESC LIMIT ?`,
      identity.userId, from, to, Math.min(200, limit));
    return {
      items: rows.map((row) => ({
        id: Number(row.id), ip: String(row.ip), deviceName: String(row.device_name),
        success: Boolean(row.success), loginAt: Number(row.created_at)
      })),
      total: rows.length
    };
  }

  searchUsers(identity: AuthIdentity, query: string, role: string | undefined, limit: number): Record<string, unknown> {
    const rows = role
      ? this.ctx.repo.all<Record<string, any>>(
        `SELECT id, username, role, active, average_rating, ready_for_mission FROM users
         WHERE id <> ? AND active = 1 AND role = ? AND instr(lower(username), lower(?)) > 0
         ORDER BY username LIMIT ?`, identity.userId, role, query, Math.min(50, limit))
      : this.ctx.repo.all<Record<string, any>>(
        `SELECT id, username, role, active, average_rating, ready_for_mission FROM users
         WHERE id <> ? AND active = 1 AND instr(lower(username), lower(?)) > 0
         ORDER BY username LIMIT ?`, identity.userId, query, Math.min(50, limit));
    return {
      items: rows.map((row) => ({
        id: String(row.id), username: String(row.username), role: String(row.role),
        readyForMission: Boolean(row.ready_for_mission), averageRating: Number(row.average_rating),
        online: this.ctx.services.realtime.isUserOnline(String(row.id))
      })),
      total: rows.length
    };
  }

  places(identity: AuthIdentity): Record<string, unknown> {
    const rows = this.ctx.repo.all<Record<string, any>>(
      'SELECT * FROM saved_places WHERE user_id=? ORDER BY rank ASC, created_at ASC', identity.userId);
    return { items: rows.map((row) => this.publicPlace(row)), total: rows.length };
  }

  createPlace(identity: AuthIdentity, input: PlaceInput): Record<string, unknown> {
    const id = newId('plc');
    const now = this.ctx.clock();
    const max = this.ctx.repo.one<{ value: number }>('SELECT COALESCE(MAX(rank),0) AS value FROM saved_places WHERE user_id=?', identity.userId);
    const rank = Number.isFinite(input.rank) ? Number(input.rank) : Number(max?.value ?? 0) + 1;
    return this.ctx.uow.commit((tx) => {
      tx.repo.run(
        `INSERT INTO saved_places(id,user_id,name,label,latitude,longitude,address,icon,rank,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?,?,?)`, id, identity.userId, input.name, input.label, input.latitude,
        input.longitude, input.address, input.icon, rank, now, now);
      tx.event(HTTP_EVENTS.USER_UPDATED, { userId: identity.userId, kind: 'saved-place-created', placeId: id }, [`user:${identity.userId}`]);
      return this.publicPlace({ id, user_id: identity.userId, ...input, rank, created_at: now, updated_at: now });
    });
  }

  updatePlace(identity: AuthIdentity, placeId: string, input: PlaceInput): Record<string, unknown> {
    const place = this.ctx.repo.one('SELECT id FROM saved_places WHERE id=? AND user_id=?', placeId, identity.userId);
    if (!place) throw notFound('Saved place not found.');
    return this.ctx.uow.commit((tx) => {
      tx.repo.run(
        `UPDATE saved_places SET name=?,label=?,latitude=?,longitude=?,address=?,icon=?,rank=?,updated_at=?
         WHERE id=? AND user_id=?`, input.name, input.label, input.latitude, input.longitude, input.address,
        input.icon, input.rank ?? 1, this.ctx.clock(), placeId, identity.userId);
      tx.event(HTTP_EVENTS.USER_UPDATED, { userId: identity.userId, kind: 'saved-place-updated', placeId }, [`user:${identity.userId}`]);
      return { ok: true, placeId };
    });
  }

  deletePlace(identity: AuthIdentity, placeId: string): Record<string, unknown> {
    const result = this.ctx.uow.commit((tx) => {
      const removed = tx.repo.run('DELETE FROM saved_places WHERE id=? AND user_id=?', placeId, identity.userId).changes;
      if (!removed) throw notFound('Saved place not found.');
      tx.event(HTTP_EVENTS.USER_UPDATED, { userId: identity.userId, kind: 'saved-place-deleted', placeId }, [`user:${identity.userId}`]);
      return { ok: true, placeId };
    });
    return result;
  }

  reorderPlaces(identity: AuthIdentity, ids: string[]): Record<string, unknown> {
    if (new Set(ids).size !== ids.length) throw badRequest('Place IDs must be unique.');
    return this.ctx.uow.commit((tx) => {
      for (const [index, id] of ids.entries()) {
        const owned = tx.repo.one('SELECT id FROM saved_places WHERE id=? AND user_id=?', id, identity.userId);
        if (!owned) throw notFound('Saved place not found.');
        tx.repo.run('UPDATE saved_places SET rank=?, updated_at=? WHERE id=?', index + 1, this.ctx.clock(), id);
      }
      tx.event(HTTP_EVENTS.USER_UPDATED, { userId: identity.userId, kind: 'saved-places-reordered' }, [`user:${identity.userId}`]);
      return { ok: true, items: ids.length };
    });
  }

  setReady(identity: AuthIdentity, ready: boolean): Record<string, unknown> {
    if (identity.role !== ROLES.RESPONDER) throw forbidden('Only responders can change mission readiness.');
    return this.ctx.uow.commit((tx) => {
      tx.repo.run('UPDATE users SET ready_for_mission=?, updated_at=? WHERE id=?', ready ? 1 : 0, this.ctx.clock(), identity.userId);
      tx.event(HTTP_EVENTS.PRESENCE_CHANGED, { userId: identity.userId, readyForMission: ready }, [`user:${identity.userId}`, 'role:admin']);
      return { ok: true, readyForMission: ready };
    });
  }

  updateMe(identity: AuthIdentity, username: string): Record<string, unknown> {
    const existing = this.ctx.repo.one('SELECT id FROM users WHERE username=? AND id<>?', username, identity.userId);
    if (existing) throw conflict('Username is already taken.', { field: 'username', code: 'USERNAME_TAKEN' });
    return this.ctx.uow.commit((tx) => {
      tx.repo.run('UPDATE users SET username=?, updated_at=? WHERE id=?', username, this.ctx.clock(), identity.userId);
      tx.event(HTTP_EVENTS.USER_UPDATED, { userId: identity.userId, username }, [`user:${identity.userId}`, 'role:admin']);
      this.ctx.services.auth.invalidateUser(identity.userId);
      return { ok: true, username };
    });
  }

  sync(identity: AuthIdentity, since: number, limit: number): Record<string, unknown> {
    const events = this.ctx.repo.eventsSince(since, {
      userId: identity.userId, role: identity.role, sessionId: identity.sessionId
    }, limit);
    return { events, cursor: events.length ? events[events.length - 1].id : since, hasMore: events.length === Math.min(500, Math.max(1, limit)) };
  }

  ticket(identity: AuthIdentity, ip: string): Record<string, unknown> {
    return this.ctx.services.realtime.issueTicket(identity, ip);
  }


  private publicPlace(row: Record<string, any>): Record<string, unknown> {
    return {
      id: String(row.id), name: String(row.name), label: String(row.label),
      latitude: Number(row.latitude), longitude: Number(row.longitude), address: String(row.address),
      icon: String(row.icon), rank: Number(row.rank), createdAt: Number(row.created_at), updatedAt: Number(row.updated_at)
    };
  }
}
