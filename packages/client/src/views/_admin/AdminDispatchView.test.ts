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
  it("distinguishes loading, failed and verified-empty mission history for the selected SOS", () => {
    const view = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
    expect(view).toContain('v-if="adminSos.selectedRequest && missionLoading && !requestMissions.length"');
    expect(view).toContain('v-else-if="requestMissions.length"');
    expect(view).toContain('v-else-if="adminSos.selectedRequest && missionLoaded"');
    expect(view).toContain('role="status" aria-label="در حال دریافت مأموریت‌های این درخواست"');
    expect(view).toContain('useAdminRequestMissions(');
    expect(view).toContain('@click="loadActiveMissions()"');
    expect(view).toContain('در حال دریافت مأموریت‌های این درخواست');
    expect(view).toContain('بازخوانی مأموریت‌ها');
  });
  it("renders pulsing MapLibre circles, compact map recenter control, responder list, guarded dispatch controls, and admin alerts", () => {
    const viewSource = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
    expect(viewSource).toContain("admin-sos-pulse");
    expect(viewSource).toContain("admin-sos-core");
    expect(viewSource).toContain("admin-sos-nearby-rescuers-dot");
    expect(viewSource).toContain("admin-sos-nearby-rescuers-label");
    expect(viewSource).toContain("buildEligibleResponderGeoJson(");
    expect(viewSource).toContain("adminSos.nearestRequestId === adminSos.selectedRequest.id");
    expect(viewSource).toContain("!adminSos.responderSearch");
    expect(viewSource).toContain('watch(nearbyFeatures, () => { mapPointChoices.value = []; syncMapData(); updateMapEdgeCues(); }, { flush: "sync" });');
    expect(viewSource).toContain("[adminSos.nearestRequestId, adminSos.nearestLoaded]");
    expect(viewSource).toContain("if (nearbyFeatures.value.features.length) frameSelectedIncident()");
    expect(viewSource).toContain("[SOS_SOURCE_ID, RESPONDER_SOURCE_ID, RESPONDER_SELECTED_SOURCE_ID]");
    expect(viewSource).toContain("[SOS_PULSE_LAYER_ID, SOS_CORE_LAYER_ID, SOS_GLYPH_LAYER_ID,");
    expect(viewSource).toContain("RESPONDER_DOT_LAYER_ID, RESPONDER_LABEL_LAYER_ID, RESPONDER_NAME_LAYER_ID,");
    expect(viewSource).toContain("cluster: true, clusterRadius: 42, clusterMaxZoom: 18");
    expect(viewSource).toContain("getClusterExpansionZoom(choice.clusterId)");
    expect(viewSource).toContain('aria-label="انتخاب یکی از نقاط هم‌پوشان نقشه"');
    expect(viewSource).toContain('nearbyFeatures.value.features.some((feature) => feature.id === choice.id)');
    expect(viewSource).not.toContain('class="severity-legend"');
    expect(viewSource).toContain('chip.textContent = incidentLabel(incident.incidentTypeId)');
    expect(viewSource).toContain('"text-field": ["get", "username"]');
    expect(viewSource).not.toContain('"text-field": ["get", "mapTitle"]');
    expect(viewSource).toContain('selectedSosLabelMarker?.remove()');
    expect(viewSource).toContain('filter: ["!", ["has", "point_count"]]');
    expect(viewSource).not.toContain('راهنمای رنگ شدت حادثه');
    expect(viewSource).toContain("آخرین موقعیت ثبت‌شده‌اند؛ موقعیت زنده نیستند");
    expect(viewSource).toContain("function frameSelectedIncident()");
    expect(viewSource).toContain("shortestLongitudeBounds([incident.location.lon");
    expect(viewSource).toContain("function focusNearbyResponder(userId: string)");
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
    const severity = readFileSync(new URL("../../admin/sos-alerts.ts", import.meta.url), "utf8");
    expect(severity).toContain("#d97706");
    expect(severity).toContain("#0284c7");

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
    expect(viewSource).toContain("responder.distance === null ? 'فاصله نامشخص'");
    expect(viewSource).toContain("تخصص مرتبط ثبت نشده");
    expect(viewSource).toContain("selectedDispatchWarnings");
    expect(viewSource).toContain("@click=\"requestDispatch\"");
    expect(viewSource).toContain("@click=\"confirmManualDispatch\"");

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
