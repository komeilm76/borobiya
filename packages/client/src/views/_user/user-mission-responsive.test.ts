import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");

describe("rescuer route phone controls (source-pinned; no Vue mount)", () => {
  it("uses one transport profile for the phone select and desktop buttons, locked during navigation", () => {
    expect(view).toMatch(/<v-select :model-value="routing\.profile\.value" :items="transportProfiles"[\s\S]*?class="mission-route__profile-select d-sm-none"[\s\S]*?label="وسیلهٔ حرکت"[\s\S]*?:disabled="navigation\.active\.value"[\s\S]*?@update:model-value="onProfileChange"/);
    expect(view).toMatch(/<v-btn-toggle class="d-none d-sm-inline-flex" :model-value="routing\.profile\.value"[\s\S]*?:disabled="navigation\.active\.value"[\s\S]*?@update:model-value="onProfileChange"/);
    expect(view).toContain('if (value === "car" || value === "bicycle" || value === "foot") routing.selectProfile(value as TransportProfile)');
    expect(view).toContain('] satisfies { title: string; value: TransportProfile }[];');
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

  it("wraps mission actions and route coordinates before the definite-height, unobscured map", () => {
    const phone = view.split("@media(max-width: 599px) {")[1]!.split("@media(max-width: 480px)")[0]!;
    expect(phone).toContain(".mission-desk__toolbar { flex-wrap: wrap; }");
    expect(phone).toContain(".mission-route__controls > div { width: 100%; min-width: 0; }");
    expect(phone).toContain(".mission-route__route-actions :deep(.v-btn) { flex: 1 1 100%; max-width: 100%;");
    expect(phone).toContain(".mission-route__coordinate { flex: 1 1 100%; max-width: none; min-width: 0; }");
    expect(view).toContain(".mission-route__map { height: min(50vh, 430px); min-height: 310px;");
    expect(view.indexOf('class="mission-route__map"')).toBeGreaterThan(view.indexOf('class="mission-route__stops"'));
    expect(view).toContain('routing.findRoutes(true)');
    expect(view).toContain('routing.addWaypoint({ lat, lon })');
  });
});
