import { computed, ref, type Ref } from "vue";
import type { CancellationReason } from "@shared/index";
import { cancelSosRequest, listSosCancellationReasons } from "../api/sos";
import { sosApiErrorMessage } from "../sos/sos-form";
import { ApiError } from "../api/http";

/** The cancellation dialog never sends a request before the user has selected and confirmed a reason. */
export function useSosCancellation(token: Ref<string | null>, requestId: Ref<string | null>) {
  const open = ref(false);
  const loading = ref(false);
  const submitting = ref(false);
  const reasons = ref<CancellationReason[]>([]);
  const reasonId = ref("");
  const customReason = ref("");
  const error = ref<string | null>(null);
  const cancelled = ref(false);
  const blocked = ref(false);
  let generation = 0;
  const selected = computed(() => reasons.value.find((reason) => reason.id === reasonId.value));
  const canConfirm = computed(() => !!requestId.value && !!token.value && !blocked.value && !loading.value && !submitting.value && !!selected.value &&
    (!selected.value.requiresCustomText || (customReason.value.trim().length >= 10 && customReason.value.trim().length <= 200)));

  async function show(): Promise<void> {
    if (!requestId.value || !token.value || submitting.value || cancelled.value || blocked.value) return;
    const current = ++generation;
    open.value = true;
    reasonId.value = "";
    customReason.value = "";
    error.value = null;
    loading.value = true;
    try {
      const result = await listSosCancellationReasons(token.value);
      if (current !== generation || !open.value) return;
      reasons.value = result;
    } catch (cause) {
      if (current === generation && open.value) error.value = sosApiErrorMessage(cause, "دریافت دلایل لغو انجام نشد. دوباره تلاش کنید.");
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  function dismiss(): void {
    if (submitting.value) return;
    ++generation;
    open.value = false;
    loading.value = false;
    error.value = null;
  }

  async function confirm(): Promise<void> {
    if (!canConfirm.value) return;
    const id = requestId.value!;
    const currentToken = token.value!;
    const selectedReason = selected.value!;
    submitting.value = true;
    error.value = null;
    try {
      await cancelSosRequest(id, currentToken, selectedReason.id,
        selectedReason.requiresCustomText ? customReason.value.trim() : undefined);
      if (requestId.value === id && token.value === currentToken) {
        cancelled.value = true;
        open.value = false;
      }
    } catch (cause) {
      if (requestId.value === id && token.value === currentToken) {
        blocked.value = cause instanceof ApiError && cause.code === "SOS_ALREADY_IN_PROGRESS";
        error.value = blocked.value
          ? "وضعیت درخواست تغییر کرده است؛ لغوی ثبت نشد. درخواست را دوباره بررسی کنید."
          : sosApiErrorMessage(cause, "لغو درخواست انجام نشد؛ وضعیت درخواست را بررسی کنید و دوباره تلاش کنید.");
      }
    } finally {
      submitting.value = false;
    }
  }

  function reset(): void {
    dismiss();
    cancelled.value = false;
    blocked.value = false;
    reasons.value = [];
    reasonId.value = "";
    customReason.value = "";
  }

  return { open, loading, submitting, reasons, reasonId, customReason, selected, error, cancelled, blocked,
    canConfirm, show, dismiss, confirm, reset };
}
