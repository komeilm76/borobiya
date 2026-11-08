/** One authenticated WebSocket with one-time tickets, durable-event catch-up and binary audio support. */
import { WS_EVENTS, WS_CLOSE } from './protocol.js';
import { post } from './api.js';

/** @typedef {(payload: any) => void} Listener */

export class RealtimeClient {
  constructor() {
    /** @type {Map<string, Set<Listener>>} */
    this.handlers = new Map();
    /** @type {WebSocket|null} */
    this.ws = null;
    /** @type {any[]} */
    this.queue = [];
    /** @type {number|null} */
    this.heartbeat = null;
    /** @type {number|null} */
    this.reconnectTimer = null;
    this.attempts = 0;
    this.connecting = false;
    this.closing = false;
    this.eventCursor = 0;
    this.lastHello = null;
  }

  /** @param {string} type @param {Listener} listener @returns {() => void} */
  on(type, listener) {
    const set = this.handlers.get(type) || new Set();
    set.add(listener);
    this.handlers.set(type, set);
    return () => this.off(type, listener);
  }

  /** @param {string} type @param {Listener} listener */
  off(type, listener) { this.handlers.get(type)?.delete(listener); }

  /** @param {string} type @param {any} payload */
  emit(type, payload) {
    for (const listener of this.handlers.get(type) || []) {
      try { listener(payload); } catch (error) { console.error(`[realtime] ${type} listener failed`, error); }
    }
  }

  async connect() {
    if (this.closing || this.connecting || (this.ws && this.ws.readyState <= WebSocket.OPEN)) return;
    this.connecting = true;
    this.emit('status', 'connecting');
    try {
      const ticket = await post('/_user/realtime/ticket');
      if (!ticket?.ticket) throw new Error('Realtime ticket was not issued.');
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${scheme}//${window.location.host}/ws?ticket=${encodeURIComponent(String(ticket.ticket))}`);
      socket.binaryType = 'arraybuffer';
      this.ws = socket;
      socket.onopen = () => {
        this.connecting = false;
        this.attempts = 0;
        this.emit('status', 'connected');
        this.startHeartbeat();
        for (const payload of this.queue.splice(0)) this.sendJson(payload);
      };
      socket.onmessage = (event) => this.handleMessage(event);
      socket.onerror = () => { this.emit('status', 'error'); };
      socket.onclose = (event) => this.handleClose(event);
    } catch (error) {
      this.connecting = false;
      this.emit('status', 'error');
      this.scheduleReconnect();
    }
  }

  /** @param {MessageEvent<any>} event */
  handleMessage(event) {
    if (event.data instanceof ArrayBuffer) { this.emit('binary', event.data); return; }
    if (typeof event.data !== 'string') return;
    /** @type {any} */
    let message;
    try { message = JSON.parse(event.data); } catch { return; }
    if (message.type === WS_EVENTS.HELLO) {
      this.lastHello = message;
      this.eventCursor = Number(message.eventCursor || 0);
      this.emit('hello', message);
    }
    if (message.type === WS_EVENTS.EVENT && message.event) {
      this.eventCursor = Math.max(this.eventCursor, Number(message.event.id || 0));
      this.emit('event', message.event);
      this.emit(String(message.event.type), message.event.payload);
    } else {
      this.emit(String(message.type), message);
    }
    this.emit('message', message);
  }

  /** @param {CloseEvent} event */
  handleClose(event) {
    this.stopHeartbeat();
    this.ws = null;
    this.connecting = false;
    this.emit('status', 'disconnected');
    if (this.closing || event.code === WS_CLOSE.POLICY) return;
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.closing || this.reconnectTimer !== null) return;
    const delay = Math.min(10000, 400 * 2 ** Math.min(5, this.attempts++));
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      void this.connect();
    }, delay);
  }

  startHeartbeat() {
    this.stopHeartbeat();
    const interval = Number(this.lastHello?.heartbeatMs || 25000) / 2;
    this.heartbeat = window.setInterval(() => this.sendJson({ type: WS_EVENTS.PING, at: Date.now() }), interval);
  }

  stopHeartbeat() {
    if (this.heartbeat !== null) window.clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  /** @param {any} payload @returns {boolean} */
  sendJson(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) { this.queue.push(payload); return false; }
    try { this.ws.send(JSON.stringify(payload)); return true; } catch { return false; }
  }

  /** @param {ArrayBuffer} payload @returns {boolean} */
  sendBinary(payload) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    try { this.ws.send(payload); return true; } catch { return false; }
  }

  /** @param {string} room @param {string} [requestId] */
  subscribe(room, requestId) {
    return this.sendJson({ type: WS_EVENTS.SUBSCRIBE, room, requestId: requestId || `sub-${Date.now()}` });
  }

  /** @param {number} [since] */
  sync(since = this.eventCursor) {
    return this.sendJson({ type: 'sync', since, limit: 100, requestId: `sync-${Date.now()}` });
  }

  close() {
    this.closing = true;
    this.stopHeartbeat();
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    try { this.ws?.close(WS_CLOSE.NORMAL, 'client closed'); } catch { /* already closed */ }
    this.ws = null;
  }
}
