import { onScopeDispose, ref } from "vue";
import type { GeocodeResponse, GeocodeResult } from "@shared/index";
import { searchPlaces } from "@/api/geocoding";

const DEBOUNCE_MS = 300;

export type PlaceSearchScope = "library" | "viewport";

/** A single search snapshot: the filter must use the same bounds as the gateway request. */
export interface PlaceSearchArea {
  bbox: string;
  contains: (place: GeocodeResult) => boolean;
}

/** Search decisions live here, not in the map component: old results must not be selectable. */
export function usePlaceSearch(options: {
  area: (scope: PlaceSearchScope) => PlaceSearchArea | null;
  search?: typeof searchPlaces;
}) {
  const term = ref("");
  const scope = ref<PlaceSearchScope>("library");
  const results = ref<GeocodeResponse>([]);
  const selectedPlaceId = ref<string | null>(null);
  const loading = ref(false);
  const failed = ref(false);
  const searched = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let generation = 0;
  let disposed = false;
  let lastRequestBbox: string | null = null;

  function invalidate(): void {
    generation++;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    controller?.abort();
    controller = null;
    results.value = [];
    selectedPlaceId.value = null;
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
    const area = options.area(scope.value);
    lastRequestBbox = area?.bbox ?? null;
    // No map bounds means no safe local search. Never silently turn this into a global query.
    if (!area) { failed.value = true; return; }
    const current = generation;
    controller = new AbortController();
    loading.value = true;
    try {
      const places = await (options.search ?? searchPlaces)(
        { q, limit: 5, bbox: area.bbox }, controller.signal
      );
      if (disposed || current !== generation) return;
      results.value = places.filter(area.contains);
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

  /** The choice changes the request, so discard old results immediately and search again. */
  async function setScope(next: PlaceSearchScope): Promise<void> {
    if (disposed || scope.value === next) return;
    invalidate();
    scope.value = next;
    if (term.value.trim().length >= 2) await run();
  }

  /** After a camera move, fetch only when the visible search bbox actually changed.
   * A pending term debounce already reads the latest bounds, so don't bypass it here.
   */
  function refreshForViewport(): void {
    if (disposed || scope.value !== "viewport" || term.value.trim().length < 2 || timer !== null) return;
    const bbox = options.area("viewport")?.bbox ?? null;
    if (bbox === lastRequestBbox) return;
    void run(); // Invalidates the old request/results and uses one fresh bbox/filter snapshot.
  }

  /** Selection is not a new query; keep the list so another hit remains reachable. */
  function select(place: GeocodeResult): boolean {
    if (disposed || !results.value.some((result) => result.placeId === place.placeId)) return false;
    selectedPlaceId.value = place.placeId;
    return true;
  }

  onScopeDispose(() => { disposed = true; invalidate(); });
  return { term, scope, results, selectedPlaceId, loading, failed, searched, run, update, clear, setScope, refreshForViewport, select };
}
