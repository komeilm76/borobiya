import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { designTokenStylesheet, radii } from "./tokens";

const src = fileURLToPath(new URL("../", import.meta.url));

function vueFiles(path: string): string[] {
  return readdirSync(path, { withFileTypes: true }).flatMap((entry) => {
    const full = join(path, entry.name);
    return entry.isDirectory() ? vueFiles(full) : entry.name.endsWith(".vue") ? [full] : [];
  });
}

function declaration(file: string, selector: string): string {
  const source = readFileSync(join(src, file), "utf8");
  const start = source.indexOf(`${selector} {`);
  expect(start, `${file}: missing ${selector}`).toBeGreaterThan(-1);
  return source.slice(source.indexOf("{", start) + 1, source.indexOf("}", start));
}

// Outer surfaces and clickable rows are deliberately different sizes; unrelated circles,
// badges, inputs, map markers and pill buttons keep their functional shapes.
const outer: Record<string, string[]> = {
  "styles/auth.css": [".auth-intro", ".auth-card"],
  "components/mission/MissionLivePanel.vue": [".live-panel"],
  "components/mission/MissionRatingPanel.vue": [".rating"],
  "components/mission/MissionTimelinePanel.vue": [".timeline"],
  "views/_user/UserMissionView.vue": [".mission-route", ".mission-hero", ".mission-desk__card, .mission-desk__empty"],
  "views/_user/UserProposalsView.vue": [".offers__hero", ".accepted-map", ".offer-detail", ".offers__empty"],
  "views/_user/UserRescuerHistoryView.vue": [".history__hero", ".history__detail,.history__empty"],
  "views/_user/UserSosHistoryView.vue": [".history__hero", ".history__panel,.history__empty"]
};

const nested: Record<string, string[]> = {
  "styles/auth.css": [".auth-trust-row", ".recovery-question"],
  "styles/tailwind.css": [".skeleton-note"],
  "components/map/PlaceSearchPanel.vue": [".place-search__result"],
  "components/mission/MissionLivePanel.vue": [".live-panel__member", ".live-panel__map"],
  "components/settings/DevicePriorityPanel.vue": [".device-priority__share"],
  "components/sharing/ShareDialog.vue": [".share-dialog__results"],
  "components/sharing/ShareLists.vue": [".share-lists__row"],
  "components/sos/SosRequestSheet.vue": [".sos-severity-card", ".sos-sheet__map-wrap"],
  "views/_admin/AdminDispatchView.vue": [".dispatch-mission-timeline"],
  "views/_admin/AdminUsersView.vue": [".admin-users-table-wrap", ".admin-mobile-card"],
  "views/_user/UserDashboardView.vue": [".user-dashboard__map-preview"],
  "views/_user/UserMapView.vue": [".user-map-view > .user-map-view__canvas"],
  "views/_user/UserMissionView.vue": [".mission-route__stops", ".mission-route__map", ".mission-route__choice", ".mission-steps__item"],
  "views/_user/UserProposalsView.vue": [".offers__stat", ".offer-card", ".offer-detail__facts > div", ".offers__skeleton", ".accepted-map__canvas", ".offer-detail__map", ".offer-detail__photo"],
  "views/_user/UserRescuerHistoryView.vue": [".history__item"],
  "views/_user/UserSosHistoryView.vue": [".history__item", ".history__evidence img"]
};

describe("card corner scale (source-pinned; no Vue mount)", () => {
  it("publishes a 24px outer / 16px nested scale for plain CSS", () => {
    expect(radii).toEqual({ card: 24, nested: 16 });
    expect(designTokenStylesheet()).toContain("--bb-radius-card: 24px");
    expect(designTokenStylesheet()).toContain("--bb-radius-nested: 16px");
  });

  it("uses Vuetify's 24px xl corners for all v-cards, retaining top-only corners on the SOS sheet", () => {
    for (const path of vueFiles(src)) {
      const source = readFileSync(path, "utf8");
      for (const tag of source.match(/<v-card(?=[\s>])[^>]*>/gs) ?? []) {
        expect(tag, path).toMatch(/\brounded="(?:xl|t-xl)"/);
        if (tag.includes('rounded="t-xl"')) {
          expect(path).toMatch(/SosRequestSheet\.vue$/);
        }
      }
    }
  });

  it("uses the same outer and nested tokens across custom card-like surfaces", () => {
    for (const [file, selectors] of Object.entries(outer)) {
      for (const selector of selectors) {
        expect(declaration(file, selector), `${file} ${selector}`).toContain("border-radius: var(--bb-radius-card, 24px)");
      }
    }
    for (const [file, selectors] of Object.entries(nested)) {
      for (const selector of selectors) {
        expect(declaration(file, selector), `${file} ${selector}`).toContain("border-radius: var(--bb-radius-nested, 16px)");
      }
    }
    const mission = readFileSync(join(src, "views/_user/UserMissionView.vue"), "utf8");
    expect(mission).not.toMatch(/\.mission-route\s*\{[^}]*border-radius:\s*18px/);
    const auth = readFileSync(join(src, "styles/auth.css"), "utf8");
    expect(auth).not.toMatch(/\.(?:auth-card|auth-intro)\s*\{[^}]*border-radius:\s*22px/);
    for (const file of ["UserProposalsView.vue", "UserRescuerHistoryView.vue", "UserSosHistoryView.vue"]) {
      const source = readFileSync(join(src, "views/_user", file), "utf8");
      expect(source).toMatch(/\.\w+__items:focus-visible\s*\{[^}]*border-radius:\s*var\(--bb-radius-nested, 16px\)/);
    }
  });

  it("uses nested corners for the dashboard broadcast card, but keeps standalone broadcast cards full-sized", () => {
    const dashboard = readFileSync(join(src, "views/_user/UserDashboardView.vue"), "utf8");
    expect(dashboard).toContain("<LiveBroadcastBar inset />");
    const broadcast = readFileSync(join(src, "components/sharing/LiveBroadcastBar.vue"), "utf8");
    expect(broadcast).toContain("'broadcast-bar--inset': inset");
    expect(declaration("components/sharing/LiveBroadcastBar.vue", ".broadcast-bar--inset"))
      .toContain("border-radius: var(--bb-radius-nested, 16px)");
    const shares = readFileSync(join(src, "views/_user/UserLocationSharesView.vue"), "utf8");
    expect(shares).toContain("<LiveBroadcastBar />");
  });

  it("keeps alert banners on one scale instead of mixing card-sized corners into them", () => {
    for (const path of vueFiles(src)) {
      const source = readFileSync(path, "utf8");
      for (const tag of source.match(/<v-alert(?=[\s>])[^>]*>/gs) ?? []) {
        expect(tag, path).not.toContain('rounded="xl"');
      }
    }
  });
});
