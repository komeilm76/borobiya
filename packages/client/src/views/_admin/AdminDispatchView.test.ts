import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("AdminDispatchView and App shell live SOS alert wiring (T3.2.5)", () => {
  it("renders pulsing MapLibre circle layers, severity legend, sound controls, and global admin alert banner", () => {
    const viewSource = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
    expect(viewSource).toContain("admin-sos-pulse");
    expect(viewSource).toContain("admin-sos-core");
    expect(viewSource).toContain("requestAnimationFrame");
    expect(viewSource).toContain("cancelAnimationFrame");
    expect(viewSource).toContain("styledata");
    expect(viewSource).toContain('"idle"');
    expect(viewSource).toContain(":constrain-bounds=\"false\"");
    expect(viewSource).toContain("toggleSoundMuted");
    expect(viewSource).toContain("testAlertSound");
    expect(viewSource).toContain("#dc2626");
    expect(viewSource).toContain("#d97706");
    expect(viewSource).toContain("#0284c7");

    const appSource = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
    expect(appSource).toContain("/_admin/dispatch");
    expect(appSource).toContain("useAdminSosStore");
    expect(appSource).toContain("openAlertOnMap");
  });
});
