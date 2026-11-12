import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import type { Mission } from "@shared/index";
import { listRescuerMissions } from "@/api/mission";
import { accountSessionKey } from "./device-identity";
import { isActiveMission } from "./use-mission-desk";
import { useMissionLiveLocations, type MissionLiveRuntime, type LiveMissionIdentity } from "./use-mission-live-locations";

const POLL_MS = 30_000;
export interface RescuerAutoShareRuntime {
  list?: typeof listRescuerMissions;
  live?: MissionLiveRuntime;
}

/** App-scoped: a confirmed active assignment, not the currently displayed page, owns the GPS publisher. */
export function useRescuerMissionAutoShare(
  token: Ref<string | null>, owner: Ref<string | null>, ensureSession?: () => Promise<unknown>,
  runtime: RescuerAutoShareRuntime = {}
) {
  const session = computed(() => accountSessionKey(owner.value, token.value));
  const mission = ref<LiveMissionIdentity | null>(null);
  const error = ref<string | null>(null);
  const refreshing = ref(false);
  const hadActiveMission = ref(false);
  const live = useMissionLiveLocations(mission, token, owner, ensureSession, runtime.live, true);
  let generation = 0;

  async function refresh(): Promise<void> {
    const key = session.value;
    const userId = owner.value;
    if (!key || !userId) return;
    const current = ++generation;
    refreshing.value = true;
    try {
      await ensureSession?.();
      if (current !== generation || session.value !== key || !token.value) return;
      // The server orders active missions first, even if there are many completed rows.
      const page = await (runtime.list ?? listRescuerMissions)(token.value);
      if (current !== generation || session.value !== key) return;
      const active = page.items.find((item: Mission) => item.rescuerId === userId && isActiveMission(item.status));
      mission.value = active ? { id: active.id, rescuerId: active.rescuerId, requesterId: active.requesterId } : null;
      hadActiveMission.value = Boolean(active);
      error.value = null;
    } catch {
      if (current === generation && session.value === key) {
        // A failed status read is not proof the assignment is still active: fail closed.
        mission.value = null;
        error.value = "وضعیت مأموریت تأیید نشد؛ اشتراک موقعیت متوقف شد. دوباره بررسی کنید.";
      }
    } finally {
      if (current === generation) refreshing.value = false;
    }
  }
  function retry(): void {
    if (!session.value) return;
    if (mission.value && live.connected.value && !live.recoveryPending.value) live.startSharing();
    else if (mission.value) void live.start();
    else void refresh();
  }
  watch(session, (next) => {
    ++generation;
    mission.value = null; // Revoke old GPS/room synchronously, before any new account can render.
    refreshing.value = false;
    hadActiveMission.value = false;
    error.value = null;
    if (next) void refresh();
  }, { immediate: true, flush: "sync" });
  watch(live.endedMissionId, (id) => {
    if (!id || mission.value?.id !== id) return;
    ++generation;
    mission.value = null;
    void refresh(); // Verify a terminal socket/ack against the authoritative mission list.
  }, { flush: "sync" });
  const timer = setInterval(() => { if (session.value) void refresh(); }, POLL_MS);
  timer.unref?.();
  onScopeDispose(() => { clearInterval(timer); ++generation; mission.value = null; });
  return { mission, live, refreshing, error, hadActiveMission, refresh, retry };
}
