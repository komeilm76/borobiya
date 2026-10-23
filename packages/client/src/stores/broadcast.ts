import { computed, watch } from "vue";
import { defineStore } from "pinia";
import { describeBroadcastState } from "@/live/broadcast-status";
import { useLiveLocationBroadcast } from "@/composables/useLiveLocationBroadcast";
import { usePriorityDevice } from "@/composables/use-priority-device";
import { useAuthStore } from "./auth";

/**
 * Single app-scoped live broadcast controller (`T2.1.5` + `T2.3.6`).
 *
 * Kept in Pinia rather than inside a single route component so starting a broadcast on
 * `/_user/dashboard` keeps streaming smoothly when navigating to `/_user/map` or `/_user/devices`,
 * while logging out immediately halts hardware GPS and closes the socket.
 */
export const useBroadcastStore = defineStore("broadcast", () => {
  const auth = useAuthStore();
  const accessToken = computed(() => auth.accessToken);

  const live = useLiveLocationBroadcast({
    accessToken,
    ensureSession: () => auth.refreshSession()
  });
  const priority = usePriorityDevice({
    accessToken,
    ensureSession: () => auth.refreshSession()
  });

  const view = computed(() =>
    describeBroadcastState({
      status: live.status.value,
      lastErrorCode: live.lastErrorCode.value,
      peerCount: live.peerCount.value,
      isSupported: live.isSupported.value,
      priority: {
        hasMultipleDevices: priority.hasMultipleDevices.value,
        broadcastingCount: priority.broadcastingShares.value.length + priority.unassignedShares.value.length,
        ignoredCount: priority.ignoredShareIds.value.length,
        hasShares: priority.liveShares.value.length > 0
      }
    })
  );

  async function refreshPriority(): Promise<void> {
    await priority.refresh();
  }

  async function toggle(): Promise<void> {
    if (live.status.value === "connecting" || live.status.value === "broadcasting") {
      live.stop();
      return;
    }
    await priority.refresh();
    await live.start();
  }

  watch([accessToken, () => auth.mustCompleteSecurityQuestions], ([nextToken, onboardingIncomplete]) => {
    if (!nextToken || onboardingIncomplete) {
      live.stop();
      priority.clear();
      return;
    }
    void priority.refresh();
  });

  return {
    status: live.status,
    lastErrorCode: live.lastErrorCode,
    lastSentAt: live.lastSentAt,
    peerCount: live.peerCount,
    isSupported: live.isSupported,
    priority,
    view,
    start: live.start,
    stop: live.stop,
    toggle,
    refreshPriority
  };
});
