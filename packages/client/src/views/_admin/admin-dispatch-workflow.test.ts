import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source and compiler contracts; docs/TASKS.md forbids mounting Vue components in unit tests.
const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const template = parse(source).descriptor.template!.content;
const css = parse(source).descriptor.styles[0]!.content;

describe("admin SOS triage flow", () => {
  it("puts selection, incident context and responder action before optional history", () => {
    const queue = template.indexOf('class="admin-dispatch__queue"');
    const detail = template.indexOf('class="admin-dispatch__detail-heading"');
    const map = template.indexOf('<MapCanvas');
    const responders = template.indexOf('id="dispatch-responders"');
    const timeline = template.indexOf('class="mb-3 pa-3 dispatch-mission-timeline"');
    const live = template.indexOf('<MissionLivePanel v-for="mission in (showLivePanel ? activeMissions : [])"');
    expect(queue).toBeGreaterThan(0);
    expect(queue).toBeLessThan(detail);
    expect(detail).toBeLessThan(map);
    expect(map).toBeLessThan(responders);
    expect(responders).toBeLessThan(timeline);
    expect(timeline).toBeLessThan(live);
    expect(template).toContain('v-if="adminSos.selectedRequest" id="dispatch-responders" tabindex="-1"');
    expect(template).toContain('v-if="adminSos.visibleRequests.length && !adminSos.selectedRequest"');
    expect(template).toContain('v-if="adminSos.nearestLoaded && !adminSos.nearestLoading"');
    expect(template).toContain(':disabled="!adminSos.canDispatchSelected"');
  });

  it("keeps incident evidence visible and uses the jump only for navigation, not dispatch", () => {
    const detail = template.slice(template.indexOf('class="admin-dispatch__detail-heading"'), template.indexOf('<v-col cols="12" lg="7"'));
    expect(detail).toContain('adminSos.selectedRequest.requesterId');
    expect(detail).toContain('adminSos.selectedRequest.description');
    expect(detail).toContain('class="admin-dispatch__facts"');
    expect(detail).toContain('adminSos.selectedRequest.location.isManual');
    expect(detail).toContain('adminSos.selectedRequest.location.accuracy !== undefined');
    expect(detail).toContain('adminSos.selectedRequest.photoUrl');
    expect(detail).toContain('aria-controls="dispatch-responders" @click="focusResponders"');
    expect(detail).not.toContain('@click="requestDispatch"');
    expect(source).toMatch(/function focusResponders\(\): void \{\s*if \(!adminSos\.selectedRequest\) return;/);
    expect(source).toContain('target.focus({ preventScroll: true });');
    expect(source).toContain('window.matchMedia("(prefers-reduced-motion: reduce)")');
    expect(source).toContain('target.scrollIntoView({');
    expect(source).toContain('if (!adminSos.canDispatchSelected) return;');
  });

  it("scans verified workload honestly and keeps complete incident evidence available on demand", () => {
    expect(template).toContain('class="admin-dispatch__overview"');
    expect(template).toContain("adminSos.queueVerified && adminSos.filterStatus !== 'dispatched'");
    expect(template).toContain("adminSos.queueVerified && adminSos.filterStatus !== 'pending'");
    expect(template).toContain(':aria-current="item.id === adminSos.selectedId ? \'true\' : undefined"');
    const queue = template.slice(template.indexOf('class="dispatch-request-list"'), template.indexOf('id="dispatch-incident"'));
    expect(queue).toContain('item.location.isManual');
    expect(queue).toContain('item.photoUrl');
    expect(queue).not.toContain('item.location.lat.toFixed'); // Coordinates live in incident facts and on the map.
    expect(template).toContain('adminSos.selectedRequest.location.lat.toFixed(6)');
    expect(template).toContain('class="admin-dispatch__sender-id"');
    expect(template).toContain('class="admin-dispatch__photo-open"');
    expect(template).toContain('v-model="photoDialogOpen"');
    expect(source).toContain('photoDialogOpen.value = false;');
  });

  it("keeps dispatch safety visible while putting optional history and live maps behind disclosure", () => {
    expect(template).toContain('class="admin-dispatch__manual-warning" role="note"');
    expect(template).toContain('جست‌وجوی دستی فاصله و تخصص را تأیید نمی‌کند');
    expect(template).toContain('class="admin-dispatch__search-help"');
    expect(template).toContain('v-else-if="adminSos.nearestError"');
    expect(template).toContain('class="admin-dispatch__submit');
    expect(template).toContain('v-else-if="requestMissions.length" class="mb-3 pa-3 dispatch-mission-timeline"');
    expect(template).toContain('class="admin-dispatch__followup mb-3"');
    expect(template).toContain('v-for="mission in (showLivePanel ? activeMissions : [])"');
    expect(source).toContain('if (selectedDispatchWarnings.value.length) manualDispatchConfirmation.value = true;');
  });

  it("preserves a readable mobile map and full-width actions without an overlapping floating card", () => {
    expect(css).toContain('.dispatch-request-row__summary { display: -webkit-box;');
    expect(css).toContain('-webkit-line-clamp: 2;');
    expect(css).toContain('.admin-dispatch__detail-body { display: grid; gap: .75rem;');
    expect(css).toContain('.admin-dispatch__responders { scroll-margin-top: calc(5rem + env(safe-area-inset-top, 0px)); }');
    expect(css).toContain('.admin-dispatch__responders:focus-visible');
    expect(css).toContain('.admin-dispatch__next :deep(.v-btn), .admin-dispatch__submit :deep(.v-btn) { width: 100%; }');
    expect(css).toContain('.map-selected-alert-card {\n    position: static;');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "dispatch-flow", source: template }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "dispatch-flow", source: css, scoped: true }).errors).toEqual([]);
  });
});
