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
  it("keeps desktop route review nonmodal and gives phones a content-sized map-visible bottom sheet", () => {
    expect(map).not.toContain('برای انتخاب مقصد، انگشت یا کلیک چپ را روی نقشه نگه دارید.');
    expect(sheet).toContain("isPhone ? VBottomSheet : 'section'");
    expect(sheet).toContain('import { VBottomSheet } from "vuetify/components"');
    expect(sheet).toContain(':model-value="isPhone ? api.sheetOpen.value : undefined"');
    expect(sheet).toContain('@update:model-value="onVisible"');
    expect(sheet).toContain('@after-enter="emit(\'layout-change\')"');
    expect(sheet).toContain('id="map-point-route-sheet"');
    expect(sheet).not.toContain(':scrollable="isPhone"'); // Vuetify scrollable sets flex: 1 1 100% on the overlay.
    expect(sheet).toContain(':scrim="isPhone ? false : undefined"'); // The map remains readable while reviewing routes.
    expect(sheet).toContain(':persistent="isPhone"'); // Panning/selecting a line cannot dismiss the route controls.
    expect(sheet).toContain('function onVisible(visible: boolean)');
    expect(sheet).not.toContain('icon="mdi-alarm-light"');
    expect(sheet).not.toContain('openEmergencyForm');
    expect(sheet).not.toContain('useSosSheetStore');
    const dock = map.slice(map.indexOf('<v-bottom-navigation'), map.indexOf('</v-bottom-navigation>'));
    expect(dock).not.toContain('sos');
    expect(dock).not.toContain('SOS');
    expect(sheet).toContain("'با «مسیر دیگر» گزینه‌ها را عوض کنید.'");
    const styles = css(sheet, "PointRouteSheet.vue");
    expect(styles).toContain('.point-route-shell.v-bottom-sheet > .v-overlay__content');
    expect(styles).toContain('width: 100vw');
    expect(styles).not.toContain('min-height: min(60dvh, 26rem)');
    expect(styles).toContain('height: auto !important'); // Beat Vuetify's scrollable dialog flex sizing when teleported.
    expect(styles).toContain('flex: 0 1 auto !important');
    expect(styles).toContain('max-height: min(52dvh, 27rem)'); // Expanded review leaves almost half the map exposed.
    expect(styles).toContain('min-height: 0; max-height: min(48dvh, 24rem)'); // Summary hugs its contents, not a viewport floor.
    expect(styles).toContain('max-height: clamp(14rem, 60dvh, 17rem)'); // Short phones keep fixed controls reachable.
    expect(styles).toContain('overflow-y: auto');
    expect(styles).toContain('safe-area-inset-bottom');
    expect(styles).toContain('(max-height: 430px) and (max-width: 599px)');
  });

  it("puts active phone guidance in a nonmodal bottom sheet with one shared search form", () => {
    const styles = css(map, "UserMapView.vue");
    expect(map).toContain("isPhone && journey.navigating.value ? VBottomSheet : 'div'");
    expect(map).toContain('v-if="isPhone && !journey.navigating.value" class="user-map-view__dock-frame"');
    expect(map).toContain('v-if="!isPhone || !journey.navigating.value" class="user-map-view__search-dialog"');
    expect(map).toContain('v-if="navigationSearchOpen" id="map-navigation-search"');
    expect(map).toContain('aria-controls="map-navigation-search" :aria-expanded="navigationSearchOpen"');
    expect(map.match(/<PlaceSearchPanel :api="placeSearch"/g)).toHaveLength(2); // Exclusive mount paths, one composable.
    expect(map).toContain('aria-label="جست‌وجوی مکان در مسیر"');
    expect(map).toContain('navigationSearchOpen.value = false;\n  removeSelectedCompanion();');
    expect(map).toContain('if (navigationSearchOpen.value) closeNavigationSearch();');
    expect(map).toContain('else if (navigationSearchOpen.value) closeNavigationSearch();'); // First Back closes search.
    expect(map).toContain('@keydown.esc.stop="closeNavigationSearch"');
    expect(map).toContain(':scrim="false" :persistent="true" :close-on-back="false" :retain-focus="false"');
    expect(map).toContain(":scroll-strategy=\"isPhone && journey.navigating.value ? 'none' : undefined\"");
    expect(map).toContain(":aria-modal=\"isPhone && journey.navigating.value ? 'false' : undefined\"");
    expect(map).toContain('navigationFollowEnabled.value = false; // Keep the result overview');
    expect(map).toContain('if (sheet) padding.bottom =');
    expect(map).toContain("const navigationSheet = document.getElementById('map-navigation-sheet')");
    expect(map).toContain('observer = new ResizeObserver(update)');
    expect(styles).toContain('.user-map-view__journey-stack.v-bottom-sheet > .v-overlay__content');
    expect(styles).toContain('max-height: min(72dvh, 36rem)');
    expect(styles).toContain('max-height: 32dvh');
    expect(styles).toContain('safe-area-inset-bottom');
    expect(styles).toContain('var(--bb-map-navigation-sheet-height, 15rem)');
    expect(map).toContain('aria-label="حد مجاز نامشخص"'); // Never invent a legal limit.
  });

  it("shows POI pins for an explicit search overview during guidance and hides them on follow", () => {
    expect(map).toContain('showAllResultsOnMap.value && (!journey.navigating.value || showNavigationSearchResults.value)');
    expect(map).toContain('showNavigationSearchResults.value = true;');
    expect(map).toContain('const excludedId = journey.navigating.value && showNavigationSearchResults.value && !isSelectedSearchDestination.value');
    expect(map).toContain('? null : placeSearch.selectedPlaceId.value;');
    expect(map).toContain('function resumePointFollowing(): void {\n  if (!journey.navigating.value) return;\n  showNavigationSearchResults.value = false;\n  syncResultMarkers();');
    expect(map).toContain('watch(() => journey.navigating.value, (active) => {\n  navigationSearchOpen.value = false;\n  showNavigationSearchResults.value = false;');
  });

  it("acknowledges accurate arrival once and removes guidance instead of opening the route planner", () => {
    expect(route).toContain('if (fix.accuracy <= 35 && directDistance <= 25)');
    expect(route).toContain('routesVisible.value = false; sheetOpen.value = false; arrived.value = true; return;');
    expect(map).toContain('watch(() => journey.arrived.value, (arrived) => {');
    expect(map).toContain('arrivalDestination.value = journey.title.value;');
    expect(map).toContain('journey.clear();');
    expect(map).toContain('navigationAlert.playArrival();');
    expect(map).toContain('}, { flush: "post" });');
    expect(map).toContain('aria-labelledby="map-arrival-title" aria-describedby="map-arrival-message"');
    expect(map).toContain('role="alert"');
    expect(map).toContain('متوجه شدم');
    expect(map).toContain('if (arrivalDialogOpen.value) closeArrivalDialog();'); // First phone Back.
    expect(map).toContain('arrivalDialogOpen.value = false; arrivalDestination.value = null;'); // Sign-out.
    expect(sheet).not.toContain('api.arrived.value'); // Arrival is no longer route editing.
  });

  it("begins as a compact planner with a separate place-info toggle", () => {
    expect(sheet).not.toContain('<v-bottom-sheet');
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
    expect(sheet).not.toContain('مبدأ این مسیر بر اساس GPS تقریبی است');
    expect(sheet).toContain('api.provisionalRoute.value ? "مبدأ تقریبی" : "مبدأ"');
    expect(sheet).toContain('class="point-route__endpoints"');
    expect(sheet).toContain('class="point-route__endpoint-address"');
    expect(sheet).toContain('originAddress');
    expect(sheet).toContain('destinationAddress');
    expect(sheet).toContain('api.plannedFrom.value');
    expect(sheet).toContain('originReverse.address.value');
    expect(sheet).toContain('api.address.value');
    expect(sheet).toContain('نشانی در دسترس نیست');
    expect(map).toContain('const originReverse = useReversePlace()');
    expect(map).toContain('originReverse.select(origin.lat, origin.lon)');
    expect(map).toContain('originReverse.close()');
    expect(map).toContain(':origin-reverse="originReverse"');
    const endpoints = css(sheet, "PointRouteSheet.vue");
    expect(endpoints).toMatch(/\.point-route__endpoints[^{}]*\{[^}]*font-size: \.8rem/);
    expect(endpoints).toMatch(/\.point-route__endpoint-address[^{}]*\{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/);
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
      "position: relative; order: 3", "max-height: min(52dvh, 27rem)", "height: auto !important"]) {
      expect(styles).toContain(token);
    }
  });

  it("keeps only route facts and short pending state in the phone summary, not how-to paragraphs", () => {
    expect(sheet).not.toContain('برای راهبری، «شروع راهبری» را بزنید. بدون موقعیت دقیق، هشدار GPS نمایش داده می‌شود و راهبری زنده منتظر می‌ماند.');
    expect(sheet).not.toContain('برای تغییر مسیر «ویرایش مسیرها» را بزنید');
    expect(sheet).not.toContain('برای انتخاب وسیلهٔ حرکت یا دیدن مسیرهای دیگر');
    expect(sheet).toContain('class="point-route__summary"');
    expect(sheet).toContain('api.selectedRoute.value');
    expect(sheet).toContain('در انتظار مسیر…');
    expect(sheet).toContain('api.durationLabel.value');
    expect(sheet).toContain('api.distanceLabel.value');
  });

  it("keeps speed and remaining-time telemetry inside active guidance without inventing a legal speed limit", () => {
    const bar = map.slice(map.indexOf('class="user-map-view__journey-bar"'),
      map.indexOf('class="user-map-view__navigation-status"'));
    expect(bar).toContain('v-if="journey.navigating.value" class="user-map-view__telemetry"');
    expect(bar).toContain('سرعت فعلی');
    expect(bar).toContain('حد مجاز');
    expect(bar).toContain('زمان باقی‌مانده');
    expect(bar).toContain('دادهٔ معتبر موجود نیست');
    expect(map).toContain('currentSpeedKmh(');
    expect(map).toContain('estimateRemainingRouteSeconds(');
    expect(map).toContain('own.lastFixAt.value');
    expect(map).toContain('telemetryNow.value - own.lastFixAt.value > 15_000');
    expect(map).toContain('onCleanup(() => clearInterval(ticker))');
    expect(map).toContain('journey.navigationPending.value');
    expect(map).toContain('journey.replanning.value');
    expect(map).toContain('journey.rerouteWaitingForFix.value');
    expect(map).toContain('const bar = document.querySelector(\'.user-map-view__journey-bar\')?.getBoundingClientRect()');
    const styles = css(map, "UserMapView.vue");
    expect(styles).toContain('.user-map-view__telemetry');
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
  });

  it("gives the active journey label its own full-width row without squeezing its controls", () => {
    const bar = map.slice(map.indexOf('class="user-map-view__journey-bar"'),
      map.indexOf('class="user-map-view__navigation-status"'));
    expect(bar).toContain('class="user-map-view__journey-label"');
    expect(bar).toContain('class="user-map-view__journey-actions"');
    expect(bar).toContain('aria-label="کنترل‌های مسیر"');
    const styles = css(map, "UserMapView.vue");
    expect(styles).toMatch(/\.user-map-view__journey-bar[^{}]*\{[^}]*display: grid/);
    expect(styles).toMatch(/\.user-map-view__journey-actions[^{}]*\{[^}]*grid-column: 1 \/ -1/);
    expect(styles).toMatch(/\.user-map-view__journey-label[^{}]*\{[^}]*white-space: nowrap[^}]*text-overflow: ellipsis/);
    expect(styles).not.toContain('.user-map-view__journey-bar > span');
    expect(styles).not.toContain('.user-map-view__journey-bar { flex-wrap: wrap; }');
    expect(styles).toMatch(/\.user-map-view__journey-actions[^}]*flex-wrap: wrap/);
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
    const review = sheet.slice(sheet.indexOf('id="point-route-routes"'), sheet.indexOf('class="point-route__actions"'));
    expect(review.indexOf('class="point-route__alternative"')).toBeLessThan(review.indexOf('class="point-route__metrics"'));
    expect(css(sheet, "PointRouteSheet.vue")).toMatch(/\.point-route__alternative\[data-v-route-panel\] \.v-btn \{[^}]*min-height: 44px/);
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
