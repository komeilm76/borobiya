import { computed, ref, watch, type Ref } from "vue";
import { idSchema, type SosRequest } from "@shared/index";
import { ApiError } from "../api/http";
import { getRequesterSosRequest, listRequesterSosHistory } from "../api/sos-history";
import { sosApiErrorMessage } from "../sos/sos-form";
import { useSosCancellation } from "./use-sos-cancellation";

const CANCELLABLE = new Set<SosRequest["status"]>(["pending", "dispatched", "accepted"]);

/** Requester-only list, deep-linked detail, and a reason-gated cancellation across reloads. */
export function useSosHistory(token: Ref<string | null>, userId: Ref<string | null>,
  ensureSession?: () => Promise<unknown>) {
  const items = ref<SosRequest[]>([]);
  const selected = ref<SosRequest | null>(null);
  const page = ref(1);
  const total = ref(0);
  const totalPages = ref(0);
  const loading = ref(false);
  const error = ref<string | null>(null);
  const listLoaded = ref(false);
  const listVerified = computed(() => listLoaded.value && !loading.value && !error.value);
  const linkError = ref<string | null>(null);
  const linkRetryable = ref(false);
  let retryId: string | null = null;
  let generation = 0;
  const cancellation = useSosCancellation(token, computed(() => selected.value?.id ?? null), userId);
  const canCancelSelected = computed(() => !!selected.value && CANCELLABLE.has(selected.value.status) && !cancellation.cancelled.value);

  async function load(nextPage = page.value, deepLink?: string): Promise<void> {
    const current = ++generation;
    const owner = userId.value;
    if (!owner || !token.value) { reset(); return; }
    loading.value = true;
    error.value = null;
    linkError.value = null;
    linkRetryable.value = false;
    retryId = null;
    try {
      await ensureSession?.();
      const bearer = token.value;
      if (!bearer || userId.value !== owner || current !== generation) return;
      const result = await listRequesterSosHistory(bearer, nextPage);
      if (userId.value !== owner || current !== generation) return;
      const requested = deepLink ?? selected.value?.id;
      const match = result.items.find((item) => item.id === requested);
      let detail = match ?? null;
      if (requested && !detail && deepLink) {
        if (idSchema.safeParse(requested).success) {
          try { detail = await getRequesterSosRequest(bearer, requested); }
          catch (cause) {
            if (current !== generation || userId.value !== owner) return;
            if (cause instanceof ApiError && cause.status === 404) {
              linkError.value = "درخواست پیوندشده یافت نشد یا به آن دسترسی ندارید؛ فهرست درخواست‌های خودتان نمایش داده می‌شود.";
            } else {
              // The list succeeded. A transient detail failure must not turn it
              // into a failed/empty history or silently lose the linked request.
              linkError.value = sosApiErrorMessage(cause,
                "دریافت درخواست پیوندشده انجام نشد؛ فهرست درخواست‌های خودتان نمایش داده می‌شود. دوباره تلاش کنید.");
              linkRetryable.value = true;
              retryId = requested;
            }
          }
        } else {
          linkError.value = "درخواست پیوندشده یافت نشد یا به آن دسترسی ندارید؛ فهرست درخواست‌های خودتان نمایش داده می‌شود.";
        }
      }
      if (userId.value !== owner || current !== generation) return;
      items.value = result.items;
      page.value = result.page;
      total.value = result.total;
      totalPages.value = result.totalPages;
      const nextSelected = detail ?? result.items[0] ?? null;
      // A page change or deep link can replace the selected request without `choose()`.
      // Never apply the previous request's cancellation/blocked dialog to the new one.
      if (selected.value?.id !== nextSelected?.id) cancellation.reset();
      selected.value = nextSelected;
      listLoaded.value = true;
    } catch (cause) {
      if (userId.value === owner && current === generation)
        error.value = sosApiErrorMessage(cause, "دریافت تاریخچهٔ درخواست‌ها انجام نشد؛ دوباره تلاش کنید.");
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  function retryLink(): Promise<void> {
    return retryId && linkRetryable.value ? load(page.value, retryId) : Promise.resolve();
  }

  function choose(item: SosRequest): void {
    if (cancellation.submitting.value) return;
    ++generation;
    loading.value = false;
    linkError.value = null;
    linkRetryable.value = false;
    retryId = null;
    cancellation.reset();
    selected.value = item;
  }

  function markCancelled(): void {
    if (!selected.value || !cancellation.cancelled.value) return;
    const id = selected.value.id;
    // A history read begun before the committed mutation must not restore the
    // old cancellable status when it arrives after this local acknowledgement.
    ++generation;
    loading.value = false;
    selected.value = { ...selected.value, status: "cancelled_by_requester" };
    items.value = items.value.map((item) => item.id === id ? { ...item, status: "cancelled_by_requester" } : item);
  }

  function reset(): void {
    ++generation;
    items.value = [];
    selected.value = null;
    page.value = 1;
    total.value = 0;
    totalPages.value = 0;
    loading.value = false;
    error.value = null;
    listLoaded.value = false;
    linkError.value = null;
    linkRetryable.value = false;
    retryId = null;
    cancellation.reset();
  }

  // The view reloads when the account changes, but its ordinary watcher runs on the next tick.
  // Private requests and cancellation state must disappear synchronously at the auth boundary.
  watch(token, (next, previous) => {
    if (!next && previous) reset();
  }, { flush: "sync" });
  watch(userId, (next, previous) => {
    if (next !== previous) reset();
  }, { flush: "sync" });

  return { items, selected, page, total, totalPages, loading, error, listVerified, linkError, linkRetryable, cancellation,
    canCancelSelected, load, retryLink, choose, markCancelled, reset };
}
