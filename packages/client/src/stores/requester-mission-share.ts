import { computed } from "vue";
import { defineStore } from "pinia";
import { useRequesterMissionAutoShare } from "@/composables/use-requester-mission-auto-share";
import { useAuthStore } from "./auth";

/** One automatic mission-room GPS publisher, independent of page navigation. */
export const useRequesterMissionShareStore = defineStore("requester-mission-share", () => {
  const auth = useAuthStore();
  const owner = computed(() => auth.isAuthenticated && auth.user?.role === "user" &&
    !auth.mustCompleteSecurityQuestions ? auth.user.id : null);
  const manager = useRequesterMissionAutoShare(computed(() => auth.accessToken), owner,
    () => auth.ensureSession());
  return {
    mission: manager.mission,
    sharing: manager.live.sharing,
    connected: manager.live.connected,
    recoveryPending: manager.live.recoveryPending,
    gpsError: manager.live.error,
    statusError: manager.error,
    refreshing: manager.refreshing,
    verified: manager.verified,
    hadActiveMission: manager.hadActiveMission,
    refresh: manager.refresh,
    retry: manager.retry
  };
});
