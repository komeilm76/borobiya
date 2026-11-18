import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const css = styles[0]!.content;

// docs/TASKS.md: source/compiled-SFC checks, not mounted Vue components.
describe("waypoint-pick map clearance", () => {
  it("temporarily replaces the stage sheet and launchers with the cancellable map hint", () => {
    expect(source).toContain("'mission-desk--steps-visible': !!desk.activeMission.value && !desk.terminalHold.value && !activeTool && !pickingWaypoint");
    expect(source).toContain('v-if="!desk.terminalHold.value && !pickingWaypoint && (!activeTool || activeTool === \'status\')"');
    expect(source).toContain('v-show="!pickingWaypoint" id="mission-tool-status"');
    expect(source).toContain('v-show="!desk.terminalHold.value && !pickingWaypoint && (!activeTool || activeTool === \'status\')"');
    expect(source).toContain('hasStepsSheet: computed(() => !!desk.activeMission.value && !desk.terminalHold.value && !activeTool.value && !pickingWaypoint.value)');
    expect(source).toContain('if (pickingWaypoint.value) legendOpen.value = false;');
    expect(source).toContain('activeTool.value = pickingWaypoint.value ? null : "route";');
    expect(source).toContain('id="mission-cancel-waypoint" type="button" @click="cancelWaypointPick"');
    expect(source).toContain('if (!props.visible || !desk.activeMission.value || desk.terminalHold.value || activeTool.value || pickingWaypoint.value) return;');
    expect(source).toContain('() => desk.terminalHold.value, legendOpen, pickingWaypoint],');
    expect(source).toContain('document.documentElement.style.removeProperty("--bb-map-mission-sheet-height")');
  });

  it("makes Cancel a distinct 44px target above SOS on short phones without shrinking the map", () => {
    expect(css).toContain('.mission-desk__map-hint button { position: sticky; top: 0; min-height: 44px;');
    expect(css).toContain('.mission-desk__map-hint button:focus-visible {');
    expect(css).toContain('.mission-desk--embedded .mission-desk__map-hint,');
    expect(css).toContain('bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));\n    max-height: max(4rem, calc(100dvh - 16rem');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain;');
    expect(css).toContain('.mission-desk__map-hint [role="alert"] { grid-column: 1 / -1; }');
    expect(source).toContain('if (!props.visible || !pickingWaypoint.value || navigation.active.value) return;');
    expect(source).toContain('if (pickingWaypoint.value) { cancelWaypointPick(); return; }');
    expect(compileTemplate({ source: template!.content, filename: "UserMissionView.vue", id: "waypoint-clearance" }).errors).toEqual([]);
    expect(compileStyle({ source: css, filename: "UserMissionView.vue", id: "waypoint-clearance", scoped: true }).errors).toEqual([]);
  });
});
