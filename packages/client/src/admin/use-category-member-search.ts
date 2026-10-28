import { ref } from "vue";
import type { UserProfile } from "@shared/index";
import { friendlyErrorMessage } from "@/api/error-message";

/** The category member picker's debounced username search; the view still owns its dialog and writes. */
export function useCategoryMemberSearch(
  lookup: (term: string) => Promise<UserProfile[]>,
  assignedIds: () => ReadonlySet<string>
) {
  const memberSearch = ref("");
  const candidates = ref<UserProfile[]>([]);
  const searching = ref(false);
  const searchError = ref("");
  let timer: ReturnType<typeof setTimeout> | null = null;
  let version = 0;

  function invalidate(): number {
    ++version;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    candidates.value = [];
    searchError.value = "";
    searching.value = false;
    return version;
  }

  function queueSearch(value: unknown): void {
    // v-text-field can emit null when cleared. Invalidate on the keystroke, not after the debounce:
    // a previous query might resolve in the next 300 ms and otherwise offer the wrong user.
    memberSearch.value = typeof value === "string" ? value : "";
    const current = invalidate();
    const term = memberSearch.value.trim();
    if (!term) return;
    searching.value = true; // no false “no accounts” flash while the debounce is pending
    timer = setTimeout(() => {
      timer = null;
      void (async () => {
        try {
          const rows = await lookup(term);
          if (current !== version) return;
          const assigned = assignedIds();
          candidates.value = rows.filter((row) => row.isActive && !assigned.has(row.id));
        } catch (error) {
          if (current !== version) return;
          searchError.value = friendlyErrorMessage(error, "جست‌وجوی امدادگرها انجام نشد. دوباره تلاش کنید.");
        } finally {
          if (current === version) searching.value = false;
        }
      })();
    }, 300);
  }

  function reset(): void {
    memberSearch.value = "";
    invalidate();
  }

  return { memberSearch, candidates, searching, searchError, queueSearch, reset };
}
