import { onScopeDispose, ref } from "vue";
import type { GeocodeResponse, GeocodeResult } from "@shared/index";
import { searchPlaces } from "@/api/geocoding";

const DEBOUNCE_MS = 300;
const MAX_SEARCH_RESULTS = 30;

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
  const scope = ref<PlaceSearchScope>("viewport");
  const results = ref<GeocodeResponse>([]);
  // Map POIs are the last verified bbox snapshot, not a history of previous map areas.
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

  /** Map mode follows the current result set, never a cache of earlier viewports. */
  function showOnMap(): boolean {
    if (disposed || (!mapActive.value && (!results.value.length || loading.value))) return false;
    if (!mapActive.value) {
      mapResults.value = results.value;
      mapActive.value = true;
    }
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
    if (preserve && scope.value === "viewport") {
      // As soon as the camera enters another bbox, drop out-of-area hits even while
      // Photon is pending/offline. Keep only still-visible pins until the new answer.
      results.value = area ? results.value.filter(area.contains) : [];
      if (mapActive.value) mapResults.value = area ? mapResults.value.filter(area.contains) : [];
      if (selectedPlaceId.value && !results.value.some(place => place.placeId === selectedPlaceId.value) &&
          !mapResults.value.some(place => place.placeId === selectedPlaceId.value)) selectedPlaceId.value = null;
    }
    // No map bounds means no safe local search. Never silently turn this into a global query.
    if (!area) { failed.value = true; return; }
    const current = generation;
    controller = new AbortController();
    loading.value = true;
    try {
      const places = await (options.search ?? searchPlaces)(
        { q, limit: MAX_SEARCH_RESULTS, bbox: area.bbox }, controller.signal
      );
      if (disposed || current !== generation) return;
      const filtered = places.filter(area.contains).slice(0, MAX_SEARCH_RESULTS);
      results.value = filtered;
      if (mapActive.value) mapResults.value = filtered;
      if (selectedPlaceId.value && !filtered.some(place => place.placeId === selectedPlaceId.value))
        selectedPlaceId.value = null;
      searched.value = true;
    } catch (error) {
      if (disposed || current !== generation) return;
      // A failed refresh keeps only hits still in the new bbox and labels them stale.
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

  /** Pan/zoom after Show All follows the viewport. Prune outside the new bbox
   * immediately, then replace the snapshot from one abortable request.
   */
  function refreshForViewport(followMap = false, force = false): void {
    if (disposed || term.value.trim().length < 2 || timer !== null) return;
    if (followMap && mapActive.value) scope.value = "viewport";
    if (scope.value !== "viewport") return;
    const bbox = options.area("viewport")?.bbox ?? null;
    if (!force && bbox === lastRequestBbox) return;
    void run(true);
  }

  /** Retry in-place so a failed pan does not discard still-in-bbox POIs. */
  function retry(): void {
    if (scope.value === "viewport" && (mapActive.value || results.value.length))
      refreshForViewport(false, true);
    else void run(mapActive.value);
  }

  /** Only a current list/map hit may be selected; prior-bbox IDs are not valid. */
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
