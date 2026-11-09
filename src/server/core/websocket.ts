import type { ServerWebSocket } from 'bun';
import type { AuthIdentity } from './router.ts';
import { WS_CLOSE, WS_EVENTS, type RealtimeEvent } from '../../shared/protocol.ts';

/** Identity attached to every upgraded socket. */
export type WsIdentity = AuthIdentity;

/** A single authenticated realtime connection. */
export interface Peer {
  readonly id: string;
  readonly identity: WsIdentity;
  readonly rooms: Set<string>;
  readonly ip: string;
  readonly framesIn: number;
  readonly framesOut: number;
  readonly bytesIn: number;
  readonly bytesOut: number;
  alive: boolean;
  sendJson(payload: unknown): void;
  sendBinary(payload: Uint8Array): void;
  close(code?: number, reason?: string): void;
  ping(): void;
}

/** Options accepted by {@link WebSocketHub}. */
interface WebSocketHubOptions {
  path: string;
  maxFrameBytes: number;
  heartbeatMs: number;
  /** Resolves the client address for rate limiting and audit records. */
  clientIp(request: Request): string;
  authenticate(ticket: string | null, request: Request): WsIdentity | null;
  originAllowed(origin: string | undefined, request: Request): boolean;
  onConnect(peer: Peer): void | Promise<void>;
  onDisconnect(peer: Peer): void | Promise<void>;
  onText(peer: Peer, message: Record<string, unknown>): void | Promise<void>;
  onBinary(peer: Peer, frame: Uint8Array): void | Promise<void>;
}

/** Data Bun carries on each socket between upgrade and handlers. */
export interface PeerData {
  peer: Peer | null;
  identity: WsIdentity | null;
  ip: string;
}

type BunSocket = ServerWebSocket<PeerData>;

/** Minimal upgrade-capable server surface used by the hub (matches `Bun.serve`). */
export interface UpgradeServer {
  upgrade(request: Request, options: { data: PeerData }): boolean;
}

const EMPTY = new Uint8Array(0);

/**
 * Peer implementation over a Bun `ServerWebSocket`.
 * Fragmentation, masking, control frames and ping/pong are handled natively by Bun,
 * which replaces a hand-written RFC 6455 state machine.
 */
class BunPeer implements Peer {
  readonly id: string;
  readonly rooms = new Set<string>();
  readonly ip: string;
  alive = true;
  framesIn = 0;
  framesOut = 0;
  bytesIn = 0;
  bytesOut = 0;
  private closed = false;

  constructor(
    readonly identity: WsIdentity,
    ip: string,
    private readonly socket: BunSocket,
    private readonly maxFrameBytes: number,
    private readonly onClosed: (peer: Peer) => void
  ) {
    this.id = `${identity.sessionId}:${crypto.randomUUID().slice(0, 8)}`;
    this.ip = ip;
    this.rooms.add(`user:${identity.userId}`);
    this.rooms.add(`session:${identity.sessionId}`);
    this.rooms.add(`role:${identity.role}`);
  }

  sendJson(payload: unknown): void {
    if (this.closed) return;
    let body: string;
    try {
      body = JSON.stringify(payload);
    } catch {
      return;
    }
    const size = Buffer.byteLength(body, 'utf8');
    if (size > this.maxFrameBytes) {
      this.close(WS_CLOSE.TOO_BIG, 'message too large');
      return;
    }
    try {
      this.socket.send(body);
      this.framesOut++;
      this.bytesOut += size;
    } catch {
      this.close(WS_CLOSE.INTERNAL, 'send failed');
    }
  }

  sendBinary(payload: Uint8Array): void {
    if (this.closed) return;
    if (payload.byteLength > this.maxFrameBytes) {
      this.close(WS_CLOSE.TOO_BIG, 'message too large');
      return;
    }
    try {
      this.socket.sendBinary(payload);
      this.framesOut++;
      this.bytesOut += payload.byteLength;
    } catch {
      this.close(WS_CLOSE.INTERNAL, 'send failed');
    }
  }

  ping(): void {
    if (this.closed) return;
    try {
      this.socket.ping(EMPTY);
    } catch {
      this.closed = true;
    }
  }

  close(code: number = WS_CLOSE.NORMAL, reason = ''): void {
    if (this.closed) return;
    this.closed = true;
    const safeCode = Number.isInteger(code) && code >= 1000 && code < 5000 ? code : WS_CLOSE.INTERNAL;
    try {
      this.socket.close(safeCode, reason.slice(0, 100));
    } catch {
      // The socket is already gone; room cleanup below still runs.
    }
    this.onClosed(this);
  }

  /** Records an inbound frame for the realtime diagnostics counters. */
  countInbound(bytes: number): void {
    this.framesIn++;
    this.bytesIn += bytes;
  }
}

/**
 * Audience-indexed realtime hub over one native Bun WebSocket endpoint.
 * Keeps one-use tickets, room authorization, presence, binary audio and durable cursors.
 */
export class WebSocketHub {
  private readonly peers = new Set<BunPeer>();
  private readonly byUser = new Map<string, Set<BunPeer>>();
  private readonly bySession = new Map<string, Set<BunPeer>>();
  private readonly byRole = new Map<string, Set<BunPeer>>();
  private readonly byRoom = new Map<string, Set<BunPeer>>();
  private heartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly options: WebSocketHubOptions) {
    this.heartbeat = setInterval(() => {
      for (const peer of this.peers) {
        if (!peer.alive) {
          peer.close(WS_CLOSE.POLICY, 'heartbeat timeout');
          continue;
        }
        peer.alive = false;
        peer.ping();
      }
    }, options.heartbeatMs);
    this.heartbeat.unref?.();
  }

  private static indexInto(map: Map<string, Set<BunPeer>>, key: string, peer: BunPeer): void {
    const members = map.get(key) ?? new Set<BunPeer>();
    members.add(peer);
    map.set(key, members);
  }

  private static removeFrom(map: Map<string, Set<BunPeer>>, key: string, peer: BunPeer): void {
    const members = map.get(key);
    members?.delete(peer);
    if (members?.size === 0) map.delete(key);
  }

  private index(peer: BunPeer, room: string): void {
    const key = room.toLowerCase();
    if (key.startsWith('user:')) WebSocketHub.indexInto(this.byUser, key, peer);
    if (key.startsWith('session:')) WebSocketHub.indexInto(this.bySession, key, peer);
    if (key.startsWith('role:')) WebSocketHub.indexInto(this.byRole, key, peer);
    WebSocketHub.indexInto(this.byRoom, key, peer);
  }

  private unindex(peer: BunPeer, room: string): void {
    const key = room.toLowerCase();
    WebSocketHub.removeFrom(this.byUser, key, peer);
    WebSocketHub.removeFrom(this.bySession, key, peer);
    WebSocketHub.removeFrom(this.byRole, key, peer);
    WebSocketHub.removeFrom(this.byRoom, key, peer);
  }

  /**
   * Authenticates and upgrades a request.
   *
   * @param request Incoming upgrade request.
   * @param server The `Bun.serve` instance performing the upgrade.
   * @returns A refusal response, or undefined when the upgrade was handed to Bun.
   */
  upgrade(request: Request, server: UpgradeServer): Response | undefined {
    const url = new URL(request.url);
    if (url.pathname !== this.options.path) return new Response('Not found', { status: 404 });
    if (!this.options.originAllowed(request.headers.get('origin') ?? undefined, request)) {
      return new Response('Forbidden', { status: 403 });
    }
    const identity = this.options.authenticate(url.searchParams.get('ticket'), request);
    if (!identity) return new Response('Unauthorized', { status: 401 });
    const data: PeerData = { peer: null, identity, ip: this.options.clientIp(request) };
    if (!server.upgrade(request, { data })) return new Response('Upgrade failed', { status: 400 });
    return undefined;
  }

  /** Creates the peer and runs the connect handler for a newly opened socket. */
  handleOpen(socket: BunSocket): void {
    const identity = socket.data?.identity ?? null;
    if (!identity) {
      socket.close(WS_CLOSE.AUTH_FAILED, 'unauthenticated');
      return;
    }
    const peer = new BunPeer(identity, socket.data.ip, socket, this.options.maxFrameBytes, (closed) => this.unregister(closed));
    socket.data.peer = peer;
    this.peers.add(peer);
    for (const room of peer.rooms) this.index(peer, room);
    try {
      const result = this.options.onConnect(peer);
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error('[websocket] connect handler failed', error);
          peer.close(WS_CLOSE.INTERNAL, 'connect failed');
        });
      }
    } catch (error) {
      console.error('[websocket] connect handler failed', error);
      peer.close(WS_CLOSE.INTERNAL, 'connect failed');
    }
  }

  /**
   * Handles a frame from a socket.
   *
   * `Bun.serve` delivers text frames as `string` and binary frames as `Buffer`/`Uint8Array`.
   * Binary payloads are therefore routed to the audio pipeline instead of being parsed as
   * JSON, which keeps push-to-talk frames from ever reaching the text handler.
   */
  handleMessage(socket: BunSocket, message: string | Buffer): void {
    const peer = socket.data?.peer;
    if (!peer) return;
    if (!peer.alive) peer.alive = true;
    if (typeof message !== 'string') {
      this.handleBinary(socket, new Uint8Array(message));
      return;
    }
    (peer as BunPeer).countInbound(Buffer.byteLength(message, 'utf8'));
    let decoded: unknown;
    try {
      decoded = JSON.parse(message) as unknown;
    } catch {
      peer.sendJson({ type: WS_EVENTS.ERROR, code: 'INVALID_INPUT', message: 'Expected JSON text frame.' });
      return;
    }
    if (!isTextMessage(decoded)) {
      peer.sendJson({ type: WS_EVENTS.ERROR, code: 'INVALID_INPUT', message: 'Message.type is required.' });
      return;
    }
    this.invoke(peer, () => this.options.onText(peer, decoded));
  }

  /** Handles a binary audio frame from a socket. */
  handleBinary(socket: BunSocket, frame: Uint8Array): void {
    const peer = socket.data?.peer;
    if (!peer) return;
    (peer as BunPeer).countInbound(frame.byteLength);
    if (!peer.alive) peer.alive = true;
    this.invoke(peer, () => this.options.onBinary(peer, frame));
  }

  private invoke(peer: Peer, action: () => void | Promise<void>): void {
    try {
      const result = action();
      if (result instanceof Promise) {
        result.catch((error) => {
          console.error('[websocket] handler failed', error);
          peer.sendJson({ type: WS_EVENTS.ERROR, code: 'INTERNAL', message: 'Realtime handler failed.' });
        });
      }
    } catch (error) {
      console.error('[websocket] handler failed', error);
      peer.sendJson({ type: WS_EVENTS.ERROR, code: 'INTERNAL', message: 'Realtime handler failed.' });
    }
  }

  /** Removes a peer from every index exactly once. */
  unregister(peer: Peer): void {
    const bunPeer = peer as BunPeer;
    if (!this.peers.has(bunPeer)) return;
    this.peers.delete(bunPeer);
    for (const room of [...bunPeer.rooms]) this.unindex(bunPeer, room);
    try {
      const result = this.options.onDisconnect(bunPeer);
      if (result instanceof Promise) result.catch((error) => console.error('[websocket] disconnect handler failed', error));
    } catch (error) {
      console.error('[websocket] disconnect handler failed', error);
    }
  }

  /** Marks a socket alive when Bun reports a pong. */
  markAlive(socket: BunSocket): void {
    const peer = socket.data?.peer;
    if (peer) peer.alive = true;
  }

  join(peer: Peer, room: string): boolean {
    if (!/^[a-z0-9:_-]{1,80}$/i.test(room)) return false;
    if (!peer.rooms.has(room) && peer.rooms.size >= 32) return false;
    peer.rooms.add(room);
    this.index(peer as BunPeer, room);
    return true;
  }

  leave(peer: Peer, room: string): void {
    peer.rooms.delete(room);
    this.unindex(peer as BunPeer, room);
  }

  private recipients(audience: string[]): Set<BunPeer> {
    const output = new Set<BunPeer>();
    for (const subject of audience) {
      if (subject === 'all') {
        for (const peer of this.peers) output.add(peer);
        continue;
      }
      for (const peer of this.byRoom.get(subject.toLowerCase()) ?? []) output.add(peer);
    }
    return output;
  }

  /** Publishes a durable event to every audience member. */
  publish(event: RealtimeEvent): void {
    const message = { type: WS_EVENTS.EVENT, event };
    for (const peer of this.recipients(event.audience)) peer.sendJson(message);
  }

  sendToUsers(userIds: string[], payload: unknown, exceptPeer?: Peer): void {
    for (const peer of this.recipients(userIds.map((id) => `user:${id}`))) {
      if (peer !== exceptPeer) peer.sendJson(payload);
    }
  }

  sendToRoom(room: string, payload: unknown, exceptPeer?: Peer): void {
    for (const peer of this.recipients([room])) if (peer !== exceptPeer) peer.sendJson(payload);
  }

  sendBinaryToUsers(userIds: string[], payload: Uint8Array, exceptPeer?: Peer): void {
    for (const peer of this.recipients(userIds.map((id) => `user:${id}`))) {
      if (peer !== exceptPeer) peer.sendBinary(payload);
    }
  }

  disconnectUser(userId: string): void {
    for (const peer of [...(this.byUser.get(`user:${userId}`.toLowerCase()) ?? [])]) peer.close(WS_CLOSE.POLICY, 'session revoked');
  }

  disconnectSession(sessionId: string): void {
    for (const peer of [...(this.bySession.get(`session:${sessionId}`.toLowerCase()) ?? [])]) peer.close(WS_CLOSE.POLICY, 'session revoked');
  }

  /** Diagnostics surfaced by the administrator system-health endpoint. */
  stats(): Record<string, unknown> {
    let framesIn = 0;
    let framesOut = 0;
    let bytesIn = 0;
    let bytesOut = 0;
    for (const peer of this.peers) {
      framesIn += peer.framesIn;
      framesOut += peer.framesOut;
      bytesIn += peer.bytesIn;
      bytesOut += peer.bytesOut;
    }
    return {
      connections: this.peers.size,
      users: this.byUser.size,
      sessions: this.bySession.size,
      rooms: this.byRoom.size,
      framesIn,
      framesOut,
      bytesIn,
      bytesOut
    };
  }

  close(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
    for (const peer of [...this.peers]) peer.close(WS_CLOSE.GOING_AWAY, 'server shutting down');
    this.peers.clear();
    this.byUser.clear();
    this.bySession.clear();
    this.byRole.clear();
    this.byRoom.clear();
  }
}

function isTextMessage(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && typeof (value as Record<string, unknown>).type === 'string';
}
