import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source/compiled-SFC checks (docs/TASKS.md): do not mount Vue components in unit tests.
const mission = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const travel = readFileSync(new URL("../map/PointRouteChoicesSheet.vue", import.meta.url), "utf8");
const cards = readFileSync(new URL("./MissionMapCards.vue", import.meta.url), "utf8");
const { template, styles } = parse(mission).descriptor;
const css = styles[0]!.content;
const travelCss = parse(travel).descriptor.styles[0]!.content;

function rule(source: string, selector: string): string {
  const start = source.indexOf(selector + " {");
  expect(start, selector).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("}", start));
}

describe("mission route chooser and alerts match Travel's widget rhythm", () => {
  it("keeps each route an explicit preview with a readable selected state and elevation context", () => {
    expect(travel).toContain('class="point-route-choices__card" :aria-pressed="index === api.index.value"');
    expect(mission).toContain('class="mission-route__choice" :class="{ \'mission-route__choice--selected\': routing.selectedIndex.value === index }"');
    expect(mission).toContain(':aria-pressed="routing.selectedIndex.value === index"');
    expect(mission).toContain('class="mission-route__choice-selected">در حال پیش‌نمایش</span>');
    expect(mission).toContain('class="mission-route__choice-metrics"');
    expect(mission).toContain('class="mission-route__elevation-chart"');
    expect(mission).toContain('@click="previewAlternative(index)"');
    expect(mission).toContain('routeWorkspace.openAlternatives(routing.selectedIndex.value)');
    expect(mission).toContain('routeWorkspace.close();');
    expect(mission).toContain('routeWorkspace.accept();');
    expect(rule(css, '.mission-route__choice')).toContain('min-height: 72px;');
    expect(rule(travelCss, '.point-route-choices__card')).toContain('min-height: 72px;');
    expect(css).toContain('.mission-route__choice-selected { margin-inline-start: auto; color: rgb(var(--v-theme-primary));');
    expect(css).toContain('.mission-route__choice[aria-pressed="true"] { outline: 2px solid Highlight; }');
  });

  it("separates the two confirmation actions from the scrollable alternatives on normal screens", () => {
    const start = mission.indexOf('class="mission-route__navigation mission-route__navigation--choice-actions"');
    const footer = mission.slice(start, mission.indexOf('</div>', start));
    expect(start).toBeGreaterThan(mission.indexOf('class="mission-route__choices"'));
    expect(footer.indexOf('بازگشت بدون تغییر')).toBeLessThan(footer.indexOf('تأیید این مسیر'));
    expect(footer).toContain(':disabled="!routing.selectedRoute.value || routing.loading.value || navigation.active.value"');
    expect(css).toContain('.mission-route__choices { flex: 1 1 auto; min-height: 0; overflow-y: auto;');
    expect(rule(css, '.mission-route__navigation--choice-actions')).toContain('border-top: 1px solid var(--bb-color-outline);');
    expect(rule(css, '.mission-route__navigation--choice-actions :deep(.v-btn)')).toContain('min-height: 46px;');
    expect(rule(travelCss, '.point-route-choices__footer')).toContain('border-top: 1px solid');
    expect(css).toContain('.mission-route__preview-note { flex: none; margin: 0;');
    expect(rule(css, '.mission-route__preview-note')).not.toContain('background:');
  });

  it("switches to one scrolling surface in a short viewport without hiding the footer", () => {
    const short = css.slice(css.indexOf('@media (max-height: 560px) {'));
    expect(short).toContain('.mission-route__body { overflow-y: auto; overscroll-behavior: contain; }');
    expect(short).toContain('.mission-route__body--alternatives .mission-route__choices { flex: none; max-height: none; overflow: visible; }');
    expect(css).toContain('.mission-route__elevation-note { flex: none;');
    expect(mission).toContain('class="mission-route__elevation-note text-caption mt-2"');
    expect(mission).toContain('routeSection === \'stops\' ? \'mdi-map-marker-plus-outline\'');
  });

  it("keeps warnings readable with independent 44px actions and a status cue that is not just color", () => {
    expect(rule(css, '.mission-desk__guidance--warning')).toContain('font-size: .875rem; line-height: 1.5;');
    expect(rule(css, '.mission-desk__guidance--warning :deep(.v-btn)')).toContain('min-width: 44px; min-height: 44px;');
    expect(css).toContain('.mission-desk__terminal-heading strong { display: block; font-size: 1rem;');
    expect(cards).toContain('<v-icon icon="mdi-signal-off" size="18" aria-hidden="true" />');
    expect(cards).toContain('mission-map-cards__notice--sharing');
    const cardCss = parse(cards).descriptor.styles[0]!.content;
    expect(cardCss).toContain('border-inline-start: 3px solid rgb(var(--v-theme-warning));');
    expect(cardCss).toContain('font-size: .875rem; line-height: 1.5; color: rgb(var(--v-theme-on-surface));');
    expect(compileTemplate({ filename: "MissionMapCards.vue", id: "route-chooser", source: parse(cards).descriptor.template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "MissionMapCards.vue", id: "route-chooser", scoped: true, source: cardCss }).errors).toEqual([]);
    expect(compileTemplate({ filename: "UserMissionView.vue", id: "route-chooser", source: template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "UserMissionView.vue", id: "route-chooser", scoped: true, source: css }).errors).toEqual([]);
  });
});
