import { onScopeDispose, ref } from "vue";
import type { GeocodeResponse, GeocodeResult } from "@shared/index";
import { searchPlaces } from "@/api/geocoding";

const DEBOUNCE_MS = 300;
const MAX_MAP_RESULTS = 30;

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
  // A bounded, query-owned collection of hits already explored on the map. A viewport
  // refresh changes the current list, not the POIs someone was just inspecting.
  const mapResults = ref<GeocodeResponse>([]);
  const mapActive = ref(false);
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
    mapResults.value = [];
    mapActive.value = false;
    selectedPlaceId.value = null;
    loading.value = false;
    failed.value = false;
    searched.value = false;
  }

  function clear(): void {
    invalidate();
    term.value = "";
  }

  function mergeMapResults(places: GeocodeResponse): void {
    if (!mapActive.value) return;
    const merged = new Map(mapResults.value.map(place => [place.placeId, place]));
    for (const place of places) merged.set(place.placeId, place);
    const currentIds = new Set(places.map(place => place.placeId));
    while (merged.size > MAX_MAP_RESULTS) {
      const evict = [...merged.keys()].find(id => id !== selectedPlaceId.value && !currentIds.has(id));
      if (!evict) break; // At most five new hits per response, so a protected set cannot exceed the cap.
      merged.delete(evict);
    }
    mapResults.value = [...merged.values()];
  }

  /** Open the map collection without losing the current list or making a second request. */
  function showOnMap(): boolean {
    if (disposed || (!mapActive.value && (!results.value.length || loading.value))) return false;
    mapActive.value = true;
    mergeMapResults(results.value);
    return mapResults.value.length > 0;
  }

  async function run(preserve = false): Promise<void> {
    if (disposed) return;
    if (timer !== null) clearTimeout(timer);
    timer = null;
    if (preserve) {
      generation++;
      controller?.abort();
      controller = null;
      failed.value = false;
      loading.value = false;
    } else invalidate();
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
      const filtered = places.filter(area.contains);
      if (preserve) mergeMapResults(filtered);
      results.value = filtered;
      if (selectedPlaceId.value && !filtered.some(place => place.placeId === selectedPlaceId.value) &&
          !mapResults.value.some(place => place.placeId === selectedPlaceId.value)) selectedPlaceId.value = null;
      searched.value = true;
    } catch (error) {
      if (disposed || current !== generation) return;
      // A failed map refresh keeps already visited POIs and labels the old list as stale.
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

  /** Pan/zoom after Show All follows the viewport. Retain visited POIs while a
   * bounded, abortable request loads; don't refresh for the fit/selection flight.
   */
  function refreshForViewport(followMap = false, force = false): void {
    if (disposed || term.value.trim().length < 2 || timer !== null) return;
    if (followMap && mapActive.value) scope.value = "viewport";
    if (scope.value !== "viewport") return;
    const bbox = options.area("viewport")?.bbox ?? null;
    if (!force && bbox === lastRequestBbox) return;
    void run(true);
  }

  /** Retry in-place so a failed pan does not destroy the earlier POIs. */
  function retry(): void {
    if (scope.value === "viewport" && (results.value.length || mapResults.value.length))
      refreshForViewport(false, true);
    else void run();
  }

  /** Selection may come from the current list or from an earlier, still-pinned map hit. */
  function select(place: GeocodeResult): boolean {
    if (disposed || !results.value.some(result => result.placeId === place.placeId) &&
        !(mapActive.value && mapResults.value.some(result => result.placeId === place.placeId))) return false;
    selectedPlaceId.value = place.placeId;
    return true;
  }

  onScopeDispose(() => { disposed = true; invalidate(); });
  return { term, scope, results, mapResults, mapActive, selectedPlaceId, loading, failed, searched,
    run, update, clear, setScope, refreshForViewport, retry, showOnMap, select };
}
