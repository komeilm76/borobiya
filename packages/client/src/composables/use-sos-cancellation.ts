import { computed, getCurrentScope, onScopeDispose, ref, watch, type Ref } from "vue";
import type { CancellationReason } from "@shared/index";
import { cancelSosRequest, listSosCancellationReasons } from "../api/sos";
import { sosApiErrorMessage } from "../sos/sos-form";
import { ApiError } from "../api/http";
import { decodeAccessTokenClaims } from "./device-identity";

/** The cancellation dialog never sends a request before the user has selected and confirmed a reason. */
export function useSosCancellation(token: Ref<string | null>, requestId: Ref<string | null>,
  userId: Ref<string | null>) {
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
  let openedRequestId: string | null = null;
  let openedSession: string | null = null;
  // A token renewal in the same session keeps the prompt; logout, account switch and
  // a different JWT session revoke consent before a new request can reuse it.
  const sessionKey = computed(() => {
    const owner = userId.value;
    const bearer = token.value;
    if (!owner || !bearer) return null;
    const claims = decodeAccessTokenClaims(bearer);
    if (bearer.includes(".") && (claims?.sub !== owner || typeof claims.sessionId !== "string")) return null;
    return JSON.stringify([owner, claims?.sessionId ?? null]);
  });
  const selected = computed(() => reasons.value.find((reason) => reason.id === reasonId.value));
  const canConfirm = computed(() => open.value && !!requestId.value && requestId.value === openedRequestId &&
    !!sessionKey.value && sessionKey.value === openedSession && !blocked.value && !loading.value && !submitting.value && !!selected.value &&
    (!selected.value.requiresCustomText || (customReason.value.trim().length >= 10 && customReason.value.trim().length <= 200)));

  async function show(): Promise<void> {
    if (!requestId.value || !token.value || !sessionKey.value || submitting.value || cancelled.value || blocked.value) return;
    const owner = userId.value;
    const current = ++generation;
    openedRequestId = requestId.value;
    openedSession = sessionKey.value;
    open.value = true;
    reasonId.value = "";
    customReason.value = "";
    // A reopened dialog must not offer an earlier reason list if this read fails;
    // the dialog's Retry action is shown only when the current list is empty.
    reasons.value = [];
    error.value = null;
    loading.value = true;
    try {
      const result = await listSosCancellationReasons(token.value);
      if (current !== generation || userId.value !== owner || !open.value) return;
      reasons.value = result;
    } catch (cause) {
      if (current === generation && userId.value === owner && open.value) error.value = sosApiErrorMessage(cause, "دریافت دلایل لغو انجام نشد. دوباره تلاش کنید.");
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  function dismiss(): void {
    if (submitting.value) return;
    ++generation;
    open.value = false;
    openedRequestId = null;
    openedSession = null;
    loading.value = false;
    error.value = null;
    reasons.value = [];
    reasonId.value = "";
    customReason.value = "";
  }

  async function confirm(): Promise<void> {
    if (!canConfirm.value) return;
    const id = requestId.value!;
    const currentToken = token.value!;
    const owner = userId.value!;
    const current = generation;
    const selectedReason = selected.value!;
    submitting.value = true;
    error.value = null;
    try {
      await cancelSosRequest(id, currentToken, selectedReason.id,
        selectedReason.requiresCustomText ? customReason.value.trim() : undefined);
      if (current === generation && requestId.value === id && userId.value === owner && token.value) {
        cancelled.value = true;
        open.value = false;
      }
    } catch (cause) {
      if (current === generation && requestId.value === id && userId.value === owner && token.value) {
        blocked.value = cause instanceof ApiError && cause.code === "SOS_ALREADY_IN_PROGRESS";
        error.value = blocked.value
          ? "وضعیت درخواست تغییر کرده است؛ لغوی ثبت نشد. درخواست را دوباره بررسی کنید."
          : sosApiErrorMessage(cause, "لغو درخواست انجام نشد؛ وضعیت درخواست را بررسی کنید و دوباره تلاش کنید.");
      }
    } finally {
      if (current === generation) submitting.value = false;
    }
  }

  function reset(): void {
    // Reset is a lifecycle boundary (including logout/unmount), not an ordinary
    // dismiss. Invalidate even an in-flight confirmation, and do not let its
    // finally block unlock a later confirmation in the reopened panel.
    ++generation;
    open.value = false;
    openedRequestId = null;
    openedSession = null;
    loading.value = false;
    submitting.value = false;
    error.value = null;
    cancelled.value = false;
    blocked.value = false;
    reasons.value = [];
    reasonId.value = "";
    customReason.value = "";
  }

  // Synchronous invalidation also catches A -> B -> A within a single Vue tick.
  watch([requestId, sessionKey], ([id, session], [previousId, previousSession]) => {
    if (id !== previousId || session !== previousSession) reset();
  }, { flush: "sync" });
  if (getCurrentScope()) onScopeDispose(reset);

  return { open, loading, submitting, reasons, reasonId, customReason, selected, error, cancelled, blocked,
    canConfirm, show, dismiss, confirm, reset };
}
