import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { createMemoryHistory } from "vue-router";
import { compileTemplate, parse } from "vue/compiler-sfc";
import { createAppRouter } from "@/router";
import { proposalEntryIntent, workspaceTabQuery } from "./workspace-tab-query";

vi.mock("@client/views/_user/UserMapView.vue", () => ({ default: {} }));
const map = readFileSync(new URL("../views/_user/UserMapView.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const room = readFileSync(new URL("../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");
const offers = readFileSync(new URL("../components/shell/ProposalInboxContent.vue", import.meta.url), "utf8");
const proposalDrawer = readFileSync(new URL("../components/shell/MapProposalSidebar.vue", import.meta.url), "utf8");

// Source and compiled-template tests: never mount .vue components in unit tests.
describe("one persistent user map workspace", () => {
  it("redirects old mission bookmarks to Missions without discarding query parameters", async () => {
    const router = createAppRouter(createMemoryHistory(), {
      isAuthenticated: true, mustCompleteSecurityQuestions: false,
      user: { role: "user" }, ensureSession: async () => {}
    });
    await router.push("/_user/mission?offer=example");
    expect(router.currentRoute.value.path).toBe("/_user/map");
    expect(router.currentRoute.value.query).toMatchObject({ tab: "missions", offer: "example" });
  });
  it("opens bookmarked proposals once, then keeps them closed across every map tab", async () => {
    const router = createAppRouter(createMemoryHistory(), {
      isAuthenticated: true, mustCompleteSecurityQuestions: false,
      user: { role: "user" }, ensureSession: async () => {}
    });
    for (const link of ["/_user/map?inbox=1", "/_user/map?offer=example"]) {
      await router.push(link);
      expect(proposalEntryIntent(router.currentRoute.value.path, router.currentRoute.value.query)).not.toBeNull();
      for (const tab of ["missions", "sharing", "history", "trips"] as const) {
        const current = router.currentRoute.value;
        await router.push({ path: "/_user/map", query: workspaceTabQuery(current.query, tab) });
        expect(router.currentRoute.value.query.tab).toBe(tab);
        expect(proposalEntryIntent(router.currentRoute.value.path, router.currentRoute.value.query)).toBeNull();
      }
    }
  });
  it("uses one canvas for idle/active mission, search and trip, never a second offer/room map", () => {
    expect(map.match(/<MapCanvas\b/g)).toHaveLength(1);
    expect(mission).not.toMatch(/<MapCanvas\b/);
    expect(room).toContain('<MapCanvas v-if="!externalCanvas"');
    expect(mission).toContain(':external-canvas="embedded"');
    expect(map).toContain('embedded :visible="mode === \'missions\'" :external-map="map" :external-marker="workspaceMarker"');
    expect(offers).not.toMatch(/<MapCanvas\b/);
    for (const [source, filename] of [[map, "UserMapView.vue"], [mission, "UserMissionView.vue"], [room, "MissionLivePanel.vue"], [offers, "ProposalInboxContent.vue"]] as const)
      expect(compileTemplate({ source: parse(source).descriptor.template!.content, filename, id: filename }).errors).toEqual([]);
  });
  it("keeps mission navigation and its private overlays mounted while Sharing is selected", () => {
    expect(map).toContain('v-if="auth.user?.role === \'user\' && (mode === \'missions\' || missionActive)"');
    expect(map).toContain('v-show="mode === \'missions\'" ref="missionWorkspace"');
    expect(room).toContain('watch(() => [props.externalMap, props.externalMarker] as const');
    expect(room).toContain('clearMarkers(); detachCameraGesture?.();');
    expect(mission).toContain('closeRoutes(); // Revoke GPS guidance and private incident overlays immediately.');
    expect(mission).toContain('if (next) closeRoutes(); // Same mounted canvas, new private incident.');
  });
  it("never routes a mission search result to a personal destination or changes the incident", () => {
    const branch = map.slice(map.indexOf('if (missionActive.value || mode.value === "missions")'), map.indexOf('journey.select({ lat: place.lat'));
    expect(branch).toContain('pendingMissionStop.value = place');
    expect(branch).toContain('return;');
    expect(map).toContain('فقط به‌عنوان ایستگاه میانی افزوده می‌شود؛ محل حادثه مقصد نهایی می‌ماند.');
    expect(mission).toContain('if (navigation.active.value) stopGuidance();');
    expect(mission).toContain('routing.via.value.length >= 6');
    expect(mission).toContain('const added = routing.addWaypoint({ lat, lon });');
    expect(mission).toContain('if (!props.visible || !pickingWaypoint.value || navigation.active.value) return;');
    expect(mission).toContain('if (!visible && pickingWaypoint.value) {');
  });
  it("does not reopen proposal drawers on tab changes or scroll the entire map when an offer is selected", () => {
    expect(map).toContain('workspaceTabQuery(route.query, next)');
    expect(map).toContain('workspaceTabQuery(route.query, "history")');
    expect(map).toContain('workspaceTabQuery(route.query, "sharing")');
    expect(map).toContain('workspaceTabQuery(route.query, "missions")');
    expect(proposalDrawer).toContain('if (intent === lastEntryIntent) return;');
    expect(proposalDrawer).toContain('const intent = proposalEntryIntent(route.path, route.query);');
    expect(proposalDrawer).toContain('returnFocusOnClose.value = false;');
    expect(offers).toContain('detail.closest<HTMLElement>(".mission-desk__empty, .map-proposal__details-scroll")');
    expect(offers).not.toContain('detailRef.value?.scrollIntoView(');
    expect(mission).toContain('.mission-desk__empty :deep(.offers__items) {');
    expect(mission).toContain('max-height: none; overflow: visible; padding: 0;');
    expect(proposalDrawer).toContain('.map-proposal__details-scroll .offers .offers__items');
    expect(map).toContain('max-width: calc(100% - 8.5rem); overflow: hidden;');
  });
  it("leaves offers accessible while trip navigation locks Missions/History", () => {
    expect(map).toContain(':disabled="!modeAvailability[item.id]');
    expect(map).toContain(':disabled="tool.id === \'history\' && !modeAvailability.history"');
    expect(map).toContain('if (selected === "history" && !modeAvailability.value.history) return;');
    expect(map).toContain('if (journey.point.value || journey.navigating.value || journey.navigationPending.value) clearPointRoute();');
    expect(offers).toContain('mapTripSession.endForMission()');
  });
});
