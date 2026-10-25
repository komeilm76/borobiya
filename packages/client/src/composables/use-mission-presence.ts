import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import type { MissionPresence } from "@shared/index";
import { getMissionPresence } from "@/api/mission";
import { missionPresenceBadge } from "@/mission/presence";

/** Periodic scoped status reads. A stale/failed read cannot label somebody offline or cancel a mission. */
export function useMissionPresence(missionId: Ref<string | null>, token: Ref<string | null>,
  userId: Ref<string | null>, read = getMissionPresence) {
  const snapshot = ref<MissionPresence | null>(null);
  const now = ref(Date.now());
  let epoch = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  async function refresh() {
    const id = missionId.value;
    const bearer = token.value;
    const owner = userId.value;
    if (!id || !bearer || !owner) return;
    controller?.abort();
    const abort = new AbortController();
    controller = abort;
    const current = ++epoch;
    try {
      const result = await read(bearer, id, abort.signal);
      if (current !== epoch || abort.signal.aborted || missionId.value !== id ||
        userId.value !== owner || token.value !== bearer) return;
      snapshot.value = result.missionId === id ? result : null;
    } catch {
      if (current === epoch && !abort.signal.aborted) snapshot.value = null;
    }
  }
  function stop() {
    epoch++;
    controller?.abort();
    controller = null;
    if (timer) clearInterval(timer);
    timer = null;
    snapshot.value = null;
  }
  watch(() => [missionId.value, token.value, userId.value] as const, () => {
    stop();
    if (!missionId.value || !token.value || !userId.value) return;
    void refresh();
    timer = setInterval(() => { now.value = Date.now(); void refresh(); }, 30_000);
    timer.unref?.();
  }, { immediate: true });
  onScopeDispose(stop);
  return { snapshot, now, refresh, stop,
    requester: computed(() => missionPresenceBadge(snapshot.value?.requester ?? null, now.value)),
    rescuer: computed(() => missionPresenceBadge(snapshot.value?.rescuer ?? null, now.value)) };
}
