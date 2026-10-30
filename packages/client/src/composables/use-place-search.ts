import { onScopeDispose, ref } from "vue";
import type { GeocodeResponse, GeocodeResult } from "@shared/index";
import { PlaceSearchError, searchPlaces } from "@/api/geocoding";

const DEBOUNCE_MS = 300;
const MAX_SEARCH_RESULTS = 30;

/** No query text, coordinates, token or raw upstream message in a mobile report. */
export function placeSearchDiagnostic(error: unknown): string {
  if (!(error instanceof PlaceSearchError)) return "GET /geocode · UNKNOWN_ERROR";
  const status = error.status !== null && Number.isInteger(error.status) && error.status >= 100 && error.status <= 599
    ? ` · HTTP ${error.status}` : "";
  const gateway = error.gatewayCode && ["invalid_geocode_query", "geocoding_unavailable",
    "geocoding_failed", "invalid_geocoder_response", "not_found", "internal_error", "method_not_allowed"]
    .includes(error.gatewayCode) ? ` · ${error.gatewayCode}` : "";
  const probe = error.probe && ["LIMIT_5_ACCEPTED", "LIMIT_5_REJECTED", "LIMIT_5_UNAVAILABLE"]
    .includes(error.probe) ? ` · ${error.probe}` : "";
  return `GET /geocode · ${error.code}${status}${gateway}${probe}`;
}

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
  const diagnostic = ref<string | null>(null);
  const searched = ref(false);
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let generation = 0;
  let disposed = false;
  let lastRequestBbox: string | null = null;
  let lastPrunedBbox: string | null = null;
  let needsRefresh = false;

  function invalidate(): void {
    generation++;
    lastRequestBbox = null;
    lastPrunedBbox = null;
    needsRefresh = false;
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
    diagnostic.value = null;
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
      diagnostic.value = null;
      loading.value = false;
    } else invalidate();
    const q = term.value.trim();
    if (q.length < 2) return;
    const area = options.area(scope.value);
    lastRequestBbox = area?.bbox ?? null;
    lastPrunedBbox = lastRequestBbox;
    needsRefresh = false;
    if (preserve && scope.value === "viewport") {
      // As soon as the camera enters another bbox, drop out-of-area hits even while
      // Photon is pending/offline. Keep only still-visible pins until the new answer.
      results.value = area ? results.value.filter(area.contains) : [];
      if (mapActive.value) mapResults.value = area ? mapResults.value.filter(area.contains) : [];
      if (selectedPlaceId.value && !results.value.some(place => place.placeId === selectedPlaceId.value) &&
          !mapResults.value.some(place => place.placeId === selectedPlaceId.value)) selectedPlaceId.value = null;
    }
    // No map bounds means no safe local search. Never silently turn this into a global query.
    if (!area) {
      failed.value = true;
      diagnostic.value = "GET /geocode · MAP_BOUNDS_UNAVAILABLE";
      return;
    }
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
      if ((error as { name?: unknown } | null)?.name !== "AbortError") {
        failed.value = true;
        diagnostic.value = placeSearchDiagnostic(error);
      }
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

  /** Remove out-of-bbox hits during a gesture rather than waiting for moveend.
   * Stop a previous bbox's in-flight read now: it must not repaint old pins mid-drag.
   * The caller starts just one new read when the camera settles.
   */
  function pruneForViewport(followMap = false, awaitRefresh = true): void {
    if (disposed || term.value.trim().length < 2 || timer !== null) return;
    if (followMap) scope.value = "viewport";
    if (scope.value !== "viewport") return;
    const area = options.area("viewport");
    const bbox = area?.bbox ?? null;
    if (bbox === lastPrunedBbox) return;
    lastPrunedBbox = bbox;
    // Even returning to the starting bbox needs a read: intermediate pruning
    // already removed hits that cannot be reconstructed from the old snapshot.
    needsRefresh = true;
    if (bbox !== lastRequestBbox) {
      if (controller) {
        generation++;
        controller.abort();
        controller = null;
      }
      failed.value = false;
      diagnostic.value = null;
      loading.value = awaitRefresh; // A selection flight prunes but never requests.
    }
    const visibleResults = area ? results.value.filter(area.contains) : [];
    if (visibleResults.length !== results.value.length) results.value = visibleResults;
    if (mapActive.value) {
      const visibleMapResults = area ? mapResults.value.filter(area.contains) : [];
      if (visibleMapResults.length !== mapResults.value.length) mapResults.value = visibleMapResults;
    }
    if (selectedPlaceId.value && !results.value.some(place => place.placeId === selectedPlaceId.value) &&
        !mapResults.value.some(place => place.placeId === selectedPlaceId.value)) selectedPlaceId.value = null;
  }

  /** Pan/zoom after Show All follows the viewport. Prune outside the new bbox
   * immediately, then replace the snapshot from one abortable request.
   */
  function refreshForViewport(followMap = false, force = false): void {
    if (disposed || term.value.trim().length < 2 || timer !== null) return;
    if (followMap) scope.value = "viewport";
    if (scope.value !== "viewport") return;
    const bbox = options.area("viewport")?.bbox ?? null;
    if (!force && !needsRefresh && bbox === lastRequestBbox) return;
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
  return { term, scope, results, mapResults, mapActive, selectedPlaceId, loading, failed, diagnostic, searched,
    run, update, clear, setScope, pruneForViewport, refreshForViewport, retry, showOnMap, select };
}
