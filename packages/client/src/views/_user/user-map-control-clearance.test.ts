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
    // Editing the trip route is not a Sharing-tab action, even while guidance continues.
    expect(map).toContain('v-show="!!journey.point.value && mode === \'trips\' && !missionActive"');
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
