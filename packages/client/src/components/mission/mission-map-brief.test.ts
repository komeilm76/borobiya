import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const descriptor = parse(page).descriptor;

// Source/compiled SFC only; docs/TASKS.md disallows Vue mounting in unit tests.
describe("default mission map brief", () => {
  it("shows route readiness beside the team action in the progress header", () => {
    const actions = page.slice(page.indexOf('<div class="mission-desk__header-actions">'), page.indexOf('</div>', page.indexOf('<div class="mission-desk__header-actions">')));
    expect(actions.match(/<v-btn\b/g)).toHaveLength(2);
    expect(actions).toContain('icon="mdi-routes"');
    expect(actions).not.toContain('<strong>مسیر</strong>');
    expect(actions.indexOf('mission-tool-team')).toBeLessThan(actions.indexOf('mission-tool-route'));
    expect(page).not.toContain('mission-desk__dock');
    expect(page).not.toContain('mission-desk__status-brief');
    expect(page).toContain(':current-status-label="currentStatusLabel"');
    expect(actions).toContain('${routeCue.label}');
    expect(actions).toContain('mission-desk__route-action--warning');
    expect(page).toContain('missionRouteCue({');
    expect(page).toContain('freshFix: !!navigation.fix.value');
    expect(page).toContain('hasRoute: !!routing.selectedRoute.value');
    expect(page).toContain('blocked: !!desk.terminalHold.value || !!desk.error.value');
    expect(page).toContain('aria-controls="mission-route-panel"');
    expect(page).toContain('aria-controls="mission-status-panel"');
    expect(descriptor.styles[0]!.content).toContain('.mission-desk__route-action--warning');
    expect(descriptor.styles[0]!.content).toContain('min-width: 44px; min-height: 44px;');
    expect(compileTemplate({ filename: "UserMissionView.vue", id: "mission-map-brief", source: descriptor.template!.content }).errors).toEqual([]);
  });
  it("opens the existing workspace from the incident marker without requesting GPS or adding a waypoint", () => {
    expect(page).toContain('document.createElement("button")');
    expect(page).toContain('incidentPin.type = "button";');
    expect(page).toContain('incidentPin.addEventListener("click", (event) => {');
    const open = page.slice(page.indexOf('function openRouteWorkspace(): void {'), page.indexOf('function toggleTool('));
    expect(open).toContain('void routing.open()'); // Authorised private incident read only.
    expect(open).not.toContain('findRoutes('); // No location prompt from tapping the pin.
    expect(open).not.toContain('navigation.start()');
    expect(page).toContain('event.stopPropagation();');
    expect(page).toContain('if (!pickingWaypoint.value) openRouteWorkspace();');
    expect(page).toContain('incidentPin.setAttribute("aria-disabled", String(pickingWaypoint.value))');
    expect(page).toContain('aria-label", "محل حادثه؛ باز کردن برنامهٔ مسیر"');
    expect(page).toContain('watch(pickingWaypoint, (picking) => {');
    expect(page).toContain('incidentMarker?.getElement().setAttribute("aria-disabled", String(picking));');
    expect(page).not.toContain('incidentPin.setAttribute("role", "img")');
    expect(descriptor.styles[0]!.content).toContain(':global(.mission-desk__incident-pin:focus-visible)');
    expect(compileStyle({ filename: "UserMissionView.vue", id: "mission-map-brief", scoped: true, source: descriptor.styles[0]!.content }).errors).toEqual([]);
  });
});
