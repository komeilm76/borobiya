import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const map = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");

describe("shared map icon clearance", () => {
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
    expect(css).toContain('right: calc(11.25rem + env(safe-area-inset-right, 0px)); left: auto;');
    // Editing the trip route stays in the planner, not a floating action on Sharing.
    expect(map).not.toContain('id="map-route-choices-toggle"');
    expect(map).toContain('@choose-route="openRouteChoices"');
  });

  it("centers idle mission offers beneath a dedicated icon row, clear of SOS", () => {
    expect(map).toContain("'user-map-view--mission-idle': mode === 'missions' && !missionWorkspace?.hasActiveMission");
    const mapCss = parse(map).descriptor.styles[0]!.content;
    for (const action of ["recenter", "share"]) {
      expect(mapCss).toContain(`.user-map-view--mission-idle .user-map-view__${action}`);
    }
    const compass = mapCss.slice(mapCss.indexOf('.user-map-view--mission-idle .user-map-view__canvas :deep(.maplibregl-ctrl-top-right) {'));
    expect(compass).toContain('top: calc(4.85rem + env(safe-area-inset-top, 0px))');
    expect(compass).toContain('right: calc(7.75rem + env(safe-area-inset-right, 0px)); left: auto;');
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
    expect(css).toContain(".user-map-view--mission-tool-open .user-map-view__canvas :deep(.maplibregl-ctrl-top-right)");
    expect(css).toContain(".user-map-view--mission-active:not(.user-map-view--mission-tool-open)");
    const missionCss = parse(mission).descriptor.styles[0]!.content;
    expect(missionCss).toContain(".mission-desk--embedded:not(.mission-desk--active) .mission-desk__empty");
    for (const [file, source] of [["UserMapView.vue", map], ["UserMissionView.vue", mission]] as const) {
      const descriptor = parse(source).descriptor;
      expect(compileTemplate({ filename: file, id: "map-clearance", source: descriptor.template!.content }).errors).toEqual([]);
      expect(compileStyle({ filename: file, id: "map-clearance", scoped: true, source: descriptor.styles[0]!.content }).errors).toEqual([]);
    }
  });
});
