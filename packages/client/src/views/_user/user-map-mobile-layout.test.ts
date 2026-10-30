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

  it("uses a slightly smaller SOS pill on the phone map without shrinking its touch target or hiding its label", () => {
    const phoneShell = shell.split("@media (max-width: 599px) {").at(-1)!;
    expect(phoneShell).toMatch(/\.app-shell--map \.sos-fab\.sos-fab\s*\{[^}]*min-height: 44px;[^}]*padding: 0\.5rem 0\.75rem;[^}]*font-size: 0\.875rem;/);
    expect(phoneShell).toContain("inset-block-end: calc(5.5rem + env(safe-area-inset-bottom, 0px))");
    expect(sosTrigger).toContain('aria-label="درخواست امداد فوری (SOS)"');
    expect(sosTrigger).toContain('<span class="sos-fab__label">SOS امداد</span>');
    expect(sosTrigger).toContain('@click="$emit(\'trigger\')"');
  });

  it("keeps full-size controls mounted and offers four accessible launchers with one scrollable panel", () => {
    expect(view).toContain('useMediaQuery("(max-width: 599px)")');
    expect(view).toContain('class="user-map-view__dock"');
    for (const tool of ["search", "history", "own", "live"]) {
      expect(view).toContain(`id: "${tool}"`);
      expect(view).toContain(`id="map-${tool}-panel"`);
      expect(view).toContain(`activeTool === '${tool}'`);
    }
    expect(view).toContain(':id="`map-tool-${tool.id}`"');
    expect(view).toContain(':aria-expanded="activeTool === tool.id"');
    expect(view).toContain(':aria-controls="`map-${tool.id}-panel`"');
    expect(view).toContain('v-show="!isPhone || activeTool ===');
    expect(view).toContain('@keydown.esc="onPanelEscape"');
    expect(view).toContain("if (!isPhone.value) return;");
    expect(view).toContain("event.stopPropagation()");
    expect(view).toContain('tabindex="-1"');
    expect(view).toContain('max-height:');
    expect(view).toContain('overflow-y: auto;');
    expect(view).not.toContain('v-if="activeTool ==='); // Do not unmount playback, GPS or socket state.
    expect(view).toContain('const next = activeTool.value === tool ? null : tool');
    expect(view).toContain('document.getElementById(`map-${next}-panel`)?.focus()');
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
    expect(phoneMap).toContain(".user-map-view__dock");
    expect(view).toContain('class="user-map-view__dock-label"');
    expect(phoneMap).toContain(".user-map-view__dock-label");
    expect(phoneMap).toContain(".user-map-view__panel");
    expect(phoneMap).toMatch(/\.user-map-view__panel\s*\{[^}]*inset-block-end: calc\(9\.75rem \+ env\(safe-area-inset-bottom/);
    expect(phoneMap).toContain("100dvh - 18.5rem"); // Space for expanded attribution above the sheet.
    // All four panels inherit different desktop logical insets. In RTL a physical
    // left:50% cannot override inset-inline-start/right; history/live go offscreen.
    expect(phoneMap).toMatch(/\.user-map-view__panel\s*\{[^}]*inset-inline: 0;[^}]*margin-inline: auto;/);
    expect(phoneMap).not.toMatch(/\.user-map-view__panel\s*\{[^}]*left: 50%/);
    expect(phoneMap).toMatch(/\.user-map-view__panel\s*\{[^}]*top: auto;[^}]*inset-block-end: calc\(9\.75rem/); // Own/live inherited desktop insets must not stretch the sheet.
    // Live uses flex columns: a height-capped aside otherwise shrinks both cards
    // and clips their contents *without any scroll overflow*.
    expect(phoneMap).toContain(".user-map-view__panel > :not(.user-map-view__panel-head)");
    expect(phoneMap).toContain("flex-shrink: 0;");
    expect(phoneMap).toContain("overscroll-behavior: contain");
    expect(phoneMap).toContain("min-height: 44px");
    expect(phoneMap).toContain("@media (min-width: 480px) and (max-width: 599px) and (max-height: 480px)");
    expect(phoneMap).toContain("width: min(23rem, calc(100% - 11.5rem));");
    expect(phoneMap).toContain("bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));");
    expect(css(view, "UserMapView.vue")).toContain(".user-map-view__panel[data-v-map-mobile]");
  });
});
