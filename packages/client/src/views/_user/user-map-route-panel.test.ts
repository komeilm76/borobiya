import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source and compiled CSS contracts only; never mount Vue SFCs in unit tests.
const sheet = readFileSync(new URL("../../components/map/PointRouteSheet.vue", import.meta.url), "utf8");
const choices = readFileSync(new URL("../../components/map/PointRouteChoicesSheet.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
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
    expect(sheet).toContain('<section v-if="api.point.value && api.sheetOpen.value && !choicesOpen"');
    expect(sheet).toContain('role="region" aria-label="برنامه‌ریزی مسیر"');
    expect(sheet).not.toContain('import { VBottomSheet }');
    expect(sheet).not.toContain('onVisible('); // No overlay model can close the newly selected point.
    expect(sheet).toContain('id="map-point-route-sheet"');
    expect(sheet).not.toContain('icon="mdi-alarm-light"');
    expect(sheet).not.toContain('openEmergencyForm');
    expect(sheet).not.toContain('useSosSheetStore');
    const dock = map.slice(map.indexOf('<v-bottom-navigation'), map.indexOf('</v-bottom-navigation>'));
    expect(dock).not.toContain('sos');
    expect(dock).not.toContain('SOS');
    expect(sheet).toContain('برای بررسی مسیرها از دکمهٔ انتخاب مسیر کنار SOS استفاده کنید.');
    const styles = css(sheet, "PointRouteSheet.vue");
    expect(styles).toContain('section.point-route-shell[data-v-route-panel] { position: fixed; z-index: 7');
    expect(styles).toContain('section.point-route-shell[data-v-route-panel] { left: 0; right: 0;\n    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: 100%;');
    expect(styles).toContain('border-radius: var(--bb-radius-card, 24px)');
    expect(styles).not.toContain('min-height: min(60dvh, 26rem)');
    expect(styles).toContain('max-height: min(52dvh, 27rem)'); // Expanded review leaves almost half the map exposed.
    expect(styles).toContain('min-height: 0; max-height: min(48dvh, 24rem)'); // Summary hugs its contents, not a viewport floor.
    expect(styles).toContain('max-height: max(7rem, calc(100dvh - 13rem'); // Short phones scroll without shrinking touch targets.
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

  it("does not trap a signed-out user on the map behind route-choice or delete overlays", () => {
    const guard = map.slice(map.indexOf('onBeforeRouteLeave(() => {'), map.indexOf('// The desktop hosts are boxless divs'));
    expect(guard).toContain('if (!auth.isAuthenticated) return;');
    expect(guard.indexOf('if (!auth.isAuthenticated) return;')).toBeLessThan(guard.indexOf('if (routeDeleteConfirmOpen.value)'));
    expect(guard.indexOf('if (!auth.isAuthenticated) return;')).toBeLessThan(guard.indexOf('if (routeChoicesOpen.value)'));
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

  it("keeps a compact planner with menu-based destination copying instead of duplicated place info", () => {
    expect(sheet).not.toContain('<v-bottom-sheet');
    expect(sheet).not.toContain('role="dialog"');
    expect(sheet).toContain('v-if="api.point.value && api.sheetOpen.value && !choicesOpen"');
    expect(sheet).toContain('id="map-point-route-sheet"');
    expect(sheet).not.toContain('point-route-info');
    expect(sheet).not.toContain('mdi-information');
    expect(sheet).toContain('id="point-route-menu-button" icon="mdi-dots-vertical"');
    expect(sheet).toContain(':aria-expanded="menuOpen"');
    expect(sheet).toContain('کپی مختصات مقصد');
    expect(sheet).toContain('کپی نشانی مقصد');
    expect(sheet).toContain('api.address.value');
    expect(sheet).toContain('api.knownPlace.value?.type');
    expect(sheet).toContain('گزینه‌های مقصد');
    expect(sheet).toContain('v-if="routesOpen" id="point-route-routes"');
    expect(sheet).toContain('v-if="!routesOpen" id="point-route-show-routes" variant="tonal"');
    expect(sheet).toContain('جزئیات و وسیلهٔ حرکت');
    expect(sheet).not.toContain('نمایش مسیرها');
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
      "width: min(30rem, calc(100vw - 7.5rem))", "max-height: min(52dvh, 27rem)"]) {
      expect(styles).toContain(token);
    }
  });

  it("copies only resolved destination details, with manual fallback and stale-response guards", () => {
    const menu = sheet.slice(sheet.indexOf('<v-menu'), sheet.indexOf('</v-menu>'));
    expect(menu).toContain('role="menu" aria-label="گزینه‌های مقصد"');
    expect(menu).toContain('role="menuitem"');
    expect(menu).toContain(':disabled="!api.address.value?.trim()"'); // No placeholder text in the clipboard.
    expect(menu).toContain('v-if="reverse.failed.value && !api.address.value"');
    expect(menu).toContain('reverse.load()');
    expect(menu).toContain('id="point-route-copy-fallback"');
    expect(menu).toContain('readonly dir="auto"');
    expect(sheet).toContain('destinationCopyText(kind, point, props.api.address.value)');
    expect(sheet).toContain('clipboard?.writeText?.bind(clipboard)');
    expect(sheet).toContain('current !== copyGeneration');
    expect(sheet).toContain('props.api.point.value !== point');
    expect(sheet).toContain('copyToastOpen.value = true');
    expect(sheet).toContain('if (menuOpen.value) { menuOpen.value = false;');
    expect(sheet).toContain('else dismiss();'); // Escape dismisses review, not the destination.
    expect(map).toContain("document.getElementById('point-route-menu-button')?.focus()");
    const styles = css(sheet, "PointRouteSheet.vue");
    expect(styles).toContain('.point-route__copy-menu');
    expect(styles).toContain('max-height: min(60dvh, 17rem)');
    expect(styles).toContain('min-height: 44px');
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
    const header = sheet.slice(sheet.indexOf('class="point-route__header"'), sheet.indexOf('class="point-route__endpoints"'));
    const footer = sheet.slice(sheet.indexOf('class="point-route__actions"'), sheet.indexOf('</v-card>'));
    const clearButton = header.match(/<v-btn id="point-route-remove-button"[^>]*@click="requestDelete"[^>]*\/>/s)?.[0];
    expect(clearButton).toContain('aria-label="حذف مقصد و مسیر"');
    expect(clearButton).not.toMatch(/v-if|v-show|:disabled/);
    expect(footer).not.toContain('requestDelete');
    expect(footer).not.toContain('حذف مقصد');
    expect(sheet).toContain('function requestDelete(): void { menuOpen.value = false; confirmDeleteOpen.value = true; }');
    expect(sheet).not.toContain('function clearDestination()');
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
    expect(styles).not.toContain('.point-route__clear');
    expect(styles).toContain('(max-height: 430px) and (max-width: 599px)');
    expect(styles).toContain('grid-template-columns: repeat(2, minmax(0, 1fr))');
  });

  it("confirms destructive route removal without closing the planner on cancel or Back", () => {
    const dialog = sheet.slice(sheet.indexOf('<v-dialog v-model="confirmDeleteOpen"'), sheet.indexOf('</v-dialog>'));
    expect(dialog).toContain('aria-labelledby="point-route-delete-title" aria-describedby="point-route-delete-description"');
    expect(dialog).toContain('id="point-route-cancel-remove"');
    expect(dialog).toContain('@click="cancelDelete">انصراف');
    expect(dialog).toContain('color="error" variant="flat" @click="confirmDelete"');
    expect(dialog).toContain('راهبری جاری متوقف می‌شود');
    expect(dialog).toContain('api.title.value');
    expect(dialog).not.toContain('persistent');
    expect(sheet).toContain('role="region" aria-label="برنامه‌ریزی مسیر"');
    expect(sheet).not.toContain('retain-focus'); // Only the deletion confirmation is modal.
    expect(sheet).not.toContain('aria-modal="true"');
    expect(dialog).not.toContain('retain-focus="false"');
    const request = sheet.slice(sheet.indexOf('function requestDelete()'), sheet.indexOf('function cancelDelete()'));
    expect(request).not.toContain('props.api.clear()');
    const cancel = sheet.slice(sheet.indexOf('function cancelDelete()'), sheet.indexOf('function focusCancelRemoval()'));
    expect(cancel).not.toContain('props.api.clear()');
    const confirm = sheet.slice(sheet.indexOf('function confirmDelete()'), sheet.indexOf('function onEscape()'));
    expect(confirm).toContain('if (!confirmDeleteOpen.value || !props.api.point.value) return;');
    expect(confirm).toContain("props.api.clear(); emit('dismiss');");
    expect(sheet).toContain('if (!open) confirmDeleteOpen.value = false;');
    expect(sheet).toContain('watch(() => props.api.point.value');
    expect(sheet).toContain('document.getElementById("point-route-remove-button")?.focus()');
    expect(map).toContain('v-model:confirm-delete-open="routeDeleteConfirmOpen"');
    expect(map).toContain('if (routeDeleteConfirmOpen.value) { routeDeleteConfirmOpen.value = false; return false; }');
    expect(map.indexOf('if (routeDeleteConfirmOpen.value) { routeDeleteConfirmOpen.value = false; return false; }'))
      .toBeLessThan(map.indexOf('const position: unknown = window.history.state?.position;', map.indexOf('onBeforeRouteLeave(() => {')));
    const styles = css(sheet, "PointRouteSheet.vue");
    expect(styles).toContain('.point-route__delete-confirm');
    expect(styles).toContain('min-height: 44px');
    expect(styles).toContain('safe-area-inset-bottom');
  });

  it("locates the route launcher in SOS's viewport context in idle and guidance states", () => {
    // Keep the target and its teleported child stable while point selection and
    // reverse geocoding trigger back-to-back render updates.
    expect(app).toContain('<span v-show="isMapRoute" id="map-route-choices-action-anchor" />');
    expect(app).not.toContain('<span v-if="isMapRoute" id="map-route-choices-action-anchor" />');
    expect(app.indexOf('id="map-route-choices-action-anchor"')).toBeLessThan(app.indexOf('<v-main class="app-main'));
    expect(app).toContain('<SosTriggerButton v-if="showSosButton"');
    expect(map).toContain('<Teleport defer to="#map-route-choices-action-anchor">');
    expect(map).toContain('<v-btn v-show="!!journey.point.value" id="map-route-choices-toggle"');
    expect(map).not.toContain('<v-btn v-if="journey.point.value" id="map-route-choices-toggle"');
    const { descriptor } = parse(map, { filename: "UserMapView.vue" });
    const rendered = compileTemplate({
      source: descriptor.template!.content, filename: "UserMapView.vue", id: "route-launcher",
    });
    expect(rendered.errors).toEqual([]);
    const teleport = rendered.code.slice(rendered.code.indexOf('_createBlock(_Teleport'), rendered.code.indexOf('Keep location a map feature'));
    expect(teleport).toContain('_withDirectives(_createVNode(_component_v_btn');
    expect(teleport).toContain('[_vShow, !!_ctx.journey.point.value]');
    expect(teleport).not.toContain('_ctx.journey.point.value)\n        ?'); // No conditional component vnode in the Teleport block.
    const routeSelector = '.app-shell--map .user-map-view__route-choices-toggle.user-map-view__route-choices-toggle';
    const base = shell.slice(shell.indexOf(`${routeSelector} {`), shell.indexOf('}', shell.indexOf(`${routeSelector} {`)));
    expect(base).toContain('position: fixed;');
    expect(base).toContain('z-index: 950;'); // SOS is 950; map is isolated.
    expect(base).toContain('inset-inline-start: calc(1.25rem + 3.5rem)');
    expect(base).toContain('inset-block-end: max(1.25rem, env(safe-area-inset-bottom, 0px))');
    const phone = shell.slice(shell.indexOf('@media (max-width: 599px) {', shell.indexOf(`${routeSelector} {`)));
    const phoneSos = phone.slice(phone.indexOf('.app-shell--map .sos-fab.sos-fab {'), phone.indexOf('}', phone.indexOf('.app-shell--map .sos-fab.sos-fab {')));
    const phoneRoute = phone.slice(phone.indexOf(`${routeSelector} {`), phone.indexOf('}', phone.indexOf(`${routeSelector} {`)));
    expect(phoneSos).toContain('inset-inline-start: calc(0.75rem + env(safe-area-inset-right, 0px))');
    expect(phoneRoute).toContain('inset-inline-start: calc(0.75rem + 3.5rem + env(safe-area-inset-right, 0px))');
    expect(phoneRoute).toContain('inset-block-end: calc(5.5rem + env(safe-area-inset-bottom, 0px))');
    expect(phoneSos).toContain('inset-block-end: calc(5.5rem + env(safe-area-inset-bottom, 0px))');
    const navigatingSos = phone.slice(phone.indexOf('.app-shell--map:has(.user-map-view--navigating) .sos-fab.sos-fab {'));
    const navigatingRoute = phone.slice(phone.indexOf(`.app-shell--map:has(.user-map-view--navigating) .user-map-view__route-choices-toggle`));
    const offset = 'inset-block-end: calc(var(--bb-map-navigation-sheet-height, 15rem) + 0.5rem)';
    expect(navigatingSos).toContain(offset);
    expect(navigatingRoute).toContain(offset);
    expect(map).not.toContain('.user-map-view--navigating .user-map-view__route-choices-toggle,'); // Teleported element is not a map descendant.
  });

  it("keeps SOS and route choices reachable above whichever phone route sheet is open", () => {
    expect(map).toContain("'user-map-view--route-preview': journey.sheetOpen.value && !!journey.point.value");
    expect(map).toContain('function measurePointSheet(): void {');
    expect(map).toContain('routeChoicesOpen.value ? "map-point-route-choices-sheet" : "map-point-route-sheet"');
    expect(map).toContain('new ResizeObserver(measurePointSheet)');
    expect(map).toContain('document.documentElement.style.removeProperty("--bb-map-point-sheet-height")');
    expect(map).toContain('function onPointRouteLayoutChange(): void {\n  measurePointSheet();');
    expect(map).toContain('watch(routeChoicesOpen, async () => { await nextTick(); fitPointRoute(); });');
    const phone = shell.slice(shell.indexOf('@media (max-width: 599px) {', shell.indexOf('/* Both actions are App.vue siblings')));
    const rule = '.app-shell--map:has(.user-map-view--route-preview)';
    const bottom = 'inset-block-end: calc(var(--bb-map-point-sheet-height, 48dvh) + 6rem + env(safe-area-inset-bottom, 0px))';
    for (const selector of ['.sos-fab.sos-fab', '.user-map-view__route-choices-toggle.user-map-view__route-choices-toggle']) {
      const start = phone.indexOf(`${rule} ${selector} {`);
      expect(start).toBeGreaterThan(0);
      expect(phone.slice(start, phone.indexOf('}', start))).toContain(bottom);
    }
    const rail = css(map, "UserMapView.vue");
    expect(rail).toContain('.user-map-view--route-preview');
    expect(rail).toContain('var(--bb-map-point-sheet-height, 48dvh) + 6rem + env(safe-area-inset-bottom, 0px)');
    expect(rail).toContain('13rem + env(safe-area-inset-right, 0px)');
    // Five 48px actions with >=4px gaps fit a 320px phone with 20px insets.
    const lastActionLeft = 320 - (12 + 13 * 16 + 20) - 48;
    expect(lastActionLeft).toBeGreaterThanOrEqual(20);
    expect(sheet).toContain('role="region"'); // No overlay focus trap: the map and actions remain reachable.
  });

  it("keeps the Search/History/Companions dock clickable below a selected point and its route chooser", () => {
    expect(map).toContain('v-if="isPhone && !journey.navigating.value" class="user-map-view__dock-frame"');
    expect(map).toContain('@update:model-value="selectTool"');
    expect(map).toContain('modelValue: activeTool.value === "search"');
    expect(map).toContain('modelValue: activeTool.value === "history"');
    expect(map).toContain('modelValue: activeTool.value === "live"');
    expect(map).toContain('@create-share="shareOpen = true"');
    expect(map).toContain('<ShareDialog v-model="shareOpen" :fullscreen="isPhone"');
    const planner = css(sheet, "PointRouteSheet.vue");
    const chooser = css(choices, "PointRouteChoicesSheet.vue");
    const dock = css(map, "UserMapView.vue");
    for (const panel of [planner, chooser]) {
      expect(panel).toContain('bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: 100%;');
      expect(panel).toContain('pointer-events: auto');
    }
    expect(dock).toContain('inset-block-end: calc(0.75rem + env(safe-area-inset-bottom, 0px))');
    expect(dock).toContain('height: 4rem');
    // Dock top is 4.75rem above the viewport bottom; panels end at 5.5rem.
    expect(5.5 - (0.75 + 4)).toBeGreaterThanOrEqual(0.5);
    expect(planner).toContain('overflow-y: auto'); // Landscape keeps full-size buttons scrollable.
  });

  it("centers a held destination without recentering an invalid or out-of-bounds selection", () => {
    const hold = map.slice(map.indexOf('function attachHold('), map.indexOf('const pointer = (event: PointerEvent)', map.indexOf('function attachHold(')));
    expect(hold).toContain('if (!auth.user?.id || journey.navigating.value || map.value !== instance) return;');
    expect(hold).toContain('if (bounds && !bounds.contains(location)) return;');
    expect(hold.indexOf('journey.select({ lat: location.lat, lon: location.lng })'))
      .toBeLessThan(hold.indexOf('instance.easeTo({ center: [location.lng, location.lat], duration: 450 }'));
    expect(hold).toContain('{ placeSearchSelection: true }');
    expect(hold).not.toContain('zoom:'); // Preserve user zoom on hold.
  });

  it("moves alternative selection into a separate accessible sheet and returns to the planner", () => {
    expect(map).toContain('id="map-route-choices-toggle" class="user-map-view__route-choices-toggle"');
    expect(map).toContain('aria-controls="map-point-route-choices-sheet"');
    expect(map).not.toContain('aria-controls="map-point-route-choices-sheet" aria-haspopup="dialog"');
    expect(map).toContain('ویرایش و انتخاب مسیر؛ راهبری متوقف می‌شود');
    expect(map).toContain('if (routeChoicesOpen.value) { closeRouteChoices(); return; }');
    expect(map).toContain('if (journey.navigating.value) journey.editNavigation();');
    expect(map).toContain('if (routeChoicesOpen.value) { closeRouteChoices(); return false; }');
    expect(map).toContain(':choices-open="routeChoicesOpen"');
    expect(sheet).not.toContain('onVisible('); // A pending point hold cannot be dismissed by a dialog lifecycle event.
    expect(map).toContain('@choose="selectPointRoute" @confirm="confirmPointRoute" @close="closeRouteChoices"');
    const preview = map.slice(map.indexOf('function selectPointRoute('), map.indexOf('function confirmPointRoute('));
    expect(preview).toContain('journey.choose(index)');
    expect(preview).not.toContain('closeRouteChoices()'); // A card/map tap previews without closing.
    expect(map).toContain('routeChoiceSnapshot = { routes: journey.routes.value, index: journey.index.value }');
    expect(map).toContain('if (routeChoicesOpen.value) routeChoiceSnapshot = { routes, index: journey.index.value }');
    expect(map).toContain('previousRouteIndex(routeChoiceSnapshot, journey.routes.value)');
    expect(map).toContain('if (previous !== null) journey.choose(previous)');
    expect(map).toContain('routeChoiceSnapshot = null; // Accept the preview; close without restoring the old index.\n  closeRouteChoices();');
    const mapLine = map.slice(map.indexOf('function onAlternativeRouteClick('), map.indexOf('function attachHold('));
    expect(mapLine).toContain('if (!routeChoicesOpen.value) openRouteChoices();\n  selectPointRoute(index);');
    expect(mapLine).not.toContain('journey.choose(index)');
    expect(map).toContain("document.getElementById('map-point-route-sheet')?.focus({ preventScroll: true })");
    expect(map).toContain('routeChoicesOpen.value = false;\n  routeChoiceSnapshot = null;\n  journey.clear();');
    expect(map).toContain('watch(routeChoicesOpen, async () => { await nextTick(); fitPointRoute(); });');
    expect(map).toContain('routeChoicesOpen.value ? "map-point-route-choices-sheet" : "map-point-route-sheet"');
    expect(choices).toContain('<section v-if="open && api.point.value" class="point-route-choices-shell"');
    expect(choices).toContain('role="region" aria-label="انتخاب مسیر"');
    expect(choices).not.toContain('VBottomSheet');
    const choiceStyles = css(choices, "PointRouteChoicesSheet.vue");
    expect(choiceStyles).toContain('section.point-route-choices-shell[data-v-route-panel] { left: 0; right: 0;\n    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: 100%;');
    expect(choiceStyles).toContain('width: min(30rem, calc(100vw - 7.5rem))');
    expect(choices).toContain("@keydown.esc.stop.prevent=\"emit('close')\"");
    expect(choices).toContain('v-for="(route, index) in api.routes.value"');
    expect(choices).toContain(':aria-pressed="index === api.index.value"');
    expect(choices).toContain("formatRouteDuration(route.duration_s)");
    expect(choices).toContain("formatRouteDistance(route.distance_m)");
    expect(choices).toContain("@click=\"emit('choose', index)\"");
    expect(choices).toContain("@click=\"emit('confirm')\">تأیید مسیر انتخابی");
    expect(choices).toContain('بازگشت بدون تغییر');
    expect(choices).toContain(':disabled="!api.selectedRoute.value || api.loading.value"');
    expect(choices).toContain('api.loading.value');
    expect(choices).toContain('api.error.value');
    expect(choices).toContain('safe-area-inset-bottom');
    expect(css(choices, "PointRouteChoicesSheet.vue")).toContain('.point-route-choices__card[aria-pressed="true"]');
    expect(shell).toContain('.app-shell--map .user-map-view__route-choices-toggle.user-map-view__route-choices-toggle');
  });

  it("reserves mode and trip details for the planner, with alternatives in the separate sheet", () => {
    for (const label of ["زمان تقریبی", "مسافت مسیر", "خودرو", "دوچرخه", "پیاده", "بازگشت", "شروع دوبارهٔ راهبری", "حذف مقصد"]) {
      expect(sheet).toContain(label);
    }
    expect(sheet).not.toContain('api.choose((api.index.value + 1) % api.routes.value.length)');
    const review = sheet.slice(sheet.indexOf('id="point-route-routes"'), sheet.indexOf('class="point-route__actions"'));
    expect(review.indexOf('class="point-route__alternative"')).toBeLessThan(review.indexOf('class="point-route__metrics"'));
    expect(choices).toContain('v-for="(route, index) in api.routes.value"');
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
