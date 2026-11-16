import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// docs/TASKS.md: inspect source and compiler output; never mount Vue SFCs in unit tests.
const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const room = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
const { template, styles } = parse(page).descriptor;
const css = styles[0]!.content;

describe("compact mission itinerary and map legend", () => {
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
    expect(css).not.toContain('.mission-route__endpoint { display: flex;');
  });

  it("moves the only accessible marker key to the map and keeps it clear of safety controls", () => {
    expect(page.match(/راهنمای نشانگرها و مختصات حادثه/g)).toHaveLength(3); // details and summary accessible names, visually hidden label
    const mapLegend = page.slice(page.indexOf('<details v-if="routing.target.value && !activeTool'), page.indexOf('</details>', page.indexOf('<details v-if="routing.target.value && !activeTool')));
    expect(mapLegend).toContain('ref="mapLegendEl" class="mission-desk__map-legend"');
    expect(mapLegend).toContain('<summary title="راهنمای نشانگرهای نقشه"');
    expect(mapLegend).toContain('routing.target.value.incident.lon.toFixed(5)');
    expect(mapLegend).toContain('موقعیت اشتراکی درخواست‌کننده');
    expect(mapLegend).toContain('موقعیت اشتراکی امدادگر');
    expect(mapLegend).toContain('موقعیت اشتراکی مدیر مرکز');
    expect(mapLegend).toContain('تازه‌بودن موقعیت را جداگانه بررسی کنید');
    expect(page).not.toContain('class="mission-route__legend"');
    expect(page).toContain('class="mission-desk__map-cards"');
    expect(page).toContain('&& !legendOpen"');
    expect(page).toContain('watch(() => [routing.target.value, activeTool.value, desk.terminalHold.value] as const,\n  closeMapLegend, { flush: "sync" });');
    expect(css).toContain('.mission-desk--embedded .mission-desk__map-legend,');
    expect(css).toContain('left: calc(.75rem + env(safe-area-inset-left, 0px));');
    expect(css).toContain('width: min(18rem, calc(100vw - 8rem - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))');
    expect(css).toContain('bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px))');
    expect(css).toContain('.mission-desk__map-legend summary { width: 44px; padding: 0; justify-content: center; }');
    expect(css).toContain('.mission-desk__map-legend-label { display: none; }');
    expect(mapLegend).toContain('class="mission-desk__map-legend-label">راهنمای نقشه</span>');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain;');
    // At 320px, the closed legend [12,56] and cards [60,252] do not overlap.
    expect(320 - 4.25 * 16 - (320 - 8 * 16)).toBe(60);
    expect(12 + 44).toBeLessThan(60);
    expect(page).toContain('new MarkerClass({ color: "#2563a6" })');
    expect(page).toContain('new MarkerClass({ color: "#c27c14" })');
    for (const color of ["#dc593b", "#16826c", "#5555ae"])
      expect(room).toContain(color);
    expect(compileTemplate({ source: template!.content, filename: "UserMissionView.vue", id: "map-legend" }).errors).toEqual([]);
    expect(compileStyle({ source: css, filename: "UserMissionView.vue", id: "map-legend", scoped: true }).errors).toEqual([]);
  });
});
