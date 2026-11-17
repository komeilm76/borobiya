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
  let currentId: string | null = null;
  let currentBearer: string | null = null;

  function clear(): void {
    generation++;
    currentId = null;
    currentBearer = null;
    requestMissions.value = [];
    timelineMissionId.value = null;
    missionLoading.value = false;
    missionLoaded.value = false;
    missionError.value = null;
  }

  async function loadActiveMissions(): Promise<void> {
    const id = requestId.value;
    const bearer = token.value;
    const sameScope = id !== null && bearer !== null && id === currentId && bearer === currentBearer;
    const current = ++generation; // Discard any late reply from a previous read or account.
    if (!sameScope) {
      requestMissions.value = [];
      timelineMissionId.value = null;
    }
    currentId = id;
    currentBearer = bearer;
    missionLoaded.value = false;
    missionError.value = null;
    if (!id || !bearer) { missionLoading.value = false; return; }
    missionLoading.value = true;
    try {
      const missions = await read(bearer, id, true);
      if (current !== generation || requestId.value !== id || token.value !== bearer) return;
      requestMissions.value = missions;
      // Refreshing the same SOS must not jump away from the operator's chosen mission.
      timelineMissionId.value = missions.some((mission) => mission.id === timelineMissionId.value)
        ? timelineMissionId.value : missions[0]?.id ?? null;
      missionLoaded.value = true;
    } catch {
      if (current === generation && requestId.value === id && token.value === bearer)
        missionError.value = "سابقهٔ مأموریت‌ها بارگذاری نشد؛ داده‌های قبلی ممکن است قدیمی باشند.";
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
