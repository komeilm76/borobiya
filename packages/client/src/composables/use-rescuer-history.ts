import { onScopeDispose, ref, type Ref } from "vue";
import { idSchema, type Mission, type MissionDetail } from "@shared/index";
import { getMission, listRescuerMissions } from "../api/mission";
import { ApiError } from "../api/http";
import { sosApiErrorMessage } from "../sos/sos-form";

/** Paginated rescuer mission history, with ownership-checked detail and deep links. */
export function useRescuerHistory(token: Ref<string | null>, userId: Ref<string | null>,
  ensureSession?: () => Promise<unknown>) {
  const items = ref<Mission[]>([]);
  const selected = ref<MissionDetail | null>(null);
  // A failed detail read has no `selected` record, but its card and retry must keep the user's choice.
  const requestedId = ref<string | null>(null);
  const page = ref(1);
  const total = ref(0);
  const totalPages = ref(0);
  const loading = ref(false);
  const detailLoading = ref(false);
  const error = ref<string | null>(null);
  const detailError = ref<string | null>(null);
  const linkError = ref<string | null>(null);
  let generation = 0;
  let detailGeneration = 0;

  async function choose(id: string): Promise<void> {
    const owner = userId.value;
    const bearer = token.value;
    if (!owner || !bearer || !items.value.some((item) => item.id === id)) return;
    const current = ++detailGeneration;
    requestedId.value = id;
    selected.value = null;
    detailError.value = null;
    detailLoading.value = true;
    try {
      await ensureSession?.();
      if (current !== detailGeneration || userId.value !== owner || !token.value) return;
      const detail = await getMission(token.value, id);
      if (current === detailGeneration && userId.value === owner) selected.value = detail;
    } catch (cause) {
      if (current === detailGeneration && userId.value === owner)
        detailError.value = sosApiErrorMessage(cause, "جزئیات مأموریت بارگذاری نشد.");
    } finally {
      if (current === detailGeneration) detailLoading.value = false;
    }
  }

  function retryDetail(): Promise<void> {
    return requestedId.value ? choose(requestedId.value) : Promise.resolve();
  }

  async function load(nextPage = page.value, deepLink?: string): Promise<void> {
    const current = ++generation;
    const owner = userId.value;
    const previous = deepLink ?? requestedId.value;
    const selectionVersion = detailGeneration;
    if (!owner || !token.value) { reset(); return; }
    loading.value = true;
    error.value = null;
    linkError.value = null;
    try {
      await ensureSession?.();
      if (current !== generation || userId.value !== owner || !token.value) return;
      const result = await listRescuerMissions(token.value, nextPage);
      if (current !== generation || userId.value !== owner) return;
      items.value = result.items;
      page.value = nextPage;
      total.value = result.total;
      totalPages.value = result.totalPages;
      const selectedId = previous && result.items.some((item) => item.id === previous) ? previous : result.items[0]?.id;
      if (deepLink && !result.items.some((item) => item.id === deepLink)) {
        if (idSchema.safeParse(deepLink).success && token.value) {
          try {
            const detail = await getMission(token.value, deepLink);
            if (current !== generation || userId.value !== owner || selectionVersion !== detailGeneration) return;
            // A requester can also read mission details. The history page must
            // nevertheless refuse a non-rescuer deep link, even for that account.
            if (detail.rescuerId === owner) {
              ++detailGeneration;
              requestedId.value = deepLink;
              selected.value = detail;
              detailError.value = null;
              return;
            }
          } catch (cause) {
            if (!(cause instanceof ApiError) || cause.status !== 404) throw cause;
          }
        }
        linkError.value = "مأموریت پیوندشده یافت نشد یا به آن دسترسی ندارید؛ فهرست مأموریت‌های خودتان نمایش داده می‌شود.";
      }
      if (current === generation && selectionVersion === detailGeneration) {
        if (selectedId) await choose(selectedId);
        else { ++detailGeneration; requestedId.value = null; selected.value = null; }
      }
    } catch (cause) {
      if (current === generation && userId.value === owner)
        error.value = sosApiErrorMessage(cause, "بارگذاری سابقهٔ مأموریت‌ها انجام نشد.");
    } finally {
      if (current === generation) loading.value = false;
    }
  }

  function reset(): void {
    ++generation;
    ++detailGeneration;
    items.value = [];
    selected.value = null;
    requestedId.value = null;
    page.value = 1;
    total.value = 0;
    totalPages.value = 0;
    loading.value = false;
    detailLoading.value = false;
    error.value = null;
    detailError.value = null;
    linkError.value = null;
  }
  onScopeDispose(reset);
  return { items, selected, requestedId, page, total, totalPages, loading, detailLoading, error, detailError, linkError,
    load, choose, retryDetail, reset };
}
