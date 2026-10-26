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

  it("keeps the sheet in a non-dismissable attaching state after SOS creation until photo upload settles", () => {
    expect(sheetSource).toContain('v-else-if="sos.createdRequestId.value && sos.submitting.value"');
    expect(sheetSource).toContain('!sos.createdRequestId.value && !sos.isCompleted.value && !sos.awaitingPhotoRetry.value');
    expect(sheetSource).toContain('if (sos.submitting.value || cancellation.submitting.value) return;');
  });

  it("keeps the SOS close control in its own top-aligned mobile header column", () => {
    expect(sheetSource).toContain('class="sos-sheet__close"');
    expect(sheetSource).toContain('aria-label="بستن فرم امداد"');
    expect(sheetSource).toContain('v-card-title class="sos-sheet__header"');
    expect(sheetSource).toMatch(/\.sos-sheet__header\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) auto;[^}]*white-space: normal;/s);
    expect(sheetSource).toMatch(/\.sos-sheet__title-group\s*\{[^}]*min-width: 0;/s);
    expect(sheetSource).toMatch(/\.sos-sheet__close\s*\{[^}]*align-self: start;[^}]*min-width: 44px;[^}]*min-height: 44px;/s);
    expect(sheetSource).toMatch(/\.sos-sheet__subtitle\s*\{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/s);
  });

  it("keeps cancel and emergency submit reachable in the narrow bottom-sheet footer", () => {
    expect(sheetSource).toContain("<v-bottom-sheet");
    expect(sheetSource).toContain("    scrollable\n");
    expect(sheetSource).toContain('class="sos-sheet__actions"');
    expect(sheetSource).toContain('data-test="sos-submit"');
    expect(sheetSource).toContain('@click="sos.submit()"');
    // Vuetify's v-card-actions does not wrap and v-btn defaults to flex-shrink: 0.
    // At 320px, two buttons plus a spacer can push the emergency action outside the clipped card.
    // The inset sheet drops to 70% width at 600px, so the footer needs the
    // stacked treatment through small tablets, not just at phone widths.
    const narrow = sheetSource.split("@media (max-width: 700px) {")[1]!.split("@media (max-width: 600px) {")[0]!;
    expect(narrow).toContain('.sos-sheet__actions { flex-wrap: wrap; }');
    expect(narrow).toContain('.sos-sheet__actions :deep(.v-spacer) { display: none; }');
    expect(narrow).toContain('.sos-sheet__actions :deep(.v-btn) { flex: 1 1 100%; min-width: 0; min-height: 44px; height: auto; }');
    expect(narrow).toContain('.sos-sheet__actions :deep(.v-btn__content) { white-space: normal; text-align: center; }');
    expect(sheetSource).toContain('@media (max-width: 600px) {\n  .sos-sheet__severities {');
    expect(sheetSource).toContain('max-height: min(74vh, 42rem);');
  });

  it("replaces the dashboard 'coming soon' rescue card with an active SOS trigger", () => {
    expect(dashboardSource).toContain("sosSheet.openSheet()");
    expect(dashboardSource).not.toContain("درخواست و پیگیری امداد در گام بعدی اضافه می‌شود");
  });
});
