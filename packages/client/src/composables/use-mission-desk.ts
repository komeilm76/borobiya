import { computed, ref, watch, type Ref } from "vue";
import type { CancellationReason, Mission } from "@shared/index";
import { ApiError } from "../api/http";
import { decodeAccessTokenClaims } from "./device-identity";
import { cancelRescuerMission, listRescuerCancellationReasons, listRescuerMissions } from "../api/mission";
import { sosApiErrorMessage } from "../sos/sos-form";

const ACTIVE = new Set<Mission["status"]>(["pending", "on_the_way", "arrived", "in_progress"]);
export function isActiveMission(status: Mission["status"]): boolean { return ACTIVE.has(status); }

/** Session-scoped mission panel: never carry a cancellation or response across a changed account. */
export function useMissionDesk(token: Ref<string | null>, userId: Ref<string | null>,
  ensureSession?: () => Promise<unknown>) {
  const missions = ref<Mission[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const cancellationOpen = ref(false);
  const reasonLoading = ref(false);
  const cancelling = ref(false);
  const cancellationError = ref<string | null>(null);
  const cancelledMissionId = ref<string | null>(null);
  const cancellationMissionId = ref<string | null>(null);
  const reasons = ref<CancellationReason[]>([]);
  const reasonId = ref("");
  const customReason = ref("");
  const blocked = ref(false);
  // List reads, reason reads and panel sessions have different lifetimes. Opening a
  // dialog must not invalidate a list read without clearing its loading indicator.
  let listGeneration = 0;
  let reasonGeneration = 0;
  let sessionGeneration = 0;
  // Treat bearer renewal in the same session as continuous, but discard private
  // state synchronously if the owner, session, or token availability changes.
  const sessionKey = computed(() => {
    const owner = userId.value;
    const bearer = token.value;
    if (!owner || !bearer) return null;
    const claims = decodeAccessTokenClaims(bearer);
    // JWT-shaped tokens must have a readable, matching owner and session
    // before they may fetch private rows; opaque bearers keep their caller's owner.
    if (bearer.includes(".") && (claims?.sub !== owner || typeof claims.sessionId !== "string")) return null;
    return JSON.stringify([owner, claims?.sessionId ?? null]);
  });
  watch(sessionKey, () => reset(), { flush: "sync" });
  const activeMission = computed(() => missions.value.find((item) => isActiveMission(item.status)) ?? null);
  const selectedReason = computed(() => reasons.value.find((item) => item.id === reasonId.value));
  // The confirmation belongs to the mission that was active when the dialog opened,
  // never a replacement that appears during a list refresh.
  const missionChanged = computed(() => cancellationOpen.value && cancellationMissionId.value !== activeMission.value?.id);
  const canCancel = computed(() => cancellationOpen.value && !missionChanged.value && !reasonLoading.value && !cancelling.value &&
    !blocked.value && !!activeMission.value && !!sessionKey.value && !!selectedReason.value &&
    (!selectedReason.value.requiresCustomText ||
      (customReason.value.trim().length >= 10 && customReason.value.trim().length <= 200)));

  async function load(): Promise<void> {
    const current = ++listGeneration;
    const owner = userId.value;
    if (!owner || !sessionKey.value) {
      missions.value = [];
      loading.value = false;
      error.value = null;
      return;
    }
    loading.value = true;
    error.value = null;
    try {
      await ensureSession?.();
      const bearer = token.value;
      if (!bearer || !sessionKey.value || userId.value !== owner || current !== listGeneration) return;
      const page = await listRescuerMissions(bearer);
      if (current === listGeneration && userId.value === owner) {
        missions.value = page.items;
        // A verified new active mission supersedes the prior cancellation banner.
        // Do not imply the new mission was cancelled, or clear it on a failed read.
        if (cancelledMissionId.value && page.items.some((item) => isActiveMission(item.status) && item.id !== cancelledMissionId.value)) {
          cancelledMissionId.value = null;
        }
      }
    } catch (cause) {
      if (current === listGeneration && userId.value === owner)
        error.value = sosApiErrorMessage(cause, "بارگذاری مأموریت‌ها ممکن نشد؛ دوباره تلاش کنید.");
    } finally {
      if (current === listGeneration) loading.value = false;
    }
  }

  async function showCancellation(): Promise<void> {
    const owner = userId.value;
    const bearer = token.value;
    if (!owner || !bearer || !activeMission.value || !sessionKey.value || cancelling.value) return;
    const current = ++reasonGeneration;
    cancellationMissionId.value = activeMission.value.id;
    cancellationOpen.value = true;
    reasonId.value = "";
    customReason.value = "";
    reasons.value = []; // A failed reload must expose Retry, not selectable cached reasons.
    cancellationError.value = null;
    blocked.value = false;
    reasonLoading.value = true;
    try {
      const result = await listRescuerCancellationReasons(bearer);
      if (current === reasonGeneration && cancellationOpen.value && userId.value === owner) reasons.value = result;
    } catch (cause) {
      if (current === reasonGeneration && cancellationOpen.value && userId.value === owner)
        cancellationError.value = sosApiErrorMessage(cause, "دریافت دلایل ممکن نشد؛ دوباره تلاش کنید.");
    } finally {
      if (current === reasonGeneration) reasonLoading.value = false;
    }
  }

  function dismissCancellation(): void {
    if (cancelling.value) return;
    ++reasonGeneration;
    cancellationOpen.value = false;
    cancellationMissionId.value = null;
    reasonLoading.value = false;
    cancellationError.value = null;
    reasons.value = [];
  }

  async function confirmCancellation(): Promise<void> {
    if (!canCancel.value) return;
    const mission = activeMission.value!;
    const reason = selectedReason.value!;
    const bearer = token.value!;
    const owner = userId.value;
    const session = sessionGeneration;
    cancelling.value = true;
    cancellationError.value = null;
    try {
      await cancelRescuerMission(bearer, mission.id, reason.id,
        reason.requiresCustomText ? customReason.value.trim() : undefined);
      if (session !== sessionGeneration || userId.value !== owner ||
          cancellationMissionId.value !== mission.id || activeMission.value?.id !== mission.id) return;
      // A pre-commit list can arrive after the mutation and resurrect the old
      // active status. Ignore it; a later explicit refresh reads the committed row.
      ++listGeneration;
      loading.value = false;
      error.value = null;
      missions.value = missions.value.map((item) => item.id === mission.id
        ? { ...item, status: "cancelled_by_rescuer", cancelledBy: "rescuer", cancellationReasonId: reason.id }
        : item);
      cancelledMissionId.value = mission.id;
      cancellationOpen.value = false;
      cancellationMissionId.value = null;
    } catch (cause) {
      if (session !== sessionGeneration || userId.value !== owner ||
          cancellationMissionId.value !== mission.id || activeMission.value?.id !== mission.id) return;
      blocked.value = cause instanceof ApiError && cause.status === 409;
      cancellationError.value = blocked.value
        ? "وضعیت مأموریت تغییر کرده است؛ فهرست را تازه کنید. هیچ لغوی ثبت نشد."
        : sosApiErrorMessage(cause, "ثبت لغو انجام نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.");
    } finally {
      if (session === sessionGeneration) cancelling.value = false;
    }
  }

  function reset(): void {
    ++sessionGeneration;
    ++listGeneration;
    ++reasonGeneration;
    missions.value = [];
    loading.value = false;
    error.value = null;
    cancelledMissionId.value = null;
    cancellationMissionId.value = null;
    cancellationOpen.value = false;
    reasonLoading.value = false;
    cancelling.value = false;
    cancellationError.value = null;
    reasons.value = [];
    reasonId.value = "";
    customReason.value = "";
    blocked.value = false;
  }

  return { missions, activeMission, loading, error, cancellationOpen, reasonLoading, cancelling,
    cancellationError, cancelledMissionId, missionChanged, reasons, reasonId, customReason, selectedReason,
    canCancel, load, showCancellation, dismissCancellation, confirmCancellation, reset };
}
