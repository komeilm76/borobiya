import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("./MissionStatusPanel.vue", import.meta.url), "utf8");
const cards = readFileSync(new URL("./MissionMapCards.vue", import.meta.url), "utf8");
const info = readFileSync(new URL("./MissionBriefDetails.vue", import.meta.url), "utf8");

// Source-pinned by design: docs/TASKS.md prohibits mounting Vue components in unit tests.
describe("at-a-glance mission progress and information", () => {
  it("keeps the stage summary on the map and opens information from a separate bottom-left icon", () => {
    expect(page).toContain('class="mission-desk__status-brief"');
    expect(page).not.toContain('mission-desk__status-trigger');
    expect(page).toContain('id="mission-tool-status" class="mission-desk__info-action" icon="mdi-information-outline"');
    expect(page).toContain('aria-controls="mission-status-panel"');
    expect(page).toContain(':aria-expanded="activeTool === \'status\'"');
    expect(page).toContain('@click="toggleTool(\'status\')"');
    expect(page).toContain('class="mission-desk__stage-track" aria-hidden="true"');
    expect(page).toContain('index <= activeStep');
    expect(page).toContain('id="mission-tool-team" icon="mdi-account-group-outline"');
    const dock = page.slice(page.indexOf('<nav class="mission-desk__dock"'), page.indexOf('</nav>', page.indexOf('<nav class="mission-desk__dock"')));
    expect(dock.match(/<button\b/g)).toHaveLength(1);
    expect(dock).toContain('mission-tool-route');
    expect(dock).not.toContain('mission-tool-status');
  });

  it("shows the only step list and guarded action without a disclosure, while preserving safety warnings", () => {
    expect(page).toContain('class="mission-desk__map-cards"');
    expect(page).toContain('<MissionMapCards :desk="desk" :steps="steps" :active-step="activeStep"');
    expect(cards).toContain('<ol class="mission-desk__phase-steps" aria-label="پیشرفت مأموریت">');
    expect(cards).not.toContain('<details');
    expect(cards.match(/v-for="\(step, index\) in steps"/g)).toHaveLength(1);
    expect(cards).toContain(':aria-current="index === activeStep ? \'step\' : undefined"');
    expect(cards).toContain('v-if="desk.nextStatus.value && !desk.terminalHold.value"');
    expect(cards).toContain(':disabled="!desk.canAdvance.value"');
    expect(cards).toContain('@click="desk.advanceStatus()"');
    expect(cards).toContain('desk.cancellationNeedsRefresh.value');
    expect(cards).toContain('desk.showCancellation()');
    expect(cards).toContain('v-if="!teamSharing"');
    expect(cards).toContain('@click="desk.load()"'); // Only on an actual safety warning.
    expect(panel).not.toContain('desk.load()'); // No redundant reload in the information panel.
    expect(panel).not.toContain('v-chip');
    expect(panel).not.toContain('desk.showCancellation()');
    expect(panel).toContain('<MissionBriefDetails :mission-id="desk.activeMission.value?.id ?? \'\'" :visible="visible" />');
    expect(info).not.toContain('<details');
    expect(info).toContain('مختصات ثبت‌شدهٔ حادثه');
    expect(info).toContain('getMissionBrief(token, id, controller.signal)');
    expect(info).toContain('getSosPhotoSrc(id, token)');
  });

  it("keeps open surfaces compact and scrollable at narrow widths in both themes", () => {
    const viewStyle = parse(page).descriptor.styles[0]!.content;
    const cardStyle = parse(cards).descriptor.styles[0]!.content;
    const panelStyle = parse(panel).descriptor.styles[0]!.content;
    const infoStyle = parse(info).descriptor.styles[0]!.content;
    for (const [filename, css] of [["UserMissionView.vue", viewStyle], ["MissionStatusPanel.vue", panelStyle],
      ["MissionMapCards.vue", cardStyle], ["MissionBriefDetails.vue", infoStyle]] as const)
      expect(compileStyle({ filename, id: "data-v-mission-brief", scoped: true, source: css }).errors).toEqual([]);
    expect(viewStyle).toContain('.mission-desk__map-cards { position: absolute;');
    expect(viewStyle).toContain('right: calc(4.25rem + env(safe-area-inset-right, 0px));');
    expect(viewStyle).toContain('bottom: calc(17rem + env(safe-area-inset-bottom, 0px));');
    expect(viewStyle).toContain('overflow-y: auto; overscroll-behavior: contain; pointer-events: auto;');
    expect(viewStyle).toContain('@media (max-width: 599px) and (max-height: 560px) {');
    expect(viewStyle).toContain('.mission-desk__status-brief { position: absolute; width: 1px; height: 1px;');
    expect(viewStyle).toContain('right: calc(.75rem + env(safe-area-inset-right, 0px));');
    expect(cardStyle).toContain('.mission-desk__phase-steps');
    expect(cardStyle).toContain('.mission-desk__phase-step--current');
    expect(infoStyle).toContain('.mission-brief__body');
  });
});
