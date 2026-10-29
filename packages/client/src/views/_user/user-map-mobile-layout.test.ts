import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Project convention: source/compiled-style pins, not mounted .vue components.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");

function css(source: string, filename: string): string {
  const { descriptor } = parse(source, { filename });
  const compiled = compileStyle({ source: descriptor.styles[0]!.content, filename, id: "data-v-map-mobile", scoped: true });
  expect(compiled.errors).toEqual([]);
  return compiled.code;
}

describe("mobile map viewport and overlay tools", () => {
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
    expect(phoneMap).toMatch(/\.maplibregl-ctrl-bottom-right\)\s*\{\s*bottom: calc\(9\.5rem/); // RTL SOS is physical right.
    expect(phoneMap).toMatch(/\.maplibregl-ctrl-bottom-left\)\s*\{\s*bottom: calc\(4\.75rem/);
    expect(phoneMap).toContain(".user-map-view__dock");
    expect(phoneMap).toContain(".user-map-view__panel");
    expect(phoneMap).toContain("overscroll-behavior: contain");
    expect(phoneMap).toContain("min-height: 44px");
    expect(css(view, "UserMapView.vue")).toContain(".user-map-view__panel[data-v-map-mobile]");
  });
});
