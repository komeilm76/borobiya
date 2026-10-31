import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DURATION_PRESET_MINUTES } from "./share-form";

// Source contract only: project convention prohibits mounting Vue SFCs in unit tests.
const dialog = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");

describe("simplified location-sharing dialog", () => {
  it("searches recipients without incident-type or minimum-rating filters or an unnecessary catalog request", () => {
    expect(dialog).not.toContain("incidentTypeChoice");
    expect(dialog).not.toContain("minRatingChoice");
    expect(dialog).not.toContain("listPublicIncidentTypes");
    expect(dialog).not.toContain("loadIncidentTypes");
    expect(dialog).not.toContain('label="نوع رویداد"');
    expect(dialog).not.toContain('label="حداقل امتیاز"');
    expect(dialog).toContain("onlineFilter === 'online'"); // Optional online-only narrowing remains.
  });

  it("offers exactly 15 minutes, 1 hour, 6 hours and until turned off for live shares", () => {
    expect(DURATION_PRESET_MINUTES).toEqual([15, 60, 360]);
    expect(dialog).toContain('const durationMinutes = ref(60)');
    expect(dialog).toContain('role="group" aria-label="مدت دسترسی به موقعیت زنده"');
    expect(dialog).toContain('v-for="minutes in presets"');
    expect(dialog).toContain('@click="chooseLiveDuration(null)"');
    expect(dialog).toContain('تا وقتی خاموش کنم');
    expect(dialog).toContain('chooseLiveDuration(minutes)');
    expect(dialog).not.toContain('<v-slider');
    expect(dialog).not.toContain('durationMinutes }} دقیقه');
  });

  it("keeps history ranges separate and permanent live sharing out of timed payloads", () => {
    expect(dialog).toContain("mode === 'history'");
    expect(dialog).toContain('class="share-dialog__history-fields"');
    expect(dialog).toContain('buildHistorySharePayload(current');
    expect(dialog).toContain('buildLiveSharePayload(current)');
    expect(dialog).toContain('const shareKind = computed<"live" | "history">');
    expect(dialog).toContain('lastLiveMode.value = mode.value');
    expect(dialog).toContain('mode.value = lastLiveMode.value');
    expect(dialog).toContain('mode.value = minutes === null ? "permanent" : "timed"');
  });
});
