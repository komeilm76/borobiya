import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { missionLocationEventSchema, missionStatusUpdatedEventSchema,
  rescuerCancellationEventSchema, requesterCancellationEventSchema, type MissionLocationEvent } from "@shared/index";
import { MISSION_LOCATION_EVENT, MISSION_LOCATION_PUBLISH_EVENT, MISSION_SUBSCRIBE_EVENT,
  MISSION_STATUS_UPDATED_EVENT, MISSION_CANCELLED_BY_REQUESTER_EVENT, MISSION_CANCELLED_BY_RESCUER_EVENT } from "@/services/socket-events";
import type { RealtimeClient } from "@/services/socket";
import { ownDeviceId, decodeAccessTokenClaims } from "./device-identity";

function isAdmin(token: string | null): boolean { return decodeAccessTokenClaims(token)?.role === "admin"; }

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
  const error = ref<string | null>(null);
  const now = ref((runtime.now ?? Date.now)());
  const currentTime = runtime.now ?? Date.now;
  let client: RealtimeClient | null = null;
  let stopWatch: (() => void) | null = null;
  let clockTicker: ReturnType<typeof setInterval> | null = null;
  let lastPublished = Number.NEGATIVE_INFINITY;
  let generation = 0;

  const participantStatus = computed(() => (["requester", "rescuer", "admin"] as const).map((role) => {
    const entry = locations.value[role];
    return { role, entry, online: Boolean(entry && connected.value &&
      now.value - Date.parse(entry.timestamp) <= STALE_MS) };
  }));

  function stopSharing(): void {
    stopWatch?.(); stopWatch = null;
    sharing.value = false;
  }
  function stop(): void {
    generation++;
    stopSharing();
    if (clockTicker) clearInterval(clockTicker);
    clockTicker = null;
    client?.close();
    client = null;
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
    if (!current || !socket?.connected) return;
    socket.timeout(5000).emit(MISSION_SUBSCRIBE_EVENT, { missionId: current.id },
      (timeout: Error | null, response: { ok?: boolean } | undefined) => {
        if (client?.socket !== socket || mission.value?.id !== current.id) return;
        if (timeout || !response?.ok) {
          connected.value = false;
          stopSharing();
          error.value = "دسترسی به اتاق زندهٔ مأموریت ممکن نیست؛ دوباره تلاش کنید.";
        } else { connected.value = true; error.value = null; }
      });
  }
  async function start(): Promise<void> {
    stop();
    const current = mission.value;
    const owner = userId.value;
    if (!current || !owner || !token.value) return;
    const gen = generation;
    clockTicker = setInterval(() => { now.value = currentTime(); }, 1000);
    clockTicker.unref?.();
    try {
      await ensureSession?.();
      if (gen !== generation || !token.value || mission.value?.id !== current.id || userId.value !== owner) return;
      const opener = runtime.openSocket ?? (async (bearer: string) => {
        const { createRealtimeClient } = await import("@/services/socket");
        return createRealtimeClient(bearer);
      });
      const opened = await opener(token.value);
      if (gen !== generation || mission.value?.id !== current.id || userId.value !== owner) {
        opened.close(); return;
      }
      client = opened;
      opened.socket.on("connect", subscribe);
      opened.socket.on("disconnect", () => { connected.value = false; stopSharing(); });
      opened.socket.on(MISSION_LOCATION_EVENT, handleEvent);
      opened.socket.on(MISSION_STATUS_UPDATED_EVENT, onMissionStatus);
      opened.socket.on(MISSION_CANCELLED_BY_REQUESTER_EVENT, (payload: unknown) => onCancellation(payload, "requester"));
      opened.socket.on(MISSION_CANCELLED_BY_RESCUER_EVENT, (payload: unknown) => onCancellation(payload, "rescuer"));
      opened.updateToken(token.value);
      opened.connect();
      if (opened.socket.connected) subscribe();
    } catch {
      if (gen === generation) error.value = "اتصال زندهٔ مأموریت برقرار نشد؛ دوباره تلاش کنید.";
    }
  }
  function publish(fix: { lat: number; lon: number; accuracy?: number }): void {
    const current = mission.value;
    const socket = client?.socket;
    const device = ownDeviceId(token.value);
    if (!sharing.value || !connected.value || !current || !socket?.connected || !device) return;
    if (current.requesterId !== userId.value && current.rescuerId !== userId.value &&
      !isAdmin(token.value)) return;
    const timestamp = currentTime();
    if (timestamp - lastPublished < 5000) return;
    lastPublished = timestamp;
    socket.timeout(5000).emit(MISSION_LOCATION_PUBLISH_EVENT, { missionId: current.id,
      location: { ...fix, timestamp: new Date(timestamp).toISOString(), priorityDeviceId: device } },
    (timeout: Error | null, response: { ok?: boolean; code?: string } | undefined) => {
      if (!sharing.value || mission.value?.id !== current.id) return;
      if (timeout || !response?.ok) {
        error.value = response?.code === "MISSION_UNAVAILABLE" ? "مأموریت دیگر فعال نیست؛ اشتراک متوقف شد." :
          "ارسال موقعیت ممکن نشد؛ وضعیت اتصال و دستگاه اولویت‌دار را بررسی کنید.";
        stopSharing();
      } else error.value = null;
    });
  }
  function startSharing(): void {
    if (sharing.value || !connected.value || !mission.value || !userId.value ||
      (mission.value.requesterId !== userId.value && mission.value.rescuerId !== userId.value &&
        !isAdmin(token.value))) return;
    sharing.value = true;
    error.value = null;
    try {
      stopWatch = (runtime.watchPosition ?? browserWatch)((fix) => {
        if (!sharing.value) return;
        publish(fix);
      }, (denied) => {
        error.value = denied ? "اجازهٔ موقعیت قطع شد؛ اشتراک متوقف شد." : "موقعیت تازه دریافت نشد.";
        if (denied) stopSharing();
      });
    } catch {
      stopSharing();
      error.value = "مکان‌یابی در این دستگاه در دسترس نیست.";
    }
  }
  watch(() => [mission.value?.id, userId.value] as const, () => { void start(); }, { immediate: true });
  watch(token, (next) => { if (next && client) client.updateToken(next); if (!next) stop(); });
  onScopeDispose(stop);
  return { locations, participantStatus, connected, sharing, error, now, start, stop,
    startSharing, stopSharing, handleEvent };
}
