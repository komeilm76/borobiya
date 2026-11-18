import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Screenshot-state regression contracts; do not mount SFCs (docs/TASKS.md).
const map = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");
const mapCss = parse(map).descriptor.styles[0]!.content;
const missionCss = parse(mission).descriptor.styles[0]!.content;

function block(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  expect(i, selector).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf("}", i));
}

describe("photographed mission and sharing map controls", () => {
  it("removes Broadcast from the iPhone briefing instead of covering its bottom edge", () => {
    const button = map.slice(map.indexOf('class="user-map-view__share"'), map.indexOf('@click="broadcast.toggle()"'));
    expect(button).not.toContain("!broadcast.automaticActive && !missionShare.mission && !journey.navigating.value && !journey.navigationPending.value");
    expect(mission).toContain('hasOpenMapTool: computed(() => !!desk.activeMission.value && !!activeTool.value)');
    expect(mission).toContain('<MissionStatusPanel v-if="activeTool === \'status\'"');
    expect(map).toContain('v-show="(mode !== \'missions\' || !missionWorkspace?.hasActiveMission) && !(isPhone && activeTool)"');
  });

  it("uses two right-aligned phone columns in Sharing and closed Missions", () => {
    const phone = mapCss.slice(mapCss.indexOf('@media (max-width: 599px) {'));
    const controls = phone.slice(phone.indexOf('/* Search/Location are the lower row;'));
    const share = block(controls, '.user-map-view__share');
    expect(share).toContain('inset-inline-start: calc(.75rem + env(safe-area-inset-right, 0px));');
    expect(share).toContain('inset-block-end: calc(7.75rem + env(safe-area-inset-bottom, 0px));');
    expect(block(controls, '.user-map-view__recenter')).toContain('inset-block-end: calc(.75rem + env(safe-area-inset-bottom, 0px));');
    expect(block(phone, '.user-map-view__search-action')).toContain('inset-inline-start: calc(4.25rem + env(safe-area-inset-right, 0px));');
    expect(block(phone, '.user-map-view--mission-active.user-map-view--mission-steps .user-map-view__share'))
      .toContain('right: calc(.75rem + env(safe-area-inset-right, 0px)); left: auto;');
    // A 361px CSS viewport: each 48px hit target has an 8px gap to its neighbor.
    const right = 361 - .75 * 16 - 48, left = 361 - 4.25 * 16 - 48;
    expect(right - (left + 48)).toBe(8);
    expect(7.75 * 16 - (4.25 * 16 + 48)).toBe(8);
    expect(mapCss).toContain('bottom: min(calc(var(--bb-map-mission-sheet-height, 15rem) + 7.5rem),');
  });

  it("packs Surface Pro controls into one column, inserting Frame only when available", () => {
    const wide = mapCss.slice(0, mapCss.indexOf('@media (max-width: 599px) {'));
    expect(wide).toContain('inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 7rem);'); // Compass
    expect(wide).toContain('.user-map-view__share { inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 10.5rem); }');
    expect(block(wide, '.user-map-view--mission-steps:has(.mission-desk__map-focus--pair) .user-map-view__share'))
      .toContain('inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 14rem);');
    expect(block(missionCss, '.mission-desk__map-focus--pair :deep(.mission-desk__frame-action)'))
      .toContain('position: absolute; right: 0; bottom: 10.5rem;');
    expect(missionCss).not.toContain('.mission-desk--steps-visible:has(.mission-desk__map-focus--pair) .mission-desk__bottom-stack');
    // Five 48px icons with 8px gaps fit well below the top toolbar at 1045px.
    expect(1045 - (1.25 + 14 + 3) * 16).toBeGreaterThan(5 * 16);
    expect(10.5 - (7 + 3)).toBe(.5);
    expect(14 - (10.5 + 3)).toBe(.5);
    for (const [file, css] of [["UserMapView.vue", mapCss], ["UserMissionView.vue", missionCss]] as const)
      expect(compileStyle({ filename: file, id: "rail-photos", scoped: true, source: css }).errors).toEqual([]);
  });
});
