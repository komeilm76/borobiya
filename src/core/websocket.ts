import { createHash } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { AuthIdentity } from './router.ts';
import { WS_CLOSE, WS_EVENTS } from '../../public/js/protocol.js';

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPCODE = Object.freeze({ CONTINUATION: 0x0, TEXT: 0x1, BINARY: 0x2, CLOSE: 0x8, PING: 0x9, PONG: 0xA });

export type WsIdentity = AuthIdentity;

export interface RealtimeEvent {
  id: number;
  type: string;
  payload: unknown;
  audience: string[];
  createdAt: string;
}

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
  sendBinary(payload: Buffer): void;
  close(code?: number, reason?: string): void;
  ping(): void;
}

export interface WebSocketHubOptions {
  path: string;
  maxFrameBytes: number;
  heartbeatMs: number;
  authenticate(ticket: string | null, req: IncomingMessage): WsIdentity | null;
  originAllowed(origin: string | undefined, req: IncomingMessage): boolean;
  onConnect(peer: Peer): void | Promise<void>;
  onDisconnect(peer: Peer): void | Promise<void>;
  onText(peer: Peer, message: Record<string, unknown>): void | Promise<void>;
  onBinary(peer: Peer, frame: Buffer): void | Promise<void>;
}

class PeerImpl implements Peer {
  readonly id: string;
  readonly rooms = new Set<string>();
  readonly ip: string;
  alive = true;
  framesIn = 0;
  framesOut = 0;
  bytesIn = 0;
  bytesOut = 0;
  private buffer = Buffer.alloc(0);
  private fragmentOpcode = 0;
  private fragments: Buffer[] = [];
  private fragmentBytes = 0;
  private closed = false;
  private finished = false;

  constructor(
    readonly identity: WsIdentity,
    ip: string,
    private readonly socket: Duplex,
    private readonly options: WebSocketHubOptions,
    private readonly onFinished: (peer: PeerImpl) => void
  ) {
    this.id = `${identity.sessionId}:${createHash('sha1').update(`${Date.now()}:${Math.random()}`).digest('hex').slice(0, 10)}`;
    this.ip = ip;
    this.rooms.add(`user:${identity.userId}`);
    this.rooms.add(`session:${identity.sessionId}`);
    this.rooms.add(`role:${identity.role}`);
  }

  attach(head: Buffer): void {
    const withNoDelay = this.socket as Duplex & { setNoDelay?: (value: boolean) => void };
    withNoDelay.setNoDelay?.(true);
    this.socket.on('data', (chunk: Buffer) => this.onData(chunk));
    this.socket.on('close', () => this.finish());
    this.socket.on('error', () => { this.finish(); this.socket.destroy(); });
    if (head.length) this.onData(head);
  }

  sendJson(payload: unknown): void {
    let body: Buffer;
    try { body = Buffer.from(JSON.stringify(payload), 'utf8'); } catch { return; }
    if (body.length > this.options.maxFrameBytes) { this.close(WS_CLOSE.TOO_BIG, 'message too large'); return; }
    this.writeFrame(OPCODE.TEXT, body);
  }

  sendBinary(payload: Buffer): void {
    if (payload.length > this.options.maxFrameBytes) { this.close(WS_CLOSE.TOO_BIG, 'message too large'); return; }
    this.writeFrame(OPCODE.BINARY, payload);
  }

  ping(): void { this.writeFrame(OPCODE.PING, Buffer.from('bb')); }

  close(code: number = WS_CLOSE.NORMAL, reason = ''): void {
    if (this.closed) return;
    this.closed = true;
    const safeCode = Number.isInteger(code) && code >= 1000 && code < 5000 ? code : WS_CLOSE.INTERNAL;
    const payload = Buffer.alloc(2 + Math.min(Buffer.byteLength(reason, 'utf8'), 123));
    payload.writeUInt16BE(safeCode, 0);
    if (reason) payload.write(reason, 2, 'utf8');
    try { this.writeFrame(OPCODE.CLOSE, payload, true); this.socket.end(); } catch { this.socket.destroy(); }
  }

  private writeFrame(opcode: number, payload: Buffer, forced = false): void {
    if ((this.closed && !forced) || this.socket.destroyed) return;
    const length = payload.length;
    const headerLength = length < 126 ? 2 : length < 65536 ? 4 : 10;
    const frame = Buffer.allocUnsafe(headerLength + length);
    frame[0] = 0x80 | opcode;
    if (length < 126) frame[1] = length;
    else if (length < 65536) { frame[1] = 126; frame.writeUInt16BE(length, 2); }
    else { frame[1] = 127; frame.writeBigUInt64BE(BigInt(length), 2); }
    payload.copy(frame, headerLength);
    const buffered = (this.socket as Duplex & { writableLength?: number }).writableLength ?? 0;
    if (buffered > this.options.maxFrameBytes * 4) { this.close(WS_CLOSE.POLICY, 'backpressure'); return; }
    try {
      this.socket.write(frame);
      this.framesOut++;
      this.bytesOut += frame.length;
    } catch {
      this.socket.destroy();
    }
  }

  private onData(chunk: Buffer): void {
    if (this.closed) return;
    const part = Buffer.from(chunk);
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, part]) : part;
    this.bytesIn += chunk.length;
    if (this.buffer.length > this.options.maxFrameBytes * 2 + 1024) {
      this.close(WS_CLOSE.TOO_BIG, 'buffer too large');
      return;
    }
    while (this.buffer.length >= 2) {
      const first = this.buffer[0];
      const second = this.buffer[1];
      const fin = (first & 0x80) !== 0;
      const rsv = first & 0x70;
      const opcode = first & 0x0F;
      const masked = (second & 0x80) !== 0;
      let length = second & 0x7F;
      let offset = 2;
      if (rsv !== 0 || !masked) { this.fail(WS_CLOSE.POLICY, 'invalid frame flags'); return; }
      if (length === 126) {
        if (this.buffer.length < offset + 2) return;
        length = this.buffer.readUInt16BE(offset);
        offset += 2;
      } else if (length === 127) {
        if (this.buffer.length < offset + 8) return;
        const large = this.buffer.readBigUInt64BE(offset);
        offset += 8;
        if (large > BigInt(this.options.maxFrameBytes)) { this.fail(WS_CLOSE.TOO_BIG, 'frame too large'); return; }
        length = Number(large);
      }
      if (length > this.options.maxFrameBytes) { this.fail(WS_CLOSE.TOO_BIG, 'frame too large'); return; }
      if (opcode >= 0x8 && (!fin || length > 125)) { this.fail(WS_CLOSE.POLICY, 'invalid control frame'); return; }
      const frameLength = offset + 4 + length;
      if (this.buffer.length < frameLength) return;
      const mask = this.buffer.subarray(offset, offset + 4);
      const maskedPayload = this.buffer.subarray(offset + 4, frameLength);
      const payload = Buffer.allocUnsafe(length);
      for (let index = 0; index < length; index++) payload[index] = maskedPayload[index] ^ mask[index % 4];
      this.buffer = this.buffer.subarray(frameLength);
      this.framesIn++;
      if (!this.processFrame(fin, opcode, payload)) return;
    }
  }

  private processFrame(fin: boolean, opcode: number, payload: Buffer): boolean {
    if (opcode === OPCODE.PING) { this.writeFrame(OPCODE.PONG, payload); return true; }
    if (opcode === OPCODE.PONG) { this.alive = true; return true; }
    if (opcode === OPCODE.CLOSE) {
      const code = payload.length >= 2 ? payload.readUInt16BE(0) : WS_CLOSE.NORMAL;
      const reason = payload.length > 2 ? payload.subarray(2).toString('utf8').slice(0, 100) : '';
      this.close(code, reason);
      return false;
    }
    if (opcode === OPCODE.TEXT || opcode === OPCODE.BINARY) {
      if (this.fragmentOpcode) { this.fail(WS_CLOSE.POLICY, 'nested fragments'); return false; }
      if (!fin) {
        this.fragmentOpcode = opcode;
        this.fragments = [payload];
        this.fragmentBytes = payload.length;
        return true;
      }
      this.dispatch(opcode, payload);
      return true;
    }
    if (opcode === OPCODE.CONTINUATION) {
      if (!this.fragmentOpcode) { this.fail(WS_CLOSE.POLICY, 'unexpected continuation'); return false; }
      this.fragmentBytes += payload.length;
      if (this.fragmentBytes > this.options.maxFrameBytes) { this.fail(WS_CLOSE.TOO_BIG, 'fragment too large'); return false; }
      this.fragments.push(payload);
      if (!fin) return true;
      const original = this.fragmentOpcode;
      const combined = Buffer.concat(this.fragments);
      this.fragmentOpcode = 0;
      this.fragments = [];
      this.fragmentBytes = 0;
      this.dispatch(original, combined);
      return true;
    }
    this.fail(WS_CLOSE.POLICY, 'unknown opcode');
    return false;
  }

  private dispatch(opcode: number, payload: Buffer): void {
    const invoke = (action: Promise<void> | void) => Promise.resolve(action).catch((error) => {
      console.error('[websocket] handler failed', error);
      this.sendJson({ type: WS_EVENTS.ERROR, code: 'INTERNAL', message: 'Realtime handler failed.' });
    });
    if (opcode === OPCODE.BINARY) { invoke(this.options.onBinary(this, payload)); return; }
    let message: unknown;
    try { message = JSON.parse(payload.toString('utf8')); } catch {
      this.sendJson({ type: WS_EVENTS.ERROR, code: 'INVALID_INPUT', message: 'Expected JSON text frame.' });
      return;
    }
    if (typeof message !== 'object' || message === null || Array.isArray(message) || typeof (message as Record<string, unknown>).type !== 'string') {
      this.sendJson({ type: WS_EVENTS.ERROR, code: 'INVALID_INPUT', message: 'Message.type is required.' });
      return;
    }
    invoke(this.options.onText(this, message as Record<string, unknown>));
  }

  private fail(code: number, reason: string): void {
    console.warn(`[websocket] ${reason}`);
    this.close(code, reason);
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    this.closed = true;
    this.onFinished(this);
    try { Promise.resolve(this.options.onDisconnect(this)).catch((error) => console.error('[websocket] disconnect handler failed', error)); } catch (error) {
      console.error('[websocket] disconnect handler failed', error);
    }
  }
}

export class WebSocketHub {
  private readonly peers = new Set<PeerImpl>();
  private readonly byUser = new Map<string, Set<PeerImpl>>();
  private readonly bySession = new Map<string, Set<PeerImpl>>();
  private readonly byRole = new Map<string, Set<PeerImpl>>();
  private readonly byRoom = new Map<string, Set<PeerImpl>>();
  private readonly heartbeat: NodeJS.Timeout;

  constructor(private readonly options: WebSocketHubOptions) {
    this.heartbeat = setInterval(() => {
      for (const peer of this.peers) {
        if (!peer.alive) { peer.close(WS_CLOSE.POLICY, 'heartbeat timeout'); continue; }
        peer.alive = false;
        peer.ping();
      }
    }, options.heartbeatMs);
    this.heartbeat.unref?.();
  }

  handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer): boolean {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (url.pathname !== this.options.path) return false;
    if (!this.options.originAllowed(req.headers.origin, req)) { reject(socket, 403); return true; }
    const upgrade = String(req.headers.upgrade ?? '').toLowerCase();
    const connection = String(req.headers.connection ?? '').toLowerCase();
    const key = req.headers['sec-websocket-key'];
    const version = req.headers['sec-websocket-version'];
    if (req.method !== 'GET' || upgrade !== 'websocket' || !connection.includes('upgrade') || typeof key !== 'string' ||
      !/^[A-Za-z0-9+/]{22}==$/.test(key) || Buffer.from(key, 'base64').length !== 16 || version !== '13') {
      reject(socket, 400);
      return true;
    }
    const identity = this.options.authenticate(url.searchParams.get('ticket'), req);
    if (!identity) { reject(socket, 401); return true; }
    const accept = createHash('sha1').update(`${key}${GUID}`).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      `Sec-WebSocket-Accept: ${accept}\r\n\r\n`
    );
    const ip = req.socket.remoteAddress || 'unknown';
    const peer = new PeerImpl(identity, ip, socket, this.options, (finished) => this.remove(finished));
    this.add(peer);
    peer.attach(head);
    try {
      Promise.resolve(this.options.onConnect(peer)).catch((error) => {
        console.error('[websocket] connect handler failed', error);
        peer.close(WS_CLOSE.INTERNAL, 'connect failed');
      });
    } catch (error) {
      console.error('[websocket] connect handler failed', error);
      peer.close(WS_CLOSE.INTERNAL, 'connect failed');
    }
    return true;
  }

  private add(peer: PeerImpl): void {
    this.peers.add(peer);
    for (const room of peer.rooms) this.join(peer, room);
  }

  private remove(peer: PeerImpl): void {
    this.peers.delete(peer);
    for (const room of peer.rooms) {
      const members = this.byRoom.get(room);
      members?.delete(peer);
      if (members?.size === 0) this.byRoom.delete(room);
    }
    removeFrom(this.byUser, `user:${peer.identity.userId}`, peer);
    removeFrom(this.bySession, `session:${peer.identity.sessionId}`, peer);
    removeFrom(this.byRole, `role:${peer.identity.role}`, peer);
  }

  join(peer: Peer, room: string): boolean {
    if (!/^[a-z0-9:_-]{1,80}$/i.test(room)) return false;
    if (!peer.rooms.has(room) && peer.rooms.size >= 32) return false;
    peer.rooms.add(room);
    const members = this.byRoom.get(room) ?? new Set<PeerImpl>();
    members.add(peer as PeerImpl);
    this.byRoom.set(room, members);
    index(this.byUser, room, 'user:', peer as PeerImpl);
    index(this.bySession, room, 'session:', peer as PeerImpl);
    index(this.byRole, room, 'role:', peer as PeerImpl);
    return true;
  }

  leave(peer: Peer, room: string): void {
    peer.rooms.delete(room);
    this.byRoom.get(room)?.delete(peer as PeerImpl);
  }

  private recipients(audience: string[]): Set<PeerImpl> {
    const output = new Set<PeerImpl>();
    for (const subject of audience) {
      if (subject === 'all') { for (const peer of this.peers) output.add(peer); continue; }
      for (const peer of this.byRoom.get(subject) ?? []) output.add(peer);
    }
    return output;
  }

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

  sendBinaryToUsers(userIds: string[], payload: Buffer, exceptPeer?: Peer): void {
    for (const peer of this.recipients(userIds.map((id) => `user:${id}`))) {
      if (peer !== exceptPeer) peer.sendBinary(payload);
    }
  }

  disconnectUser(userId: string): void {
    for (const peer of [...(this.byRoom.get(`user:${userId}`) ?? [])]) peer.close(WS_CLOSE.POLICY, 'session revoked');
  }

  disconnectSession(sessionId: string): void {
    for (const peer of [...(this.byRoom.get(`session:${sessionId}`) ?? [])]) peer.close(WS_CLOSE.POLICY, 'session revoked');
  }

  stats(): Record<string, unknown> {
    let framesIn = 0, framesOut = 0, bytesIn = 0, bytesOut = 0;
    for (const peer of this.peers) {
      framesIn += peer.framesIn; framesOut += peer.framesOut; bytesIn += peer.bytesIn; bytesOut += peer.bytesOut;
    }
    return {
      connections: this.peers.size,
      users: this.byUser.size,
      sessions: this.bySession.size,
      rooms: this.byRoom.size,
      framesIn, framesOut, bytesIn, bytesOut
    };
  }

  close(): void {
    clearInterval(this.heartbeat);
    for (const peer of [...this.peers]) peer.close(WS_CLOSE.GOING_AWAY, 'server shutting down');
    this.peers.clear();
    this.byUser.clear();
    this.bySession.clear();
    this.byRole.clear();
    this.byRoom.clear();
  }
}

function index(map: Map<string, Set<PeerImpl>>, room: string, prefix: string, peer: PeerImpl): void {
  if (!room.startsWith(prefix)) return;
  const members = map.get(room) ?? new Set<PeerImpl>();
  members.add(peer);
  map.set(room, members);
}

function removeFrom(map: Map<string, Set<PeerImpl>>, key: string, peer: PeerImpl): void {
  const members = map.get(key);
  members?.delete(peer);
  if (members?.size === 0) map.delete(key);
}

function reject(socket: Duplex, status: number): void {
  const label = status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : 'Bad Request';
  socket.write(`HTTP/1.1 ${status} ${label}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
  socket.destroy();
}
