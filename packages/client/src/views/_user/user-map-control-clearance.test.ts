import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const map = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");

describe("shared map icon clearance", () => {
  it("keeps Location usable in Sharing, including during a mission and inside the phone dialog", () => {
    const shared = map.slice(map.indexOf('class="user-map-view__recenter"'), map.indexOf('class="user-map-view__share"'));
    expect(shared).toContain('v-show="(mode !== \'missions\' || !missionWorkspace?.hasActiveMission) && !(isPhone && activeTool)"');
    expect(shared).toContain('@click="centerOnOwnLocation"');
    expect(shared).not.toContain('v-show="!missionActive');
    const live = map.slice(map.indexOf('class="user-map-view__live-title"'), map.indexOf('class="user-map-view__live-body"'));
    expect(live).toContain(':aria-label="recenterLabel"');
    expect(live).toContain(':disabled="!map || !auth.user"');
    expect(live).toContain('@click="focusOwnFromDialog"');
    const history = map.slice(map.indexOf('class="user-map-view__history-title"'), map.indexOf('class="user-map-view__history-body"'));
    expect(history).toContain(':aria-label="recenterLabel"');
    expect(history).toContain('@click="focusOwnFromDialog"');
    expect(map).toContain('document.getElementById("map-recenter")?.focus({ preventScroll: true })');
    expect(map).toContain('if (initiatedByUser && isPhone.value && activeTool.value) closeTool(false);');
  });

  it("keeps navigation controls above the guidance card after changing to Sharing", () => {
    expect(map).toContain("'user-map-view--navigating': isPhone && journey.navigating.value && !journey.sheetOpen.value");
    expect(map).toContain("if (next === \"sharing\") void selectTool(\"live\")");
    expect(map).toContain("--bb-map-navigation-sheet-height");
    expect(map).toContain(".user-map-view--navigating .user-map-view__search-action");
    expect(map).toContain(".user-map-view--navigating .user-map-view__share");
    expect(map).toContain(".user-map-view--navigating .user-map-view__recenter");
    expect(map).toContain(".user-map-view--navigating .user-map-view__canvas :deep(.maplibregl-ctrl-top-right)");
    // MapLibre's direction is independent of the RTL app; physical-right
    // anchoring must agree with the SOS, Sharing and recenter controls.
    const css = parse(map).descriptor.styles[0]!.content;
    const compass = css.slice(css.indexOf('.user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {'));
    expect(compass).toContain('right: 1.25rem;');
    expect(compass.slice(0, compass.indexOf('}'))).not.toContain('inset-inline-start:');
    expect(css).toContain('right: calc(7.75rem + env(safe-area-inset-right, 0px)); left: auto;');
    // Editing the trip route stays in the planner, not a floating action on Sharing.
    expect(map).not.toContain('id="map-route-choices-toggle"');
    expect(map).toContain('@choose-route="openRouteChoices"');
  });

  it("centers idle mission offers while keeping Location at the lower right", () => {
    expect(map).toContain("'user-map-view--mission-idle': mode === 'missions' && !missionWorkspace?.hasActiveMission");
    const mapCss = parse(map).descriptor.styles[0]!.content;
    // The empty/unverified briefing owns the top map. The two upper rail
    // controls belong above SOS/compass, not on the headline or the alert.
    expect(mapCss).not.toContain('.user-map-view--mission-idle .user-map-view__recenter');
    expect(mapCss).toContain('.user-map-view--mission-idle .user-map-view__share {\n    top: auto; bottom: calc(7.75rem + env(safe-area-inset-bottom, 0px));\n    right: calc(.75rem + env(safe-area-inset-right, 0px)); left: auto;');
    expect(mapCss).toContain('.user-map-view--mission-idle .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-right) {\n    top: auto; bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px));');
    expect(7.75 - (4.25 + 3)).toBe(.5);
    expect(mapCss).toContain('inset-block-end: calc(.75rem + env(safe-area-inset-bottom, 0px));');
    expect(mapCss).toContain('inset-block-end: calc(4.25rem + env(safe-area-inset-bottom, 0px));');
    expect(mapCss).toContain('inset-inline-start: calc(4.25rem + env(safe-area-inset-right, 0px));');
    expect(mapCss).toContain('right: calc(7.75rem + env(safe-area-inset-right, 0px));');
    const missionCss = parse(mission).descriptor.styles[0]!.content;
    const phone = missionCss.slice(missionCss.indexOf('@media (max-width: 599px) {'));
    const panel = phone.slice(phone.indexOf('.mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty {'));
    expect(panel).toContain('margin: calc(8.5rem + env(safe-area-inset-top, 0px)) auto 0;');
    expect(panel).toContain('width: min(42rem, calc(100vw - 1.5rem');
    expect(panel).toContain('max-height: max(3.75rem, calc(100dvh - 16rem');
    expect(panel).not.toContain('margin: calc(8.5rem + env(safe-area-inset-top, 0px)) 0 0 calc(');
    // At 320px the card is centered: 12px margins; at 568px high it
    // ends 4px above the fixed SOS hit area, even though it can scroll.
    expect((320 - (320 - 24)) / 2).toBe(12);
    expect(568 - 7.5 * 16).toBeLessThan(568 - 4.25 * 16 - 48);
  });

  it("places the shared compass beside mission focus on phones, not behind its panels", () => {
    expect(mission).toContain("hasOpenMapTool: computed(() => !!desk.activeMission.value && !!activeTool.value)");
    expect(map).toContain("'user-map-view--mission-active': mode === 'missions' && !!missionWorkspace?.hasActiveMission");
    expect(map).toContain("'user-map-view--mission-tool-open': mode === 'missions' && !!missionWorkspace?.hasOpenMapTool");
    const css = parse(map).descriptor.styles[0]!.content;
    expect(css).toContain(".user-map-view--mission-active .user-map-view__canvas :deep(.maplibregl-ctrl-top-right)");
    const active = css.slice(css.indexOf('.user-map-view--mission-active .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {'));
    expect(active).toContain('bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));');
    expect(active).toContain('right: calc(4.25rem + env(safe-area-inset-right, 0px));');
    expect(css).toContain(".user-map-view--mission-active.user-map-view--mission-steps");
    const missionCss = parse(mission).descriptor.styles[0]!.content;
    expect(missionCss).toContain(".mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty");
    for (const [file, source] of [["UserMapView.vue", map], ["UserMissionView.vue", mission]] as const) {
      const descriptor = parse(source).descriptor;
      expect(compileTemplate({ filename: file, id: "map-clearance", source: descriptor.template!.content }).errors).toEqual([]);
      expect(compileStyle({ filename: file, id: "map-clearance", scoped: true, source: descriptor.styles[0]!.content }).errors).toEqual([]);
    }
  });
});
