import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const map = source("../views/_user/UserMapView.vue");
const mission = source("../views/_user/UserMissionView.vue");
const room = source("../components/mission/MissionLivePanel.vue");
const status = source("../components/mission/MissionStatusPanel.vue");
const point = source("../components/map/PointRouteSheet.vue");
const routes = source("../components/map/PointRouteChoicesSheet.vue");
const transport = source("../components/map/PointTransportChoicesSheet.vue");
const share = source("../components/sharing/ShareDialog.vue");
const offers = source("../components/shell/ProposalInboxContent.vue");
const drawer = source("../components/shell/MapProposalSidebar.vue");
const sidebar = source("../components/shell/MapSidebar.vue");
const history = source("../components/map/HistoryPlaybackPanel.vue");
const detail = source("../components/map/CompanionDetailSheet.vue");
const address = source("../components/map/ReverseAddressSheet.vue");
const shareLists = source("../components/sharing/ShareLists.vue");
function style(sfc: string, filename: string): string {
  const css = parse(sfc).descriptor.styles[0]!.content;
  const result = compileStyle({ filename, id: "data-v-map-scroll", scoped: true, source: css });
  expect(result.errors).toEqual([]);
  return css;
}

// Source/compiled-style contracts only. Do not mount .vue files (docs/TASKS.md).
describe("map workspace scroll ownership", () => {
  it("gives Search and Companions one scroller at each breakpoint", () => {
    const css = style(map, "UserMapView.vue");
    expect(css).toContain(':global(.user-map-view__search .place-search.v-card) {\n  max-height: calc(100dvh - 6rem');
    expect(css).toContain('overflow: hidden;\n}');
    const searchCss = style(source('../components/map/PlaceSearchPanel.vue'), 'PlaceSearchPanel.vue');
    expect(searchCss).toContain('.place-search__content { flex: 0 1 auto; min-height: 0;');
    expect(searchCss).toContain('overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable;');
    expect(css).toContain(':global(.user-map-view__search-dialog .place-search__content) {\n    flex: 1 1 auto; min-height: 0; max-height: none; overflow-y: auto;');
    expect(css).toContain(':global(.user-map-view__live .live-companions__peers) { max-height: none; overflow: visible; }');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain;'); // Fullscreen phone dialog body.
    expect(css).toContain('max-height: none;\n    overflow: visible;'); // Tablet page scroll, not nested search.
    expect(style(share, "ShareDialog.vue")).not.toMatch(/\.share-dialog__results\s*\{[^}]*overflow-y:\s*auto/);
  });

  it("keeps trip options and confirmation reachable without a seven-rem phone viewport", () => {
    const trip = style(point, "PointRouteSheet.vue");
    expect(trip).toContain('.point-route-shell--expanded .point-route.bb-map-navigation-card {\n    max-height: min(40rem, max(7rem, calc(100dvh - 12.25rem');
    expect(trip).toContain('.point-route__content { overflow-y: auto;');
    expect(trip).toContain('.point-route__content { flex: none; overflow: visible; }');
    expect(trip).toContain('overflow-y: auto; /* One scroll surface when the header and footer alone fill the card. */');
    for (const [sfc, filename, list] of [
      [routes, "PointRouteChoicesSheet.vue", ".point-route-choices__list"],
      [transport, "PointTransportChoicesSheet.vue", ".point-transport-choices__list"]
    ]) {
      const css = style(sfc, filename);
      expect(css).toContain('max-height: max(7rem, calc(100dvh - 12.25rem');
      expect(css).toContain(`${list} { flex: none; overflow-y: visible; }`); // Short phones: outer card only.
      expect(css).toContain('overflow-y: auto; }');
    }
  });

  it("keeps long map-side drawers and detail sheets on a single scroll surface", () => {
    expect(style(sidebar, "MapSidebar.vue")).toContain('.map-sidebar__scroll) {\n  flex: 1 1 auto; min-height: 0;');
    expect(style(drawer, "MapProposalSidebar.vue")).toContain('.map-proposal__details-scroll .offers .offers__items) {\n  max-height: none; overflow: visible;');
    expect(style(history, "HistoryPlaybackPanel.vue")).toContain('max-height: none;\n    overflow: hidden;'); // Closed history stays compact.
    expect(style(detail, "CompanionDetailSheet.vue")).toContain('.companion-detail__body { min-height: 0; overflow-y: auto;');
    expect(style(address, "ReverseAddressSheet.vue")).toContain('.reverse-address__body { min-height: 0; overflow-y: auto;');
    expect(style(shareLists, "ShareLists.vue")).toContain('.share-lists__confirm-body { min-height: 0; overflow-y: auto;');
  });

  it("expands mission tools, keeps their close actions visible and never nests offer swipes", () => {
    const css = style(mission, "UserMissionView.vue");
    const team = style(room, "MissionLivePanel.vue");
    const stage = style(status, "MissionStatusPanel.vue");
    expect(mission).toContain('v-if="!desk.terminalHold.value && (!activeTool || activeTool === \'status\')"');
    expect(css).toContain('max-height: calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('top: calc(.75rem + env(safe-area-inset-top, 0px));\n    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));\n    max-height: none;');
    expect(team).toContain('max-height: min(15.5rem, calc(100dvh - 19rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px)));');
    expect(team).toContain('top: calc(.75rem + env(safe-area-inset-top, 0px));\n    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));');
    // Tools replace the progress sheet while the camera/SOS strip remains clear.
    for (const height of [561, 667, 800]) {
      const panelTop = height - 9.5 * 16 - (height - 19 * 16);
      expect(panelTop).toBeGreaterThanOrEqual(9 * 16);
    }
    for (const height of [320, 360, 560]) {
      const panelBottom = height - 9.5 * 16;
      const cameraTop = height - 5.75 * 16 - 48;
      expect(cameraTop - panelBottom).toBeGreaterThanOrEqual(12);
    }
    expect(team).toContain('.live-panel__member-list { list-style: none;');
    expect(team).toContain('overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable;');
    expect(team).toContain('overflow: hidden; backdrop-filter: blur(12px);');
    expect(stage).toContain('.mission-desk__card-header { position: sticky;');
    expect(css).toContain('.mission-desk__terminal-alert :deep(.v-btn) { position: sticky; bottom: 0;');
    expect(css).toContain('.mission-desk__guidance--warning span { flex: 1 1 100%; max-height: none; overflow: visible; }');
    expect(css).toContain('.mission-desk__empty :deep(.offers__items) {\n  max-height: none; overflow: visible;');
    expect(drawer).toContain('.map-proposal__details-scroll .offers .offers__items');
    expect(offers).toContain('detail.closest<HTMLElement>(".mission-desk__empty, .map-proposal__details-scroll")');
  });
});
