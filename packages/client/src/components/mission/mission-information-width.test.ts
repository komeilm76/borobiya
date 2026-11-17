import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// docs/TASKS.md: source/compiled SFC contracts, not mounted Vue components.
const view = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const detail = readFileSync(new URL("./MissionStatusPanel.vue", import.meta.url), "utf8");
const { template, styles } = parse(view).descriptor;
const css = styles[0]!.content;

function rule(source: string, selector: string): string {
  const start = source.indexOf(selector + " {");
  expect(start, selector).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("}", start));
}

describe("responsive Mission Information", () => {
  it("keeps the information and steps surfaces distinct, with the incident photo in the scrollable detail", () => {
    expect(view).toContain("'mission-desk--steps-visible': !!desk.activeMission.value && !desk.terminalHold.value && !activeTool");
    expect(view).toContain("'mission-desk__bottom-stack--information': activeTool === 'status'");
    expect(view).toContain('<MissionStatusPanel v-if="activeTool === \'status\'"');
    expect(view).toContain('id="mission-tool-status"');
    expect(detail).toContain('id="mission-status-panel"');
    expect(detail).toContain('<MissionBriefDetails');
    expect(css).toContain('width: 100%; max-height: none; margin: 0;'); // Child fills only its bounded parent.
  });

  it("caps Information beside Search on desktop, and beside map controls on tablet", () => {
    const selector = '.mission-desk--active .mission-desk__bottom-stack--information';
    const tablet = css.slice(css.indexOf('@media (min-width: 600px) and (max-width: 1023px) {', css.indexOf('.mission-desk__bottom-stack--information {')));
    const wide = css.slice(css.indexOf('@media (min-width: 1024px) {', css.indexOf('.mission-desk__bottom-stack--information {')));
    expect(rule(tablet, selector)).toContain('width: min(30rem, calc(100% - 7.5rem');
    expect(rule(wide, selector)).toContain('left: max(calc(27rem + env(safe-area-inset-left, 0px)), calc(50% - 20rem));');
    expect(rule(wide, selector)).toContain('width: min(40rem, calc(100% - 34rem');
    // At the narrowest desktop width, Search ends at 416px and the right rail
    // starts at 956px. The Information panel fits with room on both sides.
    expect(27 * 16).toBeGreaterThan(16 + 25 * 16);
    expect(27 * 16 + (1024 - 34 * 16)).toBeLessThan(1024 - 1.25 * 16 - 48);
    expect(css).toContain('max-height: min(75dvh, 40rem, calc(100dvh - 15rem');
  });

  it("preserves the full-width bottom-opening phone layout and focusable close action", () => {
    const phone = css.slice(css.indexOf('@media (max-width: 599px) {'));
    expect(phone).toContain('.mission-desk__bottom-stack--information {');
    expect(phone).toContain('.mission-desk__bottom-stack { bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));');
    expect(detail).toContain('aria-label="بستن اطلاعات مأموریت"');
    expect(compileTemplate({ filename: 'UserMissionView.vue', id: 'info-width', source: template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: 'UserMissionView.vue', id: 'info-width', scoped: true, source: css }).errors).toEqual([]);
  });
});
