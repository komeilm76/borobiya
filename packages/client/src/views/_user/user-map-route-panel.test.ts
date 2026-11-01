import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Source and compiled CSS contracts only; never mount Vue SFCs in unit tests.
const sheet = readFileSync(new URL("../../components/map/PointRouteSheet.vue", import.meta.url), "utf8");
const map = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const route = readFileSync(new URL("../../composables/use-point-route.ts", import.meta.url), "utf8");
const css = (source: string, filename: string) => {
  const { descriptor } = parse(source, { filename });
  const result = compileStyle({ source: descriptor.styles[0]!.content, id: "data-v-route-panel", filename, scoped: true });
  expect(result.errors).toEqual([]);
  return result.code;
};

describe("progressive trip planning and editing", () => {
  it("begins as a compact nonmodal bottom bar with a separate place-info toggle", () => {
    expect(sheet).not.toContain("<v-bottom-sheet");
    expect(sheet).not.toContain('role="dialog"');
    expect(sheet).toContain('v-if="api.point.value && api.sheetOpen.value"');
    expect(sheet).toContain('id="map-point-route-sheet"');
    expect(sheet).toContain('v-if="infoOpen" id="point-route-info"');
    expect(sheet).toContain('aria-controls="point-route-info"');
    expect(sheet).toContain(':aria-expanded="infoOpen"');
    expect(sheet).toContain('api.address.value');
    expect(sheet).toContain('api.knownPlace.value?.type');
    expect(sheet).toContain('نمایش اطلاعات مکان');
    expect(sheet).toContain('v-if="routesOpen" id="point-route-routes"');
    expect(sheet).toContain('v-if="!routesOpen" id="point-route-show-routes" variant="tonal"');
    expect(sheet).toContain('نمایش مسیرها');
    expect(sheet).toContain('شروع راهبری');
    expect(sheet).toContain('api.provisionalRoute.value');
    expect(sheet).toContain('مبدأ این مسیر بر اساس GPS تقریبی است');
    expect(sheet).toContain('v-if="!api.navigating.value" color="primary" variant="flat" :disabled="!api.point.value"');
    expect(sheet).not.toContain('v-else-if="!api.navigating.value"');
    expect(sheet).not.toContain(':disabled="!ownFix || !api.selectedRoute.value || api.loading.value"');
    expect(map).toContain('journey.gpsWarning.value');
    expect(map).toContain('class="user-map-view__navigation-status"');
    expect(map).toContain('class="user-map-view__gps-warning" role="status" aria-live="polite"');
    expect(map).toContain('در انتظار GPS برای محاسبهٔ مسیر');
    expect(map).toContain('journey.navigationPending.value');
    expect(css(map, "UserMapView.vue")).toContain('.user-map-view__journey-stack');
    expect(sheet).toContain('props.api.routesVisible.value = true');
    expect(sheet).toContain('props.api.editNavigation()');
    expect(sheet).toContain('watch(() => props.api.point.value');
    expect(sheet).toContain("emit('layout-change')");
    expect(sheet).toContain('@keydown.esc.stop.prevent="onEscape"');
    expect(map).toContain('@dismiss="focusDestinationMarker"');
    expect(map).toContain('destinationMarker?.getElement() ?? map.value?.getCanvas()');
    const styles = css(sheet, "PointRouteSheet.vue");
    for (const token of ["pointer-events: none", "pointer-events: auto", "overflow-y: auto",
      "min-height: 44px", "safe-area-inset-bottom", "(min-width: 600px) and (max-width: 1023px)",
      "position: relative; order: 3", "max-height: min(38dvh, 19rem)", "max-height: min(58dvh, 32rem)"]) {
      expect(styles).toContain(token);
    }
  });

  it("keeps removal reachable in summary, route review, and the closed active/paused bar", () => {
    const clearButton = sheet.match(/<v-btn[^>]*@click="clearDestination"[^>]*>حذف مقصد<\/v-btn>/s)?.[0];
    expect(clearButton).toBeDefined();
    expect(clearButton).not.toMatch(/v-if|v-show|:disabled/);
    expect(sheet).toContain("function clearDestination(): void { props.api.clear(); emit('dismiss'); }");
    const bar = map.slice(map.indexOf('v-if="journey.point.value && !journey.sheetOpen.value"'),
      map.indexOf('<p v-if="journey.rerouteMessage.value'));
    const barClear = bar.match(/<v-btn icon="mdi-delete-outline"[^>]*\/>/s)?.[0];
    expect(barClear).toContain('aria-label="حذف مسیر و مقصد"');
    expect(barClear).toContain('@click="clearPointRoute"');
    expect(barClear).not.toMatch(/v-if|v-show|:disabled/);
    expect(map).toContain('function clearPointRoute(): void {');
    expect(map).toContain('journey.clear()');
    const clear = route.slice(route.indexOf('function clear(): void'), route.indexOf('function select('));
    expect(clear.indexOf('routesVisible.value = false; routes.value = []')).toBeGreaterThanOrEqual(0);
    expect(clear.indexOf('routesVisible.value = false; routes.value = []')).toBeLessThan(clear.indexOf('point.value = null'));
    const styles = css(sheet, "PointRouteSheet.vue");
    expect(styles).toContain('grid-column: 1 / -1');
    expect(styles).toContain('(max-height: 430px) and (max-width: 599px)');
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  });

  it("reserves modes and alternatives for Show Routes, with direct car start and mid-trip editing", () => {
    for (const label of ["زمان تقریبی", "مسافت مسیر", "خودرو", "دوچرخه", "پیاده", "مسیر دیگر", "بازگشت", "شروع دوبارهٔ راهبری", "حذف مقصد"]) {
      expect(sheet).toContain(label);
    }
    expect(sheet).toContain('api.choose((api.index.value + 1) % api.routes.value.length)');
    expect(route).toContain('const profile = ref<TransportProfile>("car")');
    expect(route).toContain('routesVisible.value = false');
    expect(route).toContain('routesVisible.value = true');
    expect(map).toContain('journey.point.value && journey.routesVisible.value ? routeGeometries.value : []');
    expect(map).toContain('pointRouteFeatures(geometries, journey.index.value, journey.navigating.value)');
    expect(map).toContain('instance.on("click", ROUTE_ALT_LAYER, onAlternativeRouteClick)');
    expect(map).toContain('journey.choose(index)');
    expect(map).toContain('syncRouteOriginMarker()');
    expect(map).toContain('pointRouteSelectionExtent(journey.routePoints.value');
    expect(map).toContain('maxZoom: instance.getMaxZoom()');
    expect(map).toContain('if (journey.sheetOpen.value && journey.selectedRoute.value) void nextTick(fitPointRoute)');
    expect(map).toContain('journey.plannedFrom.value');
    expect(map).toContain('new markerConstructor({ element, anchor: "center" })');
    expect(map).toContain('setLngLat([origin.lon, origin.lat])');
    expect(map).not.toContain('offset: [-14, 0]');
    expect(map).toContain('pointRouteOverviewBottom(canvas, sheet)');
    expect(map).toContain('@layout-change="onPointRouteLayoutChange"');
    expect(map).toContain('if (navigationFollowEnabled.value) journey.focus()');
    expect(map).toContain('جزئیات و تغییر مسیر');
    expect(map).toContain('journey.rerouteMessage.value');
    expect(map).toContain('journey.rerouteWaitingForFix.value');
    expect(map).toContain('journey.navigationPending.value || journey.replanning.value || journey.rerouteWaitingForFix.value ? [] :');
    expect(map).toContain('watch([() => journey.navigationPending.value, () => journey.replanning.value, () => journey.rerouteWaitingForFix.value]');
    expect(map).toContain('navigationAlert.arm()');
    expect(map).toContain('navigationAlert.dispose()');
    expect(css(map, "UserMapView.vue")).toContain(".user-map-view--route-preview .user-map-view__canvas");
  });
});
