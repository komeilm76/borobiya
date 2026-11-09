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
    expect(panel).toContain(':disabled="!ready || (!api.mapResults.value.length && (api.loading.value || !api.results.value.length))"');
    expect(panel).toContain('@click="$emit(\'show-all\')"');
    expect(panel).toContain("'show-all': []");
    expect(view).toContain('@show-all="showAllSearchResults"');
    const { descriptor } = parse(panel, { filename: "PlaceSearchPanel.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "PlaceSearchPanel.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain(".place-search__show-all");
    expect(css.code).toContain("min-height: 44px");
  });
  it("shows named, keyboard-reachable place callouts rather than number-only circles", () => {
    const sync = body("syncResultMarkers");
    for (const part of ['document.createElement("bdi")', 'name.textContent = place.name',
      'button.append(badge, copy, affordance)', 'anchor: "bottom"',
      'button.setAttribute("aria-label"', '${place.name}، ${place.address}؛ انتخاب مقصد',
      'placeSearch.mapResults.value.find(hit => hit.placeId === place.placeId)',
      'button.addEventListener("keydown"']) {
      expect(sync).toContain(part);
    }
    expect(sync).not.toContain('button.innerHTML'); // Never render Photon strings as markup.
    expect(view).toContain('class="user-map-view__search-map-actions"');
    expect(view).toContain('aria-label="بازگشت به فهرست نتایج جست‌وجو"');
    expect(view).toContain('@click="selectTool(\'search\')"');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    for (const part of ['.user-map-view__result-marker__badge', '.user-map-view__result-marker__name',
      '.user-map-view__result-marker:focus-visible', 'text-overflow: ellipsis',
      ':root.dark .user-map-view .user-map-view__result-marker', '@media (forced-colors: active)']) {
      expect(css.code).toContain(part);
    }
  });

  it("shows no extra content or style on hover or focus, while retaining readable text and a keyboard outline", () => {
    const sync = body("syncResultMarkers");
    expect(sync).not.toContain('button.setAttribute("title"'); // No native hover tooltip either.
    expect(sync).not.toContain('user-map-view__result-marker__tooltip');
    expect(sync).not.toContain('tooltipName.textContent');
    expect(sync).not.toContain('address.textContent');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    const style = descriptor.styles[0]!.content;
    expect(style).toMatch(/\.user-map-view__result-marker\)\s*\{[^}]*font-family:\s*var\(--bb-font-family/s);
    expect(style).not.toContain('.user-map-view__result-marker__tooltip');
    expect(style).not.toContain('.user-map-view__result-marker__address');
    expect(style).not.toContain('.user-map-view__result-marker:hover');
    expect(css.code).toContain('.user-map-view__result-marker:focus-visible');
    expect(css.code).toContain('outline: 3px solid');
  });

  it("validates the current snapshot, fits all in-bounds POIs and dismisses only the phone dialog", () => {
    const show = body("showAllSearchResults");
    expect(show).toContain("placeSearch.results.value");
    expect(show).toContain("placeSearch.showOnMap()");
    expect(show).toContain("placeSearch.mapResults.value");
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
    expect(sync).toContain("selectPlace(currentPlace, true)");
    expect(body("selectPlace")).toContain("fromMap ? instance.getZoom() : Math.min(16, instance.getMaxZoom())");
    expect(view).toContain("placeSearch.mapResults.value.find(result => result.placeId === placeSearch.selectedPlaceId.value)");
    expect(sync).toContain("event.stopPropagation()");
    expect(sync).toContain("placeSearch.selectedPlaceId.value");
    expect(sync).toContain("placeSearch.mapResults.value");
    expect(view).toContain("watch(() => placeSearch.mapResults.value, () => {");
    expect(view).toContain("const showAllResultsOnMap = placeSearch.mapActive");
    expect(body("onMapReady")).toContain("syncResultMarkers()");
    expect(body("onMapReady")).toContain("clearResultMarkers()");
    expect(view).toContain("onBeforeUnmount(() => {");
    expect(view).toContain("clearResultMarkers()");
    // Holds attach only to the canvas, not the independently clickable result/peer markers.
    expect(body("attachHold")).toContain("instance.getCanvasContainer()");
    expect(body("onMapReady")).toContain("detachHold = attachHold(instance)");
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain(".user-map-view__result-marker");
    expect(css.code).toContain(".user-map-view__search-map-actions");
    expect(view).toContain("placeSearch.pruneForViewport(!!event.originalEvent || showAllResultsOnMap.value)");
    expect(view).toContain('instance.on("move", onMapMoving)');
    expect(view).toContain('instance.off("move", onMapMoving)');
    expect(view).toContain("placeSearch.refreshForViewport(followViewport)");
    expect(view).toContain('aria-label="نمایش دوبارهٔ همهٔ نتایج روی نقشه"');
    expect(view).toContain('aria-label="تلاش دوباره برای نتایج این محدوده"');
    expect(view).toContain('placeSearch.retry()');
  });
});
