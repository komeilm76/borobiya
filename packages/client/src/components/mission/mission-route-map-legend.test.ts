import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// docs/TASKS.md: inspect source and compiler output; never mount Vue SFCs in unit tests.
const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const room = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
const info = readFileSync(new URL("./MissionBriefDetails.vue", import.meta.url), "utf8");
const mapPage = readFileSync(new URL("../../views/_user/UserMapView.vue", import.meta.url), "utf8");
const { template, styles } = parse(page).descriptor;
const css = styles[0]!.content;

describe("compact mission itinerary and visible map legend", () => {
  it("puts both distinct endpoints in one inset itinerary with truthful snapshot and fixed-destination labels", () => {
    const itinerary = page.slice(page.indexOf('class="mission-route__endpoints"'), page.indexOf('class="mission-route__route-actions"'));
    expect(itinerary).toContain('role="group" aria-label="مبدأ و مقصد"');
    expect(itinerary.match(/class="mission-route__endpoint"/g)).toHaveLength(2);
    expect(itinerary).toContain('موقعیت مسیر؛ نه موقعیت زنده');
    expect(itinerary).toContain('مقصد نهایی · ثابت');
    expect(itinerary).toContain('v-if="routing.from.value"');
    expect(itinerary).toContain('پس از دریافت موقعیت مشخص می‌شود');
    expect(itinerary).toContain('routing.from.value.lat.toFixed(5)');
    expect(itinerary).toContain('routing.target.value.incident.lat.toFixed(5)');
    expect(css).toContain('.mission-route__endpoint + .mission-route__endpoint { border-top: 1px solid var(--bb-color-outline); }');
    expect(css).toContain('grid-template-columns: 22px minmax(0, 1fr)');
  });

  it("displays the marker key on the map without a toggle or misplaced incident coordinates", () => {
    const start = page.indexOf('<section v-if="routing.target.value || activeTool === \'status\'"');
    const mapLegend = page.slice(start, page.indexOf('</section>', start));
    expect(start).toBeGreaterThan(0);
    expect(mapLegend).toContain('class="mission-desk__map-legend bb-floating-card"');
    expect(mapLegend).toContain('aria-labelledby="mission-map-legend-title"');
    expect(mapLegend).toContain('<h2 id="mission-map-legend-title">راهنمای نقشه</h2>');
    expect(mapLegend).toContain('مبدأ مسیر');
    expect(mapLegend).toContain('درخواست‌کننده');
    expect(mapLegend).toContain('امدادگر');
    expect(mapLegend).toContain('مدیر مرکز');
    expect(mapLegend).not.toContain('toFixed(5)');
    expect(info).toContain('مختصات ثبت‌شدهٔ حادثه');
    expect(mapLegend).not.toContain('<details');
    expect(page).not.toContain('class="mission-route__legend"');
    expect(page).toContain('class="mission-desk__map-cards"');
    expect(page).toContain("hasMapLegend: computed(() => !desk.terminalHold.value &&\n    (activeTool.value === 'status' || (!activeTool.value && !!routing.target.value)))");
    expect(mapPage).toContain('user-map-view--mission-legend');
    expect(css).toContain('.mission-desk--embedded .mission-desk__bottom-stack,');
    expect(css).toContain('.mission-desk__bottom-stack { position: absolute; z-index: 9;');
    expect(css).toContain('left: 0; right: 0; bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('.mission-desk__map-legend { flex: none; min-width: 0;');
    expect(css).toContain('border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: var(--bb-radius-card, 24px);');
    expect(css).toContain('background: rgba(var(--v-theme-surface), .95); color: rgb(var(--v-theme-on-surface));');
    expect(css).toContain('.mission-desk__map-legend-body { display: grid; grid-template-columns: repeat(3,');
    const stack = page.slice(page.indexOf('class="mission-desk__bottom-stack"'), page.indexOf('class="mission-desk__bottom-panel"'));
    expect(stack.indexOf('class="mission-desk__map-legend bb-floating-card"')).toBeGreaterThan(0);
    expect(stack.indexOf('<MissionStatusPanel v-if="activeTool === \'status\'"')).toBeGreaterThan(stack.indexOf('class="mission-desk__map-legend bb-floating-card"'));
    expect(stack.match(/id="mission-map-legend-title"/g)).toHaveLength(1);
    expect(css).toContain('.mission-desk--active .mission-desk__bottom-stack #mission-status-panel {\n  position: relative; inset: auto;');
    expect(page).toContain('new MarkerClass({ color: "#2563a6" })');
    expect(page).toContain('new MarkerClass({ color: "#c27c14" })');
    for (const color of ["#dc593b", "#16826c", "#5555ae"])
      expect(room).toContain(color);
    expect(compileTemplate({ source: template!.content, filename: "UserMissionView.vue", id: "map-legend" }).errors).toEqual([]);
    expect(compileStyle({ source: css, filename: "UserMissionView.vue", id: "map-legend", scoped: true }).errors).toEqual([]);
  });
});
