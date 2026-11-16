import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// docs/TASKS.md: source/compiled-template checks, not mounted Vue components.
const map = readFileSync(new URL("../views/_user/UserMapView.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const room = readFileSync(new URL("../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");
const cards = readFileSync(new URL("../components/mission/MissionMapCards.vue", import.meta.url), "utf8");

describe("Missions search, short phones and shared-map tab boundaries", () => {
  it("lets idle Missions search explore the map without a disabled stop dialog or a personal trip", () => {
    const branch = map.slice(map.indexOf('if (missionActive.value || mode.value === "missions")'), map.indexOf('journey.select({ lat: place.lat'));
    expect(branch).toContain('if (!missionActive.value && !missionShare.mission) return;');
    expect(branch.indexOf('if (!missionActive.value && !missionShare.mission) return;'))
      .toBeLessThan(branch.indexOf('pendingMissionStop.value = place;'));
    expect(branch).not.toContain('journey.select');
    expect(map).toContain(':disabled="!missionShare.mission" @click="addMissionStop"');
    expect(map).toContain('assignmentId !== missionShare.mission?.id'); // Revocation invalidates consent.
    expect(map).toContain('missionWorkspace.value?.addSearchWaypoint(place.lat, place.lon)');
  });

  it("removes private mission pins and route geometry while Sharing uses the same canvas, without ending guidance or sharing", () => {
    expect(map).toContain('v-show="mode === \'missions\'" ref="missionWorkspace"');
    expect(mission).toContain(':visible="visible" :external-canvas="embedded"');
    expect(room).toContain('visible?: boolean;');
    expect(room).toContain('visible: true'); // Standalone requester/admin rooms remain visible.
    expect(room).toContain('if (!props.visible) { clearMarkers(); return; }');
    expect(room).toContain('watch(() => props.visible, (visible) => {\n  syncMarkers();');
    expect(room).toContain('if (!props.visible || !map.value) return;');
    expect(room).toContain('if (!props.visible) return;\n  if (hasMarkers.value) focusMembers();');
    expect(mission).toContain('const incident = props.visible && routing.visible.value ? routing.target.value?.incident : null;');
    expect(mission).toContain('clearRouteOverlays(!incident);');
    expect(mission).toContain('watch(() => props.visible, (visible) => {\n  syncRouteMap();');
    expect(mission).toContain('if (!props.visible || !map || !map.isStyleLoaded()) return;');
    expect(mission).toContain('if (!props.visible || !map || !routing.visible.value || !routing.target.value || !needsOverlayRestore({');
    expect(mission).toContain('if (visible && navigation.active.value && followingGps.value) navigation.recenter();');
    expect(mission).toContain('if (props.visible && followingGps.value) routeMap?.easeTo(camera);');
    expect(mission).toContain('if (props.visible && event.originalEvent) pauseGuidanceFollow();');
    const tabWatcher = mission.slice(mission.indexOf('watch(() => props.visible, (visible) => {\n  syncRouteMap();'), mission.indexOf('function applyRouteLayer(): void'));
    expect(tabWatcher).not.toContain('navigation.stop()');
    expect(tabWatcher).not.toContain('routing.reset()');
    expect(tabWatcher).not.toContain('missionShare.stop');
    // Sharing still renders its own inbound grant overlays on the parent map.
    expect(map).toContain('showCompanions.value && (mode.value === "sharing" || !missionActive.value)');
  });

  it("gives short phones room for a scrollable step list beside the key, with manual action reachable", () => {
    const css = parse(mission).descriptor.styles[0]!.content;
    const short = css.slice(css.indexOf('@media (max-width: 599px) and (max-height: 560px) {'));
    expect(short).toContain('.mission-desk__map-cards {\n    top: calc(4.25rem + env(safe-area-inset-top, 0px));\n    bottom: calc(9rem + env(safe-area-inset-bottom, 0px));');
    expect(short).toContain('width: min(18rem, calc(100vw - 12.5rem');
    expect(short).toContain('max-height: none;');
    expect(short).toContain('.mission-desk__map-legend-body { grid-template-columns: minmax(0, 1fr); }');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain; pointer-events: auto;');
    // 430px with 16px root font and no cutout: 430 - 68 - 144 = 218px,
    // not the former 96px cap. Insets deliberately reduce the available space.
    expect(430 - 4.25 * 16 - 9 * 16).toBeGreaterThan(200);
    expect(cards.indexOf('class="mission-desk__phase-summary"')).toBeLessThan(cards.indexOf('class="mission-desk__next-step"'));
    const cardCss = parse(cards).descriptor.styles[0]!.content;
    expect(cardCss).toContain('.mission-desk__next-step { position: sticky; bottom: 0;');
    for (const [source, filename] of [[mission, 'UserMissionView.vue'], [room, 'MissionLivePanel.vue'], [cards, 'MissionMapCards.vue']] as const) {
      const sfc = parse(source).descriptor;
      expect(compileTemplate({ source: sfc.template!.content, filename, id: filename }).errors).toEqual([]);
      expect(compileStyle({ source: sfc.styles[0]!.content, filename, id: filename, scoped: true }).errors).toEqual([]);
    }
  });
});
