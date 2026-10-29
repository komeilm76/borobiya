import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { missionLocationEventSchema, missionStatusUpdatedEventSchema,
  rescuerCancellationEventSchema, requesterCancellationEventSchema, type MissionLocationEvent } from "@shared/index";
import { MISSION_LOCATION_EVENT, MISSION_LOCATION_PUBLISH_EVENT, MISSION_SUBSCRIBE_EVENT,
  MISSION_STATUS_UPDATED_EVENT, MISSION_CANCELLED_BY_REQUESTER_EVENT, MISSION_CANCELLED_BY_RESCUER_EVENT } from "@/services/socket-events";
import type { RealtimeClient } from "@/services/socket";
import { ownDeviceId, decodeAccessTokenClaims } from "./device-identity";
import { readAllUserSync } from "@/api/sync";
import { getMission } from "@/api/mission";
import type { MissionDetail, UserSyncResponse } from "@shared/index";

function isAdmin(token: string | null): boolean { return decodeAccessTokenClaims(token)?.role === "admin"; }

/** Ignore access-token rotations, but never inherit GPS consent across login sessions. */
function sessionIdentity(token: string | null): string | null {
  const claims = decodeAccessTokenClaims(token);
  return claims ? JSON.stringify([claims.sub, claims.role, claims.deviceId, claims.sessionId]) : null;
}

/** Do not open a private mission room while the refreshed bearer and cached profile disagree. */
function matchesOwner(token: string | null, owner: string | null): boolean {
  const subject = decodeAccessTokenClaims(token)?.sub;
  return Boolean(token && owner && (typeof subject !== "string" || subject === owner));
}

export interface LiveMissionIdentity {
  id: string;
  requesterId: string;
  rescuerId: string;
}
export interface MissionLiveRuntime {
  openSocket?: (token: string) => Promise<RealtimeClient>;
  watchPosition?: (onFix: (fix: { lat: number; lon: number; accuracy?: number }) => void,
    onError: (denied: boolean) => void) => () => void;
  now?: () => number;
  readSync?: (token: string, since: string, signal?: AbortSignal) => Promise<UserSyncResponse>;
  readMission?: (token: string, id: string) => Promise<MissionDetail>;
}
const STALE_MS = 30_000;

function browserWatch(onFix: (fix: { lat: number; lon: number; accuracy?: number }) => void,
  onError: (denied: boolean) => void): () => void {
  if (typeof navigator === "undefined" || !navigator.geolocation) throw new Error("GEOLOCATION_UNAVAILABLE");
  const id = navigator.geolocation.watchPosition(({ coords }) => onFix({
    lat: coords.latitude, lon: coords.longitude, accuracy: coords.accuracy
  }), (error) => onError(error.code === 1), { enableHighAccuracy: true, maximumAge: 5000, timeout: 12_000 });
  return () => navigator.geolocation.clearWatch(id);
}

/** A private mission room listener and separately consented publisher; no location persists in browser storage. */
export function useMissionLiveLocations(
  mission: Ref<LiveMissionIdentity | null>, token: Ref<string | null>, userId: Ref<string | null>,
  ensureSession?: () => Promise<unknown>, runtime: MissionLiveRuntime = {}
) {
  const locations = ref<Partial<Record<MissionLocationEvent["role"], MissionLocationEvent>>>({});
  const connected = ref(false);
  const sharing = ref(false);
  // A room subscription confirms access, not that the mission remained active during an outage.
  // Keep explicit GPS consent disabled until the missed-status HTTP read has succeeded.
  const recoveryPending = ref(false);
  const error = ref<string | null>(null);
  const now = ref((runtime.now ?? Date.now)());
  const currentTime = runtime.now ?? Date.now;
  let client: RealtimeClient | null = null;
  let socketIdentity: string | null = null;
  let stopWatch: (() => void) | null = null;
  let clockTicker: ReturnType<typeof setInterval> | null = null;
  let lastPublished = Number.NEGATIVE_INFINITY;
  let generation = 0;
  let shareGeneration = 0;
  let lastDisconnectAt: string | null = null;
  let recoveryMissionId: string | null = null;
  let recoveryOwner: string | null = null;
  let recoveryIdentity: string | null = null;
  let syncAbort: AbortController | null = null;
  let refreshingAuth = false;

  // GPS freshness is not transport/session presence: someone may be connected without opting in.
  const participantStatus = computed(() => (["requester", "rescuer", "admin"] as const).map((role) => {
    const entry = locations.value[role];
    return { role, entry, fresh: Boolean(entry && connected.value &&
      now.value - Date.parse(entry.timestamp) <= STALE_MS) };
  }));

  function stopSharing(): void {
    // Invalidate callbacks first: watchPosition/clearWatch and Socket.IO acks can arrive late,
    // including after a new opt-in has already started for this very same mission.
    shareGeneration++;
    sharing.value = false;
    lastPublished = Number.NEGATIVE_INFINITY;
    const cleanup = stopWatch;
    stopWatch = null;
    cleanup?.();
  }
  function stop(): void {
    generation++;
    syncAbort?.abort();
    syncAbort = null;
    lastDisconnectAt = null;
    recoveryMissionId = null;
    recoveryOwner = null;
    recoveryIdentity = null;
    recoveryPending.value = false;
    stopSharing();
    if (clockTicker) clearInterval(clockTicker);
    clockTicker = null;
    client?.close();
    client = null;
    socketIdentity = null;
    connected.value = false;
    locations.value = {};
    error.value = null;
  }
  function handleEvent(payload: unknown): void {
    const parsed = missionLocationEventSchema.safeParse(payload);
    const current = mission.value;
    if (!parsed.success || !current || parsed.data.missionId !== current.id ||
      (parsed.data.role !== "admin" &&
        parsed.data.userId !== current[parsed.data.role === "rescuer" ? "rescuerId" : "requesterId"])) return;
    const previous = locations.value[parsed.data.role];
    if (previous && Date.parse(parsed.data.timestamp) <= Date.parse(previous.timestamp)) return;
    // A delayed or forged fix outside the just-observed live window is never painted.
    const age = currentTime() - Date.parse(parsed.data.timestamp);
    if (age < -10_000 || age > 60_000) return;
    locations.value = { ...locations.value, [parsed.data.role]: parsed.data };
    now.value = currentTime();
  }
  function endMission(): void {
    stop();
    error.value = "مأموریت پایان یافت؛ اشتراک موقعیت متوقف شد.";
  }
  function onMissionStatus(payload: unknown): void {
    const event = missionStatusUpdatedEventSchema.safeParse(payload);
    if (event.success && event.data.missionId === mission.value?.id &&
      ["completed", "cancelled_by_requester", "cancelled_by_rescuer", "cancelled_by_admin", "expired"]
        .includes(event.data.status)) endMission();
  }
  function onCancellation(payload: unknown, by: "requester" | "rescuer"): void {
    const event = (by === "requester" ? requesterCancellationEventSchema : rescuerCancellationEventSchema).safeParse(payload);
    if (event.success && event.data.missionId === mission.value?.id) endMission();
  }
  function subscribe(): void {
    const current = mission.value;
    const socket = client?.socket;
    if (!current || !socket?.connected || !matchesOwner(token.value, userId.value) ||
      socketIdentity !== sessionIdentity(token.value)) return;
    const gen = generation;
    const owner = userId.value;
    socket.timeout(5000).emit(MISSION_SUBSCRIBE_EVENT, { missionId: current.id },
      (timeout: Error | null, response: { ok?: boolean } | undefined) => {
        if (gen !== generation || client?.socket !== socket ||
          mission.value?.id !== current.id || userId.value !== owner) return;
        if (timeout || !response?.ok) {
          connected.value = false;
          stopSharing();
          error.value = "دسترسی به اتاق زندهٔ مأموریت ممکن نیست؛ دوباره تلاش کنید.";
        } else { connected.value = true; if (!lastDisconnectAt) error.value = null; }
      });
  }
  async function recoverAuth(opened: RealtimeClient, gen: number): Promise<void> {
    if (!ensureSession || refreshingAuth) return;
    refreshingAuth = true;
    try {
      const before = token.value;
      await ensureSession();
      if (gen !== generation || client !== opened || socketIdentity !== sessionIdentity(token.value)) return;
      if (!token.value || token.value === before) return;
      opened.updateToken(token.value);
      if (opened.reconnect) opened.reconnect();
      else opened.connect();
    } catch {
      if (gen === generation) error.value = "نشست زنده منقضی شده است؛ دوباره وارد شوید.";
    } finally { refreshingAuth = false; }
  }

  async function reconcile(current: LiveMissionIdentity, owner: string,
    opened: RealtimeClient, gen: number): Promise<void> {
    const since = lastDisconnectAt;
    const bearer = token.value;
    if (!since || !bearer) return;
    syncAbort?.abort();
    const abort = new AbortController();
    syncAbort = abort;
    const valid = () => gen === generation && !abort.signal.aborted && client === opened &&
      opened.socket.connected && mission.value?.id === current.id && userId.value === owner &&
      socketIdentity === sessionIdentity(token.value);
    try {
      // Admins do not have a /_user sync stream: their authenticated detail read is the
      // authoritative recovery path; participant sync must never leak a global event feed.
      const result = isAdmin(bearer) ? null : await (runtime.readSync ?? readAllUserSync)(bearer, since, abort.signal);
      if (!valid()) return;
      // A full snapshot contains the current mission whenever it is active or changed since
      // disconnect. A truncated list or an older terminal mission needs a scoped detail read.
      const snapshot = result?.missions.find((item) => item.id === current.id);
      const latest = snapshot ?? await (runtime.readMission ?? getMission)(token.value!, current.id);
      if (!valid()) return;
      if (latest.status === "completed" || latest.status.startsWith("cancelled_") || latest.status === "expired") {
        endMission();
        return;
      }
      // A socket event delivered while the HTTP snapshot was in flight can be newer than the
      // snapshot. Neither this reconciliation nor reconnect starts GPS sharing by itself.
      lastDisconnectAt = null;
      recoveryMissionId = null;
      recoveryOwner = null;
      recoveryIdentity = null;
      recoveryPending.value = false;
      if (connected.value) error.value = null;
    } catch {
      if (valid()) {
        stopSharing();
        error.value = "همگام‌سازی پس از اتصال دوباره ممکن نشد؛ برای بررسی وضعیت مأموریت دوباره تلاش کنید.";
      }
    } finally {
      if (syncAbort === abort) syncAbort = null;
    }
  }

  function pendingRecoveryFor(id: string | null, owner: string | null): string | null {
    return id && owner && lastDisconnectAt && recoveryMissionId === id && recoveryOwner === owner &&
      recoveryIdentity !== null && recoveryIdentity === sessionIdentity(token.value)
      ? lastDisconnectAt : null;
  }
  function restoreRecovery(since: string | null, id: string | null, owner: string | null): void {
    if (!since) return;
    lastDisconnectAt = since;
    recoveryMissionId = id;
    recoveryOwner = owner;
    recoveryIdentity = sessionIdentity(token.value);
    recoveryPending.value = true;
  }
  async function start(): Promise<void> {
    // Manual Retry must retain an unverified outage across a new socket or a failed
    // opener, but only within the same mission, owner and JWT session.
    const missedSince = pendingRecoveryFor(mission.value?.id ?? null, userId.value);
    stop();
    restoreRecovery(missedSince, mission.value?.id ?? null, userId.value);
    const current = mission.value;
    const owner = userId.value;
    if (!current || !owner || !token.value || !matchesOwner(token.value, owner)) return;
    const gen = generation;
    clockTicker = setInterval(() => { now.value = currentTime(); }, 1000);
    clockTicker.unref?.();
    try {
      await ensureSession?.();
      if (gen !== generation || !token.value || !matchesOwner(token.value, owner) ||
        mission.value?.id !== current.id || userId.value !== owner) return;
      const opener = runtime.openSocket ?? (async (bearer: string) => {
        const { createRealtimeClient } = await import("@/services/socket");
        return createRealtimeClient(bearer);
      });
      const openingToken = token.value;
      const openingIdentity = sessionIdentity(openingToken);
      const opened = await opener(openingToken);
      const currentBearer = token.value;
      if (gen !== generation || mission.value?.id !== current.id || userId.value !== owner ||
        !currentBearer || !matchesOwner(currentBearer, owner) || !openingIdentity ||
        openingIdentity !== sessionIdentity(currentBearer)) {
        opened.close(); return;
      }
      client = opened;
      socketIdentity = openingIdentity;
      const active = () => gen === generation && client === opened &&
        socketIdentity === sessionIdentity(token.value) && matchesOwner(token.value, owner) &&
        mission.value?.id === current.id && userId.value === owner;
      let connectedDuringSetup = false;
      const onConnect = () => {
        if (!active()) return;
        connectedDuringSetup = true;
        subscribe();
        void reconcile(current, owner, opened, gen);
      };
      opened.socket.on("connect", onConnect);
      opened.socket.on("disconnect", (reason) => {
        if (!active()) return;
        connected.value = false;
        syncAbort?.abort();
        lastDisconnectAt ??= new Date(currentTime()).toISOString();
        recoveryMissionId = current.id;
        recoveryOwner = owner;
        recoveryIdentity = socketIdentity;
        recoveryPending.value = true;
        stopSharing();
        if (reason === "io server disconnect") void recoverAuth(opened, gen);
      });
      opened.socket.on("connect_error", () => { if (active()) void recoverAuth(opened, gen); });
      opened.socket.on(MISSION_LOCATION_EVENT, (payload: unknown) => { if (active()) handleEvent(payload); });
      opened.socket.on(MISSION_STATUS_UPDATED_EVENT, (payload: unknown) => { if (active()) onMissionStatus(payload); });
      opened.socket.on(MISSION_CANCELLED_BY_REQUESTER_EVENT, (payload: unknown) => {
        if (active()) onCancellation(payload, "requester");
      });
      opened.socket.on(MISSION_CANCELLED_BY_RESCUER_EVENT, (payload: unknown) => {
        if (active()) onCancellation(payload, "rescuer");
      });
      opened.updateToken(currentBearer);
      opened.connect();
      // An injected/native socket can already be connected before handlers are attached.
      // The room subscribe and missed-status read are both required, but do not double
      // subscribe if connect() synchronously emitted the event while we were setting up.
      if (opened.socket.connected && !connectedDuringSetup) onConnect();
    } catch {
      if (gen === generation) {
        const retrySince = pendingRecoveryFor(current.id, owner);
        stop();
        restoreRecovery(retrySince, current.id, owner);
        error.value = "اتصال زندهٔ مأموریت برقرار نشد؛ دوباره تلاش کنید.";
      }
    }
  }
  function publish(fix: { lat: number; lon: number; accuracy?: number }, share: number,
    owner: string, device: string, identity: string | null): void {
    const current = mission.value;
    const socket = client?.socket;
    if (share !== shareGeneration || !sharing.value || !connected.value || !current ||
      !socket?.connected || owner !== userId.value || device !== ownDeviceId(token.value) ||
      identity !== sessionIdentity(token.value) || identity !== socketIdentity) return;
    if (current.requesterId !== owner && current.rescuerId !== owner && !isAdmin(token.value)) return;
    const timestamp = currentTime();
    if (timestamp - lastPublished < 5000) return;
    lastPublished = timestamp;
    socket.timeout(5000).emit(MISSION_LOCATION_PUBLISH_EVENT, { missionId: current.id,
      location: { ...fix, timestamp: new Date(timestamp).toISOString(), priorityDeviceId: device } },
    (timeout: Error | null, response: { ok?: boolean; code?: string } | undefined) => {
      if (share !== shareGeneration || !sharing.value || client?.socket !== socket ||
        mission.value?.id !== current.id || userId.value !== owner || device !== ownDeviceId(token.value) ||
        identity !== sessionIdentity(token.value)) return;
      if (timeout || !response?.ok) {
        error.value = response?.code === "MISSION_UNAVAILABLE" ? "مأموریت دیگر فعال نیست؛ اشتراک متوقف شد." :
          "ارسال موقعیت ممکن نشد؛ وضعیت اتصال و دستگاه اولویت‌دار را بررسی کنید.";
        stopSharing();
      } else error.value = null;
    });
  }
  function startSharing(): void {
    if (sharing.value || !connected.value || recoveryPending.value || !mission.value || !userId.value ||
      !matchesOwner(token.value, userId.value) ||
      (mission.value.requesterId !== userId.value && mission.value.rescuerId !== userId.value &&
        !isAdmin(token.value))) return;
    const owner = userId.value;
    const device = ownDeviceId(token.value);
    const identity = sessionIdentity(token.value);
    if (!device || !identity || identity !== socketIdentity) {
      error.value = "نشست این دستگاه معتبر نیست یا در حال تغییر است؛ دوباره وارد شوید.";
      return;
    }
    const share = ++shareGeneration;
    sharing.value = true;
    lastPublished = Number.NEGATIVE_INFINITY;
    error.value = null;
    try {
      const cleanup = (runtime.watchPosition ?? browserWatch)((fix) => {
        if (share !== shareGeneration || !sharing.value || userId.value !== owner ||
          identity !== sessionIdentity(token.value)) return;
        publish(fix, share, owner, device, identity);
      }, (denied) => {
        if (share !== shareGeneration || !sharing.value || userId.value !== owner) return;
        error.value = denied ? "اجازهٔ موقعیت قطع شد؛ اشتراک متوقف شد." : "موقعیت تازه دریافت نشد.";
        if (denied) stopSharing();
      });
      // A synchronous watch error may have stopped sharing before its disposer was returned.
      if (share === shareGeneration && sharing.value) stopWatch = cleanup;
      else cleanup();
    } catch {
      stopSharing();
      error.value = "مکان‌یابی در این دستگاه در دسترس نیست.";
    }
  }
  // Account, mission and JWT-session changes are privacy boundaries: stop GPS and
  // clear previous participants before Vue's deferred render or a same-tick relogin.
  watch(() => [mission.value?.id, userId.value] as const, () => { void start(); },
    { immediate: true, flush: "sync" });
  watch(token, (next, previous) => {
    if (!next) { stop(); return; }
    if (!sessionIdentity(next) || sessionIdentity(next) !== sessionIdentity(previous)) {
      // A different login may use the same account and device. It needs a fresh
      // authenticated room and a new, explicit consent gesture.
      void start();
      return;
    }
    client?.updateToken(next);
  }, { flush: "sync" });
  onScopeDispose(stop);
  return { locations, participantStatus, connected, sharing, recoveryPending, error, now, start, stop,
    startSharing, stopSharing, handleEvent };
}
