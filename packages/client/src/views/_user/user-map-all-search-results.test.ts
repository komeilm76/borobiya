import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Contract tests: do not mount Vue SFCs (docs/TASKS.md).
const panel = readFileSync(new URL("../../components/map/PlaceSearchPanel.vue", import.meta.url), "utf8");
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
function body(name: string): string {
  const start = view.indexOf(`function ${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = view.indexOf("\nfunction ", start + 1);
  return view.slice(start, end < 0 ? view.length : end);
}

describe("show all current POIs on the map", () => {
  it("puts an accessible action beside the input, enabled only for current results", () => {
    expect(panel).toContain('class="place-search__show-all"');
    expect(panel).toContain('aria-label="نمایش همهٔ نتایج روی نقشه"');
    expect(panel).toContain(':disabled="!ready || api.loading.value || !api.results.value.length"');
    expect(panel).toContain('@click="$emit(\'show-all\')"');
    expect(panel).toContain("'show-all': []");
    expect(view).toContain('@show-all="showAllSearchResults"');
    const { descriptor } = parse(panel, { filename: "PlaceSearchPanel.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "PlaceSearchPanel.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain(".place-search__show-all");
    expect(css.code).toContain("min-height: 44px");
  });
  it("validates the current snapshot, fits all in-bounds POIs and dismisses only the phone dialog", () => {
    const show = body("showAllSearchResults");
    expect(show).toContain("placeSearch.results.value");
    expect(show).toContain("bounds.contains([place.lon, place.lat])");
    expect(show).toContain("resultExtent(places)");
    expect(show).toContain("resultCameraPadding(");
    expect(show).toContain("instance.fitBounds(");
    expect(show).toContain("{ placeSearchSelection: true }");
    expect(show).toContain('activeTool.value === "search"');
    expect(show).toContain("closeTool(false)");
    expect(show).not.toContain("placeSearch.select(");
    expect(show).not.toContain("openSelectedPlaceDetail(");
  });
  it("uses independently selectable, labeled, 44px DOM POIs and cleans them on invalidation, map replacement and unmount", () => {
    const sync = body("syncResultMarkers");
    expect(sync).toContain("showAllResultsOnMap.value");
    expect(sync).toContain("resultMarkerOffsets(places)");
    expect(sync).toContain('document.createElement("button")');
    expect(sync).toContain('button.type = "button"');
    expect(sync).toContain('button.setAttribute("aria-label"');
    expect(sync).toContain("selectPlace(currentPlace)");
    expect(sync).toContain("event.stopPropagation()");
    expect(sync).toContain("placeSearch.selectedPlaceId.value");
    expect(view).toContain("watch(() => placeSearch.results.value, () => {");
    expect(view).toContain("showAllResultsOnMap.value = false");
    expect(body("onMapReady")).toContain("syncResultMarkers()");
    expect(body("onMapReady")).toContain("clearResultMarkers()");
    expect(view).toContain("onBeforeUnmount(() => {");
    expect(view).toContain("clearResultMarkers()");
    expect(body("onMapClick")).toContain('closest(".user-map-view__peer-avatar, .user-map-view__result-marker")');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain(".user-map-view__result-marker");
  });
});
