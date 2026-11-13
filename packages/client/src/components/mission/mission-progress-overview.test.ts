import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("./MissionStatusPanel.vue", import.meta.url), "utf8");

// Source-pinned by design: docs/TASKS.md prohibits mounting Vue components in unit tests.
describe("at-a-glance mission progress", () => {
  it("opens status from the full-screen map heading while keeping Members and the two-item dock", () => {
    expect(page).toContain('class="mission-desk__status-trigger"');
    expect(page).toContain('aria-controls="mission-status-panel"');
    expect(page).toContain(':aria-expanded="activeTool === \'status\'"');
    expect(page).toContain('id="mission-status-trigger" type="button"');
    expect(page).toContain('@click="toggleTool(\'status\', \'mission-status-trigger\')"');
    expect(page).toContain('statusFocusOrigin = focusOrigin ?? "mission-tool-status"');
    expect(page).toContain('const focusTarget = focusOrigin ?? (tool === "status" ? statusFocusOrigin : `mission-tool-${tool}`);');
    expect(page).toContain('class="mission-desk__stage-track" aria-hidden="true"');
    expect(page).toContain('v-for="(step, index) in steps" :key="step.status"');
    expect(page).toContain('index <= activeStep');
    expect(page).toContain('id="mission-tool-team" icon="mdi-account-group-outline"');
    const dock = page.slice(page.indexOf('<nav class="mission-desk__dock"'), page.indexOf('</nav>', page.indexOf('<nav class="mission-desk__dock"')));
    expect(dock.match(/<button\b/g)).toHaveLength(2);
  });

  it("shows verified progress and the guarded manual next action before optional history and explanation", () => {
    expect(panel).toContain('class="mission-desk__phase-track" role="progressbar"');
    expect(panel).toContain(':aria-valuenow="Math.max(0, activeStep + 1)"');
    expect(panel).toContain(':aria-valuemax="steps.length"');
    expect(panel).toContain("steps[activeStep]?.label ?? 'در حال بررسی'");
    expect(panel).toContain('v-if="desk.nextStatus.value && !desk.terminalHold.value" class="mission-desk__next-step"');
    expect(panel.indexOf('class="mission-desk__next-step"')).toBeLessThan(panel.indexOf('<details class="mission-desk__timeline">'));
    expect(panel).toContain(':disabled="!desk.canAdvance.value"');
    expect(panel).toContain('@click="desk.advanceStatus()"');
    expect(panel).toContain('desk.cancellationNeedsRefresh.value');
    expect(panel).toContain('desk.showCancellation()');
    expect(panel).toContain("teamSharing ? 'اشتراک موقعیت مأموریت برقرار است' : 'اشتراک موقعیت مأموریت برقرار نشده'");
    expect(panel).toContain('پس از تأیید مأموریت و اجازهٔ GPS خودکار فعال می‌شود');
    expect(panel).toContain('class="mission-desk__sharing"');
    expect(panel).toContain('grid-template-columns: minmax(0, 1fr);'); // A 28rem floating card cannot fit five text columns.
    expect(panel).toContain('class="mission-desk__tracking-id"');
  });

  it("keeps a compact header and readable progress indicators at narrow widths in both themes", () => {
    const viewStyle = parse(page, { filename: "UserMissionView.vue" }).descriptor.styles[0]!.content;
    const panelStyle = parse(panel, { filename: "MissionStatusPanel.vue" }).descriptor.styles[0]!.content;
    for (const [filename, css] of [["UserMissionView.vue", viewStyle], ["MissionStatusPanel.vue", panelStyle]] as const) {
      expect(compileStyle({ filename, id: "data-v-mission-brief", scoped: true, source: css }).errors).toEqual([]);
    }
    expect(viewStyle).toContain('.mission-desk__status-trigger:focus-visible');
    expect(viewStyle).toContain('.mission-desk__stage-track');
    expect(viewStyle).toContain('max-width: calc(100vw - 7rem);');
    expect(panelStyle).toContain('.mission-desk__phase-track');
    expect(panelStyle).toContain('background: rgb(var(--v-theme-primary));');
    expect(panelStyle).toContain('background: var(--bb-color-inset);');
  });
});
