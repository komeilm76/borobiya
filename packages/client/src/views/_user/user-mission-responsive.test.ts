import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");

describe("rescuer route phone controls (source-pinned; no Vue mount)", () => {
  it("uses one transport profile for the phone select and desktop buttons, locked during navigation", () => {
    expect(view).toMatch(/<v-select :model-value="routing\.profile\.value" :items="transportProfiles"[\s\S]*?class="mission-route__profile-select d-sm-none"[\s\S]*?label="وسیلهٔ حرکت"[\s\S]*?:disabled="navigation\.active\.value"[\s\S]*?@update:model-value="onProfileChange"/);
    expect(view).toMatch(/<v-btn-toggle class="d-none d-sm-inline-flex" :model-value="routing\.profile\.value"[\s\S]*?:disabled="navigation\.active\.value"[\s\S]*?@update:model-value="onProfileChange"/);
    expect(view).toContain('if (value === "car" || value === "bicycle" || value === "foot") routing.selectProfile(value as TransportProfile)');
    expect(view).toContain('] satisfies { title: string; value: TransportProfile }[];');
  });

  it("states the actual mission outcome and keeps optional stops out of the primary route path", () => {
    expect(view).toContain('<h1>{{ missionHeadline }}</h1>');
    expect(view).toContain('v-if="desk.cancellationNeedsRefresh.value && !desk.cancellationOpen.value"');
    expect(view).toContain('پیش از تغییر مرحله، وضعیت مأموریت را از سرور تازه کنید.');
    expect(view).toContain('if (desk.error.value) return "وضعیت تازهٔ مأموریت تأیید نشد.";');
    expect(view).toContain('if (desk.activeMission.value) return "کمک در جریان است.";');
    expect(view).toContain('if (desk.loading.value) return "در حال بررسی مأموریت…";');
    expect(view).toContain('return "مأموریت فعالی ندارید.";');
    expect(view).toContain('<details class="mission-route__stops" @toggle="onWaypointDisclosureToggle">');
    expect(view).toContain('<summary class="mission-route__stops-toggle">ایستگاه‌های میانی (اختیاری، حداکثر ۶)');
    expect(view).toContain('if (!(event.target as HTMLDetailsElement).open) pickingWaypoint.value = false;');
    const stopsStart = view.indexOf('<details class="mission-route__stops"');
    const editor = view.slice(stopsStart, view.indexOf('</details>', stopsStart));
    expect(editor).toContain('@click="addTypedWaypoint"');
    expect(editor).toContain('@click="routing.removeWaypoint(index)"');
    expect(editor).not.toContain('class="mission-route__step-control"');
    expect(view.indexOf('class="mission-route__step-control"')).toBeGreaterThan(stopsStart);
    expect(view).toContain('.mission-route__stops-toggle:focus-visible { outline: 3px solid rgb(var(--v-theme-primary));');
  });

  it("keeps mission cancellation actions reachable on narrow and short screens", () => {
    const phone = view.split("@media(max-width: 599px) {")[1]!.split("@media(max-width: 480px)")[0]!;
    expect(view).toContain('<v-dialog :model-value="desk.cancellationOpen.value" max-width="510" scrollable');
    expect(view).toContain('<v-card-actions class="mission-cancel-actions">');
    expect(phone).toContain('.mission-cancel-actions { flex-direction: column; align-items: stretch; gap: 8px; }');
    expect(phone).toContain('.mission-cancel-actions :deep(.v-spacer) { display: none; }');
    expect(phone).toContain('.mission-cancel-actions :deep(.v-btn) { width: 100%; min-width: 0; min-height: 44px; height: auto; margin: 0; }');
    expect(phone).toContain('.mission-cancel-actions :deep(.v-btn__content) { white-space: normal; text-align: center; }');
    expect(view).toContain(':disabled="!desk.canCancel.value" @click="desk.confirmCancellation()"');
  });

  it("keeps one definite-height mission map above the planner on phones and near it on wide screens", () => {
    const phone = view.split("@media(max-width: 599px) {")[1]!.split("@media(max-width: 480px)")[0]!;
    expect(phone).toContain(".mission-route__controls > div { width: 100%; min-width: 0; }");
    expect(phone).toContain(".mission-route__route-actions :deep(.v-btn) { flex: 1 1 100%; max-width: 100%;");
    expect(phone).toContain(".mission-route__coordinate { flex: 1 1 100%; max-width: none; min-width: 0; }");
    expect(view).not.toContain('<MapCanvas');
    expect(panel.match(/<MapCanvas\b/g)).toHaveLength(1);
    expect(panel.indexOf('<slot name="route-planner"')).toBeGreaterThan(panel.indexOf('<MapCanvas'));
    expect(view).toContain('<template #route-planner>');
    expect(panel).toContain('.live-panel--routing .live-panel__map { height: min(50dvh, 450px); min-height: 310px; }');
    expect(panel).toContain('.live-panel--routing .live-panel__map { height: min(42dvh, 360px); min-height: 275px; }');
    expect(panel).toContain('@container (min-width: 721px) { .live-panel--routing .live-panel__map { position: sticky;');
    expect(view).toContain('routing.findRoutes(true)');
    expect(view).toContain('routing.addWaypoint({ lat, lon })');
  });
});
