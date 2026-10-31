import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source contract: do not mount Vue SFCs (docs/TASKS.md).
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../components/map/LiveCompanionPanel.vue", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../../components/sharing/ShareDialog.vue", import.meta.url), "utf8");

describe("sharing from the map companions widget", () => {
  it("opens the existing recipient form as a full-screen dialog and keeps the map broadcast control separate", () => {
    expect(panel).toContain('اشتراک موقعیت');
    expect(panel).toContain("$emit('create-share')");
    expect(view).toContain('@create-share="shareOpen = true"');
    expect(view).toContain('<ShareDialog v-model="shareOpen" fullscreen');
    expect(dialog).toContain(':fullscreen="fullscreen || $vuetify.display.smAndDown"');
    expect(view).toContain('@shared="onShareCreated"');
    expect(view).toContain('void broadcast.refreshPriority()');
    expect(view).toContain('@click="broadcast.toggle()"');
    expect(view).toContain('if (shareOpen.value) shareOpen.value = false;');
    expect(view).toContain('document.getElementById("map-share-location-button")?.focus()');
    expect(dialog).toContain(':close-on-back="!fullscreen"');
  });

  it("gives each companion the full list width and makes freshness, age and accuracy readable", () => {
    expect(panel).toContain('class="live-companions__peer-main"');
    expect(panel).toContain('class="live-companions__peer-meta"');
    expect(panel).toContain('موقعیت قدیمی');
    expect(panel).toContain('در انتظار موقعیت');
    expect(panel).toContain('ageWords(member.ageMs)');
    expect(panel).toContain('Math.round(member.accuracy)');
    expect(panel).toContain('aria-label="نمایش همراهان روی نقشه"');
    expect(panel).toContain('width: 100%;');
  });
});
