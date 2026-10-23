import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useSosSheetStore } from "@/stores/sos-sheet";

const appSource = readFileSync(resolve(import.meta.dirname, "../App.vue"), "utf8");
const triggerSource = readFileSync(
  resolve(import.meta.dirname, "../components/sos/SosTriggerButton.vue"),
  "utf8"
);
const sheetSource = readFileSync(
  resolve(import.meta.dirname, "../components/sos/SosRequestSheet.vue"),
  "utf8"
);
const dashboardSource = readFileSync(
  resolve(import.meta.dirname, "../views/_user/UserDashboardView.vue"),
  "utf8"
);

describe("Always-accessible SOS trigger and bottom-sheet UI (T3.2.4)", () => {
  it("opens and closes the shared SOS sheet store cleanly", () => {
    setActivePinia(createPinia());
    const store = useSosSheetStore();
    expect(store.open).toBe(false);
    store.openSheet();
    expect(store.open).toBe(true);
    store.closeSheet();
    expect(store.open).toBe(false);
  });

  it("mounts the prominent red SOS button and bottom sheet globally in App.vue", () => {
    expect(appSource).toContain("<SosTriggerButton");
    expect(appSource).toContain("<SosRequestSheet");
    expect(appSource).toContain("auth.isAuthenticated && !auth.mustCompleteSecurityQuestions");
    expect(triggerSource).toContain('data-test="sos-trigger"');
    expect(triggerSource).toContain("prefers-reduced-motion: reduce");
  });

  it("renders a Vuetify bottom sheet with severity, incident type, map picker, and camera/gallery upload", () => {
    expect(sheetSource).toContain("<v-bottom-sheet");
    expect(sheetSource).toContain("<MapCanvas");
    expect(sheetSource).toContain('capture="environment"');
    expect(sheetSource).toContain('accept="image/jpeg,image/png,image/webp"');
    expect(sheetSource).toContain("sos.retryPhotoUpload()");
    expect(sheetSource).toContain("@update:model-value=\"onLatTyped\"");
    expect(sheetSource).toContain("@update:model-value=\"onLonTyped\"");
    expect(sheetSource).toContain("map.easeTo(");
    expect(appSource).toContain("if (!visible) sosSheet.closeSheet()");
  });

  it("replaces the dashboard 'coming soon' rescue card with an active SOS trigger", () => {
    expect(dashboardSource).toContain("sosSheet.openSheet()");
    expect(dashboardSource).not.toContain("درخواست و پیگیری امداد در گام بعدی اضافه می‌شود");
  });
});
