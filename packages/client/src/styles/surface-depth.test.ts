import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { designTokenStylesheet, shadows } from "./tokens";

// No .vue mounting in this workspace. Pin the actual surface wiring and the shadow cascade:
// Vuetify's elevation-0 class uses !important, so an ordinary scoped box-shadow does not win.
const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

describe("surface depth across light and dark UI", () => {
  it("provides distinct theme-aware surface shadows and a scoped utility that beats elevation-0", () => {
    const tokens = designTokenStylesheet();
    const [light, dark] = tokens.split(":root.dark {");
    expect(light).toMatch(/--bb-shadow-surface: [^;}]*rgba\([^)]*, 0\.[0-9]+\)/);
    expect(dark).toMatch(/--bb-shadow-surface: [^;}]*rgba\([^)]*, 0\.[0-9]+\)/);
    expect(shadows.light.surface).not.toBe(shadows.dark.surface);
    expect(light).toContain(`--bb-shadow-surface: ${shadows.light.surface}`);
    expect(dark).toContain(`--bb-shadow-surface: ${shadows.dark.surface}`);
    const css = source("./tailwind.css");
    expect(css).toMatch(/\.v-card\.bb-surface-card\s*\{\s*box-shadow:\s*var\(--bb-shadow-surface\)\s*!important;/);
    expect(css).not.toMatch(/\.v-card\s*\{[^}]*box-shadow:/); // not dialogs/inset cards
  });

  it("gives previously flat top-level admin tables and share lists an explicit surface tier", () => {
    for (const path of [
      "../views/_admin/AdminIncidentsView.vue",
      "../views/_admin/AdminCategoriesView.vue"
    ]) {
      expect(source(path)).toMatch(/<v-card\s+elevation="0"\s+rounded="xl"\s+class="overflow-hidden bb-surface-card"/);
    }
    expect(source("../components/sharing/ShareLists.vue"))
      .toMatch(/<v-card class="share-lists bb-surface-card" elevation="0"/);
    expect(source("../views/_admin/AdminUsersView.vue"))
      .toMatch(/\.admin-users-card\s*\{[^}]*box-shadow:\s*var\(--bb-shadow-surface\)\s*!important;/);
  });

  it("makes dashboard and device surfaces visible despite Vuetify elevation-0", () => {
    const dashboard = source("../views/_user/UserDashboardView.vue");
    expect(dashboard).toMatch(/\.user-dashboard__note-card\s*\{[^}]*box-shadow:\s*var\(--bb-shadow-surface\)\s*!important;/);
    expect(dashboard).not.toMatch(/:global\(:root.dark\) \.user-dashboard__feature-card\s*\{[^}]*box-shadow:/);
    const devices = source("../components/settings/DevicePriorityPanel.vue");
    expect(devices).toMatch(/\.device-priority__card\s*\{[^}]*box-shadow:\s*var\(--bb-shadow-surface\)\s*!important;/);
  });

  it("keeps custom primary panels aligned without raising nested rows and selection rings", () => {
    const mission = source("../views/_user/UserMissionView.vue");
    const proposals = source("../views/_user/UserProposalsView.vue");
    const history = source("../views/_user/UserSosHistoryView.vue");
    const rescuer = source("../views/_user/UserRescuerHistoryView.vue");
    for (const [text, selector] of [
      [mission, ".mission-route"], [mission, ".mission-desk__card"],
      [proposals, ".accepted-map"], [proposals, ".offer-detail"],
      [history, ".history__panel"], [rescuer, ".history__detail"],
      [source("../components/mission/MissionLivePanel.vue"), ".live-panel"],
      [source("../components/mission/MissionTimelinePanel.vue"), ".timeline"]
    ]) {
      expect(text).toContain(`${selector}`);
      expect(text).toMatch(new RegExp(`${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[^}]*box-shadow: var\\(--bb-shadow-surface\\)`));
    }
    expect(proposals).toContain(".offer-card--selected { border-color: #319581; box-shadow: 0 0 0 2px");
    expect(history).toContain(".history__item--selected { border-color: #269b7c; box-shadow: 0 0 0 2px");
  });
});
