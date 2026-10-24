import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AdminDispatchView and App shell live SOS alert & dispatch console wiring (T3.2.5 / T3.3.4)", () => {
  it("renders pulsing MapLibre circle layers, floating map alert card, nearest responder list, multi-select dispatch controls, and global admin alert banner", () => {
    const viewSource = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
    expect(viewSource).toContain("admin-sos-pulse");
    expect(viewSource).toContain("admin-sos-core");
    expect(viewSource).toContain("requestAnimationFrame");
    expect(viewSource).toContain("cancelAnimationFrame");
    expect(viewSource).toContain("styledata");
    expect(viewSource).toContain('"idle"');
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

    // T3.6.5: persistent accessible replacement signposting survives sound autoplay denial.
    expect(viewSource).toContain("NEEDS REPLACEMENT");
    expect(viewSource).toContain('aria-live="assertive"');
    expect(viewSource).toContain("rescuerLocation");
    expect(viewSource).toContain("prefers-reduced-motion");

    const appSource = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
    expect(appSource).toContain("/_admin/dispatch");
    expect(appSource).toContain("useAdminSosStore");
    expect(appSource).toContain("openAlertOnMap");
    expect(appSource).toContain("openReplacementOnMap");
    expect(appSource).toContain("dismissUrgentReplacement");
  });
});
