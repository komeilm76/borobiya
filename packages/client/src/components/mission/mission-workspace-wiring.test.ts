import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const view = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const status = readFileSync(new URL("./MissionStatusPanel.vue", import.meta.url), "utf8");

// No Vue component mounting in unit tests (docs/TASKS.md).
describe("mission map workspace", () => {
  it("reuses the map's navigation-card surface but keeps its one private room canvas", () => {
    expect(view).toContain('class="mission-route bb-map-navigation-card bb-floating-card"');
    expect(status).toContain('class="mission-desk__card bb-floating-card bb-map-navigation-card"');
    expect(view).toContain('<MissionLivePanel :mission="desk.activeMission.value" fullscreen');
    expect(view).not.toContain('background: #21383a');
    expect(view).toContain('max-height: min(52dvh, 26rem)');
    const { descriptor } = parse(status, { filename: "MissionStatusPanel.vue" });
    const style = compileStyle({ source: descriptor.styles[0]!.content, filename: "MissionStatusPanel.vue", id: "data-v-mission-status", scoped: true });
    expect(style.errors).toEqual([]);
    expect(style.code).toContain(".mission-steps__item");
  });
  it("separates plan, transport and alternatives; only explicit acceptance commits a preview", () => {
    expect(view).toContain('routeWorkspace.openTransport()');
    expect(view).toContain('routeWorkspace.openAlternatives(routing.selectedIndex.value)');
    expect(view).toContain('routeWorkspace.preview(index, routing.routes.value.length)');
    expect(view).toContain('routeWorkspace.accept()');
    expect(view).toContain('if (activeTool.value === "route") closeRouteSection();');
    expect(view).toContain('if (activeTool.value === "route" && routeSection.value !== "plan") { closeRouteSection(); return; }');
    expect(view).toContain('watch(routing.routes, () => closeRouteSection(false), { flush: "sync" });');
    expect(view).toContain('<PointTransportChoicesSheet :mission-id="desk.activeMission.value.id"');
    expect(view).toContain(':open="activeTool === \'route\' && routeSection === \'transport\'"');
    expect(view).toContain('v-if="routeSection === \'alternatives\' && routing.routes.value.length"');
    expect(view).toContain('@click="acceptAlternative"');
  });
  it("does not confuse closing the route, deleting a plan or cancelling a mission", () => {
    expect(view).toContain('aria-label="بستن پنل مسیر؛ مسیر روی نقشه می‌ماند"');
    expect(view).toContain('@click="routeDeleteConfirmOpen = true"');
    expect(view).toContain('v-model="routeDeleteConfirmOpen"');
    expect(view).toContain('محل حادثه و مأموریت حذف نمی‌شوند');
    expect(view).toContain('if (navigation.active.value || !routing.target.value) return;');
    expect(view).toContain('routing.clearPlan();');
    expect(status).toContain('desk.showCancellation()');
    expect(status).toContain('desk.advanceStatus()');
    expect(status).toContain(':disabled="!desk.canAdvance.value"');
  });
});
