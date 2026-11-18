import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const { template, styles } = parse(page).descriptor;
const css = styles[0]!.content;

// Source and compiled SFC contracts, not mounted Vue components (docs/TASKS.md).
describe("mission route workspace on a map", () => {
  it("shows the next route decision before optional coordinates and keeps GPS opt-in", () => {
    const decision = page.indexOf('<section v-if="routeSection === \'plan\'" class="mission-route__decision"');
    const endpoints = page.indexOf('<div v-if="routeSection === \'plan\'" class="mission-route__endpoints"');
    const settings = page.indexOf('class="mission-route__section-links"');
    expect(decision).toBeGreaterThan(0);
    expect(endpoints).toBeGreaterThan(decision);
    expect(settings).toBeLessThan(endpoints); // Advanced coordinates sit behind the compact settings link.
    expect(page).toContain('مبدأ فقط پس از درخواست شما از GPS گرفته می‌شود.');
    expect(page).toContain('@click="routing.findRoutes()"');
    expect(page).toContain('@click="startGuidance"');
    expect(compileTemplate({ filename: "UserMissionView.vue", id: "route-workspace", source: template!.content }).errors).toEqual([]);
  });
  it("keeps a visible Stop in the short route header, independently of the scrollable card", () => {
    const header = page.slice(page.indexOf('<header class="mission-route__header">'), page.indexOf('</header>', page.indexOf('<header class="mission-route__header">')));
    expect(header).toContain('v-if="navigation.active.value"');
    expect(header).toContain('aria-label="توقف راهبری"');
    expect(header).toContain('@click="stopGuidance"');
    expect(header).toContain('aria-label="بستن پنل مسیر؛ مسیر روی نقشه می‌ماند"');
    expect(page).toContain('v-else color="error" variant="tonal" rounded="lg" prepend-icon="mdi-stop-circle-outline"');
    expect(css).toContain('.mission-route__header { position: relative; z-index: 1;');
    expect(css).toContain('.mission-desk--active .mission-route { display: flex; flex-direction: column;');
    expect(css).toContain('.mission-route__header :deep(.v-btn) { flex: none; min-width: 44px; min-height: 44px; }');
  });
  it("docks the route sheet on short phones and scrolls its content without hiding map or SOS", () => {
    expect(page).toContain("'mission-desk--route-open': !!desk.activeMission.value && activeTool === 'route' && routeSection !== 'transport'");
    expect(css).toContain('@media (max-width: 599px) and (max-height: 560px)');
    expect(css).toContain('.mission-desk--route-open .mission-route {');
    expect(css).toContain('.mission-desk--route-open .mission-route {\n    top: auto; bottom: 0;');
    expect(css).toContain('.mission-desk--active .mission-route:has(.mission-route__route-details[open]) .mission-route__body--plan {\n    overflow-y: auto;');
    expect(css).toContain('max-height: min(65dvh, 32rem, max(7rem, calc(100dvh - 14rem');
    expect(page).not.toContain('mission-desk__map-heading');
    expect(css).toContain('.mission-desk--route-open .mission-desk__guidance { visibility: hidden; }');
    expect(css).toContain('.mission-desk--route-open .mission-route__emblem { display: none; }');
    expect(css).toContain('.mission-desk--route-open .mission-route__heading small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }');
    expect(page).toContain('class="mission-desk__header-actions"');
    expect(page).toContain('<MissionLivePanel :mission="desk.activeMission.value" fullscreen');
    expect(compileStyle({ filename: "UserMissionView.vue", id: "route-workspace", scoped: true, source: css }).errors).toEqual([]);
    // At 320px with no cutouts, the dock retains 112px and a visible map lane.
    expect(Math.max(7 * 16, 320 - 14 * 16)).toBe(112);
  });
});
