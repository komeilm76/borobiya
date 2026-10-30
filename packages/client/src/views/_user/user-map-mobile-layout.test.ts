import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Project convention: source/compiled-style pins, not mounted .vue components.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
const sosTrigger = readFileSync(new URL("../../components/sos/SosTriggerButton.vue", import.meta.url), "utf8");

function css(source: string, filename: string): string {
  const { descriptor } = parse(source, { filename });
  const compiled = compileStyle({ source: descriptor.styles[0]!.content, filename, id: "data-v-map-mobile", scoped: true });
  expect(compiled.errors).toEqual([]);
  return compiled.code;
}

describe("mobile map viewport and overlay tools", () => {
  it("uses a route title instead of the app logo or a second dashboard shortcut on the map", () => {
    expect(app).toContain('v-if="!isMapRoute" class="brand-link"');
    expect(app).toContain('<h1 v-else class="app-map-title">نقشهٔ همراهان</h1>');
    expect(view).not.toContain('to="/_user/dashboard"');
    expect(view).not.toContain('user-map-view__toolbar');
    expect(view).not.toContain('user-map-view__map-chip'); // No hard-coded Tehran label for other regions.
    expect(app).toContain('title="فهرست بخش‌ها"');
  });

  it("uses a full-height map on phones with shell navigation over the tiles, not flow panels and footer", () => {
    expect(app).toContain("'app-shell--map': isMapRoute");
    expect(app).toContain('route.name === "user-map"');
    const phoneShell = shell.split("@media (max-width: 599px) {").at(-1)!;
    expect(phoneShell).toContain(".app-shell--map .app-topbar");
    expect(phoneShell).toContain(".app-shell--map .app-footer { display: none; }");
    expect(phoneShell).toContain(".app-shell--map .app-main");
    expect(phoneShell).toContain(".app-shell--map .sos-fab.sos-fab"); // Beats the component's scoped selector.
    const phoneMap = view.split("@media (max-width: 599px) {")[1]!;
    expect(phoneMap).toContain("position: fixed;");
    expect(phoneMap).toContain("height: 100dvh;");
    expect(phoneMap).toContain("inset: 0;");
    expect(phoneMap).toMatch(/\.user-map-view > \.user-map-view__canvas\s*\{[^}]*position: absolute;[^}]*height: 100%;/);
    expect(phoneMap).not.toContain("height: clamp(20rem, 55dvh, 32rem)");
    expect(css(view, "UserMapView.vue")).toContain("height: 100dvh");
  });

  it("keeps the icon-only SOS accessible and above the phone-map dock without enlarging it", () => {
    const phoneShell = shell.split("@media (max-width: 599px) {").at(-1)!;
    const mapSos = phoneShell.match(/\.app-shell--map \.sos-fab\.sos-fab\s*\{([^}]*)\}/)?.[1];
    expect(mapSos).toContain("inset-block-end: calc(5.5rem + env(safe-area-inset-bottom, 0px))");
    expect(mapSos).toContain("inset-inline-start: 0.75rem;");
    expect(mapSos).not.toMatch(/(?:padding|gap|font-size|width|height):/); // Share the global 48px target.
    expect(sosTrigger).toContain('aria-label="باز کردن فرم درخواست امداد فوری (SOS)"');
    expect(sosTrigger).not.toContain("sos-fab__label");
    expect(sosTrigger).toContain('@click="$emit(\'trigger\')"');
  });

  it("keeps full-size controls mounted and offers four accessible launchers with one scrollable panel", () => {
    expect(view).toContain('useMediaQuery("(max-width: 599px)")');
    expect(view).toContain('<div v-if="isPhone" class="user-map-view__dock-frame" @keydown.esc.stop="closeTool()">');
    expect(view).toContain('<v-layout class="user-map-view__dock-layout">');
    expect(view).toContain('<v-bottom-navigation');
    expect(view).toContain('class="user-map-view__dock"');
    expect(view).toContain('tag="nav"');
    expect(view).toContain('aria-label="ابزارهای نقشه"');
    expect(view).toContain(':model-value="activeTool"');
    expect(view).toContain('@update:model-value="selectTool"');
    expect(view).toContain(':mandatory="false"'); // Tapping the selected tool closes it.
    expect(view).toContain(':height="64"');
    expect(view).toMatch(/grow\s+absolute/);
    expect(view).toContain(':value="tool.id"');
    for (const tool of ["search", "history", "own", "live"]) {
      expect(view).toContain(`id: "${tool}"`);
      expect(view).toContain(`id="map-${tool}-panel"`);
      expect(view).toContain(`activeTool === '${tool}'`);
    }
    expect(view).toContain(':id="`map-tool-${tool.id}`"');
    expect(view).toContain(':aria-expanded="activeTool === tool.id"');
    expect(view).toContain(':aria-controls="`map-${tool.id}-panel`"');
    expect(view).toContain('v-show="!isPhone || activeTool ===');
    expect(view).toContain(`:is="isPhone ? VBottomSheet : 'div'"`);
    expect(view).toContain('class="user-map-view__tool-host"');
    expect(view).toContain(`:class="isPhone ? 'user-map-view__tool-sheet' : undefined"`);
    expect(view).toContain('v-bind="isPhone ? phoneSheetProps : {}"');
    expect(view).toContain('modelValue: activeTool.value !== null');
    expect(view).toContain('@update:model-value="onSheetVisibilityChange"');
    expect(view).toContain('if (!visible && activeTool.value) closeTool()');
    expect(view).toContain("eager: true");
    expect(view).toContain('persistent: false');
    expect(view).toContain('closeOnBack: true');
    // Vuetify's Back hook may not run when the Vue Router guard navigates first.
    expect(view).toContain('onBeforeRouteLeave(() => {');
    expect(view).toContain('window.history.state?.position');
    expect(view).toContain('position < mapEntryPosition');
    expect(view).toContain('return false;'); // Cancel the backward route change, keep the map.

    expect(view).toContain('activator: ".user-map-view"'); // Dock/map controls are not outside clicks.
    expect(view).toContain('openOnClick: false'); // Activator must not toggle the sheet on map gestures.
    expect(view).not.toContain('@click:outside="onSheetOutside"');
    expect(view).toContain('closeTool(false);'); // Map tap/long press opens reverse address; don't steal modal focus.

    expect(view).toContain('@keydown.esc.stop="closeTool()"');
    // Map controls, dock and SOS must remain interactive, not hidden behind a modal scrim.
    for (const prop of ['scrim: false', 'retainFocus: false', 'captureFocus: false',
      'scrollStrategy: "none"', '"aria-modal": "false"',
      '"aria-hidden": activeTool.value === null ? "true" : undefined']) expect(view).toContain(prop);
    expect(view).toContain('.user-map-view__tool-host { display: contents; }');
    expect(view).toContain('@keydown.esc="onPanelEscape"');
    expect(view).toContain("if (!isPhone.value) return;");
    expect(view).toContain("event.stopPropagation()");
    expect(view).toContain('tabindex="-1"');
    expect(view).toContain('max-height:');
    expect(view).toContain('overflow-y: auto;');
    expect(view).not.toContain('v-if="activeTool ==='); // Do not unmount playback, GPS or socket state.
    // A non-mandatory Vuetify group emits undefined (not null) on deselection.
    // Leaving that value in activeTool keeps modelValue !== null true and creates a blank open sheet.
    expect(view).toContain('async function selectTool(next: MapTool | null | undefined)');
    expect(view).toContain('const selected = next ?? null;');
    expect(view).toContain('const previous = activeTool.value;');
    expect(view).toContain('activeTool.value = selected;');
    expect(view).toContain('document.getElementById(`map-${selected}-panel`)?.focus()');
    expect(view).toContain('document.getElementById(`map-tool-${previous}`)?.focus()');
    expect(view).toContain('document.getElementById(`map-tool-${tool}`)?.focus()');
    // Camera actions reveal their destination; opening the tool again retains the full content.
    for (const tool of ["search", "history", "own"]) {
      expect(view).toContain(`if (isPhone.value && activeTool.value === "${tool}") closeTool()`);
    }
  });

  it("does not let compact navigation, SOS, dock or MapLibre attribution obscure each other", () => {
    const phoneMap = view.split("@media (max-width: 599px) {")[1]!;
    expect(phoneMap).toContain("safe-area-inset-top");
    expect(phoneMap).toContain("safe-area-inset-bottom");
    expect(phoneMap).toContain(".maplibregl-ctrl-top-right");
    expect(phoneMap).toContain(".maplibregl-ctrl-bottom-right");
    expect(phoneMap).toMatch(/\.maplibregl-ctrl-bottom-right\)\s*\{[^}]*top: calc\(4rem[^}]*bottom: auto;/);
    expect(phoneMap).toContain(".maplibregl-ctrl-bottom-right .maplibregl-ctrl-attrib");
    expect(phoneMap).toContain("max-width: calc(100vw - 9.5rem);"); // Real OSM/OpenMapTiles credit must not cover zoom.
    expect(phoneMap).toMatch(/\.maplibregl-ctrl-bottom-left\)\s*\{\s*bottom: calc\(5\.5rem/);
    expect(phoneMap).toContain(".user-map-view__dock-frame");
    expect(phoneMap).toContain(".user-map-view__dock-layout");
    expect(phoneMap).toContain(".user-map-view__dock");
    expect(phoneMap).toContain(".v-bottom-navigation__content > .v-btn");
    expect(phoneMap).toContain("min-width: 44px"); // Vuetify's 80px minimum would clip four tools at 320px.
    expect(view).toContain('class="user-map-view__dock-label"');
    expect(phoneMap).toContain(".user-map-view__dock-label");
    expect(phoneMap).toContain(".user-map-view__tool-sheet.v-bottom-sheet > .v-bottom-sheet__content.v-overlay__content");
    // Vuetify's default translateY(100%) sweeps the open sheet across SOS and
    // the dock during animation, swallowing a quick second tool press.
    expect(phoneMap).toContain(".bottom-sheet-transition-enter-from");
    expect(phoneMap).toContain(".bottom-sheet-transition-leave-to");
    expect(phoneMap).toContain("transform: none;");
    expect(phoneMap).toContain("opacity: 0;");
    expect(phoneMap).toMatch(/v-bottom-sheet > \.v-bottom-sheet__content\.v-overlay__content\)\s*\{[^}]*inset-block-end: calc\(9\.75rem \+ env\(safe-area-inset-bottom/);
    expect(phoneMap).toContain("100dvh - 18.5rem"); // Space for expanded attribution above the sheet.
    expect(phoneMap).toMatch(/v-bottom-sheet > \.v-bottom-sheet__content\.v-overlay__content\)\s*\{[^}]*inset-inline: 0;[^}]*margin: 0 auto;/);
    expect(phoneMap).toContain("overflow-y: auto;"); // Sheet scrolls; full-size cards do not shrink.
    expect(phoneMap).toContain(".user-map-view__panel");
    expect(phoneMap).toContain(".user-map-view__panel > :not(.user-map-view__panel-head)");
    expect(phoneMap).toContain("flex-shrink: 0;");
    expect(phoneMap).toContain("overscroll-behavior: contain");
    expect(phoneMap).toContain("min-height: 44px");
    expect(phoneMap).toContain("@media (min-width: 480px) and (max-width: 599px) and (max-height: 480px)");
    expect(phoneMap).toContain("width: min(23rem, calc(100% - 11.5rem));");
    expect(phoneMap).toContain("bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));");
    expect(css(view, "UserMapView.vue")).toContain(".user-map-view__panel[data-v-map-mobile]");
    expect(css(view, "UserMapView.vue")).toContain(".user-map-view__tool-sheet.v-bottom-sheet > .v-bottom-sheet__content.v-overlay__content");
  });
});
