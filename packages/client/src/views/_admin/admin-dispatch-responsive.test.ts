import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");

describe("dispatch console responsive triage (source-pinned; no Vue mount)", () => {
  it("keeps one filter state while showing an accessible compact phone control", () => {
    expect(source).toMatch(/<v-select\s+:model-value="adminSos\.filterStatus"[\s\S]*?class="admin-dispatch__filter-select d-sm-none"[\s\S]*?label="وضعیت درخواست‌های اضطراری"[\s\S]*?@update:model-value="onFilterChange"/);
    expect(source).toMatch(/<v-btn-toggle\s+class="d-none d-sm-inline-flex"\s+:model-value="adminSos\.filterStatus"/);
    expect(source).toContain("adminSos.setFilterStatus(value)");
    // The filter remains usable even while the server snapshot/counts are unverified.
    expect(source).toContain('title: "در انتظار رسیدگی", value: "pending"');
    expect(source).toContain('title: "اعزام‌شده", value: "dispatched"');
  });

  it("presents the SOS queue first and removes map overlays at every stacked width", () => {
    const mapColumn = '<v-col cols="12" lg="7" class="admin-dispatch__map-and-actions">';
    const queueColumn = '<v-col cols="12" lg="5" class="admin-dispatch__queue">';
    expect(source).toContain(mapColumn);
    expect(source).toContain(queueColumn);
    expect(source.indexOf(queueColumn)).toBeLessThan(source.indexOf(mapColumn));
    expect(source).not.toMatch(/\.admin-dispatch__queue \{ order:/); // no visual/keyboard order mismatch
    const desktop = source.split("<style scoped>")[1]!.split("@media (max-width: 1279px)")[0]!;
    expect(desktop).toMatch(/\.map-selected-alert-card \{\s*position: absolute;/);
    expect(desktop).toMatch(/\.severity-legend \{\s*position: absolute;/);
    const stacked = source.split("@media (max-width: 1279px) {")[1]!.split("@media (max-width: 599px)")[0]!;
    expect(stacked).toMatch(/\.dispatch-map-wrapper \{[^}]*display: flex;[^}]*height: auto;/);
    expect(stacked).toMatch(/\.dispatch-map-wrapper > :deep\(\.map-canvas\) \{[^}]*height: clamp\(20rem, 48dvh, 30rem\);[^}]*min-height: 20rem;/);
    for (const element of ["map-selected-alert-card", "severity-legend"]) {
      expect(stacked).toMatch(new RegExp(`\\.${element} \\{[^}]*position: static;`));
    }
    expect(source.indexOf('class="map-selected-alert-card bb-floating-card"')).toBeGreaterThan(source.indexOf('<MapCanvas'));
    expect(source).toContain('@click="focusRequest(adminSos.selectedRequest)"');
    expect(source).toContain('@click="focusRequest(item)"');
  });

  it("still reserves the compact filter and responder search wrap for phones", () => {
    const phone = source.split("@media (max-width: 599px) {")[1]!.split("\n}\n\n.pulse-indicator")[0]!;
    expect(phone).toContain('.admin-dispatch__filter-select { flex: 1 1 12rem;');
    expect(phone).toContain('.admin-dispatch__responder-search { flex-wrap: wrap; }');
    expect(phone).not.toContain('.dispatch-map-wrapper {');
  });
});
