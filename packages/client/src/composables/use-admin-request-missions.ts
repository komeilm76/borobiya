import { computed, onScopeDispose, ref, watch, type Ref } from "vue";
import type { Mission, SosRequestStatus } from "@shared/index";
import { listActiveSosMissions } from "@/api/mission";

/** The selected admin SOS's committed mission list; an empty result needs a successful read. */
export function useAdminRequestMissions(
  requestId: Ref<string | null>, requestStatus: Ref<SosRequestStatus | null>,
  token: Ref<string | null>, read: typeof listActiveSosMissions = listActiveSosMissions
) {
  const requestMissions = ref<Mission[]>([]);
  const timelineMissionId = ref<string | null>(null);
  const missionLoading = ref(false);
  const missionLoaded = ref(false);
  const missionError = ref<string | null>(null);
  const activeMissions = computed(() => requestMissions.value.filter((mission) =>
    ["pending", "on_the_way", "arrived", "in_progress"].includes(mission.status)));
  const selectedTimelineMission = computed(() =>
    requestMissions.value.find((mission) => mission.id === timelineMissionId.value) ?? null);
  let generation = 0;

  function clear(): void {
    generation++;
    requestMissions.value = [];
    timelineMissionId.value = null;
    missionLoading.value = false;
    missionLoaded.value = false;
    missionError.value = null;
  }

  async function loadActiveMissions(): Promise<void> {
    clear(); // A previous selection's private rows and any pending reply are invalid now.
    const id = requestId.value;
    const bearer = token.value;
    const current = generation;
    if (!id || !bearer) return;
    missionLoading.value = true;
    try {
      const missions = await read(bearer, id, true);
      if (current !== generation || requestId.value !== id || token.value !== bearer) return;
      requestMissions.value = missions;
      timelineMissionId.value = missions[0]?.id ?? null;
      missionLoaded.value = true;
    } catch {
      if (current === generation && requestId.value === id && token.value === bearer)
        missionError.value = "سابقهٔ مأموریت‌ها بارگذاری نشد.";
    } finally {
      if (current === generation) missionLoading.value = false;
    }
  }

  watch([requestId, requestStatus, token], () => { void loadActiveMissions(); },
    { immediate: true, flush: "sync" });
  onScopeDispose(clear);
  return { requestMissions, activeMissions, timelineMissionId, selectedTimelineMission,
    missionLoading, missionLoaded, missionError, loadActiveMissions };
}
