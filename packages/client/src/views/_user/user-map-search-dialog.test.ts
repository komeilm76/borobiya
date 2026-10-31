import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Source/style contracts only; project policy forbids mounting .vue components in unit tests.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
function body(name: string): string {
  const start = view.indexOf(`function ${name}(`);
  expect(start, name).toBeGreaterThan(-1);
  const next = view.indexOf("\nfunction ", start + 1);
  return view.slice(start, next < 0 ? view.length : next);
}

describe("map place search handoff", () => {
  it("opens a real full-screen, scrollable search dialog on phones without changing history or desktop panels", () => {
    expect(view).toContain(':is="isPhone ? VDialog : \'div\'"');
    expect(view).toContain('class="user-map-view__search-dialog"');
    expect(view).toContain('v-bind="isPhone ? phoneSearchDialogProps : {}"');
    expect(view).toContain('@update:model-value="onSearchDialogVisibilityChange"');
    expect(view).toContain('modelValue: activeTool.value === "search"');
    expect(view).toContain('fullscreen: true');
    expect(view).toContain('scrollable: true');
    expect(view).toContain('aria-label="بستن جست‌وجو"');
    expect(view).toContain('id="map-search-panel"');
    expect(view).toContain('<PlaceSearchPanel :api="placeSearch" :ready="!!map" @select="selectPlace" @show-all="showAllSearchResults" />');
    expect(view).toContain('modelValue: activeTool.value === "history"');
    expect(view).toContain('class="user-map-view__history-dialog"');
    expect(view).toContain('class="user-map-view__live-dialog"');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-search-test", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain(".user-map-view__search-dialog");
    expect(css.code).toContain("safe-area-inset-bottom");
    expect(css.code).toContain("overflow-y: auto");
  });

  it("routes a current search hit to one navigation sheet without a duplicate POI modal", () => {
    const selection = body("selectPlace");
    expect(selection).toContain('bounds.contains([place.lon, place.lat])');
    expect(selection).toContain('current !== place || !placeSearch.select(place)');
    expect(selection).toContain('instance.flyTo(');
    expect(selection).toContain('offset: [0, offsetY]');
    expect(selection).toContain('{ placeSearchSelection: true }');
    expect(selection).toContain('closeTool(false)');
    expect(selection).toContain('removeSelectedCompanion()');
    expect(selection).toContain('journey.select({ lat: place.lat, lon: place.lon }, place)');
    expect(selection).not.toContain('placeSearch.clear()');
    expect(view).toContain('<PointRouteSheet :api="journey"');
    expect(view).not.toContain('PlaceDetailSheet');
    expect(view).not.toContain('placeDetailOpen');
    expect(view).not.toContain('openSelectedPlaceDetail');
    expect(view).not.toContain('can-show-place-details');
    const sheet = readFileSync(new URL("../../components/map/PointRouteSheet.vue", import.meta.url), "utf8");
    expect(sheet).not.toContain('اطلاعات مکان');
    expect(sheet).not.toContain("emit('details')");
    expect(sheet).toContain('api.title.value');
    expect(sheet).toContain('api.address.value');
    expect(sheet).toContain('api.knownPlace.value?.type');
    expect(sheet).toContain('api.point.value.lat.toFixed(5)');
    expect(sheet).toContain('api.durationLabel.value');
    expect(sheet).toContain('api.distanceLabel.value');
  });

  it("keeps the route pin distinct from search results and accessible after list refresh", () => {
    expect(view).toContain('const selectedSearchPlace = computed(');
    expect(view).toContain('journey.knownPlace.value, point = journey.point.value');
    expect(view).toContain('selected.placeId === place.placeId');
    expect(body('syncSelectedPlaceMarker')).toContain('isSelectedSearchDestination.value ? null : selectedSearchPlace.value');
    expect(body('syncSelectedPlaceMarker')).toContain('openSelectedPlaceRoute()');
    expect(body('openSelectedPlaceRoute')).toContain('selectPlace(selectedSearchPlace.value, true)');
    expect(view).toContain('watch(() => placeSearch.selectedPlaceId.value,');
    expect(body('attachHold')).toContain('journey.select({ lat: location.lat, lon: location.lng })');
  });
});
