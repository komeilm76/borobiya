import { computed, ref, type Ref } from "vue";
import type { CancellationReason, Mission } from "@shared/index";
import { ApiError } from "../api/http";
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
  const reasons = ref<CancellationReason[]>([]);
  const reasonId = ref("");
  const customReason = ref("");
  const blocked = ref(false);
  let generation = 0;
  const activeMission = computed(() => missions.value.find((item) => isActiveMission(item.status)) ?? null);
  const selectedReason = computed(() => reasons.value.find((item) => item.id === reasonId.value));
  const canCancel = computed(() => cancellationOpen.value && !reasonLoading.value && !cancelling.value &&
    !blocked.value && !!activeMission.value && !!token.value && !!selectedReason.value &&
    (!selectedReason.value.requiresCustomText ||
      (customReason.value.trim().length >= 10 && customReason.value.trim().length <= 200)));

  async function load(): Promise<void> {
    const current = ++generation;
    const owner = userId.value;
    if (!owner || !token.value) { missions.value = []; return; }
    loading.value = true;
    error.value = null;
    try {
      await ensureSession?.();
      const bearer = token.value;
      if (!bearer || userId.value !== owner || current !== generation) return;
      const page = await listRescuerMissions(bearer);
      if (current === generation && userId.value === owner) missions.value = page.items;
    } catch (cause) {
      if (current === generation && userId.value === owner)
        error.value = sosApiErrorMessage(cause, "بارگذاری مأموریت‌ها ممکن نشد؛ دوباره تلاش کنید.");
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  async function showCancellation(): Promise<void> {
    if (!activeMission.value || !token.value || cancelling.value) return;
    const current = ++generation;
    const owner = userId.value;
    cancellationOpen.value = true;
    reasonId.value = "";
    customReason.value = "";
    cancellationError.value = null;
    blocked.value = false;
    reasonLoading.value = true;
    try {
      const result = await listRescuerCancellationReasons(token.value);
      if (current === generation && cancellationOpen.value && userId.value === owner) reasons.value = result;
    } catch (cause) {
      if (current === generation && cancellationOpen.value && userId.value === owner)
        cancellationError.value = sosApiErrorMessage(cause, "دریافت دلایل ممکن نشد؛ دوباره تلاش کنید.");
    } finally {
      if (current === generation) reasonLoading.value = false;
    }
  }

  function dismissCancellation(): void {
    if (cancelling.value) return;
    ++generation;
    cancellationOpen.value = false;
    reasonLoading.value = false;
    cancellationError.value = null;
  }

  async function confirmCancellation(): Promise<void> {
    if (!canCancel.value) return;
    const mission = activeMission.value!;
    const reason = selectedReason.value!;
    const bearer = token.value!;
    const owner = userId.value;
    cancelling.value = true;
    cancellationError.value = null;
    try {
      await cancelRescuerMission(bearer, mission.id, reason.id,
        reason.requiresCustomText ? customReason.value.trim() : undefined);
      if (userId.value !== owner) return;
      missions.value = missions.value.map((item) => item.id === mission.id
        ? { ...item, status: "cancelled_by_rescuer", cancelledBy: "rescuer", cancellationReasonId: reason.id }
        : item);
      cancelledMissionId.value = mission.id;
      cancellationOpen.value = false;
    } catch (cause) {
      if (userId.value !== owner) return;
      blocked.value = cause instanceof ApiError && cause.status === 409;
      cancellationError.value = blocked.value
        ? "وضعیت مأموریت تغییر کرده است؛ فهرست را تازه کنید. هیچ لغوی ثبت نشد."
        : sosApiErrorMessage(cause, "ثبت لغو انجام نشد؛ اتصال را بررسی کنید و دوباره تلاش کنید.");
    } finally {
      cancelling.value = false;
    }
  }

  function reset(): void {
    ++generation;
    missions.value = [];
    loading.value = false;
    error.value = null;
    cancelledMissionId.value = null;
    cancellationOpen.value = false;
    cancellationError.value = null;
    reasons.value = [];
    reasonId.value = "";
    customReason.value = "";
    blocked.value = false;
  }

  return { missions, activeMission, loading, error, cancellationOpen, reasonLoading, cancelling,
    cancellationError, cancelledMissionId, reasons, reasonId, customReason, selectedReason,
    canCancel, load, showCancellation, dismissCancellation, confirmCancellation, reset };
}
