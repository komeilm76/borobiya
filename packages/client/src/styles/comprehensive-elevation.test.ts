import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { designTokenStylesheet, shadows } from "./tokens";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const vueRoot = new URL("../", import.meta.url).pathname;
function vueFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? vueFiles(join(dir, entry.name)) : entry.name.endsWith(".vue") ? [join(dir, entry.name)] : []);
}

// Source-level coverage: no mounting .vue components in this workspace.
describe("all page and component elevation roles", () => {
  it("inventories all Vue surfaces and keeps dialogs, focus rings and emergency glow out of blanket rules", () => {
    const files = vueFiles(vueRoot);
    expect(files.length).toBeGreaterThanOrEqual(37);
    const templates = files.map((file) => readFileSync(file, "utf8").split("<script")[0]).join("\n");
    expect(templates).not.toMatch(/\bshadow-(?:sm|md|lg|xl|2xl|inner|none)\b/);
    const css = source("./tailwind.css");
    expect(css).not.toMatch(/\.v-card\s*\{[^}]*box-shadow:/);
    expect(source("../components/sos/SosTriggerButton.vue")).toContain("box-shadow: 0 0.75rem 1.9rem rgba(185, 28, 28, 0.45);");
    expect(source("../components/map/LiveCompanionPanel.vue")).toContain(".live-companions__avatar");
  });

  it("defines theme-aware depth for floating map controls and gradient heroes", () => {
    const [light, dark] = designTokenStylesheet().split(":root.dark {");
    for (const [mode, output] of [["light", light], ["dark", dark]] as const) {
      expect(output).toContain(`--bb-shadow-overlay: ${shadows[mode].overlay}`);
      expect(output).toContain(`--bb-shadow-hero: ${shadows[mode].hero}`);
    }
    expect(shadows.light.overlay).not.toBe(shadows.dark.overlay);
    expect(shadows.light.hero).not.toBe(shadows.dark.hero);
    const css = source("./tailwind.css");
    expect(css).toMatch(/\.v-card\.bb-floating-card\s*\{\s*box-shadow: var\(--bb-shadow-overlay\) !important;/);
    expect(css).toMatch(/@media \(max-width: 1023px\)\s*\{\s*\.v-card\.bb-floating-card\s*\{\s*box-shadow: var\(--bb-shadow-surface\) !important;/);
  });

  it("uses floating depth only on map overlays, not their parent canvas or modal dialogs", () => {
    for (const path of [
      "../components/map/PlaceSearchPanel.vue", "../components/map/HistoryPlaybackPanel.vue",
      "../components/map/LiveCompanionPanel.vue", "../components/map/OwnPositionBar.vue"
    ]) {
      expect(source(path)).toContain("bb-floating-card");
    }
    const userMap = source("../views/_user/UserMapView.vue");
    expect(userMap).not.toContain('user-map-view__toolbar-card');
    expect(userMap).not.toContain('<OwnPositionBar :api="own"');
    expect(userMap).toContain('class="user-map-view__recenter"');
    expect(source("../components/map/OwnPositionBar.vue")).toContain('class="own-position bb-floating-card" :class="`own-position--${tone}`" elevation="2"');
    const dispatch = source("../views/_admin/AdminDispatchView.vue");
    expect(dispatch).toContain('class="map-selected-alert-card bb-floating-card"');
    expect(dispatch).toMatch(/@media \(max-width: 1279px\)[\s\S]*?\.map-selected-alert-card\.bb-floating-card\s*\{\s*box-shadow: var\(--bb-shadow-surface\) !important;/);
    expect(source("../components/sharing/LiveBroadcastBar.vue"))
      .toContain("'bb-floating-card': compact");
    expect(source("../components/map/MapCanvas.vue")).not.toContain("bb-floating-card");
    expect(source("../components/sharing/ShareDialog.vue")).not.toContain("bb-floating-card");
  });

  it("gives dark gradient heroes depth while leaving the SOS action and decorative rings alone", () => {
    for (const [path, selector] of [
      ["../views/_user/UserMissionView.vue", ".mission-hero"],
      ["../components/shell/ProposalInboxContent.vue", ".offers__hero"],
      ["../views/_user/UserSosHistoryView.vue", ".history__hero"]
    ]) {
      const css = source(path);
      const block = css.slice(css.indexOf(`${selector} {`)).split("}")[0]!;
      expect(block).toContain("box-shadow: var(--bb-shadow-hero);");
    }
    const auth = source("./auth.css");
    expect(auth).toMatch(/\.auth-intro\s*\{[^}]*box-shadow: var\(--bb-shadow-hero\);/);
    expect(auth).not.toMatch(/:root\.dark \.auth-intro\s*\{[^}]*box-shadow:/);
  });

  it("shares featured auth and welcome depth across themes and keeps disabled buttons flat", () => {
    const [light, dark] = designTokenStylesheet().split(":root.dark {");
    expect(light).toContain(`--bb-shadow-feature: ${shadows.light.feature}`);
    expect(dark).toContain(`--bb-shadow-feature: ${shadows.dark.feature}`);
    const css = source("./tailwind.css");
    const auth = source("./auth.css");
    expect(css).toMatch(/\.welcome-card\s*\{[^}]*box-shadow: var\(--bb-shadow-feature\) !important;/);
    expect(auth).toMatch(/\.auth-card\s*\{[^}]*box-shadow: var\(--bb-shadow-feature\) !important;/);
    expect(css).not.toMatch(/:root\.dark \.welcome-card\s*\{[^}]*box-shadow:/);
    expect(auth).not.toMatch(/:root\.dark \.auth-card\s*\{[^}]*box-shadow:/);
    expect(auth).toMatch(/\.v-btn\.auth-submit:not\(:disabled\)\s*\{[^}]*box-shadow: var\(--bb-shadow-item-hover\);/);
    expect(auth).toMatch(/\.v-btn\.auth-submit:disabled\s*\{\s*box-shadow: none;/);
  });

  it("elevates only the flat guest login action, not the profile menu or its sign-out", () => {
    const css = source("./tailwind.css");
    expect(css).toMatch(/\.login-button\.v-btn--variant-flat\s*\{\s*box-shadow:/);
    expect(css).not.toMatch(/\.login-button\s*\{[^}]*box-shadow:/);
    expect(source("../App.vue")).toContain('class="login-button" to="/_auth/login" color="primary" variant="flat"');
    expect(source("../App.vue")).not.toContain('class="login-button" color="primary" variant="tonal"');
  });
});
