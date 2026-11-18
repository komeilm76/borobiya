import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const css = styles[0]!.content;

// Source/compiled SFC contracts, not a mounted map (docs/TASKS.md).
describe("suggested-route save failure on the mission map", () => {
  it("does not insert an unbounded full-width warning into the map workspace", () => {
    expect(source).not.toContain('<v-alert v-if="routeSaveWarning && !desk.terminalHold.value"');
    expect(source).toContain("activeTool !== 'route' && (routing.error.value || navigation.error.value || routeSaveWarning)");
    expect(source).toContain('(navigation.active.value || !!routing.error.value || !!navigation.error.value || !!routeSaveWarning)');
    expect(source).toContain('{{ routing.error.value || navigation.error.value || routeSaveWarning }}');
    expect(source).toContain('v-else-if="!routing.error.value && navigation.error.value"');
    expect(source).toContain('aria-label="بستن هشدار راهبری" @click="navigation.dismissError()"');
    expect(source).toContain('v-if="navigation.active.value" size="small" variant="tonal" color="error"');
    expect(css).toContain('.mission-desk__guidance--warning {\n  width: min(30rem, calc(100vw - 1.5rem));');
    expect(css).toContain('.mission-desk__guidance--warning :deep(.v-btn) { min-width: 44px; min-height: 44px;');
  });

  it("shows the same warning in the route panel while Review replaces map guidance", () => {
    expect(source).toContain("routeSection === 'plan' && routeSaveWarning && !desk.terminalHold.value && !routing.error.value && !navigation.error.value");
    expect(source).toContain('class="mission-route__save-warning" type="warning" variant="tonal" role="alert">{{ routeSaveWarning }}</v-alert>');
    expect(css).toContain('.mission-route__save-warning { flex: none; margin: .35rem 0;');
    expect(css).toContain('.mission-route__body--plan:has([role="alert"]) { overflow-y: auto; overscroll-behavior: contain; }');
    expect(source).toContain('routeSaveWarning.value = "ذخیرهٔ مسیر پیشنهادی فعلی انجام نشد؛ راهبری ادامه دارد');
    expect(source).toContain('if (desk.activeMission.value?.id === missionId && missionSession.value === session)');
    expect(compileTemplate({ filename: "UserMissionView.vue", id: "route-save-warning", source: template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "UserMissionView.vue", id: "route-save-warning", source: css, scoped: true }).errors).toEqual([]);
  });
});
