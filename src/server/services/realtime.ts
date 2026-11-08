import type { AuthIdentity } from '../core/router.ts';
import type { Peer } from '../core/websocket.ts';
import { LruTtlCache } from '../core/cache.ts';
import { randomToken, tokenHash } from '../core/crypto.ts';
import { badRequest, forbidden, HttpError, isHttpError } from '../core/errors.ts';
import { identifier, latitude, longitude, number, oneOf, optional, parse, positiveInteger, shape, text } from '../core/validate.ts';
import { AUDIO, CACHE, ROLES, WS_EVENTS } from '../../shared/protocol.ts';
import { TalkFloor, type TalkState } from './talk.ts';
import type { LiveFixInput } from './location.ts';
import type { AppContext } from './context.ts';

interface TicketRecord {
  identity: AuthIdentity;
  ip: string;
  expiresAt: number;
}

const requestId = optional(text({ max: 80, allowEmpty: true }));
const optionalClock = optional(number({ min: 0, max: Number.MAX_SAFE_INTEGER, integer: true }));

export class RealtimeService {
  readonly tickets: LruTtlCache<string, TicketRecord>;
  readonly talkFloor: TalkFloor;
  private readonly onlineByUser = new Map<string, Set<string>>();
  private readonly onlineBySession = new Map<string, string>();
  private readonly rolesByUser = new Map<string, string>();

  private readonly locationSchema = shape({
    type: oneOf([WS_EVENTS.LOCATION_UPDATE]),
    requestId,
    latitude,
    longitude,
    accuracy: number({ min: 0, max: 100000 }),
    heading: optional(number({ min: 0, max: 360 })),
    speed: optional(number({ min: 0, max: 200 })),
    recordedAt: optionalClock
  });
  private readonly subscribeSchema = shape({
    type: oneOf([WS_EVENTS.SUBSCRIBE]),
    requestId,
    room: text({ min: 3, max: 80, pattern: /^[a-z0-9:_-]+$/i })
  });
  private readonly talkStartSchema = shape({
    type: oneOf([WS_EVENTS.TALK_START]),
    requestId,
    peerUserId: identifier
  });
  private readonly talkStopSchema = shape({
    type: oneOf([WS_EVENTS.TALK_STOP]),
    requestId,
    talkId: positiveInteger
  });
  private readonly snapshotSchema = shape({
    type: oneOf([WS_EVENTS.SNAPSHOT]),
    requestId
  });
  private readonly syncSchema = shape({
    type: oneOf(['sync']),
    requestId,
    since: optional(number({ min: 0, max: Number.MAX_SAFE_INTEGER, integer: true })),
    limit: optional(number({ min: 1, max: 200, integer: true }))
  });
  private readonly pingSchema = shape({
    type: oneOf([WS_EVENTS.PING]),
    requestId,
    at: optionalClock
  });

  constructor(private readonly ctx: AppContext) {
    this.tickets = new LruTtlCache(CACHE.TICKET_LIMIT, ctx.config.ticketTtlSeconds * 1000, ctx.clock);
    this.talkFloor = new TalkFloor(ctx.clock);
  }

  issueTicket(identity: AuthIdentity, ip: string): Record<string, unknown> {
    const ticket = randomToken(32);
    const expiresAt = this.ctx.clock() + this.ctx.config.ticketTtlSeconds * 1000;
    this.tickets.set(tokenHash(ticket), { identity, ip, expiresAt });
    return {
      ticket,
      expiresAt,
      path: '/ws',
      heartbeatMs: this.ctx.config.wsHeartbeatMs,
      protocol: 1
    };
  }

  /**
   * Redeems a one-use realtime ticket bound to the requesting address.
   *
   * @param ticket Raw ticket from the query string.
   * @param request The upgrade request.
   * @returns The identity the ticket was issued for, or null.
   */
  consumeTicket(ticket: string | null, request: Request): AuthIdentity | null {
    if (!ticket || !/^[A-Za-z0-9_-]{20,128}$/.test(ticket)) return null;
    const digest = tokenHash(ticket);
    const record = this.tickets.get(digest);
    if (!record) return null;
    this.tickets.delete(digest);
    if (record.expiresAt <= this.ctx.clock()) return null;
    if (record.ip !== this.ctx.hubClientIp(request)) return null;
    return record.identity;
  }

  handleConnect(peer: Peer): void {
    const { userId, sessionId, role } = peer.identity;
    const wasOnline = this.isUserOnline(userId);
    const sessions = this.onlineByUser.get(userId) ?? new Set<string>();
    sessions.add(peer.id);
    this.onlineByUser.set(userId, sessions);
    this.onlineBySession.set(sessionId, peer.id);
    this.rolesByUser.set(userId, role);
    const cursor = Number(this.ctx.repo.one<{ cursor: number }>('SELECT COALESCE(MAX(id),0) AS cursor FROM events')?.cursor ?? 0);
    peer.sendJson({
      type: WS_EVENTS.HELLO,
      protocol: 1,
      connectionId: peer.id,
      userId,
      role,
      serverTime: this.ctx.clock(),
      heartbeatMs: this.ctx.config.wsHeartbeatMs,
      eventCursor: cursor,
      snapshot: this.ctx.services.location.snapshot(userId)
    });
    if (!wasOnline) this.broadcastPresence(userId, true, peer);
  }

  handleDisconnect(peer: Peer): void {
    const { userId, sessionId } = peer.identity;
    const sessions = this.onlineByUser.get(userId);
    sessions?.delete(peer.id);
    this.onlineBySession.delete(sessionId);
    const remaining = sessions?.size ?? 0;
    if (remaining === 0) {
      this.onlineByUser.delete(userId);
      this.rolesByUser.delete(userId);
      this.broadcastPresence(userId, false, peer);
      for (const state of this.talkFloor.releaseUser(userId, 'disconnected')) this.broadcastTalkState(state);
    }
  }

  handleText(peer: Peer, message: Record<string, unknown>): void {
    const rawRequestId = typeof message.requestId === 'string' ? message.requestId : undefined;
    try {
      switch (message.type) {
        case WS_EVENTS.PING: {
          const input = parse(this.pingSchema, message, 'message') as Record<string, any>;
          peer.sendJson({ type: WS_EVENTS.PONG, requestId: input.requestId ?? null, at: input.at ?? null, serverTime: this.ctx.clock() });
          return;
        }
        case WS_EVENTS.SUBSCRIBE: {
          const input = parse(this.subscribeSchema, message, 'message') as Record<string, any>;
          if (!this.authorizeRoom(peer, String(input.room))) throw forbidden('Subscription to this room is not allowed.');
          if (!this.ctx.hub.join(peer, String(input.room))) throw badRequest('Room limit reached or room name is invalid.');
          this.sendAck(peer, input.requestId, WS_EVENTS.SUBSCRIBE, { room: input.room });
          return;
        }
        case WS_EVENTS.LOCATION_UPDATE: {
          const input = parse(this.locationSchema, message, 'message') as Record<string, any>;
          const limit = this.ctx.limiters.consume(
            { name: 'ws-location', capacity: 60, refillPerSecond: 1, windowMs: 60_000 },
            `${peer.identity.sessionId}:location`);
          if (!limit.allowed) {
            this.sendError(peer, 'RATE_LIMITED', 'Location update rate exceeded.', { retryAfterMs: limit.retryAfterMs }, input.requestId);
            return;
          }
          this.ctx.services.location.publishLive(peer.identity, input as LiveFixInput, peer, input.requestId);
          return;
        }
        case WS_EVENTS.TALK_START: {
          const input = parse(this.talkStartSchema, message, 'message') as Record<string, any>;
          const limit = this.ctx.limiters.consume(
            { name: 'ws-talk-start', capacity: 5, refillPerSecond: 0.25, windowMs: 60_000 },
            `${peer.identity.sessionId}:talk-start`);
          if (!limit.allowed) {
            this.sendError(peer, 'RATE_LIMITED', 'Too many talk attempts.', undefined, input.requestId);
            return;
          }
          const targetId = String(input.peerUserId);
          if (!this.canTalk(peer.identity.userId, targetId)) throw forbidden('One-to-one talk is not authorized for this pair.');
          const result = this.talkFloor.start(peer.identity.userId, targetId);
          if (!result.ok || !result.state) throw new HttpError(409, 'CONFLICT', `Talk cannot start: ${result.reason}`);
          this.broadcastTalkState(result.state, true);
          this.sendAck(peer, input.requestId, WS_EVENTS.TALK_START, { talkId: result.state.talkId, expiresAt: result.state.expiresAt });
          return;
        }
        case WS_EVENTS.TALK_STOP: {
          const input = parse(this.talkStopSchema, message, 'message') as Record<string, any>;
          const state = this.talkFloor.stop(peer.identity.userId, Number(input.talkId));
          if (!state) throw new HttpError(409, 'CONFLICT', 'Active talk floor not found.');
          this.broadcastTalkState(state);
          this.sendAck(peer, input.requestId, WS_EVENTS.TALK_STOP, { talkId: state.talkId });
          return;
        }
        case WS_EVENTS.SNAPSHOT: {
          const input = parse(this.snapshotSchema, message, 'message') as Record<string, any>;
          peer.sendJson({ type: WS_EVENTS.SNAPSHOT, requestId: input.requestId ?? null, ...this.ctx.services.location.snapshot(peer.identity.userId) });
          return;
        }
        case 'sync': {
          const input = parse(this.syncSchema, message, 'message') as Record<string, any>;
          const result = this.ctx.services.users.sync(peer.identity, Number(input.since ?? 0), Number(input.limit ?? 100));
          peer.sendJson({ type: WS_EVENTS.SNAPSHOT, requestId: input.requestId ?? null, ...result, kind: 'sync' });
          return;
        }
        default:
          this.sendError(peer, 'INVALID_INPUT', 'Unknown realtime message type.', undefined, rawRequestId);
      }
    } catch (error) {
      if (isHttpError(error)) {
        this.sendError(peer, error.code, error.message, error.details, rawRequestId);
        return;
      }
      throw error;
    }
  }

  /**
   * Handles a binary push-to-talk frame: header validation, rate limiting, floor authorization.
   *
   * @param peer Sending peer.
   * @param frame Raw binary frame (10-byte header plus opus payload).
   */
  handleBinary(peer: Peer, frame: Uint8Array): void {
    if (frame.length < AUDIO.HEADER_BYTES + 1 || frame[0] !== AUDIO.VERSION || frame[1] !== AUDIO.TYPE) {
      this.sendError(peer, 'INVALID_INPUT', 'Invalid audio frame header.');
      return;
    }
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength);
    const talkId = view.getUint32(2, false);
    const sequence = view.getUint32(6, false);
    const payloadLength = frame.byteLength - AUDIO.HEADER_BYTES;
    const limit = this.ctx.limiters.consume(
      { name: 'ws-audio', capacity: 100, refillPerSecond: AUDIO.FRAMES_PER_SECOND, windowMs: 10_000 },
      `${talkId}:${peer.identity.sessionId}`);
    if (!limit.allowed) {
      this.sendError(peer, 'RATE_LIMITED', 'Audio frame rate exceeded.');
      return;
    }
    const authorization = this.talkFloor.authorizeAudio(peer.identity.userId, talkId, sequence, payloadLength);
    if (!authorization.ok || !authorization.targetId) {
      this.sendError(peer, 'FORBIDDEN', `Audio frame rejected: ${authorization.reason}`);
      return;
    }
    this.ctx.hub.sendBinaryToUsers([authorization.targetId], frame, peer);
  }

  sweep(now = this.ctx.clock()): number {
    this.tickets.prune();
    const released = this.talkFloor.sweep(now);
    for (const state of released) this.broadcastTalkState(state);
    return released.length;
  }

  isUserOnline(userId: string): boolean {
    return (this.onlineByUser.get(userId)?.size ?? 0) > 0;
  }

  isSessionOnline(sessionId: string): boolean {
    return this.onlineBySession.has(sessionId);
  }

  onlineResponderCount(): number {
    let count = 0;
    for (const [userId, sessions] of this.onlineByUser) {
      if (sessions.size > 0 && this.rolesByUser.get(userId) === ROLES.RESPONDER) count++;
    }
    return count;
  }

  stats(): Record<string, unknown> {
    return {
      tickets: this.tickets.stats(),
      talk: this.talkFloor.stats(),
      onlineUsers: this.onlineByUser.size,
      onlineSessions: this.onlineBySession.size
    };
  }

  private canTalk(firstId: string, secondId: string): boolean {
    const now = this.ctx.clock();
    return Boolean(this.ctx.repo.one(
      `SELECT 1 AS ok FROM location_shares
       WHERE kind='live' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
         AND ((owner_id=? AND recipient_id=?) OR (owner_id=? AND recipient_id=?))
       UNION
       SELECT 1 AS ok FROM missions m JOIN sos_requests s ON s.id=m.sos_id
       WHERE (s.requester_id=? AND m.responder_id=?) OR (s.requester_id=? AND m.responder_id=?)
       LIMIT 1`, now, firstId, secondId, secondId, firstId, firstId, secondId, secondId, firstId));
  }

  private authorizeRoom(peer: Peer, room: string): boolean {
    const { userId, role } = peer.identity;
    if (room === `role:${role}` || room === `user:${userId}` || room === `session:${peer.identity.sessionId}`) return true;
    if (role === ROLES.ADMIN) return true;
    if (room.startsWith('sos:')) {
      const sosId = room.slice(4);
      return Boolean(this.ctx.repo.one(
        `SELECT 1 AS ok FROM sos_requests s LEFT JOIN missions m ON m.sos_id=s.id
         LEFT JOIN group_members gm ON gm.group_id=s.assigned_group_id AND gm.user_id=?
         WHERE s.id=? AND (s.requester_id=? OR s.assigned_responder_id=? OR m.responder_id=? OR gm.user_id IS NOT NULL)
         LIMIT 1`, userId, sosId, userId, userId, userId));
    }
    if (room.startsWith('mission:')) {
      const missionId = room.slice(8);
      return Boolean(this.ctx.repo.one(
        `SELECT 1 AS ok FROM missions m JOIN sos_requests s ON s.id=m.sos_id
         WHERE m.id=? AND (m.responder_id=? OR s.requester_id=?) LIMIT 1`, missionId, userId, userId));
    }
    if (room.startsWith('talk:')) {
      const active = this.talkFloor.activeForUser(userId);
      return Boolean(active && `talk:${active.talkId}` === room && (active.speakerId === userId || active.targetId === userId));
    }
    return false;
  }

  private contactsFor(userId: string): string[] {
    const now = this.ctx.clock();
    const rows = this.ctx.repo.all<{ other: string }>(
      `SELECT owner_id AS other FROM location_shares WHERE recipient_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
       UNION SELECT recipient_id AS other FROM location_shares WHERE owner_id=? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)
       UNION SELECT s.requester_id AS other FROM missions m JOIN sos_requests s ON s.id=m.sos_id WHERE m.responder_id=?
       UNION SELECT m.responder_id AS other FROM missions m JOIN sos_requests s ON s.id=m.sos_id WHERE s.requester_id=?`,
      userId, now, userId, now, userId, userId);
    return [...new Set(rows.map((row) => String(row.other)).filter((id) => id && id !== userId))];
  }

  private broadcastPresence(userId: string, online: boolean, exceptPeer?: Peer): void {
    const message = { type: WS_EVENTS.PRESENCE, userId, online, serverTime: this.ctx.clock() };
    this.ctx.hub.sendToUsers([userId, ...this.contactsFor(userId)], message, exceptPeer);
    this.ctx.hub.sendToRoom('role:admin', message, exceptPeer);
  }

  private broadcastTalkState(state: TalkState, active = false): void {
    this.ctx.hub.sendToUsers([state.speakerId, state.targetId], {
      type: WS_EVENTS.TALK_STATE,
      active,
      talkId: state.talkId,
      speakerUserId: state.speakerId,
      targetUserId: state.targetId,
      startedAt: state.startedAt,
      expiresAt: state.expiresAt,
      reason: state.reason ?? (active ? 'started' : 'released'),
      serverTime: this.ctx.clock()
    });
  }

  private sendAck(peer: Peer, request: string | null | undefined, kind: string, extra: Record<string, unknown> = {}): void {
    peer.sendJson({ type: WS_EVENTS.ACK, requestId: request ?? null, kind, accepted: true, serverTime: this.ctx.clock(), ...extra });
  }

  private sendError(peer: Peer, code: string, message: string, details?: Record<string, unknown>, request?: string | null): void {
    peer.sendJson({ type: WS_EVENTS.ERROR, code, message, details: details ?? null, requestId: request ?? null, serverTime: this.ctx.clock() });
  }
}
