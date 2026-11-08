import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";
import { transportOptions, transportLabel } from "../../map/transport-options";

// Source and compiled CSS contracts only; never mount Vue SFCs in unit tests.
const sheet = readFileSync(new URL("../../components/map/PointRouteSheet.vue", import.meta.url), "utf8");
const choices = readFileSync(new URL("../../components/map/PointRouteChoicesSheet.vue", import.meta.url), "utf8");
const transport = readFileSync(new URL("../../components/map/PointTransportChoicesSheet.vue", import.meta.url), "utf8");
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
  it("uses one nonmodal responsive sheet for point and travel, with full-size controls", () => {
    expect(sheet).toContain('<section v-if="api.point.value && api.sheetOpen.value && !choicesOpen"');
    expect(sheet).toContain('role="region" aria-label="مقصد و برنامه‌ریزی سفر"');
    expect(sheet).not.toContain('<v-bottom-sheet');
    expect(sheet).toContain('id="map-point-route-sheet"');
    expect(sheet).toContain('class="point-route__endpoints"');
    expect(sheet).toContain('originAddress');
    expect(sheet).toContain('destinationAddress');
    expect(sheet).toContain('props.api.plannedFrom.value ?? props.ownPosition');
    expect(sheet).toContain('originReverse.address.value');
    expect(sheet).toContain('نشانی در دسترس نیست');
    expect(sheet).toContain("step === 'point'");
    expect(sheet).toContain('step.value = "plan"');
    expect(sheet).toContain('step.value = "point"');
    expect(sheet).toContain('props.api.routesVisible.value = false');
    expect(sheet).toContain('props.api.routesVisible.value = true');
    expect(sheet).toContain('ارسال</v-btn>');
    expect(sheet).toContain('سفر</v-btn>');
    expect(sheet).toContain('انتخاب وسیلهٔ دیگر');
    expect(sheet).toContain('انتخاب مسیر دیگر');
    expect(sheet).toContain('مسافت</span>');
    expect(sheet).toContain('زمان تقریبی سفر');
    expect(sheet).toContain('شروع سفر');
    expect(sheet).toContain('انصراف');
    expect(sheet).not.toContain('جزئیات و وسیلهٔ حرکت');
    expect(sheet).not.toContain('زمان و مسافت، برآورد آخرین موقعیت GPS هستند و ترافیک زنده یا رسیدن قطعی را نشان نمی‌دهند.');
    expect(map).toContain('@search="openRouteSearch" @choose-route="openRouteChoices"');
    const styles = css(sheet, "PointRouteSheet.vue");
    expect(styles).toContain('section.point-route-shell[data-v-route-panel] { position: fixed; z-index: 7');
    expect(styles).toContain('bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: auto');
    expect(styles).toContain('max-height: min(52dvh, 27rem)');
    expect(styles).toContain('overflow-y: auto');
    expect(styles).toContain('min-height: 44px');
  });

  it("shares only the selected destination through a user gesture with safe fallback", () => {
    expect(sheet).toContain('import { useShare } from "@vueuse/core"');
    expect(sheet).toContain('const { isSupported, share } = useShare()');
    expect(sheet).toContain('selectedPointShare(point)');
    expect(sheet).toContain('const attempt = shareFence.begin();');
    expect(sheet).toContain('if (attempt === null) return;');
    expect(sheet).toContain(':disabled="sharePending"');
    expect(sheet).toContain('shareFence.reset();');
    expect(sheet).toContain('watch(() => props.choicesOpen, (open) => { if (open) resetShare(); }, { flush: "sync" });');
    expect(sheet).toContain('shareFence.isCurrent(attempt)');
    expect(sheet).toContain('shareFence.finish(attempt);');
    expect(sheet).toContain('if (isSupported.value)');
    expect(sheet).toContain('await share(payload)');
    expect(sheet).toContain('name === "AbortError"');
    expect(sheet).toContain('props.api.point.value !== point');
    expect(sheet).toContain('navigator.clipboard.writeText(payload.url)');
    expect(sheet).toContain('shareFallback.value = payload.url');
    expect(sheet).toContain('readonly dir="ltr"');
  });

  it("keeps the guidance card identical across breakpoints with search and two explicit exits", () => {
    const bar = map.slice(map.indexOf('class="user-map-view__journey-bar"'), map.indexOf('class="user-map-view__navigation-status"'));
    expect(map).toContain('v-if="journey.point.value && journey.navigating.value && !journey.sheetOpen.value"');
    expect(map).not.toContain('VBottomSheet');
    expect(bar).toContain('id="map-navigation-search-toggle" icon="mdi-magnify"');
    expect(bar).toContain('سرعت فعلی');
    expect(bar).toContain('حد مجاز');
    expect(bar).toContain('زمان باقی‌مانده');
    expect(bar).toContain('aria-label="حد مجاز نامشخص"'); // No legal limit from OSRM.
    expect(bar).toContain('بازگشت به برنامهٔ سفر');
    expect(bar).toContain('توقف و پایان سفر');
    expect(map).toContain('journey.editNavigation(); // Pauses guidance');
    expect(map).toContain('journey.clear(); // Also cancels');
    expect(map).toContain('navigationAlert.arm()');
    expect(map).toContain('currentSpeedKmh(');
    expect(map).toContain('estimateRemainingRouteSeconds(');
    const styles = css(map, "UserMapView.vue");
    expect(styles).toContain('.user-map-view__journey-stack[data-v-route-panel] { position: fixed;');
    expect(styles).toContain('max-height: min(72dvh, 36rem)');
    expect(styles).toContain('width: min(36rem, calc(100vw - 1.5rem))'); // Desktop card stays within viewport.
    expect(styles).toContain('width: min(30rem, calc(100vw - 7.5rem'); // Tablet SOS rail stays reachable.
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))');
    expect(styles).toContain('safe-area-inset-bottom');
  });

  it("preserves search, Back, GPS warnings and arrival while changing steps", () => {
    expect(sheet).toContain('icon="mdi-magnify" variant="text" aria-label="جست‌وجوی مکان"');
    expect(map).toContain('function openRouteSearch(): void { void selectTool("search"); }');
    expect(map).toContain('aria-label="جست‌وجوی مکان در مسیر"');
    expect(map.match(/<PlaceSearchPanel :api="placeSearch"/g)).toHaveLength(2);
    expect(map).toContain('if (navigationSearchOpen.value) closeNavigationSearch();');
    expect(map).toContain('journey.gpsWarning.value');
    expect(map).toContain('navigationAlert.playArrival()');
    expect(sheet).toContain('@keydown.esc.stop.prevent="onEscape"');
    expect(sheet).toContain('else if (step.value === "plan") backToPoint()');
    expect(sheet).toContain('defineExpose({ returnToPoint })');
    expect(map).toContain('if (!pointSheetRef.value?.returnToPoint()) journey.sheetOpen.value = false;');
    const back = map.slice(map.indexOf('onBeforeRouteLeave(() => {'), map.indexOf('// The desktop hosts are boxless divs'));
    expect(back.indexOf('else if (activeTool.value) closeTool()')).toBeLessThan(back.indexOf('else if (journey.sheetOpen.value)'));
  });

  it("keeps destructive destination removal behind a confirmation modal", () => {
    const dialog = sheet.slice(sheet.indexOf('<v-dialog v-model="confirmDeleteOpen"'), sheet.indexOf('</v-dialog>'));
    expect(sheet).toContain('id="point-route-remove-button"');
    expect(dialog).toContain('aria-labelledby="point-route-delete-title"');
    expect(dialog).toContain('id="point-route-cancel-remove"');
    expect(dialog).toContain('راهبری جاری متوقف می‌شود');
    const request = sheet.slice(sheet.indexOf('function requestDelete()'), sheet.indexOf('function confirmDelete()'));
    expect(request).not.toContain('props.api.clear()');
    expect(sheet).toContain('if (!confirmDeleteOpen.value || !props.api.point.value) return;');
    expect(sheet).toContain('props.api.clear(); emit("dismiss")');
    expect(map).toContain('if (routeDeleteConfirmOpen.value) { routeDeleteConfirmOpen.value = false; return false; }');
    expect(map).toContain('if (!auth.isAuthenticated) return;');
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
    expect(map).toContain('function pointSheetId(): string {');
    expect(map).toContain('new ResizeObserver(measurePointSheet)');
    expect(map).toContain('document.documentElement.style.removeProperty("--bb-map-point-sheet-height")');
    expect(map).toContain('function onPointRouteLayoutChange(): void {\n  measurePointSheet();');
    expect(map).toContain('watch([routeChoicesOpen, transportChoicesOpen], async () => { await nextTick(); fitPointRoute(); });');
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
    for (const panel of [planner, chooser, css(transport, "PointTransportChoicesSheet.vue")]) {
      expect(panel).toContain('bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: auto;');
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
    expect(map).toContain(':choices-open="routeChoicesOpen || transportChoicesOpen"');
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
    expect(map).toContain('routeChoicesOpen.value = false;\n  transportChoicesOpen.value = false;\n  routeChoiceSnapshot = null;\n  journey.clear();');
    expect(map).toContain('watch([routeChoicesOpen, transportChoicesOpen], async () => { await nextTick(); fitPointRoute(); });');
    expect(map).toContain('function pointSheetId(): string {');
    expect(choices).toContain('<section v-if="open && api.point.value" class="point-route-choices-shell"');
    expect(choices).toContain('role="region" aria-label="انتخاب مسیر"');
    expect(choices).not.toContain('VBottomSheet');
    const choiceStyles = css(choices, "PointRouteChoicesSheet.vue");
    expect(choiceStyles).toContain('section.point-route-choices-shell[data-v-route-panel] { left: calc(.75rem + env(safe-area-inset-left, 0px));');
    expect(choiceStyles).toContain('right: calc(.75rem + env(safe-area-inset-right, 0px));\n    bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: auto;');
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

  it("opens a separate vehicle chooser and applies a draft only after explicit confirmation", () => {
    expect(sheet).toContain('aria-controls="map-point-transport-choices-sheet"');
    expect(sheet).toContain("@click=\"emit('choose-transport')\"");
    expect(sheet).not.toContain('modeOpen');
    expect(sheet).not.toContain('api.changeProfile('); // No inline picker/recalculation.
    expect(map).toContain('@choose-transport="openTransportChoices"');
    expect(map).toContain(':choices-open="routeChoicesOpen || transportChoicesOpen"');
    expect(map).toContain('<PointTransportChoicesSheet :api="journey" :open="transportChoicesOpen" :show-search="isPhone"');
    expect(map).toContain('@confirm="confirmTransportChoice" @close="closeTransportChoices" @search="openRouteSearch"');
    expect(transport).toContain('role="region" aria-label="انتخاب وسیلهٔ حرکت"');
    expect(transport).toContain('v-for="mode in transportOptions"');
    expect(transport).toContain(':aria-pressed="selected === mode.value" @click="selected = mode.value"');
    expect(transport).toContain('const selected = ref<TransportProfile>(props.api.profile.value)');
    expect(transport).toContain('selected.value = props.api.profile.value;'); // Reopen/new point resets the draft.
    expect(transport).toContain("@click=\"emit('confirm', selected)\"");
    expect(transport).toContain('بازگشت بدون تغییر');
    expect(transport).toContain('تأیید وسیلهٔ انتخابی');
    expect(transport).toContain("@keydown.esc.stop.prevent=\"emit('close')\"");
    expect(transport).not.toContain('changeProfile('); // The child never starts a route request.
    const accept = map.slice(map.indexOf('function confirmTransportChoice('), map.indexOf('function openRouteSearch('));
    expect(accept).toContain('!transportChoicesOpen.value || !journey.point.value');
    expect(accept).toContain('!transportOptions.some((option) => option.value === mode)');
    expect(accept).toContain('if (mode !== journey.profile.value) journey.changeProfile(mode);');
    expect(accept).toContain('closeTransportChoices()');
    expect(map).toContain('if (transportChoicesOpen.value) { closeTransportChoices(); return false; }');
    expect(map).toContain('if (next !== previous) { routeChoicesOpen.value = false; transportChoicesOpen.value = false; routeChoiceSnapshot = null; }');
    expect(map).toContain('transportChoicesOpen.value = false;\n  routeChoiceSnapshot = null;\n  journey.clear()');
    const styles = css(transport, "PointTransportChoicesSheet.vue");
    expect(styles).toContain('section.point-transport-choices-shell[data-v-route-panel] { left: calc(.75rem + env(safe-area-inset-left, 0px));');
    expect(styles).toContain('right: calc(.75rem + env(safe-area-inset-right, 0px));');
    expect(styles).toContain('bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px)); width: auto');
    expect(styles).toContain('max-height: min(62dvh, 32rem)');
    expect(styles).toContain('overflow-y: auto'); // Full-size footer is reachable on short phones.
  });

  it("keeps car as the default and alternatives behind the explicit route chooser", () => {
    for (const label of ["زمان تقریبی سفر", "مسافت", "انتخاب وسیلهٔ دیگر", "انتخاب مسیر دیگر", "شروع سفر"]) {
      expect(sheet).toContain(label);
    }
    expect(transportOptions.map((mode) => mode.label)).toEqual(["خودرو", "دوچرخه", "پیاده"]);
    expect(transportOptions.map((mode) => mode.value)).toEqual(["car", "bicycle", "foot"]);
    expect(transportLabel("car")).toBe("خودرو");
    expect(sheet).not.toContain('api.choose((api.index.value + 1) % api.routes.value.length)');
    expect(transport).toContain('role="group" aria-label="وسیله‌های سفر"');
    expect(sheet).toContain('role="group" aria-label="تنظیمات سفر"');
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
    expect(map).toContain('const padding = pointRouteOverviewPadding(canvas, sheet)');
    expect(map).toContain('{ padding, maxZoom: instance.getMaxZoom()');
    expect(map).toContain('@layout-change="onPointRouteLayoutChange"');
    expect(map).toContain('if (navigationFollowEnabled.value) journey.focus()');
    expect(map).toContain('بازگشت به برنامهٔ سفر');
    expect(map).toContain('journey.rerouteMessage.value');
    expect(map).toContain('journey.rerouteWaitingForFix.value');
    expect(map).toContain('journey.navigationPending.value || journey.replanning.value || journey.rerouteWaitingForFix.value ? [] :');
    expect(map).toContain('watch([() => journey.navigationPending.value, () => journey.replanning.value, () => journey.rerouteWaitingForFix.value]');
    expect(map).toContain('navigationAlert.arm()');
    expect(map).toContain('navigationAlert.dispose()');
    expect(css(map, "UserMapView.vue")).toContain(".user-map-view--route-preview .user-map-view__canvas");
  });
});
