import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("./MissionStatusPanel.vue", import.meta.url), "utf8");
const cards = readFileSync(new URL("./MissionMapCards.vue", import.meta.url), "utf8");
const info = readFileSync(new URL("./MissionBriefDetails.vue", import.meta.url), "utf8");

// Source-pinned by design: docs/TASKS.md prohibits mounting Vue components in unit tests.
describe("at-a-glance mission progress and information", () => {
  it("removes the top step-lines widget and opens information from the bottom-left icon", () => {
    expect(page).not.toContain('mission-desk__status-brief');
    expect(page).not.toContain('mission-desk__status-trigger');
    expect(page).toContain('id="mission-tool-status" class="mission-desk__info-action" icon="mdi-information-outline"');
    expect(page).toContain('aria-controls="mission-status-panel"');
    expect(page).toContain(':aria-expanded="activeTool === \'status\'"');
    expect(page).toContain('@click="toggleTool(\'status\')"');
    expect(page).not.toContain('mission-desk__stage-track');
    expect(page).toContain('class="mission-desk__bottom-panel"');
    expect(page).toContain('id="mission-tool-team" class="mission-desk__team-action" icon="mdi-account-group-outline"');
    const actions = page.slice(page.indexOf('<div class="mission-desk__header-actions">'), page.indexOf('</div>', page.indexOf('<div class="mission-desk__header-actions">')));
    expect(actions.match(/<v-btn\b/g)).toHaveLength(2);
    expect(actions).toContain('mission-tool-route');
    expect(actions).toContain('mission-tool-team');
  });

  it("keeps the current stage and guarded action visible, with the only full step list on demand", () => {
    expect(page).toContain('class="mission-desk__map-cards"');
    expect(page).toContain('<MissionMapCards :desk="desk" :steps="steps" :active-step="activeStep"');
    expect(cards).toContain('const expanded = ref(false);');
    expect(cards).toContain('watch(() => props.desk.activeMission.value?.id, () => { expanded.value = false; });');
    expect(cards).toContain('aria-controls="mission-progress-steps" :aria-expanded="expanded"');
    expect(cards).toContain('v-if="!expanded" class="mission-map-cards__track" aria-hidden="true"');
    expect(cards).toContain('<ol v-show="expanded" id="mission-progress-steps" class="mission-desk__phase-steps" aria-label="پیشرفت مأموریت">');
    expect(cards).toContain('{{ currentStatusLabel }}');
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
    expect(info).toContain('<details class="mission-brief__details">');
    expect(info).toContain('شناسه و مختصات حادثه');
    expect(info).toContain('class="mission-brief__identity"');
    expect(info).not.toContain('class="mission-brief__facts"');
    expect(info.match(/{{ brief.requesterName }}/g)).toHaveLength(1);
    expect(info.match(/{{ brief.incidentTypeName }}/g)).toHaveLength(1);
    expect(info.indexOf('class="mission-brief__overview"')).toBeLessThan(info.indexOf('<details class="mission-brief__details">'));
    expect(info.indexOf('class="mission-brief__id"')).toBeGreaterThan(info.indexOf('<details class="mission-brief__details">'));
    expect(info).toContain('مختصات ثبت‌شدهٔ حادثه');
    expect(info).toContain('getMissionBrief(token, id, controller.signal)');
    expect(info).toContain('getSosPhotoSrc(id, token)');
  });

  it("resolves an approximate incident address, fetches available photos automatically and copies the complete ID", () => {
    const template = parse(info).descriptor.template!.content;
    expect(info).toContain('const shortMissionId = computed(() => props.missionId.length > 16');
    expect(template).toContain('{{ shortMissionId }}');
    expect(template).toContain('aria-label="شناسهٔ کامل مأموریت برای کپی دستی"');
    expect(info).toContain('await navigator.clipboard.writeText(id)');
    expect(info).toContain('current === generation && props.missionId === id');
    expect(template).toContain('محل حادثه · نشانی تقریبی');
    expect(info).toContain('await reversePlace(mission.incident, controller?.signal)');
    expect(info).toContain('current === generation && props.visible && auth.user?.id === owner');
    expect(template).toContain('نشانی در دسترس نیست؛ نقطهٔ حادثه روی نقشه ثبت شده است.');
    expect(info).toContain('if (result.hasPhoto) void loadPhoto();');
    expect(template).not.toContain('نمایش تصویر ایمن');
    expect(info).toContain('controller?.abort(); controller = null;');
    expect(info).toContain('photoSrc.value = null; photoLoading.value = false; photoError.value = null;');
    expect(page).toContain('<MissionStatusPanel v-if="activeTool === \'status\'" :desk="desk" :visible="visible"');
    expect(compileTemplate({ filename: "MissionBriefDetails.vue", id: "mission-brief-info", source: template }).errors).toEqual([]);
  });

  it("keeps open surfaces compact and scrollable at narrow widths in both themes", () => {
    const viewStyle = parse(page).descriptor.styles[0]!.content;
    const cardStyle = parse(cards).descriptor.styles[0]!.content;
    const panelStyle = parse(panel).descriptor.styles[0]!.content;
    const infoStyle = parse(info).descriptor.styles[0]!.content;
    for (const [filename, css] of [["UserMissionView.vue", viewStyle], ["MissionStatusPanel.vue", panelStyle],
      ["MissionMapCards.vue", cardStyle], ["MissionBriefDetails.vue", infoStyle]] as const)
      expect(compileStyle({ filename, id: "data-v-mission-brief", scoped: true, source: css }).errors).toEqual([]);
    expect(viewStyle).toContain('.mission-desk__bottom-stack { position: absolute; z-index: 9;');
    expect(viewStyle).toContain('left: 0; right: 0; bottom: calc(8.5rem + env(safe-area-inset-bottom, 0px));');
    expect(viewStyle).toContain('.mission-desk__bottom-panel { flex: 1 1 auto; min-height: 0; width: 100%;');
    expect(viewStyle).toContain('width: min(36rem, calc(100% - 1.5rem));');
    expect(viewStyle).toContain('@media (min-width: 600px) and (max-width: 1023px) {');
    expect(viewStyle).toContain('width: min(30rem, calc(100% - 7.5rem');
    expect(viewStyle).toContain('.mission-desk__map-cards { flex: 1 1 auto; min-height: 0; width: 100%;');
    expect(viewStyle).toContain('overflow-y: auto; overscroll-behavior: contain; pointer-events: auto;');
    expect(viewStyle).toContain('.mission-desk--active .mission-desk__bottom-stack #mission-status-panel {');
    expect(viewStyle).toContain('width: 100%; max-height: none; margin: 0;');
    expect(viewStyle).toContain('@media (max-width: 599px) and (max-height: 560px) {');
    expect(cardStyle).toContain('@media (max-width: 420px) {');
    expect(cardStyle).toContain('.mission-desk__phase-copy { flex-basis: calc(100% - 3.5rem); }');
    expect(cardStyle).toContain('.mission-desk__phase-steps');
    expect(cardStyle).toContain('.mission-desk__phase-step--current');
    expect(infoStyle).toContain('.mission-brief__body');
  });
});
