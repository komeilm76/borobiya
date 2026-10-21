import { computed, onScopeDispose, ref, watch, type ComputedRef, type Ref } from "vue";
import type { UserSearchResult } from "@shared/index";
import { searchUsers } from "@/api/location";
import { isAbortError, isLatestSearch, SEARCH_DEBOUNCE_MS, shouldSearch } from "@/sharing/share-form";

/**
 * Debounced username search for the share picker.
 *
 * Three rules, all of them load-bearing:
 * - the request fires 300 ms after typing stops, so a five-character name costs one lookup and not
 *   five (the endpoint is a `LIKE` scan until T4.1.1 adds a trigram index);
 * - a shorter term clears the list *without* a request, because the server answers one character
 *   with `400 q_too_short` and the user would see an error for normal typing;
 * - responses are matched to the request that produced them, so a slow early answer cannot
 *   replace the list the user is already reading.
 */
export interface UseTargetSearchOptions {
  accessToken: ComputedRef<string | null> | Ref<string | null>;
  /** Optional narrowing controls from the dialog. Undefined means "not filtered". */
  minRating?: Ref<number | undefined>;
  online?: Ref<boolean | undefined>;
  /** Page size; the picker shows one page and asks the user to refine rather than paginating. */
  limit?: number;
}

export function useTargetSearch(options: UseTargetSearchOptions) {
  const term = ref("");
  const results = ref<UserSearchResult[]>([]);
  const total = ref(0);
  const loading = ref(false);
  const failed = ref(false);

  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let requestId = 0;

  const hasResults = computed(() => results.value.length > 0);

  function cancelPending(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    controller?.abort();
    controller = null;
  }

  async function run(): Promise<void> {
    const query = term.value.trim();
    if (!shouldSearch(query)) {
      results.value = [];
      total.value = 0;
      failed.value = false;
      loading.value = false;
      return;
    }

    const requestIdForThisRun = ++requestId;
    controller?.abort();
    controller = new AbortController();
    const signal = controller.signal;
    loading.value = true;
    // The previous term's failure is not this term's failure: leaving `failed` set until the new
    // response arrives shows "search failed" above a list that is still loading, and offers a retry
    // button for a request that has not been made yet.
    failed.value = false;

    const accessToken = options.accessToken.value;
    if (!accessToken) {
      results.value = [];
      loading.value = false;
      failed.value = false;
      return;
    }

    try {
      const page = await searchUsers(
        {
          q: query,
          limit: options.limit ?? 20,
          ...(options.minRating?.value === undefined ? {} : { minRating: options.minRating.value }),
          ...(options.online?.value === undefined ? {} : { online: options.online.value })
        },
        accessToken,
        signal
      );
      if (!isLatestSearch(requestIdForThisRun, requestId)) return;
      results.value = page.items;
      total.value = page.total;
      failed.value = false;
    } catch (error) {
      if (!isLatestSearch(requestIdForThisRun, requestId) || isAbortError(error)) return;
      results.value = [];
      total.value = 0;
      failed.value = true;
    } finally {
      if (isLatestSearch(requestIdForThisRun, requestId)) loading.value = false;
    }
  }

  function searchNow(): void {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    void run();
  }

  watch(term, () => {
    if (timer !== null) clearTimeout(timer);
    if (!shouldSearch(term.value)) {
      // Clear without a round trip, and cancel whatever is still in flight so the list the user
      // sees always corresponds to the box they are looking at.
      cancelPending();
      requestId += 1;
      results.value = [];
      total.value = 0;
      failed.value = false;
      loading.value = false;
      return;
    }
    timer = setTimeout(() => {
      timer = null;
      void run();
    }, SEARCH_DEBOUNCE_MS);
  });

  // Narrowing controls are not debounced: they are clicked, not typed, and a stale list under a
  // newly-set filter is worse than the half-second it takes to refetch.
  watch(
    () => [options.minRating?.value, options.online?.value],
    () => searchNow()
  );

  onScopeDispose(cancelPending);

  return { term, results, total, loading, failed, hasResults, searchNow, cancelPending };
}
