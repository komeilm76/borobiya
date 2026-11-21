import { post } from '@/api/client.ts';
import { WS_CLOSE, WS_EVENTS, type RealtimeEvent } from '@shared/protocol.ts';

/** Listener signature for every realtime channel. */
type RealtimeListener = (payload: any) => void;

/** Ticket payload returned by `POST /_user/realtime/ticket`. */
interface TicketResponse {
  ticket: string;
  expiresAt: number;
  path: string;
  heartbeatMs: number;
  protocol: number;
}

/**
 * One authenticated WebSocket with one-use tickets, durable-event catch-up and binary audio.
 * Reconnection uses exponential backoff; the durable cursor makes reconnect lossless.
 */
export class RealtimeClient {
  private readonly handlers = new Map<string, Set<RealtimeListener>>();
  private socket: WebSocket | null = null;
  private queue: unknown[] = [];
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private attempts = 0;
  private connecting = false;
  private closing = false;
  private eventCursor = 0;
  private lastHello: { heartbeatMs?: number } | null = null;

  /**
   * Subscribes to a channel.
   *
   * @param type Channel name (`status`, `event`, `message`, `binary` or a domain event type).
   * @param listener Handler invoked for each payload.
   * @returns An unsubscribe function.
   */
  on(type: string, listener: RealtimeListener): () => void {
    const set = this.handlers.get(type) ?? new Set<RealtimeListener>();
    set.add(listener);
    this.handlers.set(type, set);
    return () => {
      set.delete(listener);
    };
  }

  private emit(type: string, payload: unknown): void {
    for (const listener of this.handlers.get(type) ?? []) {
      try {
        listener(payload);
      } catch (error) {
        console.error(`[realtime] ${type} listener failed`, error);
      }
    }
  }

  /** Current durable event cursor. */
  get cursor(): number {
    return this.eventCursor;
  }

  /** Opens the socket, requesting a fresh one-use ticket first. */
  async connect(): Promise<void> {
    if (this.closing || this.connecting) return;
    if (this.socket && this.socket.readyState <= WebSocket.OPEN) return;
    this.connecting = true;
    this.emit('status', 'connecting');
    try {
      const ticket = await post<TicketResponse>('/_user/realtime/ticket');
      if (!ticket?.ticket) throw new Error('Realtime ticket was not issued.');
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${scheme}//${window.location.host}/ws?ticket=${encodeURIComponent(ticket.ticket)}`);
      socket.binaryType = 'arraybuffer';
      this.socket = socket;
      this.lastHello = { heartbeatMs: ticket.heartbeatMs };
      socket.onopen = () => {
        this.connecting = false;
        this.attempts = 0;
        this.emit('status', 'connected');
        this.startHeartbeat();
        for (const payload of this.queue.splice(0)) this.sendJson(payload);
      };
      socket.onmessage = (event) => this.handleMessage(event);
      socket.onerror = () => this.emit('status', 'error');
      socket.onclose = (event) => this.handleClose(event);
    } catch {
      this.connecting = false;
      this.emit('status', 'error');
      this.scheduleReconnect();
    }
  }

  private handleMessage(event: MessageEvent): void {
    if (event.data instanceof ArrayBuffer) {
      this.emit('binary', event.data);
      return;
    }
    if (typeof event.data !== 'string') return;
    let message: any;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }
    if (message.type === WS_EVENTS.HELLO) {
      this.lastHello = message;
      this.eventCursor = Number(message.eventCursor ?? 0);
      this.emit('hello', message);
    }
    if (message.type === WS_EVENTS.EVENT && message.event) {
      const domainEvent = message.event as RealtimeEvent;
      this.eventCursor = Math.max(this.eventCursor, Number(domainEvent.id ?? 0));
      this.emit('event', domainEvent);
      this.emit(String(domainEvent.type), domainEvent.payload);
    } else {
      this.emit(String(message.type), message);
    }
    this.emit('message', message);
  }

  private handleClose(event: CloseEvent): void {
    this.stopHeartbeat();
    this.socket = null;
    this.connecting = false;
    this.emit('status', 'disconnected');
    if (this.closing || event.code === WS_CLOSE.POLICY) return;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.closing || this.reconnectTimer !== null) return;
    const delay = Math.min(10000, 400 * 2 ** Math.min(5, this.attempts++));
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const interval = Math.max(1000, Number(this.lastHello?.heartbeatMs ?? 25000) / 2);
    this.heartbeatTimer = setInterval(() => this.sendJson({ type: WS_EVENTS.PING, at: Date.now() }), interval);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer !== null) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  /**
   * Sends a JSON message, queuing it while the socket is not open.
   *
   * @param payload Serializable payload.
   * @returns True when the payload was written immediately.
   */
  sendJson(payload: unknown): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      if (this.queue.length < 64) this.queue.push(payload);
      return false;
    }
    try {
      this.socket.send(JSON.stringify(payload));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Sends a binary push-to-talk frame.
   *
   * @param payload Encoded audio frame.
   * @returns True when the frame was written.
   */
  sendBinary(payload: ArrayBuffer): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    try {
      this.socket.send(payload);
      return true;
    } catch {
      return false;
    }
  }

  /** Subscribes to an authorized room such as `sos:…` or `mission:…`. */
  subscribe(room: string, requestId = `sub-${Date.now()}`): boolean {
    return this.sendJson({ type: WS_EVENTS.SUBSCRIBE, room, requestId });
  }

  /** Requests durable events newer than the local cursor. */
  sync(since = this.eventCursor): boolean {
    return this.sendJson({ type: 'sync', since, limit: 100, requestId: `sync-${Date.now()}` });
  }

  /** Closes the socket and stops reconnection. */
  close(): void {
    this.closing = true;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try {
      this.socket?.close(WS_CLOSE.NORMAL, 'client closed');
    } catch {
      // Already closed.
    }
    this.socket = null;
    this.handlers.clear();
  }
}
