import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("./MissionStatusPanel.vue", import.meta.url), "utf8");
const cards = readFileSync(new URL("./MissionMapCards.vue", import.meta.url), "utf8");
const info = readFileSync(new URL("./MissionBriefDetails.vue", import.meta.url), "utf8");

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

  it("moves the only step list and guarded action onto the map without losing status warnings", () => {
    expect(page).toContain('class="mission-desk__map-cards"');
    expect(page).toContain('<MissionMapCards :desk="desk" :steps="steps" :active-step="activeStep"');
    expect(cards).toContain('<ol class="mission-desk__phase-steps" aria-label="پیشرفت مأموریت">');
    expect(cards.match(/v-for="\(step, index\) in steps"/g)).toHaveLength(1);
    expect(cards).toContain(':aria-current="index === activeStep ? \'step\' : undefined"');
    expect(cards).toContain('v-if="desk.nextStatus.value && !desk.terminalHold.value"');
    expect(cards).toContain(':disabled="!desk.canAdvance.value"');
    expect(cards).toContain('@click="desk.advanceStatus()"');
    expect(panel).not.toContain('class="mission-desk__next-step"');
    expect(panel).not.toContain('class="mission-desk__phase-summary"');
    expect(panel).toContain('desk.cancellationNeedsRefresh.value');
    expect(panel).toContain('desk.showCancellation()');
    expect(panel).toContain('v-if="!teamSharing" class="mission-desk__sharing" role="status"');
    expect(panel).toContain('<MissionBriefDetails :mission-id="desk.activeMission.value?.id ?? \'\'" />');
    expect(info).toContain('<summary>اطلاعات مأموریت</summary>');
    expect(info).toContain('getMissionBrief(token, id, controller.signal)');
    expect(info).toContain('getSosPhotoSrc(id, token)');
    expect(panel).toContain('aria-controls="mission-route-panel"');
    expect(panel).toContain('title="قادر به ادامه نیستم"');
  });

  it("keeps a compact header and readable progress indicators at narrow widths in both themes", () => {
    const viewStyle = parse(page, { filename: "UserMissionView.vue" }).descriptor.styles[0]!.content;
    const cardStyle = parse(cards, { filename: "MissionMapCards.vue" }).descriptor.styles[0]!.content;
    const panelStyle = parse(panel, { filename: "MissionStatusPanel.vue" }).descriptor.styles[0]!.content;
    const infoStyle = parse(info, { filename: "MissionBriefDetails.vue" }).descriptor.styles[0]!.content;
    for (const [filename, css] of [["UserMissionView.vue", viewStyle], ["MissionStatusPanel.vue", panelStyle],
      ["MissionMapCards.vue", cardStyle], ["MissionBriefDetails.vue", infoStyle]] as const) {
      expect(compileStyle({ filename, id: "data-v-mission-brief", scoped: true, source: css }).errors).toEqual([]);
    }
    expect(viewStyle).toContain('.mission-desk__map-cards { position: absolute;');
    expect(viewStyle).toContain('right: calc(4.25rem + env(safe-area-inset-right, 0px));');
    expect(viewStyle).toContain('bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));');
    expect(cardStyle).toContain('.mission-desk__phase-steps');
    expect(cardStyle).toContain('.mission-desk__phase-step--current');
    expect(infoStyle).toContain('.mission-brief__body');
  });
});
