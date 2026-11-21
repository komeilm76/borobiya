import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source and compiler contracts; docs/TASKS.md forbids mounting Vue components in unit tests.
const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const template = parse(source).descriptor.template!.content;
const css = parse(source).descriptor.styles[0]!.content;

describe("admin SOS triage flow", () => {
  it("puts selection, incident context and responder action before optional history", () => {
    const responders = template.indexOf('id="dispatch-responders"');
    const queue = template.indexOf('id="dispatch-queue"');
    const map = template.indexOf('<MapCanvas');
    const detail = template.indexOf('class="admin-dispatch__detail-heading"');
    const timeline = template.indexOf('class="mb-3 pa-3 dispatch-mission-timeline"');
    const live = template.indexOf('v-for="mission in activeMissions"');
    expect(responders).toBeGreaterThan(0);
    expect(queue).toBeLessThan(responders);
    expect(responders).toBeLessThan(map);
    expect(map).toBeLessThan(detail);
    expect(detail).toBeLessThan(timeline);
    expect(timeline).toBeLessThan(live);
    expect(template).toContain('v-if="adminSos.selectedRequest" id="dispatch-responders" tabindex="-1"');
    expect(template).toContain('v-if="!adminSos.selectedRequest"');
    expect(template).toContain('v-if="adminSos.nearestLoaded && !adminSos.nearestLoading"');
    expect(template).toContain(':disabled="!adminSos.canDispatchSelected"');
  });

  it("keeps incident evidence visible and uses the jump only for navigation, not dispatch", () => {
    const detail = template.slice(template.indexOf('class="admin-dispatch__detail-heading"'), template.indexOf('id="dispatch-dialog-01"'));
    expect(detail).toContain('adminSos.selectedRequest.requesterId');
    expect(detail).toContain('adminSos.selectedRequest.description');
    expect(detail).toContain('class="admin-dispatch__facts"');
    expect(detail).toContain('adminSos.selectedRequest.location.isManual');
    expect(detail).toContain('adminSos.selectedRequest.location.accuracy !== undefined');
    expect(detail).toContain('adminSos.selectedRequest.photoUrl');
    expect(detail).toContain('aria-controls="dispatch-responders" @click="focusResponders"');
    expect(detail).toContain('aria-controls="dispatch-map" @click="focusSelectedIncidentMap"');
    expect(detail).not.toContain('@click="requestDispatch"');
    // The map jump keeps the incident framed and hands off keyboard focus.
    const mapJump = source.slice(source.indexOf('function focusSelectedIncidentMap(): void {'),
      source.indexOf('function focusNearbyResponder(userId: string): void {'));
    expect(mapJump).toContain('frameSelectedIncident();');
    expect(mapJump).toContain('document.getElementById("dispatch-map")');
    expect(mapJump).toContain('scrollIntoView({');
    expect(mapJump).toContain('querySelector<HTMLButtonElement>(".map-selected-alert-card")?.focus({ preventScroll: true });');
    expect(css).toContain('#dispatch-map { scroll-margin-top: calc(5rem + env(safe-area-inset-top, 0px)); }');
    expect(source).toMatch(/function focusResponders\(\): void \{\s*if \(!adminSos\.selectedRequest\) return;/);
    expect(source).toContain('target.focus({ preventScroll: true });');
    expect(source).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(source).toContain('target.scrollIntoView({');
    expect(source).toContain('if (!adminSos.canDispatchSelected) return;');
  });

  it("scans verified workload honestly and keeps complete incident evidence available on demand", () => {
    expect(template).not.toContain('admin-dispatch__overview'); // One compact filter, not a second navigation row.
    expect(template).toContain('class="admin-dispatch__filter-select"');
    expect(template).toContain('label="فیلتر SOS"');
    expect(template).not.toContain('admin-dispatch__filter-toggle');
    expect(template).toContain('v-if="adminSos.queueVerified" color="error"');
    expect(template).toContain("adminSos.visibleRequests.length.toLocaleString('fa-IR')");
    expect(template).toContain(':aria-current="item.id === adminSos.selectedId ? \'true\' : undefined"');
    expect(template).toContain(':aria-pressed="item.id === adminSos.selectedId"');
    expect(template).toContain('@click="toggleQueueRequest(item)"');
    expect(template).toContain('variant="outlined">لغو انتخاب</v-chip>');
    expect(source).toMatch(/function toggleQueueRequest\(item: SosRequestRecord\): void \{[\s\S]*?toggleSosQueueSelection\(adminSos.selectedId, item.id\) === null\)[\s\S]*?adminSos.selectRequest\(null\);[\s\S]*?focusRequest\(item\);/);
    const queue = template.slice(template.indexOf('class="dispatch-request-list"'), template.indexOf('id="dispatch-map-region"'));
    expect(queue).toContain('item.location.isManual');
    expect(queue).toContain('item.photoUrl');
    expect(queue).not.toContain('item.description'); // Full incident description belongs in the selected-request card.
    expect(queue).not.toContain('item.location.lat.toFixed'); // Coordinates live in incident facts and on the map.
    expect(template).toContain('adminSos.selectedRequest.location.lat.toFixed(6)');
    expect(template).toContain(':key="adminSos.selectedRequest.id" class="admin-dispatch__location-details"');
    expect(template).toContain('class="admin-dispatch__sender-id"');
    expect(template).toContain('class="admin-dispatch__photo-open"');
    expect(template).toContain('v-model="photoDialogOpen"');
    expect(template).toContain('@click="openPhoto"');
    expect(template).toContain('@click="photoRetryNonce++"');
    expect(source).toContain('photoDialogOpen.value = false;');
    expect(source).toContain('const src = await getSosPhotoSrc(requestId, token);');
    expect(source).toContain('generation !== photoOpenGeneration');
  });

  it("keeps dispatch safety visible while putting optional history and live maps behind disclosure", () => {
    expect(template).toContain('class="admin-dispatch__manual-warning" role="note"');
    expect(template).toContain('جست‌وجوی دستی فاصله و تخصص را تأیید نمی‌کند');
    expect(template).toContain('class="admin-dispatch__search-help"');
    expect(template).toContain('v-else-if="adminSos.nearestError"');
    expect(template).toContain('class="admin-dispatch__submit');
    expect(template).toContain(':key="adminSos.selectedRequest?.id" class="mb-3 pa-3 dispatch-mission-timeline"');
    expect(template).toContain('class="admin-dispatch__followup mb-3"');
    expect(template).toContain(':aria-expanded="showLivePanel"');
    expect(template).toContain('@click="showLivePanel = !showLivePanel"');
    expect(template).toContain('<template v-if="showLivePanel">');
    expect(template).toContain('v-for="mission in activeMissions"');
    expect(template).toContain('@click="loadActiveMissions()"');
    expect(template).toContain("adminSos.selectedRequest.status === 'cancelled_by_rescuer' &&\n              adminSos.urgentReplacement?.sosRequestId !== adminSos.selectedRequest.id");
    expect(source).toContain('showLivePanel.value = false;');
    expect(source).toContain('if (selectedDispatchWarnings.value.length) manualDispatchConfirmation.value = true;');
    expect(template).toContain('@click="testSound"');
    expect(template).toContain('v-if="soundTestError" id="dispatch-notice-01" role="alert"');
    expect(source).toContain('if (!await adminSos.testAlertSound())');
  });

  it("preserves a readable mobile map and full-width actions without an overlapping floating card", () => {
    expect(css).not.toContain('.dispatch-request-row__summary');
    expect(template).toContain('<h3>شرح حادثه</h3>');
    expect(template).toContain('{{ adminSos.selectedRequest.description }}');
    expect(css).toContain('.admin-dispatch__detail-body { display: grid; gap: .75rem;');
    expect(css).toContain('.admin-dispatch__responders { scroll-margin-top: calc(5rem + env(safe-area-inset-top, 0px)); }');
    expect(css).toContain('.admin-dispatch__responders:focus-visible');
    expect(css).toContain('.admin-dispatch__next :deep(.v-btn), .admin-dispatch__submit :deep(.v-btn) { width: 100%; }');
    expect(css).toContain('min-height: 44px; max-width: calc(100% - 1.5rem);');
    expect(css).toContain('.admin-dispatch__photo-image { display: block; width: 100%; height: 100%; object-fit: cover; }');
    expect(css).toContain('width: auto; height: auto; object-fit: contain;');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "dispatch-flow", source: template }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "dispatch-flow", source: css, scoped: true }).errors).toEqual([]);
  });
});
