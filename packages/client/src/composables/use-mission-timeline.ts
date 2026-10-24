import { onScopeDispose, ref, watch, type Ref } from "vue";
import { missionStatusUpdatedEventSchema, requesterCancellationEventSchema,
  rescuerCancellationEventSchema, type MissionTimeline } from "@shared/index";
import { getMissionTimeline } from "@/api/mission";
import { MISSION_STATUS_UPDATED_EVENT, MISSION_CANCELLED_BY_REQUESTER_EVENT,
  MISSION_CANCELLED_BY_RESCUER_EVENT } from "@/services/socket-events";
import type { RealtimeClient } from "@/services/socket";

export interface MissionTimelineRuntime {
  read?: typeof getMissionTimeline;
  openSocket?: (token: string) => Promise<RealtimeClient>;
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

  function stop() {
    generation++;
    readId++;
    controller?.abort(); controller = null;
    client?.close(); client = null;
    entries.value = [];
    loading.value = false;
    error.value = null;
  }
  async function load() {
    const id = missionId.value;
    const account = owner.value;
    if (!id || !account || !token.value) return;
    const gen = generation;
    const read = ++readId;
    controller?.abort();
    const pending = new AbortController();
    controller = pending;
    loading.value = true;
    error.value = null;
    try {
      await ensureSession?.();
      if (gen !== generation || read !== readId || missionId.value !== id || owner.value !== account || !token.value) return;
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
    if (!id || !account || !token.value) return;
    const gen = generation;
    void load();
    try {
      await ensureSession?.();
      if (gen !== generation || missionId.value !== id || owner.value !== account || !token.value) return;
      const opener = runtime.openSocket ?? (async (accessToken: string) => {
        const { createRealtimeClient } = await import("@/services/socket");
        return createRealtimeClient(accessToken);
      });
      const opened = await opener(token.value);
      if (gen !== generation || missionId.value !== id || owner.value !== account) { opened.close(); return; }
      client = opened;
      const active = () => gen === generation && client === opened && missionId.value === id && owner.value === account;
      opened.socket.on("connect", () => { if (active()) void load(); });
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
      // HTTP history remains usable, including the explicit retry button, without a socket.
    }
  }
  watch([missionId, owner], () => { void start(); }, { immediate: true });
  watch(token, (next) => {
    if (!next) stop();
    else if (!client) void start();
    else client.updateToken(next);
  });
  onScopeDispose(stop);
  return { entries, loading, error, load, stop };
}
