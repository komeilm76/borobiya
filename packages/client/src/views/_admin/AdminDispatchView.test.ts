import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AdminDispatchView and App shell live SOS alert & dispatch console wiring (T3.2.5 / T3.3.4)", () => {
  it("does not call an unverified SOS queue empty or publish stale counts as current", () => {
    const view = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
    expect(view).toContain('v-if="adminSos.visibleRequests.length === 0 && adminSos.loading"');
    expect(view).toContain('v-else-if="adminSos.visibleRequests.length === 0 && !adminSos.queueVerified"');
    expect(view).toContain('v-else-if="adminSos.visibleRequests.length === 0"');
    expect(view).toContain('v-if="adminSos.visibleRequests.length && !adminSos.queueVerified"');
    expect(view).toContain('v-if="adminSos.queueVerified"');
    expect(view).not.toContain('در انتظار رسیدگی ({{ adminSos.pendingCount }})');
    expect(view).not.toContain('اعزام‌شده ({{ adminSos.dispatchedCount }})');
    expect(view).not.toContain('همه ({{ adminSos.requests.length }})');
    expect(view).not.toContain('(${adminSos.pendingCount})');
    expect(view).not.toContain('(${adminSos.dispatchedCount})');
    expect(view).not.toContain('(${adminSos.requests.length})');
    expect(view).toContain('v-if="adminSos.listTruncated"');
    expect(view).toContain('@click="adminSos.refreshRequests()"');
    const shell = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
    expect(shell).toContain('adminSos.queueVerified && adminSos.filterStatus !== "dispatched" && adminSos.pendingCount > 0');
  });
  it("does not show a no-responder result or a zero badge while the responder read is unverified", () => {
    const view = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
    expect(view).toContain('v-if="adminSos.nearestLoaded && !adminSos.nearestLoading"');
    expect(view).toContain('v-else-if="adminSos.nearestError"');
    expect(view).toContain('v-else-if="adminSos.nearestLoaded && adminSos.nearestResponders.length === 0"');
    expect(view).toContain('v-else-if="adminSos.nearestLoaded" class="responder-list');
    expect(view).toContain('@click="adminSos.loadNearestResponders()"');
  });
  it("renders pulsing MapLibre circle layers, floating map alert card, nearest responder list, multi-select dispatch controls, and global admin alert banner", () => {
    const viewSource = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
    expect(viewSource).toContain("admin-sos-pulse");
    expect(viewSource).toContain("admin-sos-core");
    expect(viewSource).toContain("requestAnimationFrame");
    expect(viewSource).toContain("cancelAnimationFrame");
    expect(viewSource).toContain("styledata");
    expect(viewSource).toContain('"idle"');
    // setData from an idle handler schedules another idle; event callbacks must only restore missing
    // layers, while the request/selection watcher remains responsible for new GeoJSON data.
    expect(viewSource).toContain("function restoreMapLayers()");
    expect(viewSource).toMatch(/const onIdle = \(\) => \{\s*restoreMapLayers\(\)/);
    expect(viewSource).toMatch(/const onStyleData = \(\) => \{\s*restoreMapLayers\(\)/);
    expect(viewSource).toContain(':constrain-bounds="false"');
    expect(viewSource).toContain("toggleSoundMuted");
    expect(viewSource).toContain("testAlertSound");
    expect(viewSource).toContain("#dc2626");
    expect(viewSource).toContain("#d97706");
    expect(viewSource).toContain("#0284c7");

    // T3.3.4 nearest responder suggestions + multi-select dispatch console
    expect(viewSource).toContain("map-selected-alert-card");
    expect(viewSource).toContain("nearestResponders");
    expect(viewSource).toContain("toggleResponderSelection");
    expect(viewSource).toContain("selectAllNearestResponders");
    expect(viewSource).toContain("dispatchSelectedResponders");
    expect(viewSource).toContain("categoryName");
    expect(viewSource).toContain("avgRating");
    expect(viewSource).toContain("lastActiveAt");
    expect(viewSource).toContain('role="search" @submit.prevent="searchResponders"');
    expect(viewSource).toContain("adminSos.setResponderSearch(term)");
    expect(viewSource).toContain("adminSos.selectedResponderNames[id]");
    expect(viewSource).toContain("فقط امدادگران فعال، آزاد، هم‌تخصص و دارای موقعیت ثبت‌شده");

    // T3.6.5: persistent accessible replacement signposting survives sound autoplay denial.
    expect(viewSource).toContain("NEEDS REPLACEMENT");
    expect(viewSource).toContain('aria-live="assertive"');
    expect(viewSource).toContain("rescuerLocation");
    expect(viewSource).toContain("prefers-reduced-motion");
    expect(viewSource).toContain("redispatchNearest(requestId)");
    expect(viewSource).toContain("quickDispatchFeedback");

    const appSource = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
    expect(appSource).toContain("/_admin/dispatch");
    expect(appSource).toContain("useAdminSosStore");
    expect(appSource).toContain("openAlertOnMap");
    expect(appSource).toContain("openReplacementOnMap");
    expect(appSource).toContain("dismissUrgentReplacement");
  });
});
