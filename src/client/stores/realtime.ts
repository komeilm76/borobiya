import { onScopeDispose, ref, shallowRef } from 'vue';
import { defineStore } from 'pinia';
import { RealtimeClient } from '@/utils/realtime-client.ts';
import type { RealtimeEvent } from '@shared/protocol.ts';

/** Connection state surfaced to offline and status surfaces. */
type RealtimeStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

/**
 * Owns the single authenticated WebSocket for the signed-in session.
 * Domain stores subscribe through this store instead of opening their own sockets.
 */
export const useRealtimeStore = defineStore('realtime', () => {
  const client = shallowRef<RealtimeClient>(new RealtimeClient());
  const status = ref<RealtimeStatus>('idle');
  const cursor = ref(0);
  const lastEvent = ref<RealtimeEvent | null>(null);
  const recentEvents = ref<RealtimeEvent[]>([]);
  const unsubscribers: Array<() => void> = [];

  /** Creates a fresh client, dropping every previous handler. */
  function reset(): void {
    for (const off of unsubscribers.splice(0)) off();
    client.value.close();
    client.value = new RealtimeClient();
    status.value = 'idle';
    cursor.value = 0;
    lastEvent.value = null;
    recentEvents.value = [];
  }

  /**
   * Connects and keeps the local mirror of status and cursor up to date.
   *
   * @returns A promise resolved once the connection attempt settles.
   */
  async function connect(): Promise<void> {
    reset();
    unsubscribers.push(
      client.value.on('status', (value: RealtimeStatus) => {
        status.value = value;
      }),
      client.value.on('hello', (hello: { eventCursor?: number }) => {
        cursor.value = Number(hello.eventCursor ?? 0);
      }),
      client.value.on('event', (event: RealtimeEvent) => {
        lastEvent.value = event;
        cursor.value = Math.max(cursor.value, Number(event.id ?? 0));
        recentEvents.value = [event, ...recentEvents.value].slice(0, 40);
      })
    );
    await client.value.connect();
  }

  /**
   * Registers a domain-event listener.
   *
   * @param type Domain event type such as `sos.created`.
   * @param listener Handler for the event payload.
   * @returns An unsubscribe function.
   */
  function on(type: string, listener: (payload: any) => void): () => void {
    const off = client.value.on(type, listener);
    unsubscribers.push(off);
    return off;
  }

  /** Sends a realtime message through the shared socket. */
  function send(payload: unknown): boolean {
    return client.value.sendJson(payload);
  }

  /** Sends a binary audio frame through the shared socket. */
  function sendBinary(frame: ArrayBuffer): boolean {
    return client.value.sendBinary(frame);
  }

  /** Subscribes to a room. */
  function subscribe(room: string): boolean {
    return client.value.subscribe(room);
  }

  /** Disconnects and clears handlers. */
  function disconnect(): void {
    reset();
    status.value = 'disconnected';
  }

  onScopeDispose(() => {
    for (const off of unsubscribers.splice(0)) off();
  });

  return { status, cursor, lastEvent, recentEvents, connect, disconnect, reset, on, send, sendBinary, subscribe, client };
});
