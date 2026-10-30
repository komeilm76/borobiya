import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Source/style contracts only; project policy forbids mounting .vue components in unit tests.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const detail = readFileSync(new URL("../../components/map/PlaceDetailSheet.vue", import.meta.url), "utf8");
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
    expect(view).toContain('<PlaceSearchPanel :api="placeSearch" :ready="!!map" @select="selectPlace" />');
    expect(view).toContain('modelValue: activeTool.value === "history"');
    expect(view).toContain('class="user-map-view__tool-host"');
    expect(view).toContain('class="user-map-view__live-dialog"');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-search-test", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain(".user-map-view__search-dialog");
    expect(css.code).toContain("safe-area-inset-bottom");
    expect(css.code).toContain("overflow-y: auto");
  });

  it("centers an authorized current result once, closes the phone dialog and opens place details", () => {
    const selection = body("selectPlace");
    expect(selection).toContain('placeSearch.results.value.some(');
    expect(selection).toContain('bounds.contains([place.lon, place.lat])');
    expect(selection).toContain('placeSearch.select(place)');
    expect(selection).toContain('instance.flyTo(');
    expect(selection).toContain('offset: [0, offsetY]');
    expect(selection).toContain('{ placeSearchSelection: true }');
    expect(selection).toContain('closeTool(false)');
    expect(selection).toContain('openSelectedPlaceDetail()');
    expect(selection).not.toContain('placeSearch.clear()');
    expect(view).toContain('<PlaceDetailSheet');
    expect(view).toContain('@after-leave="onPlaceDetailAfterLeave"');
    expect(body('onPlaceDetailAfterLeave')).toContain('selectedPlaceMarker?.getElement().focus({ preventScroll: true })');
    expect(view).toContain('watch(() => placeSearch.selectedPlaceId.value,');
    expect(view).toContain('if (!selectedSearchPlace.value) closePlaceDetail(false)');
    expect(body("onMapClick")).toContain('closePlaceDetail(false)');
    expect(body("syncSelectedPlaceMarker")).toContain('openSelectedPlaceDetail()');
    expect(detail).toContain('<v-bottom-sheet');
    expect(detail).toContain('place.name');
    expect(detail).toContain('place.address');
    expect(detail).toContain('place.type');
    expect(detail).toContain('place.lat');
    expect(detail).toContain('place.lon');
    expect(detail).toContain('aria-label="بستن اطلاعات مکان"');
    expect(detail).toContain('overflow-y: auto');
  });
});
