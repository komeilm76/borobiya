import { onScopeDispose, ref } from "vue";
import type { GeocodeResponse, GeocodeResult } from "@shared/index";
import { searchPlaces } from "@/api/geocoding";

const DEBOUNCE_MS = 300;

/** Search decisions live here, not in the map component: old results must not be selectable. */
export function usePlaceSearch(options: {
  bbox?: () => string | undefined;
  withinBounds?: (place: GeocodeResult) => boolean;
  search?: typeof searchPlaces;
} = {}) {
  const term = ref("");
  const results = ref<GeocodeResponse>([]);
  const loading = ref(false);
  const failed = ref(false);
  const searched = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let generation = 0;
  let disposed = false;

  function invalidate(): void {
    generation++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    results.value = [];
    loading.value = false;
    failed.value = false;
    searched.value = false;
  }

  function clear(): void {
    invalidate();
    term.value = "";
  }

  async function run(): Promise<void> {
    if (disposed) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    invalidate();
    const q = term.value.trim();
    if (q.length < 2) return;
    const current = generation;
    controller = new AbortController();
    loading.value = true;
    try {
      const bbox = options.bbox?.();
      const places = await (options.search ?? searchPlaces)(
        { q, limit: 5, ...(bbox ? { bbox } : {}) }, controller.signal
      );
      if (disposed || current !== generation) return;
      results.value = options.withinBounds ? places.filter(options.withinBounds) : places;
      searched.value = true;
    } catch (error) {
      if (disposed || current !== generation) return;
      // An abort of the current request is not an outage; old requests are already generation-gated.
      if ((error as { name?: unknown } | null)?.name !== "AbortError") failed.value = true;
    } finally {
      if (!disposed && current === generation) {
        loading.value = false;
        controller = null;
      }
    }
  }

  function update(value: string): void {
    invalidate(); // At the keystroke, not after debounce, so no stale item can be clicked.
    term.value = value;
    if (value.trim().length < 2) return;
    timer = setTimeout(() => { timer = null; void run(); }, DEBOUNCE_MS);
  }

  onScopeDispose(() => { disposed = true; invalidate(); });
  return { term, results, loading, failed, searched, run, update, clear };
}
