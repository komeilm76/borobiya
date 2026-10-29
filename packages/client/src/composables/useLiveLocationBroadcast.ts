import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from "vue";
import { useGeolocation } from "@vueuse/core";
import { LOCATION_UPDATE_EVENT, PEER_UPDATE_EVENT, type RealtimeClient } from "../services/socket";
import { useAuthStore } from "../stores/auth";
import {
  LOCATION_UPDATE_INTERVAL_MS,
  buildLocationUpdate,
  describeAck,
  shouldSendUpdate
} from "./location-broadcast";
import { decodeAccessTokenClaims, ownDeviceId } from "./device-identity";

export type BroadcastStatus = "idle" | "connecting" | "broadcasting" | "stopped" | "rejected";

export interface BroadcastGeolocationSource {
  readonly coords: Ref<{
    latitude: number | null;
    longitude: number | null;
    accuracy: number | null;
  } | null>;
  readonly error?: Ref<{ readonly code?: number; readonly message?: string } | null>;
  readonly isSupported: Ref<boolean> | ComputedRef<boolean>;
  resume?: () => void;
  pause?: () => void;
}

export interface UseLiveLocationBroadcastOptions {
  ownerId: Ref<string | null> | ComputedRef<string | null>;
  accessToken?: Ref<string | null> | ComputedRef<string | null>;
  /** Refreshes an expired access token via the HttpOnly refresh cookie when a socket auth check fails. */
  ensureSession?: () => Promise<unknown>;
  geolocation?: BroadcastGeolocationSource;
  openSocket?: (token: string) => RealtimeClient | Promise<RealtimeClient>;
  now?: () => number;
  intervalMs?: number;
}

function geolocationErrorCode(error: { readonly code?: number } | null | undefined): string {
  // GeolocationPositionError.PERMISSION_DENIED === 1 in W3C Geolocation API.
  return error?.code === 1 ? "GEOLOCATION_DENIED" : "GEOLOCATION_UNAVAILABLE";
}

/**
 * Owns the "my device is broadcasting my position" side of live sharing (T2.1.5): a single
 * Socket.IO connection, a throttled `location:update` every 3-5s, hardware GPS start/stop symmetry,
 * stationary heartbeat keepalive, and automatic access-token refresh on 15m JWT expiry.
 */
export function useLiveLocationBroadcast(options: UseLiveLocationBroadcastOptions) {
  const auth = options.accessToken ? null : useAuthStore();
  const accessToken = options.accessToken ?? computed(() => auth!.accessToken);
  const ensureSession = options.ensureSession ?? (auth ? () => auth.refreshSession() : undefined);
  const clock = options.now ?? (() => Date.now());
  const intervalMs = options.intervalMs ?? LOCATION_UPDATE_INTERVAL_MS;
  const openSocket =
    options.openSocket ??
    (async (token: string) => {
      const { createRealtimeClient } = await import("../services/socket");
      return createRealtimeClient(token);
    });
  // `immediate: false` prevents waking GPS hardware or prompting for location permission before the
  // user explicitly clicks "Start live broadcast", and lets `stop()` release the watcher immediately.
  const geolocation: BroadcastGeolocationSource =
    options.geolocation ??
    (useGeolocation({
      enableHighAccuracy: true,
      maximumAge: intervalMs,
      immediate: false
    }) as unknown as BroadcastGeolocationSource);

  const status = ref<BroadcastStatus>("idle");
  const lastErrorCode = ref<string | null>(null);
  const lastSentAt = ref<number | null>(null);
  const peerCount = ref(0);

  const sampledAt = ref<number | null>(null);
  let hasLiveFix = false;
  let client: RealtimeClient | null = null;
  let ticker: ReturnType<typeof setInterval> | null = null;
  let generation = 0;
  // An ack may arrive after Stop, logout or a new broadcast attempt with the same socket.
  let broadcastAttempt = 0;
  let refreshingAuth = false;
  // Consent belongs to one JWT login, not merely to an account: a new session for
  // the same user must not inherit the old session's GPS watcher and socket room.
  let consentSession: string | null = null;

  function requireToken(): string | null {
    return accessToken.value;
  }

  function belongsToOwner(token: string | null, owner: string | null): boolean {
    // Only suppress broadcasting on inconsistent local state. The server still
    // verifies the JWT, session, device priority, and each share's permissions.
    return !!token && !!owner && decodeAccessTokenClaims(token)?.sub === owner;
  }

  function loginKey(token: string | null, owner: string | null): string | null {
    if (!belongsToOwner(token, owner)) return null;
    const claims = decodeAccessTokenClaims(token);
    // Production tokens have a sessionId; older/test JWTs retain the account-only boundary.
    return JSON.stringify([owner, typeof claims?.sessionId === "string" ? claims.sessionId : null]);
  }

  function clearTicker(): void {
    if (ticker !== null) {
      clearInterval(ticker);
      ticker = null;
    }
  }

  async function tryRecoverAuth(): Promise<boolean> {
    if (!ensureSession || refreshingAuth || !client) return false;
    const recoveringClient = client;
    const recoveringGeneration = generation;
    const recoveringAttempt = broadcastAttempt;
    const owner = options.ownerId.value;
    const previousToken = requireToken();
    refreshingAuth = true;
    try {
      await ensureSession();
      // A slow refresh must not reconnect a socket after Stop, logout, or a new Start.
      if (client !== recoveringClient || generation !== recoveringGeneration ||
        broadcastAttempt !== recoveringAttempt || options.ownerId.value !== owner ||
        (status.value !== "connecting" && status.value !== "broadcasting")) return false;
      const nextToken = requireToken();
      if (!nextToken || !belongsToOwner(nextToken, owner) || nextToken === previousToken) return false;
      if (client) {
        status.value = "connecting";
        client.updateToken(nextToken);
        if (client.reconnect) client.reconnect();
        else client.connect();
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshingAuth = false;
    }
  }

  function onConnect(): void {
    if (status.value === "connecting") {
      status.value = "broadcasting";
      sendPendingUpdate();
    }
  }

  function onDisconnect(reason?: string): void {
    if (status.value === "broadcasting") status.value = "connecting";
    if (reason === "io server disconnect" && status.value === "connecting") {
      void tryRecoverAuth();
    }
  }

  async function onConnectError(error?: { data?: { code?: unknown } }): Promise<void> {
    const code = typeof error?.data?.code === "string" ? error.data.code : null;
    const attempt = broadcastAttempt;
    const failingClient = client;
    if (await tryRecoverAuth()) return;
    if (attempt !== broadcastAttempt || client !== failingClient) return;
    if (status.value === "connecting" || status.value === "broadcasting") {
      clearTicker();
      geolocation.pause?.();
      lastErrorCode.value = code;
      status.value = "rejected";
    }
  }

  function teardownClient(): void {
    generation += 1;
    if (!client) return;
    client.socket.off("connect", onConnect);
    client.socket.off("disconnect", onDisconnect);
    client.socket.off("connect_error", onConnectError);
    client.close();
    client = null;
  }

  async function ensureClient(): Promise<RealtimeClient | null> {
    const token = requireToken();
    const owner = options.ownerId.value;
    if (!token || !belongsToOwner(token, owner)) return null;
    if (client) {
      client.updateToken(token);
      return client;
    }
    const currentGeneration = ++generation;
    const opened = await openSocket(token);
    const currentToken = requireToken();
    if (currentGeneration !== generation || options.ownerId.value !== owner ||
      !belongsToOwner(currentToken, owner)) {
      opened.close();
      return null;
    }
    opened.updateToken(currentToken!);
    client = opened;
    client.socket.on("connect", onConnect);
    client.socket.on("disconnect", onDisconnect);
    client.socket.on("connect_error", onConnectError);
    return client;
  }

  function sendPendingUpdate(): void {
    const activeClient = client;
    if (status.value !== "broadcasting" || !activeClient?.socket.connected ||
      !belongsToOwner(requireToken(), options.ownerId.value)) return;
    if (geolocation.error?.value) return;

    const currentNow = clock();
    const deviceId = ownDeviceId(requireToken());
    if (!deviceId) {
      status.value = "rejected";
      lastErrorCode.value = "PRIORITY_DEVICE_REQUIRED";
      stop();
      return;
    }

    // While actively watching live geolocation without error, keep stationary users alive at the
    // heartbeat interval instead of letting `sampledAt` go stale > 60s when standing still.
    const effectiveSampledAt =
      hasLiveFix && sampledAt.value !== null
        ? Math.max(sampledAt.value, currentNow - intervalMs)
        : sampledAt.value ?? undefined;

    const payload = buildLocationUpdate(
      { coords: geolocation.coords.value ?? null, timestamp: effectiveSampledAt },
      { deviceId, now: currentNow }
    );
    if (!payload) return;
    if (!shouldSendUpdate({ lastSentAt: lastSentAt.value, now: currentNow, intervalMs })) return;

    const attempt = broadcastAttempt;
    const sentToken = requireToken();
    const owner = options.ownerId.value;
    const stillCurrent = () => attempt === broadcastAttempt && client === activeClient &&
      status.value === "broadcasting" && owner === options.ownerId.value &&
      !!sentToken && requireToken() === sentToken;
    activeClient.socket.timeout(5_000).emit(LOCATION_UPDATE_EVENT, payload, async (error: Error | null, ack: unknown) => {
      if (!stillCurrent()) return;
      const outcome = error ? { ok: false, code: "SOCKET_TIMEOUT" } : describeAck(ack);
      if (!outcome.ok && (outcome.code === "UNAUTHORIZED" || outcome.code === "INVALID_ACCESS_TOKEN")) {
        if (await tryRecoverAuth()) return;
        if (!stillCurrent()) return;
      }
      lastErrorCode.value = outcome.code;
      status.value = outcome.ok ? "broadcasting" : "rejected";
      if (!outcome.ok) {
        clearTicker();
        geolocation.pause?.();
        return;
      }
      lastSentAt.value = currentNow;
      const peers = (ack as { peers?: unknown } | undefined)?.peers;
      peerCount.value = Array.isArray(peers) ? peers.length : 0;
    });
  }

  async function start(): Promise<void> {
    if (status.value === "broadcasting" || status.value === "connecting") return;
    if (!geolocation.isSupported.value) {
      status.value = "rejected";
      lastErrorCode.value = "GEOLOCATION_UNAVAILABLE";
      return;
    }
    const owner = options.ownerId.value;
    const attempt = ++broadcastAttempt; // lock before awaiting session recovery
    status.value = "connecting";
    lastErrorCode.value = null;
    let token = requireToken();
    if (!token && ensureSession) {
      try {
        await ensureSession();
      } catch {
        // Token state below determines whether starting is permitted.
      }
      token = requireToken();
    }
    if (attempt !== broadcastAttempt || status.value !== "connecting" || options.ownerId.value !== owner) return;
    if (!belongsToOwner(token, owner)) {
      status.value = "rejected";
      lastErrorCode.value = "UNAUTHORIZED";
      return;
    }
    consentSession = loginKey(token, owner);

    hasLiveFix = geolocation.coords.value !== null && Number.isFinite(geolocation.coords.value.latitude);
    if (hasLiveFix && sampledAt.value === null) sampledAt.value = clock();
    geolocation.resume?.();
    ticker ??= setInterval(sendPendingUpdate, intervalMs);

    try {
      const activeClient = await ensureClient();
      if (attempt !== broadcastAttempt || options.ownerId.value !== owner || status.value !== "connecting") return;
      if (!activeClient) {
        clearTicker();
        geolocation.pause?.();
        status.value = "rejected";
        lastErrorCode.value = "UNAUTHORIZED";
        return;
      }

      if (activeClient.socket.connected) {
        status.value = "broadcasting";
        sendPendingUpdate();
      } else {
        activeClient.connect();
      }
    } catch {
      // A failed dynamic import/open/connect must not leave GPS watching with a stuck
      // "connecting" status. A late failure from a stopped attempt cannot reject a new one.
      if (attempt !== broadcastAttempt || options.ownerId.value !== owner ||
        (status.value !== "connecting" && status.value !== "broadcasting")) return;
      clearTicker();
      geolocation.pause?.();
      teardownClient();
      lastErrorCode.value = "SOCKET_UNAVAILABLE";
      status.value = "rejected";
    }
  }

  function stop(): void {
    broadcastAttempt++;
    generation++; // a socket opened for a cancelled start must not attach later
    consentSession = null;
    clearTicker();
    hasLiveFix = false;
    geolocation.pause?.();
    if (status.value !== "rejected") status.value = "stopped";
  }

  function toggle(): void {
    if (status.value === "connecting" || status.value === "broadcasting") stop();
    else void start();
  }

  function clearSessionBroadcast(): void {
    stop();
    status.value = "idle";
    lastErrorCode.value = null;
    lastSentAt.value = null;
    peerCount.value = 0;
    sampledAt.value = null;
    teardownClient();
  }

  watch(options.ownerId, () => {
    // An account can change without a token-null render (e.g. another tab's cookie).
    // Consent and GPS coordinates from the previous owner must not follow it.
    clearSessionBroadcast();
  }, { flush: "sync" });
  watch(accessToken, (token, previousToken) => {
    const key = loginKey(token, options.ownerId.value);
    const previousKey = loginKey(previousToken, options.ownerId.value);
    if (!key || (previousKey !== null && key !== previousKey) ||
      (consentSession !== null && key !== consentSession)) {
      // Flush synchronously: A→B→A in one tick still revokes A's prior consent.
      // A stopped broadcaster may still own a connected, reusable socket: close it too.
      clearSessionBroadcast();
      return;
    }
    client?.updateToken(token!);
    if ((status.value === "connecting" || status.value === "broadcasting") && client && !client.socket.connected) {
      client.connect();
    }
  }, { flush: "sync" });

  watch(
    () => geolocation.coords.value,
    (coords) => {
      if (coords && Number.isFinite(coords.latitude) && Number.isFinite(coords.longitude)) {
        hasLiveFix = true;
        sampledAt.value = clock();
        if (status.value === "broadcasting") sendPendingUpdate();
      }
    },
    { deep: true }
  );

  if (geolocation.error) {
    watch(
      () => geolocation.error!.value,
      (geoError) => {
        if (!geoError) return;
        if (status.value === "connecting" || status.value === "broadcasting") {
          clearTicker();
          geolocation.pause?.();
          lastErrorCode.value = geolocationErrorCode(geoError);
          status.value = "rejected";
        }
      }
    );
  }

  onScopeDispose(() => {
    stop();
    teardownClient();
  });

  return {
    status: computed(() => status.value),
    lastErrorCode: computed(() => lastErrorCode.value),
    lastSentAt: computed(() => lastSentAt.value),
    peerCount: computed(() => peerCount.value),
    isSupported: computed(() => geolocation.isSupported.value),
    start,
    stop,
    toggle,
    PEER_UPDATE_EVENT
  };
}
