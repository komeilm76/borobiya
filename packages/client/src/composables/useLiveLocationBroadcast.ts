import { computed, onScopeDispose, ref, watch } from "vue";
import { useGeolocation } from "@vueuse/core";
import { LOCATION_UPDATE_EVENT, PEER_UPDATE_EVENT, createRealtimeClient, type RealtimeClient } from "../services/socket";
import { useAuthStore } from "../stores/auth";
import {
  LOCATION_UPDATE_INTERVAL_MS,
  buildLocationUpdate,
  describeAck,
  shouldSendUpdate
} from "./location-broadcast";
import { ownDeviceId } from "./device-identity";

export type BroadcastStatus = "idle" | "connecting" | "broadcasting" | "stopped" | "rejected";

/**
 * Owns the "my device is broadcasting my position" side of live sharing (T2.1.5): a single
 * Socket.IO connection, a throttled `location:update` every 3-5s, and the server's rejection
 * codes surfaced so a UI can explain why a broadcast stopped.
 *
 * The peer/recipient side (markers, playback) belongs to the share views (T2.1.7, T2.2.4).
 */
export function useLiveLocationBroadcast() {
  const auth = useAuthStore();
  const geolocation = useGeolocation({ enableHighAccuracy: true, maximumAge: LOCATION_UPDATE_INTERVAL_MS });

  const status = ref<BroadcastStatus>("idle");
  const lastErrorCode = ref<string | null>(null);
  const lastSentAt = ref<number | null>(null);
  const peerCount = ref(0);

  // VueUse exposes the coordinates but not the position timestamp, so the age of a fix is
  // measured from the moment this tab received it.
  const sampledAt = ref<number | null>(null);

  let client: RealtimeClient | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;

  function requireToken(): string | null {
    return auth.accessToken;
  }

  function ensureClient(): RealtimeClient | null {
    const token = requireToken();
    if (!token) return null;
    if (!client) {
      client = createRealtimeClient(token);
      client.socket.on("connect_error", () => {
        if (status.value === "connecting") status.value = "rejected";
      });
      client.socket.on("connect", () => {
        if (status.value === "connecting") status.value = "broadcasting";
      });
      client.socket.on("disconnect", () => {
        if (status.value === "broadcasting") status.value = "connecting";
      });
    } else {
      client.updateToken(token);
    }
    return client;
  }

  function sendPendingUpdate(): void {
    const activeClient = client;
    if (!activeClient?.socket.connected) return;

    const deviceId = ownDeviceId(requireToken());
    if (!deviceId) {
      // Without a session device id the server can only answer WRONG_DEVICE, so stop instead of
      // burning the share rate limit on updates that are guaranteed to be ignored.
      status.value = "rejected";
      lastErrorCode.value = "PRIORITY_DEVICE_REQUIRED";
      stop();
      return;
    }

    const payload = buildLocationUpdate(
      { coords: geolocation.coords.value ?? null, timestamp: sampledAt.value ?? undefined },
      { deviceId }
    );
    if (!payload) return;
    if (!shouldSendUpdate({ lastSentAt: lastSentAt.value, now: Date.now() })) return;

    const sentAt = Date.now();
    activeClient.socket.timeout(5_000).emit(LOCATION_UPDATE_EVENT, payload, (error: Error | null, ack: unknown) => {
      const outcome = error ? { ok: false, code: "SOCKET_TIMEOUT" } : describeAck(ack);
      lastErrorCode.value = outcome.code;
      status.value = outcome.ok ? "broadcasting" : "rejected";
      if (outcome.ok) {
        lastSentAt.value = sentAt;
        const peers = (ack as { peers?: unknown } | undefined)?.peers;
        peerCount.value = Array.isArray(peers) ? peers.length : 0;
      }
    });
  }

  function start(): void {
    if (status.value === "broadcasting" || status.value === "connecting") return;
    const activeClient = ensureClient();
    if (!activeClient) {
      status.value = "rejected";
      lastErrorCode.value = "UNAUTHORIZED";
      return;
    }

    lastErrorCode.value = null;
    status.value = activeClient.socket.connected ? "broadcasting" : "connecting";
    activeClient.connect();
    if (status.value === "broadcasting") sendPendingUpdate();
    ticker ??= setInterval(sendPendingUpdate, LOCATION_UPDATE_INTERVAL_MS);
  }

  function stop(): void {
    if (ticker) {
      clearInterval(ticker);
      ticker = null;
    }
    if (status.value !== "rejected") status.value = "stopped";
  }

  // A rotated access token must not keep a socket bound to the previous session.
  watch(
    () => auth.accessToken,
    (token) => {
      if (!token) {
        stop();
        client?.close();
        client = null;
        return;
      }
      client?.updateToken(token);
    }
  );

  watch(
    () => geolocation.coords.value,
    () => {
      sampledAt.value = Date.now();
      if (status.value === "broadcasting") sendPendingUpdate();
    },
    { deep: true }
  );

  onScopeDispose(() => {
    stop();
    client?.close();
    client = null;
  });

  return {
    status: computed(() => status.value),
    lastErrorCode: computed(() => lastErrorCode.value),
    lastSentAt: computed(() => lastSentAt.value),
    peerCount: computed(() => peerCount.value),
    isSupported: computed(() => geolocation.isSupported.value),
    start,
    stop,
    PEER_UPDATE_EVENT
  };
}
