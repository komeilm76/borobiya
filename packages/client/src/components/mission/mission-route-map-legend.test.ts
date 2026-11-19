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

  it("opens the marker key above Mission Information from an icon above its launcher", () => {
    const start = page.indexOf('<section v-if="legendOpen" id="mission-map-legend"');
    const mapLegend = page.slice(start, page.indexOf('</section>', start));
    expect(start).toBeGreaterThan(0);
    expect(mapLegend).toContain('class="mission-desk__map-legend bb-floating-card"');
    expect(mapLegend).toContain('aria-labelledby="mission-map-legend-title"');
    expect(mapLegend).toContain('<h2 id="mission-map-legend-title">راهنمای نقشه</h2>');
    expect(mapLegend).toContain('<MapPointKey :kinds="[\'sos\', \'start\', \'stop\', \'helper\', \'requester\', \'director\']"');
    const pointMeta = readFileSync(new URL('../map/map-point.ts', import.meta.url), 'utf8');
    for (const label of ['مبدأ مسیر', 'درخواست‌کننده', 'امدادگر نزدیک', 'مدیر مرکز', 'ایستگاه میانی'])
      expect(pointMeta).toContain(label);
    expect(mapLegend).not.toContain('toFixed(5)');
    expect(info).toContain('مختصات ثبت‌شدهٔ حادثه');
    expect(mapLegend).not.toContain('<details');
    expect(page).not.toContain('class="mission-route__legend"');
    expect(page).toContain('class="mission-desk__map-cards"');
    expect(page).toContain("hasMapLegend: computed(() => legendOpen.value && !desk.terminalHold.value && !pickingWaypoint.value &&\n    (!activeTool.value || activeTool.value === 'status'))");
    expect(page).toContain('id="mission-tool-legend" class="mission-desk__legend-action" icon="mdi-map-outline"');
    expect(page).toContain(':aria-expanded="legendOpen" aria-controls="mission-map-legend" @click="toggleLegend"');
    expect(page.indexOf('id="mission-tool-legend"')).toBeLessThan(page.indexOf('id="mission-tool-status"'));
    expect(page).toContain('if (legendOpen.value) { toggleLegend(); return; }');
    expect(page).toContain('if (!visible) legendOpen.value = false;');
    expect(page).toContain('watch(() => desk.terminalHold.value, (held) => { if (held) legendOpen.value = false; });');
    expect(mapPage).toContain('user-map-view--mission-legend');
    expect(mapPage).toContain('.user-map-view--mission-active .user-map-view__canvas :deep(.maplibregl-ctrl-bottom-left) {');
    expect(css).toContain('.mission-desk--embedded .mission-desk__bottom-stack,');
    // The embedded workspace disables map-sized hitboxes; its launcher must opt
    // back into pointer input just like the adjacent Information button.
    expect(css).toContain('.mission-desk--embedded .mission-desk__legend-action,');
    expect(css).toMatch(/\.mission-desk--embedded \.mission-desk__legend-action,[\s\S]*?\{ pointer-events: auto; \}/);
    expect(css).toContain('.mission-desk__bottom-stack { position: absolute; z-index: 9;');
    expect(css).toContain('left: 0; right: 0; bottom: calc(8.5rem + env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('.mission-desk__legend-action { position: absolute; z-index: 10;');
    expect(css).toContain('bottom: calc(4.25rem + env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));');
    expect(4.25 * 16 - .75 * 16 - 48).toBe(8); // 8px gap between 48px targets.
    expect(8.5 * 16 - 4.25 * 16 - 48).toBe(20); // Information retains its separate panel.
    expect(css).toContain('.mission-desk--steps-visible .mission-desk__legend-action {');
    expect(css).toContain('bottom: calc(var(--bb-map-mission-sheet-height, 15rem) + 4rem);');
    expect(css).toContain('.mission-desk__map-legend { flex: none; min-width: 0;');
    expect(css).toContain('border: 1px solid rgba(var(--v-theme-on-surface), .1); border-radius: var(--bb-radius-card, 24px);');
    expect(css).toContain('background: rgba(var(--v-theme-surface), .95); color: rgb(var(--v-theme-on-surface));');
    expect(css).toContain('.mission-desk__map-legend :deep(.bb-point-key) { display: grid;\n  grid-template-columns: repeat(3,');
    const stack = page.slice(page.indexOf('class="mission-desk__bottom-stack"'), page.indexOf('class="mission-desk__bottom-panel"'));
    expect(stack.indexOf('class="mission-desk__map-legend bb-floating-card"')).toBeGreaterThan(0);
    expect(stack.indexOf('<MissionStatusPanel v-if="activeTool === \'status\'"')).toBeGreaterThan(stack.indexOf('class="mission-desk__map-legend bb-floating-card"'));
    expect(stack.match(/id="mission-map-legend-title"/g)).toHaveLength(1);
    expect(css).toContain('.mission-desk--active .mission-desk__bottom-stack #mission-status-panel {\n  position: relative; inset: auto;');
    expect(page).toContain('createMapPointElement("start", "مبدأ محاسبهٔ مسیر؛ نه موقعیت زنده")');
    expect(page).toContain('createMapPointElement("stop", navigation.active.value ? "باز کردن برنامهٔ مسیر" : "باز کردن فهرست ایستگاه‌ها"');
    expect(room).toContain('createMapPointElement(role === "rescuer" ? "helper" : role === "admin" ? "director" : "requester"');
    expect(compileTemplate({ source: template!.content, filename: "UserMissionView.vue", id: "map-legend" }).errors).toEqual([]);
    expect(compileStyle({ source: css, filename: "UserMissionView.vue", id: "map-legend", scoped: true }).errors).toEqual([]);
  });
});
