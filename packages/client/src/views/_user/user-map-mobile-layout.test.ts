import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Project convention: source/compiled-style pins, not mounted .vue components.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
const sosTrigger = readFileSync(new URL("../../components/sos/SosTriggerButton.vue", import.meta.url), "utf8");
const playbackPanel = readFileSync(new URL("../../components/map/HistoryPlaybackPanel.vue", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../../components/shell/MapSidebar.vue", import.meta.url), "utf8");

function css(source: string, filename: string): string {
  const { descriptor } = parse(source, { filename });
  const compiled = compileStyle({ source: descriptor.styles[0]!.content, filename, id: "data-v-map-mobile", scoped: true });
  expect(compiled.errors).toEqual([]);
  return compiled.code;
}

describe("mobile map viewport and overlay tools", () => {
  it("removes the map app bar and title but keeps all other routes' shell unchanged", () => {
    expect(app).toContain('<v-app-bar v-if="!isMapRoute && !isAuthRoute && !isPublicRoute" class="app-topbar');
    expect(app).toContain('<MapSidebar\n      v-if="isMapRoute"');
    expect(app).not.toContain('app-map-title');
    expect(app).not.toContain('نقشهٔ همراهان');
    expect(shell).not.toContain('.app-map-title');
    expect(view).not.toContain('to="/_user/dashboard"');
    expect(view).not.toContain('user-map-view__toolbar');
    expect(view).not.toContain('user-map-view__map-chip'); // No hard-coded Tehran label for other regions.
    expect(app).toContain('title="فهرست بخش‌ها"'); // Other routes retain their menu.
  });

  it("uses a full-height map on phones and desktop with no app-bar offset or footer", () => {
    expect(app).toContain("'app-shell--map': isMapRoute");
    expect(app).toContain('route.name === "user-map"');
    expect(shell).toContain(".app-shell--map .app-footer { display: none; }");
    expect(shell).toContain(".app-shell--map .app-main {");
    expect(shell).toContain("padding-top: 0 !important;");
    const phoneShell = shell.split("@media (max-width: 599px) {").at(-1)!;
    expect(phoneShell).toContain(".app-shell--map .sos-fab.sos-fab"); // Beats the component's scoped selector.
    const phoneMap = view.split("@media (max-width: 599px) {")[1]!;
    expect(phoneMap).toContain("position: fixed;");
    expect(phoneMap).toContain("height: 100dvh;");
    expect(phoneMap).toContain("inset: 0;");
    expect(phoneMap).toMatch(/\.user-map-view > \.user-map-view__canvas\s*\{[^}]*position: absolute;[^}]*height: 100%;/);
    expect(phoneMap).not.toContain("height: clamp(20rem, 55dvh, 32rem)");
    expect(css(view, "UserMapView.vue")).toContain("height: 100dvh");
  });

  it("gives the physical-left launcher its own hit area at desktop and tablet widths", () => {
    const mapCss = css(view, "UserMapView.vue");
    expect(mapCss).toMatch(/\.user-map-view\[data-v-map-mobile\]\s*\{[^}]*height: 100dvh;/);
    expect(mapCss).toContain('inset-block-start: calc(5rem + env(safe-area-inset-top, 0px))'); // Desktop search clears menu.
    expect(mapCss).toMatch(/@media \(max-width: 1023px\)[\s\S]*?padding: calc\(4\.5rem \+ env\(safe-area-inset-top, 0px\)\) 0\.65rem 0\.65rem;/);
    expect(mapCss).toMatch(/@media \(max-width: 599px\)[\s\S]*?\.user-map-view\[data-v-map-mobile\][^{]*\{[^}]*padding: 0;/); // Phone map stays full-bleed.
    expect(shell).toContain('@media (min-width: 600px) and (max-width: 1023px) {');
    expect(shell).toContain('.app-shell--map .app-main { overflow: visible; }');
  });

  it("keeps the icon-only SOS accessible above Search without enlarging it", () => {
    const phoneShell = shell.split("@media (max-width: 599px) {").at(-1)!;
    const mapSos = phoneShell.match(/\.app-shell--map \.sos-fab\.sos-fab\s*\{([^}]*)\}/)?.[1];
    expect(mapSos).toContain("inset-block-end: calc(4.25rem + env(safe-area-inset-bottom, 0px))");
    expect(mapSos).toContain("inset-inline-start: calc(0.75rem + env(safe-area-inset-right, 0px));");
    expect(mapSos).not.toMatch(/(?:padding|gap|font-size|width|height):/); // Share the global 48px target.
    expect(sosTrigger).toContain('aria-label="باز کردن فرم درخواست امداد فوری (SOS)"');
    expect(sosTrigger).not.toContain("sos-fab__label");
    expect(sosTrigger).toContain('@click="$emit(\'trigger\')"');
  });

  it("opens full-size phone dialogs from workspace tabs and the single common Search action", () => {
    expect(view).toContain('useMediaQuery("(max-width: 599px)")');
    expect(view).toContain(':id="`map-mode-${item.id}`"');
    expect(view).toContain('if (next === "history") void selectTool("history");');
    expect(view).toContain('else if (next === "sharing") void selectTool("live");');
    expect(view).toContain('if (next === "sharing") void selectTool("live");');
    expect(view).toContain('else if (next === "history") { void selectTool("history"); frameCamera(); }');
    expect(view).toContain('id="map-tool-search" class="user-map-view__search-action"');
    expect(view).toContain('v-if="isPhone" id="map-tool-search"');
    expect(view).toContain('aria-controls="map-search-panel"');
    expect(view).toContain(":aria-expanded=\"activeTool === 'search'\" @click=\"selectTool('search')\"");
    expect(view).not.toContain('user-map-view__dock-frame');
    expect(view).not.toContain('v-bottom-navigation');
    expect(view).not.toContain('user-map-view__mission-search');
    for (const tool of ["search", "history", "live"]) {
      expect(view).toContain(`id="map-${tool}-panel"`);
      if (tool !== "live") expect(view).toContain(`activeTool === '${tool}'`);
      else expect(view).toContain('activeTool.value === "live"');
    }
    expect(view).toContain('v-show="!isPhone || activeTool ===');
    expect(view).toContain('class="user-map-view__history-dialog"');
    expect(view).toContain('v-bind="isPhone ? phoneHistoryDialogProps : {}"');
    expect(view).toContain('modelValue: activeTool.value === "history"');
    expect(view).toContain('modelValue: activeTool.value === "search"');
    expect(view).toContain('@update:model-value="onHistoryDialogVisibilityChange"');
    expect(view).toContain('if (!visible && activeTool.value === "history") closeTool()');
    expect(view).toContain('if (!visible && activeTool.value === "search") closeTool()');
    expect(view).toContain("eager: true");
    expect(view).toContain("fullscreen: true");
    expect(view).toContain("scrollable: true");
    expect(view).toContain("closeOnBack: false");
    // Vuetify's Back hook may not run when the Vue Router guard navigates first.
    expect(view).toContain('onBeforeRouteLeave(() => {');
    expect(view).toContain('window.history.state?.position');
    expect(view).toContain('position < mapEntryPosition');
    expect(view).toContain('return false;'); // Cancel the backward route change, keep the map.

    expect(view).toContain('closeTool(false);'); // Map tap opens reverse address without stealing its focus.
    expect(view).toContain('.user-map-view__history-dialog:not(.v-overlay)');
    expect(view).toContain('.user-map-view__live-dialog:not(.v-overlay)');
    expect(view).toContain('@keydown.esc="onPanelEscape"');
    expect(view).toContain("if (!isPhone.value) return;");
    expect(view).toContain("event.stopPropagation()");
    expect(view).toContain('tabindex="-1"');
    expect(view).toContain('max-height:');
    expect(view).toContain('overflow-y: auto;');
    expect(view).not.toContain('v-if="activeTool ==='); // Do not unmount playback, GPS or socket state.
    // Each modal returns focus to Search or its workspace tab, not the deleted dock.
    expect(view).toContain('async function selectTool(next: MapTool | null | undefined)');
    expect(view).toContain('const selected = next ?? null;');
    expect(view).toContain('const previous = activeTool.value;');
    expect(view).toContain('tool === "search" ? "map-tool-search" : `map-mode-${tool === "live" ? "sharing" : "history"}`');
    expect(view).toContain('activeTool.value = selected;');
    expect(view).toContain('document.getElementById(`map-${selected}-panel`)?.focus()');
    expect(view).toContain('document.getElementById(toolLauncherId(previous))?.focus()');
    expect(view).toContain('document.getElementById(toolLauncherId(tool))?.focus()');
    // Camera actions reveal their destination; opening the tool again retains the full content.
    expect(view).toContain('if (isPhone.value && activeTool.value === "search") closeTool(false)');
    expect(view).toContain('if (isPhone.value && activeTool.value === "history") closeTool()');
  });

  it("opens complete history in a full-screen dialog, with one safe-area scroll surface", () => {
    const history = view.slice(view.indexOf('class="user-map-view__history-dialog"'),
      view.indexOf('class="user-map-view__live-dialog"'));
    expect(history).toContain('class="user-map-view__history-title"');
    expect(history).toContain('aria-label="بستن تاریخچه"');
    expect(history).toContain('class="user-map-view__history-body"');
    expect(history).toContain(":expanded=\"isPhone && activeTool === 'history'\"");
    expect(history).toContain(':show-return-to-track="userControlledCamera && playback.frames.value.length > 0"');
    expect(view).toContain('const phoneHistoryDialogProps = computed(() => ({');
    expect(view).toContain('v-bind="isPhone ? phoneHistoryDialogProps : {}"');
    expect(view).toContain('class="user-map-view__history-dialog"');
    expect(history).not.toContain('VBottomSheet');
    expect(playbackPanel).toContain('watch(() => props.expanded, (expanded) => { if (expanded) isOpen.value = true; }, { immediate: true });');
    expect(playbackPanel).toContain('v-if="!expanded"'); // No "collapse" inside the full-screen modal.
    expect(view).toContain('.user-map-view__history-dialog .history-playback) { max-height: none !important; overflow: visible; }');
    expect(view).toContain('padding: 0.75rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));');
    expect(view).toContain('overflow-y: auto; overscroll-behavior: contain;');
    expect(view).toContain('closeOnBack: false');
  });

  it("keeps a single physical-left menu button, identity/theme/logout drawer and the common Search action", () => {
    expect(app).toContain(':items="mapNavItems"');
    expect(app).toContain('auth.user?.role === "admin" && !auth.mustCompleteSecurityQuestions');
    expect(app).toContain('[{ to: "/_user/map", label: "نقشه", icon: "mdi-map-outline" }, ...navItems.value]');
    expect(app).toContain(':user="auth.user"');
    expect(app).toContain(':categories="auth.userCategories"');
    expect(app).toContain('@change-theme="appTheme.setPreference"');
    expect(app).toContain('@request-logout="logoutConfirmation.request()"');
    expect(sidebar).toContain('aria-label="باز کردن فهرست برنامه"');
    expect(sidebar).toContain('aria-labelledby="map-sidebar-title"');
    expect(sidebar).toContain('aria-label="بخش‌های برنامه"');
    expect(sidebar).toContain('aria-label="حساب کاربری"');
    expect(sidebar).toContain('aria-label="انتخاب پوسته"');
    expect(sidebar).toContain('خروج از حساب');
    expect(sidebar).toContain('open.value = false;');
    const drawerCss = css(sidebar, "MapSidebar.vue");
    expect(drawerCss).toContain('top: calc(0.75rem + env(safe-area-inset-top, 0px))');
    expect(drawerCss).toContain('left: calc(0.75rem + env(safe-area-inset-left, 0px))');
    expect(drawerCss).toContain('width: 48px');
    expect(drawerCss).toContain('.map-sidebar__dialog.v-dialog > .v-overlay__content');
    expect(drawerCss).toContain('height: 100dvh !important');
    expect(drawerCss).toContain('.map-sidebar__dialog.v-dialog > .v-overlay__content > .map-sidebar__panel > .map-sidebar__scroll');
    expect(drawerCss).toContain('env(safe-area-inset-left, 0px) !important'); // Beat Vuetify's 24px dialog gutter.
    expect(drawerCss).toContain('overflow: hidden !important'); // One scrollbar, not an outer card scroll.
    expect(drawerCss).toContain('overflow-y: auto');
    expect(drawerCss).toContain('safe-area-inset-bottom');
    expect(drawerCss).toContain('forced-colors: active');
    const phoneMap = view.split("@media (max-width: 599px) {")[1]!;
    expect(phoneMap).toContain('.user-map-view__search-action {');
    expect(phoneMap).toContain('width: 48px; min-width: 48px; height: 48px;');
    expect(phoneMap).toContain('inset-inline-start: calc(.75rem + env(safe-area-inset-right, 0px))');
    expect(css(view, "UserMapView.vue")).toContain('.user-map-view__search-action[data-v-map-mobile]');
  });

  it("keeps the SOS and map action row above the measured guidance sheet", () => {
    expect(shell).toContain('.app-shell--map:has(.user-map-view--navigating) .sos-fab.sos-fab');
    expect(shell).toContain('inset-block-end: calc(var(--bb-map-navigation-sheet-height, 15rem) + 4rem);');
    expect(view).toContain('document.documentElement.style.removeProperty("--bb-map-navigation-sheet-height")');
    expect(view).toContain('observer.observe(element)');
    const styles = css(view, "UserMapView.vue");
    expect(styles).toContain('.user-map-view--navigating');
    expect(styles).toContain('right: calc(11.25rem + env(safe-area-inset-right, 0px))');
    expect(styles).toContain('bottom: calc(var(--bb-map-navigation-sheet-height, 15rem) + 4rem)');
  });

  it("does not let compact navigation, SOS, Search or MapLibre attribution obscure each other", () => {
    const phoneMap = view.split("@media (max-width: 599px) {")[1]!;
    expect(phoneMap).toContain("safe-area-inset-top");
    expect(phoneMap).toContain("safe-area-inset-bottom");
    expect(phoneMap).toContain(".maplibregl-ctrl-top-right");
    expect(phoneMap).toContain(".maplibregl-ctrl-bottom-right");
    expect(phoneMap).toMatch(/\.maplibregl-ctrl-top-right\)\s*\{[^}]*inset-inline-start: calc\(0\.75rem[^}]*inset-block-end: calc\(16rem/);
    expect(phoneMap).toMatch(/\.maplibregl-ctrl-bottom-right\)\s*\{[^}]*top: calc\(4\.5rem[^}]*bottom: auto;/);
    expect(phoneMap).toContain(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib");
    expect(phoneMap).toContain("max-width: calc(100vw - 9.5rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px));"); // Real OSM/OpenMapTiles credit must not cover the action rail.
    expect(phoneMap).toMatch(/\.maplibregl-ctrl-bottom-left\)\s*\{\s*bottom: calc\(\.75rem/);
    expect(phoneMap).toContain('.user-map-view__search-action {');
    expect(phoneMap).toContain('.user-map-view--route-preview .user-map-view__search-action {');
    expect(phoneMap).toContain('.user-map-view--navigating .user-map-view__search-action {');
    expect(phoneMap).not.toContain('.user-map-view__dock-frame');
    expect(phoneMap).toContain(":is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content");
    expect(phoneMap).toContain(".v-dialog > .v-overlay__content > .v-card > .v-card-text");
    expect(phoneMap).toContain("max-height: none !important;"); // Remove the old 56dvh/26rem card cap.
    expect(view).toContain('v-show="!missionActive && !(isShortPhone && activeTool)"');
    expect(phoneMap).toContain(".user-map-view__recenter");
    expect(phoneMap).toContain("inset-block-end: calc(12.5rem + env(safe-area-inset-bottom, 0px))");
    expect(phoneMap).toContain("inset-block-end: calc(9rem + env(safe-area-inset-bottom, 0px))");
    expect(phoneMap).toContain("overflow-y: auto;"); // Full-height dialog body scrolls.
    expect(phoneMap).toContain("overscroll-behavior: contain");
    expect(phoneMap).toContain("min-height: 44px");
    expect(phoneMap).toContain("@media (min-width: 480px) and (max-width: 599px) and (max-height: 480px)");
    expect(phoneMap).toContain("bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));");
    expect(phoneMap).not.toContain(".user-map-view__tool-sheet");
    expect(css(view, "UserMapView.vue")).toContain(".user-map-view__panel[data-v-map-mobile]");
    expect(css(view, "UserMapView.vue")).toContain(":is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content");
  });
});
