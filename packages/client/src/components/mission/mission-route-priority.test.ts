import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const view = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const plan = view.slice(view.indexOf('<template v-if="routing.target.value">'), view.indexOf('<details v-if="routeSection === \'plan\'" class="mission-route__stops"'));

// Source-pinned by design; never mount a Vue SFC in unit tests (docs/TASKS.md).
describe("mission route decisions on the full-screen map", () => {
  it("puts route preparation or the selected route's guidance action before optional settings and stops", () => {
    expect(plan).toContain('class="mission-route__decision"');
    expect(plan).toContain('v-if="routeSection === \'plan\'"');
    expect(plan).toContain('v-if="routing.selectedRoute.value"');
    expect(plan).toContain('v-else');
    expect(plan.indexOf('class="mission-route__decision"')).toBeLessThan(plan.indexOf('class="mission-route__section-links"'));
    expect(plan.indexOf('class="mission-route__decision"')).toBeLessThan(plan.indexOf('class="mission-route__route-actions'));
    expect(plan).toContain('formatRouteDistance(routing.selectedRoute.value.distance_m)');
    expect(plan).toContain('formatRouteDuration(routing.selectedRoute.value.duration_s)');
    expect(plan).toContain(':loading="routing.loading.value"');
    expect(plan).toContain('@click="routing.findRoutes()"');
    expect(plan).toContain(':disabled="!mapReady" @click="startGuidance"');
    expect(plan).toContain('@click="stopGuidance"');
    expect(plan).toContain('aria-label="مبدأ و مقصد"');
  });
  it("makes origin and incident legible as distinct route endpoints, with untruncated coordinates", () => {
    expect(plan).toContain('class="mission-route__endpoint-mark"');
    expect(plan).toContain('class="mission-route__endpoint-mark mission-route__endpoint-mark--incident"');
    expect(plan).toContain('routing.from.value.lat.toFixed(5)');
    expect(plan).toContain('routing.from.value.lon.toFixed(5)');
    expect(plan).toContain('routing.target.value.incident.lat.toFixed(5)');
    expect(plan).toContain('routing.target.value.incident.lon.toFixed(5)');
    const css = parse(view).descriptor.styles[0]!.content;
    expect(css).toContain('.mission-route__endpoints bdi { overflow-wrap: anywhere; }');
    expect(css).not.toContain('.mission-route__endpoints span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }');
  });
  it("keeps alternatives a preview until explicit acceptance and their controls accessible", () => {
    expect(view).toContain('class="mission-route__preview-note"');
    expect(view).toContain('routeSection === \'alternatives\'');
    expect(view).toContain('class="mission-route__choices" role="group"');
    expect(view).toContain('@click="previewAlternative(index)"');
    expect(view).toContain('@click="acceptAlternative"');
    expect(view).toContain('@click="closeRouteSection()"');
    expect(view).toContain('watch(routing.routes, () => closeRouteSection(false), { flush: "sync" });');
  });
  it("uses theme-aware compact surfaces, readable text and a bounded primary action", () => {
    const style = parse(view).descriptor.styles[0]!.content;
    const compiled = compileStyle({ source: style, filename: "UserMissionView.vue", id: "data-v-route-priority", scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(style).toContain('.mission-route__decision');
    expect(style).toContain('.mission-route__decision :deep(.v-btn)');
    expect(style).toContain('background: var(--bb-color-inset);');
    expect(compiled.code).toContain('.mission-route__decision[data-v-route-priority]');
  });
});
