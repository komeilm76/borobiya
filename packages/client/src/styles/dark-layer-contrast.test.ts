import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { compileStyle, parse } from "vue/compiler-sfc";
import { describe, expect, it } from "vitest";
import { palettes, vuetifyThemeColors } from "./tokens";

// Source-level audit: do not mount .vue components (docs/TASKS.md).
const root = fileURLToPath(new URL("../", import.meta.url));
const source = (path: string) => readFileSync(join(root, path), "utf8");
function contrast(a: string, b: string): number {
  function luminance(hex: string): number {
    const channels = [1, 3, 5].map((index) => {
      const value = parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
  }
  const [first, second] = [luminance(a), luminance(b)];
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

const dark = palettes.dark;
function over(base: string, overlay: string, alpha: number): string {
  return `#${[1, 3, 5].map((index) =>
    Math.round(parseInt(overlay.slice(index, index + 2), 16) * alpha
      + parseInt(base.slice(index, index + 2), 16) * (1 - alpha))
      .toString(16).padStart(2, "0")
  ).join("")}`;
}
function overWhite(hex: string, alpha: number): string {
  return over("#ffffff", hex, alpha);
}

describe("dark surfaces and widget boundaries", () => {
  it("separates page, card, inset and outline while retaining readable small text", () => {
    expect(contrast(dark.surface, dark.background)).toBeGreaterThanOrEqual(1.5);
    expect(contrast(dark.outline, dark.surface)).toBeGreaterThanOrEqual(3);
    expect(contrast(dark.outline, dark.inset)).toBeGreaterThanOrEqual(3);
    for (const foreground of [dark.text, dark.muted, dark.primary, dark.secondary,
      dark.accent, dark.error, dark.success, dark.info, dark.warning]) {
      expect(contrast(foreground, dark.inset), foreground).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(dark.outline, "#1b2e2d")).toBeGreaterThanOrEqual(3); // public cards
    // A bright map tile beneath a translucent dark widget is the worst case.
    for (const foreground of [dark.muted, dark.primary, dark.secondary, dark.accent,
      dark.error, dark.success, dark.info, dark.warning]) {
      expect(contrast(foreground, overWhite(dark.surface, 0.94)), foreground).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps Vuetify warning text legible over its 12%-opacity tonal underlay", () => {
    // Vuetify's default dark warning (#fb8c00) falls below 4.5:1 after its
    // underlay is composited onto a raised card (registration retry alert).
    const warning = dark.warning;
    expect(vuetifyThemeColors("dark").warning).toBe(warning);
    expect(vuetifyThemeColors("light").warning).toBe("#fb8c00");
    for (const base of [dark.surface, dark.inset, overWhite(dark.surface, 0.94)]) {
      expect(contrast(warning, over(base, warning, 0.12)), base).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses the surface token instead of the old fixed dark fill across map and auth overlays", () => {
    const directories = ["components/map", "components/mission", "components/settings", "components/sharing",
      "components/shell", "components/sos", "views/_admin", "views/_auth", "views/_public", "views/_user"];
    const files = ["App.vue", "views/PlaceholderPage.vue", ...directories.flatMap((directory) =>
      readdirSync(join(root, directory)).filter((file) => file.endsWith(".vue"))
        .map((name) => `${directory}/${name}`))];
    expect(files).toHaveLength(51);
    for (const path of files) {
      expect(source(path), path).not.toMatch(/rgba?\(27,\s*41,\s*42(?:,|\))/);
    }
    expect(source("styles/auth.css")).toContain("background: var(--bb-color-inset);");
    expect(source("styles/public.css")).toContain(".public-value, :root.dark .public-health__card { border-color: var(--bb-color-outline);");
    expect(source("styles/tailwind.css")).toContain(":root.dark .v-card.bb-map-navigation-card {\n  border-color: var(--bb-color-outline);");
  });

  it("keeps the map loading canvas, MapLibre controls and attribution dark without recoloring the custom compass", () => {
    const canvas = source("components/map/MapCanvas.vue");
    expect(canvas).toContain(":global(:root.dark .map-canvas) { background: var(--bb-color-background); }");
    expect(canvas).toContain("background: var(--bb-color-surface);");
    expect(canvas).toContain(":global(:root.dark .map-canvas:not(.user-map-view__canvas) .maplibregl-ctrl-icon)");
    expect(canvas).toContain(":global(:root.dark .map-canvas .maplibregl-ctrl-attrib a)");
    expect(canvas).toContain("color: var(--bb-color-primary);");
    const style = parse(canvas).descriptor.styles[0]!;
    const compiled = compileStyle({ source: style.content, filename: "MapCanvas.vue", id: "data-v-map-audit", scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain(":root.dark .map-canvas:not(.user-map-view__canvas) .maplibregl-ctrl-icon");
    expect(compiled.code).not.toContain(":root.dark .map-canvas .maplibregl-ctrl-icon {");
    expect(contrast(dark.primary, dark.surface)).toBeGreaterThanOrEqual(4.5);
    expect(source("views/_user/UserMapView.vue")).toContain(
      ":global(:root.dark .user-map-view__canvas .maplibregl-ctrl-top-right .maplibregl-ctrl-compass .maplibregl-ctrl-icon)");
  });

  it("separates remaining share rows, float launchers, public links and auth controls", () => {
    expect(source("components/sharing/ShareLists.vue"))
      .toContain(":global(:root.dark .share-lists__row) {\n  background: var(--bb-color-inset);\n  border-color: var(--bb-color-outline);");
    expect(source("components/shell/MapSidebar.vue"))
      .toContain(":global(:root.dark .map-sidebar__menu-button) { border-color: var(--bb-color-outline); }");
    expect(source("components/shell/MapProposalSidebar.vue"))
      .toContain(":global(:root.dark .map-proposal__bell) { border-color: var(--bb-color-outline); }");
    expect(source("styles/public.css")).toContain(":root.dark .public-health__retry { border-color: var(--bb-color-outline);");
    expect(source("styles/auth.css")).toContain(":root.dark .auth-chrome__home {\n  border-color: var(--bb-color-outline);");
    expect(contrast(dark.outline, "#28453d")).toBeGreaterThanOrEqual(3);
  });

  it("distinguishes actionable rows without obscuring selected, warning or SOS states", () => {
    const contracts: Record<string, string[]> = {
      "components/map/PointRouteSheet.vue": [".point-route__choice", ".point-route__metrics > div"],
      "components/map/PointRouteChoicesSheet.vue": [".point-route-choices__card:not([aria-pressed=\"true\"])"],
      "components/map/PointTransportChoicesSheet.vue": [".point-transport-choices__card:not([aria-pressed=\"true\"])"],
      "components/map/PlaceSearchPanel.vue": [".place-search__result:not(.place-search__result--selected)"],
      "components/map/HistoryPlaybackPanel.vue": [".history-playback__range"],
      "components/map/LiveCompanionPanel.vue": [".live-companions__peer-button"],
      "components/sharing/ShareDialog.vue": [".share-dialog__chip:not(.share-dialog__chip--on)"],
      "components/settings/DevicePriorityPanel.vue": [".device-priority__session"],
      "components/shell/MapProposalSidebar.vue": [".map-proposal__item"],
      "components/shell/MapSidebar.vue": [".map-sidebar__theme:not(.map-sidebar__theme--selected)"],
      "components/shell/AccountProfileMenu.vue": [".account-profile__identity"],
      "views/_admin/AdminUsersView.vue": [".admin-users-table-wrap"],
      "views/_user/UserMissionView.vue": [".mission-route__choice:not(.mission-route__choice--selected)"],
      "views/_user/UserMapView.vue": [".user-map-view__telemetry"],
      "components/sos/SosRequestSheet.vue": [".sos-severity-card.is-selected"]
    };
    for (const [path, selectors] of Object.entries(contracts)) {
      const css = source(path);
      for (const selector of selectors) expect(css, `${path}: ${selector}`)
        .toContain(`:global(:root.dark ${selector})`);
    }
    for (const path of ["views/_user/UserSosHistoryView.vue", "views/_user/UserRescuerHistoryView.vue"]) {
      expect(source(path)).toContain(":global(:root.dark .history__item--selected) {\n  border-color: var(--bb-color-primary);");
    }
    expect(source("components/shell/ProposalInboxContent.vue"))
      .toContain(":global(:root.dark .offer-card--selected) {\n  border-color: var(--bb-color-primary);");
    expect(source("components/sharing/ShareDialog.vue"))
      .toContain(":global(:root.dark .share-dialog__result-rating .v-icon) { color: var(--bb-color-secondary); }");
  });
});
