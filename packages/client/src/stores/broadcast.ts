import { computed, ref, watch } from "vue";
import { defineStore } from "pinia";
import { describeBroadcastState } from "@/live/broadcast-status";
import { useLiveLocationBroadcast } from "@/composables/useLiveLocationBroadcast";
import { decodeAccessTokenClaims } from "@/composables/device-identity";
import { usePriorityDevice } from "@/composables/use-priority-device";
import { useAuthStore } from "./auth";

/**
 * Single app-scoped live broadcast controller (`T2.1.5` + `T2.3.6`).
 *
 * Kept in Pinia rather than inside a single route component so starting a broadcast on
 * The map keeps streaming smoothly when navigating to `/_user/location-shares` or `/_user/devices`,
 * while logging out immediately halts hardware GPS and closes the socket.
 */
export const useBroadcastStore = defineStore("broadcast", () => {
  const auth = useAuthStore();
  const accessToken = computed(() => auth.accessToken);

  const live = useLiveLocationBroadcast({
    accessToken,
    ownerId: computed(() => auth.user?.id ?? null),
    ensureSession: () => auth.refreshSession()
  });
  const priority = usePriorityDevice({
    accessToken,
    ownerId: computed(() => auth.user?.id ?? null),
    ensureSession: () => auth.refreshSession()
  });

  // The Start tap first awaits a priority snapshot. Treat that interval as connecting so
  // the same button offers Stop, and fence it before the GPS composable can be started.
  const waitingForPriority = ref(false);
  let startAttempt = 0;
  // The confirmed mission and active guidance may overlap during handoff.
  // A release must not stop a manually started broadcast or the other activity.
  type AutomaticReason = "mission" | "navigation";
  const automaticReasons = ref<Set<AutomaticReason>>(new Set());
  const automaticActive = computed(() => automaticReasons.value.size > 0);
  let automaticOwner = false;
  const status = computed(() => waitingForPriority.value ? "connecting" : live.status.value);
  const view = computed(() =>
    describeBroadcastState({
      status: status.value,
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

  function stop(): void {
    ++startAttempt;
    waitingForPriority.value = false;
    live.stop();
  }

  /** Activity owns only a broadcast it started; a prior manual broadcast survives its end. */
  function setAutomatic(reason: AutomaticReason, active: boolean): void {
    if (automaticReasons.value.has(reason) === active) return;
    const next = new Set(automaticReasons.value);
    if (active) next.add(reason);
    else next.delete(reason);
    automaticReasons.value = next;
    if (active && next.size === 1 && !waitingForPriority.value &&
      live.status.value !== "connecting" && live.status.value !== "broadcasting") {
      automaticOwner = true;
      void start().catch(() => { /* The broadcast status is reported by the live controller. */ });
    } else if (!active && next.size === 0 && automaticOwner) {
      automaticOwner = false;
      stop(); // Also fences an outstanding priority read before GPS can wake.
    }
  }

  async function retryAutomatic(): Promise<void> {
    if (!automaticActive.value || waitingForPriority.value ||
      live.status.value === "connecting" || live.status.value === "broadcasting") return;
    automaticOwner = true;
    await start();
  }

  async function start(): Promise<void> {
    if (waitingForPriority.value || live.status.value === "connecting" || live.status.value === "broadcasting") return;
    const owner = auth.user?.id;
    const session = decodeAccessTokenClaims(auth.accessToken)?.sessionId;
    if (!owner || !session || auth.mustCompleteSecurityQuestions) return;
    const attempt = ++startAttempt;
    waitingForPriority.value = true;
    try {
      await priority.refresh();
      if (attempt !== startAttempt) return;
      const current = decodeAccessTokenClaims(auth.accessToken);
      // Refreshing the access token for this same session is fine. A stopped tap must
      // never wake GPS after the priority read returns, even if auth has not changed.
      if (auth.user?.id !== owner || current?.sub !== owner || current.sessionId !== session ||
        auth.mustCompleteSecurityQuestions) return;
      await live.start();
    } finally {
      if (attempt === startAttempt) waitingForPriority.value = false;
    }
  }

  async function toggle(): Promise<void> {
    if (automaticActive.value) return; // Activity controls its own lifetime, including the priority read.
    if (waitingForPriority.value || live.status.value === "connecting" || live.status.value === "broadcasting") {
      stop();
      return;
    }
    await start();
  }

  function sessionKey(token: string | null, owner: string | null): string | null {
    const claims = decodeAccessTokenClaims(token);
    return owner && claims?.sub === owner && typeof claims.sessionId === "string"
      ? JSON.stringify([owner, claims.sessionId]) : null;
  }

  watch([accessToken, () => auth.user?.id ?? null, () => auth.mustCompleteSecurityQuestions],
    ([nextToken, owner, onboardingIncomplete], [previousToken, previousOwner]) => {
      const next = sessionKey(nextToken, owner);
      const previous = sessionKey(previousToken, previousOwner);
      if (!next || onboardingIncomplete || (previous !== null && next !== previous)) {
        // A→null→A in one tick must cancel a pending tap, not resurrect its consent.
        stop();
        automaticOwner = false;
        automaticReasons.value = new Set();
        priority.clear();
        if (next && !onboardingIncomplete) void priority.refresh();
        return;
      }
      // A same-session renewal during Start must not supersede its awaited snapshot;
      // the read already handles 401 recovery and the server validates the eventual write.
      if (waitingForPriority.value && next === previous) return;
      void priority.refresh();
    }, { flush: "sync" });

  return {
    status,
    lastErrorCode: live.lastErrorCode,
    lastSentAt: live.lastSentAt,
    peerCount: live.peerCount,
    isSupported: live.isSupported,
    priority,
    view,
    automaticActive,
    setAutomatic,
    retryAutomatic,
    start,
    stop,
    toggle,
    refreshPriority
  };
});
