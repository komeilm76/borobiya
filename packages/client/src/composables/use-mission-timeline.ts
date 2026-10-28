import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import { missionStatusUpdatedEventSchema, requesterCancellationEventSchema,
  rescuerCancellationEventSchema, type MissionTimeline } from "@shared/index";
import { getMissionTimeline } from "@/api/mission";
import { followMissionTimelineEvents } from "@/api/mission-timeline-events";
import { MISSION_STATUS_UPDATED_EVENT, MISSION_CANCELLED_BY_REQUESTER_EVENT,
  MISSION_CANCELLED_BY_RESCUER_EVENT } from "@/services/socket-events";
import type { RealtimeClient } from "@/services/socket";
import { decodeAccessTokenClaims } from "./device-identity";

export interface MissionTimelineRuntime {
  read?: typeof getMissionTimeline;
  openSocket?: (token: string) => Promise<RealtimeClient>;
  followEvents?: typeof followMissionTimelineEvents;
}

/** The server's committed rows are authoritative; socket notices only trigger scoped re-reads. */
export function useMissionTimeline(missionId: Ref<string | null>, audience: "user" | "admin",
  token: Ref<string | null>, owner: Ref<string | null>, ensureSession?: () => Promise<unknown>,
  runtime: MissionTimelineRuntime = {}) {
  const entries = ref<MissionTimeline>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  let generation = 0;
  let readId = 0;
  let controller: AbortController | null = null;
  let client: RealtimeClient | null = null;
  let fallback: AbortController | null = null;
  let fallbackRetry: ReturnType<typeof setTimeout> | null = null;
  // A same-session bearer renewal keeps the current timeline; a different JWT
  // session (or mismatched subject while the profile catches up) must not reuse it.
  const sessionKey = computed(() => {
    const account = owner.value;
    const bearer = token.value;
    if (!account || !bearer) return null;
    const claims = decodeAccessTokenClaims(bearer);
    if (bearer.includes(".") && (claims?.sub !== account || typeof claims.sessionId !== "string")) return null;
    return JSON.stringify([account, claims?.sessionId ?? null]);
  });

  function stopFallback() {
    fallback?.abort(); fallback = null;
    if (fallbackRetry) clearTimeout(fallbackRetry);
    fallbackRetry = null;
  }
  function startFallback() {
    if (fallback || fallbackRetry || client?.socket.connected || !missionId.value || !sessionKey.value || !token.value) return;
    const gen = generation;
    const id = missionId.value;
    const account = owner.value;
    const controller = new AbortController();
    fallback = controller;
    void (async () => {
      try {
        await ensureSession?.();
        if (controller.signal.aborted || gen !== generation || missionId.value !== id || owner.value !== account ||
            !sessionKey.value || !token.value || client?.socket.connected) return;
        await (runtime.followEvents ?? followMissionTimelineEvents)(token.value, id, controller.signal, () => {
          if (!controller.signal.aborted && gen === generation && missionId.value === id && owner.value === account &&
              !client?.socket.connected) void load();
        });
      } catch {
        // The timeline stays readable through normal authenticated HTTP with an explicit retry.
      } finally {
        if (fallback === controller) {
          fallback = null;
          if (gen === generation && missionId.value === id && owner.value === account && sessionKey.value &&
              !client?.socket.connected) {
            fallbackRetry = setTimeout(() => { fallbackRetry = null; startFallback(); }, 5_000);
          }
        }
      }
    })();
  }

  function stop() {
    generation++;
    readId++;
    controller?.abort(); controller = null;
    stopFallback();
    client?.close(); client = null;
    entries.value = [];
    loading.value = false;
    error.value = null;
  }
  async function load() {
    const id = missionId.value;
    const account = owner.value;
    if (!id || !account || !sessionKey.value || !token.value) return;
    const gen = generation;
    const read = ++readId;
    controller?.abort();
    const pending = new AbortController();
    controller = pending;
    loading.value = true;
    error.value = null;
    try {
      await ensureSession?.();
      if (gen !== generation || read !== readId || missionId.value !== id || owner.value !== account ||
          !sessionKey.value || !token.value) return;
      const result = await (runtime.read ?? getMissionTimeline)(token.value, id, audience, pending.signal);
      if (gen === generation && read === readId && missionId.value === id && owner.value === account) {
        entries.value = result;
      }
    } catch {
      if (gen === generation && read === readId && !pending.signal.aborted)
        error.value = "گام‌های ثبت‌شده بارگذاری نشدند؛ دوباره تلاش کنید.";
    } finally {
      if (gen === generation && read === readId) { loading.value = false; controller = null; }
    }
  }
  async function start() {
    stop();
    const id = missionId.value;
    const account = owner.value;
    if (!id || !account || !sessionKey.value || !token.value) return;
    const gen = generation;
    void load();
    try {
      await ensureSession?.();
      if (gen !== generation || missionId.value !== id || owner.value !== account || !sessionKey.value || !token.value) return;
      const opener = runtime.openSocket ?? (async (accessToken: string) => {
        const { createRealtimeClient } = await import("@/services/socket");
        return createRealtimeClient(accessToken);
      });
      const opened = await opener(token.value);
      if (gen !== generation || missionId.value !== id || owner.value !== account) { opened.close(); return; }
      client = opened;
      const active = () => gen === generation && client === opened && missionId.value === id && owner.value === account;
      opened.socket.on("connect", () => { if (active()) { stopFallback(); void load(); } });
      opened.socket.on("disconnect", () => { if (active()) startFallback(); });
      opened.socket.on("connect_error", () => { if (active()) startFallback(); });
      opened.socket.on(MISSION_STATUS_UPDATED_EVENT, (value: unknown) => {
        if (active() && missionStatusUpdatedEventSchema.safeParse(value).data?.missionId === id) void load();
      });
      opened.socket.on(MISSION_CANCELLED_BY_REQUESTER_EVENT, (value: unknown) => {
        if (active() && requesterCancellationEventSchema.safeParse(value).data?.missionId === id) void load();
      });
      opened.socket.on(MISSION_CANCELLED_BY_RESCUER_EVENT, (value: unknown) => {
        if (active() && rescuerCancellationEventSchema.safeParse(value).data?.missionId === id) void load();
      });
      opened.updateToken(token.value);
      opened.connect();
    } catch {
      startFallback();
    }
  }
  // A new mission/account/JWT session is a synchronous privacy boundary, even
  // when auth swaps bearers without ever rendering a null token. A renewal of
  // the *same* session only reauthenticates the existing transport.
  let watchedMission: string | null = null;
  let watchedSession: string | null = null;
  watch([missionId, sessionKey, token], () => {
    const id = missionId.value;
    const session = sessionKey.value;
    const bearer = token.value;
    if (id !== watchedMission || session !== watchedSession) {
      watchedMission = id;
      watchedSession = session;
      void start();
      return;
    }
    if (!session || !bearer) return;
    if (!client) {
      if (fallback) { stopFallback(); startFallback(); }
      else void start();
    } else {
      client.updateToken(bearer);
      if (fallback || fallbackRetry) { stopFallback(); startFallback(); }
    }
  }, { immediate: true, flush: "sync" });
  onScopeDispose(stop);
  return { entries, loading, error, load, stop };
}
