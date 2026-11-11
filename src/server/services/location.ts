import type { AuthIdentity } from '../core/router.ts';
import type { Peer } from '../core/websocket.ts';
import { LruTtlCache } from '../core/cache.ts';
import { newId } from '../core/crypto.ts';
import { badRequest, forbidden, notFound } from '../core/errors.ts';
import { isStale, type Point } from '../../shared/geo.ts';
import { isValidPoint } from '../domain/geo.ts';
import { HTTP_EVENTS, ROLES, WS_EVENTS } from '../../shared/protocol.ts';
import type { AppContext } from './context.ts';

/** Parses a stored scope JSON array; anything unexpected falls back to the full detail set. */
function parseScope(value: unknown): ShareScopeDetail[] {
  try {
    const parsed = JSON.parse(String(value ?? '[]'));
    if (!Array.isArray(parsed)) return [...SHARE_SCOPE_DETAILS];
    const details = parsed.filter((detail): detail is ShareScopeDetail => SHARE_SCOPE_DETAILS.includes(detail as ShareScopeDetail));
    return details.length ? [...new Set(details)] : [...SHARE_SCOPE_DETAILS];
  } catch {
    return [...SHARE_SCOPE_DETAILS];
  }
}

interface LiveFix extends Point {
  userId: string;
  accuracy: number;
  heading: number | null;
  speed: number | null;
  recordedAt: number;
}

type ShareScopeDetail = 'route' | 'motion' | 'accuracy';
const SHARE_SCOPE_DETAILS: readonly ShareScopeDetail[] = ['route', 'motion', 'accuracy'];

interface ShareInput {
  recipientId: string;
  kind: 'live' | 'history';
  durationSeconds?: number;
  historyFrom?: number;
  historyTo?: number;
  scope?: ShareScopeDetail[];
}

export interface LiveFixInput extends Point {
  accuracy: number;
  heading?: number | null;
  speed?: number | null;
  recordedAt?: number;
}

export class LocationService {
  readonly liveCache: LruTtlCache<string, LiveFix>;
  private readonly shareCache: LruTtlCache<string, string[]>;
  private readonly persistedAt: LruTtlCache<string, number>;

  constructor(private readonly ctx: AppContext) {
    this.liveCache = new LruTtlCache(8192, 45_000, ctx.clock);
    this.shareCache = new LruTtlCache(8192, 5_000, ctx.clock);
    this.persistedAt = new LruTtlCache(8192, 60 * 60_000, ctx.clock);
  }

  createShare(identity: AuthIdentity, input: ShareInput): Record<string, unknown> {
    if (input.recipientId === identity.userId) throw badRequest('A user cannot share location with themselves.');
    const recipient = this.ctx.repo.one<Record<string, any>>('SELECT id, active FROM users WHERE id=?', input.recipientId);
    if (!recipient || !Number(recipient.active)) throw notFound('Recipient not found.');
    const now = this.ctx.clock();
    let expiresAt: number | null = null;
    let durationSeconds: number | null = null;
    let historyFrom: number | null = null;
    let historyTo: number | null = null;
    // A history grant must carry the explicitly selected detail set; live grants carry null
    // (a live fix has no field-level scope — it either streams or it does not). For backward
    // compatibility an omitted selection keeps the full detail set (recorded as such).
    const requestedScope = input.scope && input.scope.length ? [...new Set(input.scope)] : null;
    if (requestedScope) {
      const unknown = requestedScope.filter((detail) => !SHARE_SCOPE_DETAILS.includes(detail));
      if (unknown.length) throw badRequest('Unknown share scope details.', { details: unknown });
    }
    const scope = input.kind === 'history'
      ? JSON.stringify(requestedScope ?? SHARE_SCOPE_DETAILS)
      : null;
    if (input.kind === 'live') {
      // durationSeconds = 0 requests an indefinite live grant (no expiry; revoke any time).
      if (input.durationSeconds === 0) {
        durationSeconds = null;
        expiresAt = null;
      } else {
        durationSeconds = input.durationSeconds ?? 3600;
        expiresAt = now + durationSeconds * 1000;
      }
    } else {
      historyFrom = input.historyFrom ?? now - 24 * 60 * 60_000;
      historyTo = input.historyTo ?? now;
      if (historyFrom >= historyTo) throw badRequest('History range must be chronological.');
      if (historyTo > now + 60_000) throw badRequest('History range cannot end in the future.');
      if (now - historyFrom > 30 * 24 * 60 * 60_000) throw badRequest('History range is limited to 30 days.');
      expiresAt = historyTo;
    }
    const id = newId('shr');
    const result = this.ctx.uow.commit((tx) => {
      tx.repo.run(
        `INSERT INTO location_shares(id,owner_id,recipient_id,kind,duration_seconds,expires_at,history_from,history_to,created_at,revoked_at,scope)
         VALUES(?,?,?,?,?,?,?,?,?,NULL,?)`, id, identity.userId, input.recipientId, input.kind,
        durationSeconds, expiresAt, historyFrom, historyTo, now, scope);
      const payload = { shareId: id, ownerId: identity.userId, recipientId: input.recipientId, kind: input.kind, expiresAt };
      tx.event(HTTP_EVENTS.LOCATION_SHARE_CREATED, payload, [`user:${identity.userId}`, `user:${input.recipientId}`]);
      return payload;
    });
    this.invalidateShareCaches(identity.userId, input.recipientId);
    return { ok: true, share: result };
  }

  /**
   * Lists shares involving the viewer. With `includeAll`, revoked and expired shares are included
   * and each row carries a `state` (active | expired | revoked); the default stays active-only so
   * existing consumers are unaffected.
   */
  listShares(identity: AuthIdentity, includeAll = false): Record<string, unknown> {
    const now = this.ctx.clock();
    const rows = includeAll
      ? this.ctx.repo.all<Record<string, any>>(
        `SELECT s.*, owner.username AS ownerUsername, recipient.username AS recipientUsername
         FROM location_shares s
         JOIN users owner ON owner.id = s.owner_id
         JOIN users recipient ON recipient.id = s.recipient_id
         WHERE (s.owner_id = ? OR s.recipient_id = ?)
         ORDER BY s.created_at DESC LIMIT 100`, identity.userId, identity.userId)
      : this.ctx.repo.all<Record<string, any>>(
        `SELECT s.*, owner.username AS ownerUsername, recipient.username AS recipientUsername
         FROM location_shares s
         JOIN users owner ON owner.id = s.owner_id
         JOIN users recipient ON recipient.id = s.recipient_id
         WHERE (s.owner_id = ? OR s.recipient_id = ?) AND s.revoked_at IS NULL
           AND (s.expires_at IS NULL OR s.expires_at > ?)
         ORDER BY s.created_at DESC LIMIT 100`, identity.userId, identity.userId, now);
    const shareState = (row: Record<string, any>): 'active' | 'expired' | 'revoked' => {
      if (row.revoked_at !== null && row.revoked_at !== undefined) return 'revoked';
      if (row.expires_at !== null && row.expires_at !== undefined && Number(row.expires_at) <= now) return 'expired';
      return 'active';
    };
    return {
      items: rows.map((row) => ({ ...this.publicShare(row), state: shareState(row) })),
      outgoing: rows.filter((row) => row.owner_id === identity.userId).length,
      incoming: rows.filter((row) => row.recipient_id === identity.userId).length,
      total: rows.length
    };
  }

  revokeShare(identity: AuthIdentity, shareId: string): Record<string, unknown> {
    const share = this.ctx.repo.one<Record<string, any>>(
      'SELECT * FROM location_shares WHERE id=? AND owner_id=? AND revoked_at IS NULL', shareId, identity.userId);
    if (!share) throw notFound('Active share not found.');
    return this.ctx.uow.commit((tx) => {
      tx.repo.run('UPDATE location_shares SET revoked_at=? WHERE id=?', this.ctx.clock(), shareId);
      tx.event(HTTP_EVENTS.LOCATION_SHARE_ENDED, {
        shareId, ownerId: String(share.owner_id), recipientId: String(share.recipient_id), reason: 'revoked'
      }, [`user:${share.owner_id}`, `user:${share.recipient_id}`]);
      this.invalidateShareCaches(String(share.owner_id), String(share.recipient_id));
      return { ok: true, shareId };
    });
  }

  activeLiveRecipients(ownerId: string): string[] {
    const key = `recipients:${ownerId}`;
    const cached = this.shareCache.get(key);
    if (cached) return cached;
    const rows = this.ctx.repo.all<{ recipient_id: string }>(
      `SELECT recipient_id FROM location_shares WHERE owner_id=? AND kind='live' AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)`, ownerId, this.ctx.clock());
    const recipients = [...new Set(rows.map((row) => String(row.recipient_id)))];
    this.shareCache.set(key, recipients);
    return recipients;
  }

  private activeLiveOwners(viewerId: string): string[] {
    const key = `owners:${viewerId}`;
    const cached = this.shareCache.get(key);
    if (cached) return cached;
    const rows = this.ctx.repo.all<{ owner_id: string }>(
      `SELECT owner_id FROM location_shares WHERE recipient_id=? AND kind='live' AND revoked_at IS NULL
       AND (expires_at IS NULL OR expires_at > ?)`, viewerId, this.ctx.clock());
    const owners = [...new Set(rows.map((row) => String(row.owner_id)))];
    this.shareCache.set(key, owners);
    return owners;
  }

  publishLive(identity: AuthIdentity, fix: LiveFixInput, peer: Peer, requestId: string | undefined): void {
    const point: Point = { latitude: fix.latitude, longitude: fix.longitude };
    if (!isValidPoint(point)) throw badRequest('Coordinates are outside the valid range.');
    if (fix.accuracy < 0 || fix.accuracy > 100000) throw badRequest('Accuracy is outside the valid range.');
    const now = this.ctx.clock();
    const recordedAt = Math.min(fix.recordedAt ?? now, now + 5_000);
    const value: LiveFix = {
      userId: identity.userId, latitude: fix.latitude, longitude: fix.longitude,
      accuracy: fix.accuracy, heading: fix.heading ?? null, speed: fix.speed ?? null, recordedAt
    };
    this.liveCache.set(identity.userId, value);
    const previousPersist = this.persistedAt.get(identity.userId) ?? 0;
    if (now - previousPersist >= 5_000) {
      this.ctx.repo.run(
        `INSERT INTO location_points(user_id,latitude,longitude,accuracy,heading,speed,recorded_at,created_at)
         VALUES(?,?,?,?,?,?,?,?)`, identity.userId, value.latitude, value.longitude, value.accuracy,
        value.heading, value.speed, recordedAt, now);
      this.persistedAt.set(identity.userId, now);
    }
    const recipients = this.activeLiveRecipients(identity.userId);
    if (recipients.length) {
      this.ctx.hub.sendToUsers(recipients, {
        type: WS_EVENTS.LOCATION_PEER, userId: identity.userId, username: identity.username, fix: value, serverTime: now
      }, peer);
    }
    peer.sendJson({
      type: WS_EVENTS.ACK, requestId: requestId ?? null, kind: WS_EVENTS.LOCATION_UPDATE,
      accepted: true, recipients: recipients.length, serverTime: now
    });
  }

  snapshot(viewerId: string): Record<string, unknown> {
    const owners = [...new Set([viewerId, ...this.activeLiveOwners(viewerId)])];
    const items = owners.flatMap((ownerId) => {
      const fix = this.liveCache.get(ownerId);
      return fix && !isStale(fix.recordedAt, this.ctx.clock()) ? [fix] : [];
    });
    return { items, serverTime: this.ctx.clock(), staleAfterMs: 45_000 };
  }

  latestFix(userId: string): LiveFix | null {
    const fix = this.liveCache.get(userId);
    return fix && !isStale(fix.recordedAt, this.ctx.clock()) ? fix : null;
  }

  history(identity: AuthIdentity, targetUserId: string, from: number, to: number, limit: number): Record<string, unknown> {
    if (from >= to) throw badRequest('History range must be chronological.');
    const isOwnerOrAdmin = identity.userId === targetUserId || identity.role === ROLES.ADMIN;
    // The grant must explicitly cover the requested window; the recipient then sees only the
    // detail set the owner selected (route always; motion = speed/heading; accuracy).
    const grant = isOwnerOrAdmin ? null : this.ctx.repo.one<Record<string, any>>(
      `SELECT id, scope, history_from, history_to FROM location_shares WHERE owner_id=? AND recipient_id=? AND kind='history'
       AND revoked_at IS NULL AND history_from <= ? AND history_to >= ? AND (expires_at IS NULL OR expires_at > ?)
       ORDER BY created_at DESC LIMIT 1`,
      targetUserId, identity.userId, from, to, this.ctx.clock());
    if (!isOwnerOrAdmin && !grant) throw forbidden('History access was not granted.');
    const scopeDetails: ShareScopeDetail[] = grant
      ? parseScope(grant.scope)
      : [...SHARE_SCOPE_DETAILS];
    const includeMotion = scopeDetails.includes('motion');
    const includeAccuracy = scopeDetails.includes('accuracy');
    const rows = this.ctx.repo.all<Record<string, any>>(
      `SELECT latitude,longitude,accuracy,heading,speed,recorded_at FROM location_points
       WHERE user_id=? AND recorded_at>=? AND recorded_at<=? ORDER BY recorded_at ASC LIMIT ?`,
      targetUserId, from, to, Math.min(1000, limit));
    return {
      items: rows.map((row) => ({
        latitude: Number(row.latitude), longitude: Number(row.longitude),
        accuracy: includeAccuracy ? Number(row.accuracy) : null,
        heading: includeMotion && row.heading !== null ? Number(row.heading) : null,
        speed: includeMotion && row.speed !== null ? Number(row.speed) : null,
        recordedAt: Number(row.recorded_at)
      })),
      total: rows.length
    };
  }

  expireShares(now = this.ctx.clock()): number {
    const expired = this.ctx.repo.all<Record<string, any>>(
      'SELECT * FROM location_shares WHERE revoked_at IS NULL AND expires_at IS NOT NULL AND expires_at <= ?', now);
    for (const share of expired) {
      this.ctx.uow.commit((tx) => {
        tx.repo.run('UPDATE location_shares SET revoked_at=? WHERE id=? AND revoked_at IS NULL', now, String(share.id));
        tx.event(HTTP_EVENTS.LOCATION_SHARE_ENDED, {
          shareId: String(share.id), ownerId: String(share.owner_id), recipientId: String(share.recipient_id), reason: 'expired'
        }, [`user:${share.owner_id}`, `user:${share.recipient_id}`]);
        return null;
      });
      this.invalidateShareCaches(String(share.owner_id), String(share.recipient_id));
    }
    return expired.length;
  }

  purgePoints(cutoff: number): number {
    return this.ctx.repo.purgeLocationPointsBefore(cutoff);
  }

  stats(): Record<string, unknown> {
    return { live: this.liveCache.stats(), shareCache: this.shareCache.stats() };
  }

  private invalidateShareCaches(ownerId: string, recipientId: string): void {
    this.shareCache.delete(`recipients:${ownerId}`);
    this.shareCache.delete(`owners:${recipientId}`);
  }

  private publicShare(row: Record<string, any>): Record<string, unknown> {
    return {
      id: String(row.id), ownerId: String(row.owner_id), recipientId: String(row.recipient_id),
      ownerUsername: String(row.ownerUsername),
      recipientUsername: String(row.recipientUsername),
      kind: String(row.kind), durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
      expiresAt: row.expires_at === null ? null : Number(row.expires_at),
      historyFrom: row.history_from === null ? null : Number(row.history_from),
      historyTo: row.history_to === null ? null : Number(row.history_to),
      createdAt: Number(row.created_at), revokedAt: row.revoked_at === null ? null : Number(row.revoked_at),
      scope: row.scope === null || row.scope === undefined ? null : parseScope(row.scope)
    };
  }
}
