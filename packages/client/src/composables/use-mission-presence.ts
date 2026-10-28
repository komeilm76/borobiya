import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import type { MissionPresence } from "@shared/index";
import { getMissionPresence } from "@/api/mission";
import { missionPresenceBadge } from "@/mission/presence";
import { decodeAccessTokenClaims } from "./device-identity";

/** Periodic scoped status reads. A stale/failed read cannot label somebody offline or cancel a mission. */
export function useMissionPresence(missionId: Ref<string | null>, token: Ref<string | null>,
  userId: Ref<string | null>, read = getMissionPresence) {
  const snapshot = ref<MissionPresence | null>(null);
  const now = ref(Date.now());
  let epoch = 0;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  // Presence is private to this mission and account. A renewed bearer for the
  // same JWT session is not a new panel (nor a reason to erase a known status).
  const identity = computed(() => {
    const id = missionId.value;
    const bearer = token.value;
    const owner = userId.value;
    if (!id || !bearer || !owner) return null;
    const claims = decodeAccessTokenClaims(bearer);
    if (bearer.includes(".") && (claims?.sub !== owner || typeof claims.sessionId !== "string")) return null;
    return JSON.stringify([id, owner, claims?.sessionId ?? null]);
  });
  async function refresh() {
    const id = missionId.value;
    const bearer = token.value;
    const currentIdentity = identity.value;
    if (!id || !bearer || !currentIdentity) return;
    controller?.abort();
    const abort = new AbortController();
    controller = abort;
    const current = ++epoch;
    try {
      const result = await read(bearer, id, abort.signal);
      if (current !== epoch || abort.signal.aborted || identity.value !== currentIdentity) return;
      snapshot.value = result.missionId === id ? result : null;
    } catch {
      if (current !== epoch || abort.signal.aborted) return;
      if (identity.value === currentIdentity && token.value && token.value !== bearer) {
        // A credential rejected after same-session rotation is not evidence that
        // the participant disconnected. Retry with the current bearer.
        void refresh();
        return;
      }
      snapshot.value = null;
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
  watch(identity, (next) => {
    stop();
    if (!next) return;
    void refresh();
    timer = setInterval(() => { now.value = Date.now(); void refresh(); }, 30_000);
    timer.unref?.();
  }, { immediate: true, flush: "sync" });
  onScopeDispose(stop);
  return { snapshot, now, refresh, stop,
    requester: computed(() => missionPresenceBadge(snapshot.value?.requester ?? null, now.value)),
    rescuer: computed(() => missionPresenceBadge(snapshot.value?.rescuer ?? null, now.value)) };
}
