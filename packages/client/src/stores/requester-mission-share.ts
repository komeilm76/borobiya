import { computed } from "vue";
import { defineStore } from "pinia";
import { useRequesterMissionAutoShare } from "@/composables/use-requester-mission-auto-share";
import { useAuthStore } from "./auth";

/** App-owned private GPS publishers for every confirmed active requester mission. */
export const useRequesterMissionShareStore = defineStore("requester-mission-share", () => {
  const auth = useAuthStore();
  const owner = computed(() => auth.isAuthenticated && auth.user?.role === "user" &&
    !auth.mustCompleteSecurityQuestions ? auth.user.id : null);
  const manager = useRequesterMissionAutoShare(computed(() => auth.accessToken), owner,
    () => auth.ensureSession());
  return {
    missions: manager.missions,
    statusError: manager.error,
    refreshing: manager.refreshing,
    verified: manager.verified,
    isSharingMission: manager.isSharingMission,
    gpsError: manager.gpsError,
    refresh: manager.refresh,
    retry: manager.retry
  };
});
