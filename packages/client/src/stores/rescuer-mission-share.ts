import { computed } from "vue";
import { defineStore } from "pinia";
import { useRescuerMissionAutoShare } from "@/composables/use-rescuer-mission-auto-share";
import { useAuthStore } from "./auth";

/** One automatic mission-room GPS publisher, independent of page navigation. */
export const useRescuerMissionShareStore = defineStore("rescuer-mission-share", () => {
  const auth = useAuthStore();
  const owner = computed(() => auth.isAuthenticated && auth.user?.role === "user" &&
    !auth.mustCompleteSecurityQuestions ? auth.user.id : null);
  const manager = useRescuerMissionAutoShare(computed(() => auth.accessToken), owner,
    () => auth.ensureSession());
  return {
    mission: manager.mission,
    sharing: manager.live.sharing,
    connected: manager.live.connected,
    recoveryPending: manager.live.recoveryPending,
    gpsError: manager.live.error,
    statusError: manager.error,
    refreshing: manager.refreshing,
    hadActiveMission: manager.hadActiveMission,
    refresh: manager.refresh,
    retry: manager.retry
  };
});
