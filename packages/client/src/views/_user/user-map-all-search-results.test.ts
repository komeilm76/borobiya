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
  it("shows compact category-colored, keyboard-reachable pins and a persistent selected name", () => {
    const sync = body("syncResultMarkers");
    for (const part of ['resultAppearance(place)', 'clusterAppearance(group)',
      'button.append(icon, tooltip)', 'anchor: "bottom"', 'button.setAttribute("aria-label"',
      '${place.name}، ${place.address}؛ انتخاب مقصد',
      'placeSearch.mapResults.value.find(hit => hit.placeId === place.placeId)',
      'button.addEventListener("keydown"', 'count.textContent = `+']) {
      expect(sync).toContain(part);
    }
    expect(sync).not.toContain('button.innerHTML'); // Photon strings never become markup.
    expect(view).toContain('class="user-map-view__search-map-actions"');
    expect(view).toContain('aria-label="بازگشت به فهرست نتایج جست‌وجو"');
    expect(view).toContain('@click="selectTool(\'search\')"');
    const selected = body("syncSelectedPlaceMarker");
    expect(selected).toContain('label.textContent = place.name');
    expect(body("syncDestinationMarker")).toContain('label.textContent = namedSearch ? journey.title.value : ""');
    expect(view).toContain('syncDestinationMarker(); // A named search callout belongs to planning, not active guidance.');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    for (const part of ['.user-map-view__result-marker__icon', '.user-map-view__selected-place-label',
      '.user-map-view__result-marker:focus-visible', '.user-map-view__result-cluster:focus-visible',
      '@media (forced-colors: active)']) expect(css.code).toContain(part);
  });

  it("keeps the always-visible selected name inside the map after selection, movement and resize", () => {
    const position = body("positionSelectedPlaceLabel");
    expect(position).toContain('instance.getCanvas().getBoundingClientRect()');
    expect(position).toContain('mapLabelShift(');
    expect(position).toContain('label.getBoundingClientRect().top < canvas.top + 8');
    expect(body("syncSelectedPlaceMarker")).toContain('positionSelectedPlaceLabel(selectedPlaceMarker, instance)');
    expect(body("syncDestinationMarker")).toContain('positionSelectedPlaceLabel(destinationMarker, instance)');
    expect(body("onMapMoveEnd")).toContain('positionSelectedPlaceLabels()');
    expect(body("onMapResize")).toContain('positionSelectedPlaceLabels()');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain('--selected-label-shift');
    expect(css.code).toContain('--selected-label-map-width');
    expect(css.code).toContain('user-map-view__selected-place--label-below');
  });

  it("shows only the real place name on hover and keyboard focus without moving the pin", () => {
    const sync = body("syncResultMarkers");
    expect(sync).toContain('document.createElement("bdi")');
    expect(sync).toContain('tooltip.dir = "auto"');
    expect(sync).toContain('tooltip.setAttribute("aria-hidden", "true")');
    expect(sync).toContain('tooltip.textContent = place.name');
    expect(sync).not.toContain('tooltip.textContent = place.address');
    expect(sync).not.toContain('button.setAttribute("title"'); // Native tooltip ignores the Persian font.
    expect(sync).not.toContain('button.innerHTML');
    expect(sync).toContain('button.addEventListener("pointerenter", () => positionResultTooltip(button, instance))');
    expect(sync).toContain('button.addEventListener("focus", () => positionResultTooltip(button, instance))');
    expect(body("syncSelectedPlaceMarker")).not.toContain('setAttribute("title"');
    const position = body("positionResultTooltip");
    expect(position).toContain('instance.getCanvas().getBoundingClientRect()');
    expect(position).toContain('canvas.width - 16');
    expect(position).toContain('tooltip.getBoundingClientRect().top < canvas.top + 8');
    expect(position).toContain('mapLabelShift(rect.left, rect.right, canvas.left, canvas.right)');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    const style = descriptor.styles[0]!.content;
    expect(style).toMatch(/\.user-map-view__result-marker\)\s*\{[^}]*width:\s*48px; height:\s*48px/s);
    expect(style).toContain('.user-map-view__result-marker:hover .user-map-view__result-marker__tooltip');
    expect(style).toContain('.user-map-view__result-marker:focus-visible .user-map-view__result-marker__tooltip');
    expect(style).toContain('pointer-events: none;');
    expect(css.code).toContain('font: 700 .9rem/1.5 var(--bb-font-family');
    expect(css.code).toContain('outline: 3px solid');
  });

  it("passes only the matching selected result to the existing route card, without invented place data", () => {
    const card = readFileSync(new URL("../../components/map/PointRouteSheet.vue", import.meta.url), "utf8");
    expect(view).toContain(':search-place="isSelectedSearchDestination ? journey.knownPlace.value : null"');
    expect(view).toContain('matchesSelectedSearchDestination(\n  selectedSearchPlace.value, journey.knownPlace.value, journey.point.value)');
    expect(view).not.toContain('selected.name === place.name && selected.address === place.address');
    expect(card).toContain("resultAppearance(searchPlace).icon");
    expect(card).toContain("resultAppearance(searchPlace).label");
    expect(card).toContain("{{ api.title.value }}");
    expect(card).toContain("{{ destinationAddress }}");
    expect(card).toContain("@click=\"sendPoint\"");
    expect(card).toContain("@click=\"showPlan\"");
    expect(card).not.toContain("rating");
    expect(card).not.toContain("verified");
  });

  it("dismisses a maximum-zoom chooser when a hand-picked point replaces it and focuses the new route", () => {
    const hold = body("attachHold");
    expect(view).toContain('v-if="nearbyPlaces.length > 1 && showAllResultsOnMap && !activeTool"');
    expect(hold).toContain('closeNearbyResults();');
    expect(hold.indexOf('closeNearbyResults();')).toBeLessThan(hold.indexOf('journey.select({ lat: location.lat, lon: location.lng })'));
    expect(hold).toContain('if (map.value === instance && journey.sheetOpen.value && journey.point.value === point)');
    expect(hold).toContain('document.getElementById("map-point-route-sheet")?.focus({ preventScroll: true })');
  });

  it("moves keyboard focus into the current route sheet when a selected map pin disappears", () => {
    const select = body("selectPlace");
    expect(select).toContain('if (fromMap) void nextTick(() => {');
    expect(select).toContain('map.value === instance && journey.sheetOpen.value');
    expect(select).toContain('matchesSelectedSearchDestination(place, journey.knownPlace.value, journey.point.value)');
    expect(select).toContain('document.getElementById("map-point-route-sheet")?.focus({ preventScroll: true })');
    expect(select.indexOf('journey.select({ lat: place.lat, lon: place.lon }, place)'))
      .toBeLessThan(select.indexOf('if (fromMap) void nextTick(() => {'));
    const sheet = readFileSync(new URL("../../components/map/PointRouteSheet.vue", import.meta.url), "utf8");
    expect(sheet).toContain('id="map-point-route-sheet"');
    expect(sheet).toContain('tabindex="-1"');
  });

  it("zooms a current cluster before opening its chooser at maximum zoom", () => {
    const activate = body("activateResultCluster");
    expect(activate).toContain('resultClusterMarkers.get(key)');
    expect(activate).toContain('marker.getElement() !== button');
    expect(activate).toContain('ids.some(id => !placeSearch.mapResults.value.some');
    expect(activate).toContain('nextClusterZoom(instance.getZoom(), instance.getMaxZoom())');
    expect(activate).toContain('if (zoom === null)');
    expect(activate).toContain('openNearbyResults(ids, button)');
    expect(activate).toContain('const center = marker.getLngLat()');
    expect(activate).toContain('bounds.contains(center)');
    expect(activate).toContain('instance.easeTo({ center: [center.lng, center.lat], zoom, duration: 450 }, { placeSearchSelection: true })');
    expect(body("onMapMoveEnd")).toContain('restoreClusterKeyboardFocus()');
    expect(body("restoreClusterKeyboardFocus")).toContain('pending.instance.getCanvas()');
    expect(view).toContain('aria-live="polite">{{ clusterZoomAnnouncement }}');
  });

  it("regroups on camera changes and opens a current-results chooser for overlaps at max zoom", () => {
    const sync = body("syncResultMarkers");
    expect(sync).toContain('instance.project([place.lon, place.lat])');
    expect(sync).toContain('groupSearchResults(visiblePlaces');
    expect(sync).toContain('resultClusterMarkers');
    expect(sync).toContain('button.setAttribute("aria-haspopup", "dialog")');
    expect(sync).toContain('button.setAttribute("aria-controls", "map-nearby-results")');
    expect(sync).toContain('activateResultCluster(group.map(hit => hit.placeId)');
    expect(sync).toContain('button.removeAttribute("aria-haspopup")');
    expect(sync).toContain('button.removeAttribute("aria-controls")');
    expect(body("onMapMoveEnd")).toContain('syncResultMarkers()');
    expect(body("onMapResize")).toContain('syncResultMarkers()');
    expect(body("clearResultMarkers")).toContain('resultClusterMarkers');
    expect(view).toContain('class="user-map-view__nearby-results"');
    expect(view).toContain('v-for="place in nearbyPlaces"');
    expect(view).toContain('@click="chooseNearbyResult(place)"');
    expect(view).toContain('@keydown.esc.stop.prevent="closeNearbyResults(true)"');
    expect(body("chooseNearbyResult")).toContain('placeSearch.mapResults.value.find');
    expect(body("chooseNearbyResult")).toContain('selectPlace(current, true)');
    expect(body("openNearbyResults")).toContain('ids.some(id => !placeSearch.mapResults.value.some');
    expect(body("onMapReady")).toContain('clearResultMarkers()');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-results", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain('.user-map-view__result-cluster:focus-visible');
    expect(css.code).toContain('.user-map-view__nearby-results');
    expect(css.code).toContain('overflow-y: auto');
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
    expect(sync).toContain("groupSearchResults(visiblePlaces");
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
