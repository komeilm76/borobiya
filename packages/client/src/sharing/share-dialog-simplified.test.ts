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

  it("keeps four live shortcuts alongside a custom slider that reaches 30 days", () => {
    expect(DURATION_PRESET_MINUTES).toEqual([15, 60, 360]);
    expect(dialog).toContain('const durationMinutes = ref(60)');
    expect(dialog).toContain('role="group" aria-label="مدت دسترسی به موقعیت زنده"');
    expect(dialog).toContain('v-for="minutes in presets"');
    expect(dialog).toContain('@click="chooseLiveDuration(null)"');
    expect(dialog).toContain('تا وقتی خاموش کنم');
    expect(dialog).toContain('chooseLiveDuration(minutes)');
    expect(dialog).toContain('<v-slider');
    expect(dialog).toContain(':max="DURATION_SLIDER_MAX"');
    expect(dialog).toContain('@update:model-value="chooseLiveDuration(minutesForSliderStep($event))"');
    expect(dialog).toContain('durationWords(maxMinutes)');
    expect(dialog).not.toContain('durationMinutes }} دقیقه');
  });

  it("reuses public profile facts in search and keeps a full-size add/remove button", () => {
    expect(dialog).toContain('<PublicProfileFacts :profile="candidate" :show-username="false" />');
    expect(dialog).toContain('avatarInitial(candidate.username)');
    expect(dialog).toContain('recipientsFull && !isSelected(candidate)');
    expect(dialog).toContain('min-height: 44px');
  });

  it("keeps history ranges separate and permanent live sharing out of timed payloads", () => {
    expect(dialog).toContain("mode === 'history'");
    expect(dialog).toContain('class="share-dialog__history-fields"');
    expect(dialog).toContain('<HistoryDateTimeField');
    expect(dialog).not.toContain('type="datetime-local"');
    expect(dialog).toContain('if (activeHistoryPresetHours.value !== null) applyHistoryPreset(activeHistoryPresetHours.value)');
    expect(dialog).toContain('buildHistorySharePayload(current');
    expect(dialog).toContain('buildLiveSharePayload(current)');
    expect(dialog).toContain('const shareKind = computed<"live" | "history">');
    expect(dialog).toContain('lastLiveMode.value = mode.value');
    expect(dialog).toContain('mode.value = lastLiveMode.value');
    expect(dialog).toContain('mode.value = minutes === null ? "permanent" : "timed"');
  });
});
