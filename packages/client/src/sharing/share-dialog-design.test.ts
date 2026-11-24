import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source contracts: sharing views are not mounted in this repository's unit tests.
const dialog = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");
const dateField = readFileSync(new URL("../components/sharing/HistoryDateTimeField.vue", import.meta.url), "utf8");
const descriptor = parse(dialog).descriptor;
const css = descriptor.styles[0]!.content;

describe("location share form design", () => {
  it("uses the approved editor hierarchy without stacking bordered cards", () => {
    expect(dialog).toContain('aria-labelledby="share-dialog-title"');
    expect(dialog).toContain('<header class="share-dialog__header">');
    expect(dialog).toContain('class="share-dialog__header-icon"');
    expect(dialog).toContain('class="share-dialog__eyebrow"');
    expect(dialog).toContain('aria-label="بستن فرم اشتراک موقعیت"');
    expect(dialog).toContain('<form id="share-location-fields" class="share-dialog__form" @submit.prevent="submit">');
    expect(dialog).toContain('<section class="share-dialog__section" aria-labelledby="share-kind-title">');
    expect(dialog).toContain('<section class="share-dialog__section" aria-labelledby="share-recipients-title">');
    expect(dialog).toContain('<section class="share-dialog__section" aria-labelledby="share-access-title">');
    expect(dialog.indexOf('aria-labelledby="share-kind-title">')).toBeLessThan(dialog.indexOf('aria-labelledby="share-recipients-title">'));
    expect(dialog.indexOf('aria-labelledby="share-recipients-title">')).toBeLessThan(dialog.indexOf('aria-labelledby="share-access-title">'));
    expect(dialog).toContain('type="submit"\n          form="share-location-fields"');
    expect(css).toContain('.share-dialog__section + .share-dialog__section {');
    expect(css).toContain('border-top: 1px solid color-mix(in srgb, var(--bb-color-outline) 35%, transparent);');
    expect(dialog).not.toContain('<v-divider class="my-5" />');
    expect(dialog).toContain('aria-labelledby="share-device-title"');
    expect(dialog).toContain('class="share-device-chooser" dir="rtl"');
    expect(compileTemplate({ filename: "ShareDialog.vue", id: "share-redesign", source: descriptor.template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "ShareDialog.vue", id: "share-redesign", scoped: true, source: css }).errors).toEqual([]);
  });

  it("clearly differentiates live and history, preserves their controls and explains privacy", () => {
    expect(dialog).toContain('v-model="shareKind" class="share-dialog__kind-switch"');
    expect(dialog).toContain('value="live" variant="text"');
    expect(dialog).toContain('value="history" variant="text"');
    expect(dialog).toContain('v-if="shareKind === \'live\'"');
    expect(dialog).toContain('v-else-if="mode === \'history\'"');
    expect(dialog).toContain('v-model="historyMaxPointsInput"');
    expect(dialog).toContain('v-model="note"');
    expect(dialog).toContain('class="share-dialog__privacy" role="note"');
    expect(dialog).toContain('historyRangeError');
    expect(dialog).toContain('historyPointsError');
    expect(dialog).toContain("{{ shareKind === 'history' ? 'اشتراک تاریخچه' : 'اشتراک موقعیت زنده' }}");
    expect(dialog).toContain('buildHistorySharePayload(current');
    expect(dialog).toContain('buildLiveSharePayload(current)');
  });

  it("makes temporary duration choices predictable without confusing them with indefinite access", () => {
    const live = dialog.slice(dialog.indexOf('v-if="shareKind === \'live\'"'), dialog.indexOf('v-else-if="mode === \'history\'"'));
    expect(live).toContain('class="share-dialog__presets share-dialog__live-presets"');
    expect(live).toContain('class="share-dialog__ongoing"');
    expect(live).toContain('v-if="mode !== \'permanent\'"');
    expect(live).toContain('aria-label="واحد مدت دلخواه"');
    expect(live).toContain('class="share-dialog__duration-value" role="status"');
    expect(live).toContain(':model-value="scaleValueForMinutes(durationScale, durationMinutes)"');
    expect(live).toContain(':aria-valuetext="durationWords(durationMinutes)"');
    expect(live).toContain('minutesForScaleValue(durationScale, durationRange(durationScale).min)');
    expect(live).toContain('minutesForScaleValue(durationScale, durationRange(durationScale).max)');
    expect(css).toContain('.share-dialog__presets.share-dialog__live-presets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }');
    expect(css).toContain('.share-dialog__presets.share-dialog__live-presets { grid-template-columns: repeat(2, minmax(0, 1fr)); }');
    expect(dialog).toContain('durationScale.value = scaleForPreset(minutes);');
    expect(dialog).toContain('durationMinutes.value = minutesForScaleValue(scale, scaleValueForMinutes(scale, durationMinutes.value));');
    expect(dialog).toContain('durationMinutes.value = minutesForScaleValue(durationScale.value, value);');
  });

  it("keeps mobile actions reachable and freezes editable controls while submitting", () => {
    expect(dialog).toContain(':fullscreen="fullscreen ?? $vuetify.display.xs"');
    expect(dialog).toContain('.share-dialog { height: 100dvh; max-height: 100dvh;');
    expect(dialog).toContain('env(safe-area-inset-bottom, 0px)');
    expect(dialog).toMatch(/<v-slider[\s\S]*?:disabled="submitting"[\s\S]*?@update:model-value="setSliderDuration\(\$event\)"/);
    expect(dialog).toContain(':disabled="submitting || isSelf(candidate) || (recipientsFull && !isSelected(candidate))"');
    expect(dialog).toMatch(/:disabled="submitting"\s+@click="applyHistoryPreset\(hours\)"/);
    expect(dialog).toMatch(/:disabled="submitting"\s+:max="historyToInput"/);
    expect(dateField).toContain('disabled?: boolean');
    expect(dateField).toContain(':disabled="disabled"');
    expect(dateField).toContain('if (props.disabled) return;');
    expect(dialog).toContain('const submission = submissionFence.begin();');
  });
});
