import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source/compiled contracts only; docs/TASKS.md prohibits mounting Vue SFCs in unit tests.
const sources = {
  trip: readFileSync(new URL("../map/PointRouteSheet.vue", import.meta.url), "utf8"),
  travelGuidance: readFileSync(new URL("../../views/_user/UserMapView.vue", import.meta.url), "utf8"),
  mission: readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8"),
  progress: readFileSync(new URL("./MissionMapCards.vue", import.meta.url), "utf8"),
  brief: readFileSync(new URL("./MissionBriefDetails.vue", import.meta.url), "utf8"),
  members: readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8"),
};
const styles = Object.fromEntries(Object.entries(sources).map(([name, source]) =>
  [name, parse(source).descriptor.styles[0]!.content])) as Record<keyof typeof sources, string>;

function rule(css: string, selector: string): string {
  const start = css.indexOf(selector + " {");
  expect(start, selector).toBeGreaterThan(-1);
  return css.slice(start, css.indexOf("}", start));
}

describe("Mission tab uses Travel's map-card hierarchy", () => {
  it("keeps Review and Stop touch-sized, clearly distinct, and available even without GPS", () => {
    expect(sources.travelGuidance).toContain('class="user-map-view__journey-content bb-floating-card bb-map-navigation-card"');
    expect(styles.mission).toContain('/* The active mission cue uses Travel\'s emblem, information hierarchy and action');
    expect(rule(styles.mission, '.mission-desk__guidance--active')).toContain('grid-template-columns: 38px minmax(0, 1fr) auto;');
    expect(rule(styles.mission, '.mission-desk__guidance--active')).toContain('border-radius: var(--bb-radius-card, 24px);');
    expect(rule(styles.mission, '.mission-desk__guidance--active :deep(.v-btn)')).toContain('min-width: 44px; min-height: 44px;');
    expect(sources.mission).toContain('class="mission-desk__guidance-actions" role="group"');
    expect(sources.mission).toContain('aria-label="بررسی برنامهٔ مسیر مأموریت؛ راهبری ادامه دارد"');
    expect(sources.mission).toContain('aria-label="توقف راهبری؛ مسیر مأموریت حفظ می‌شود"');
    expect(sources.mission).toContain('v-if="incidentDistance !== null" class="mission-desk__direct-distance" aria-live="off"');
    expect(sources.mission).toContain('زمان رسیدن زنده در دسترس نیست');
    expect(sources.mission).toContain('if (desk.loading.value || desk.error.value || desk.terminalHold.value) return;');
    expect(sources.mission).toContain('navigation.stop();');
    const phone = styles.mission.slice(styles.mission.indexOf('@media (max-width: 599px) {', styles.mission.indexOf('.mission-desk__guidance--active {')));
    expect(phone).toContain('.mission-desk__guidance-actions :deep(.v-btn) { width: 44px; min-width: 44px; height: 44px; padding: 0; }');
    expect(phone).toContain('.mission-desk__guidance-actions .mission-desk__stop-label { display: none; }');
    expect(phone).toContain('.mission-desk__guidance--active .mission-desk__planned-distance {\n    position: absolute;');
    expect(styles.mission).toContain('.mission-desk__guidance {\n  position: absolute; z-index: 10; top:');
    expect(styles.mission).toContain('@media (min-width: 600px) and (max-height: 700px) {\n  /* A zoomed/landscape desktop still needs a clear lane');
    expect(styles.mission).toContain('.mission-desk__guidance--active { max-height: min(7rem, 25dvh); overflow-y: auto;');
  });

  it("gives stage actions and the map key the same readable type and single-surface separation", () => {
    expect(styles.trip).toContain('.point-route__actions { position: sticky; bottom: 0;');
    expect(rule(styles.progress, '.mission-desk__next-step')).toContain('border-top: 1px solid var(--bb-color-outline);');
    expect(styles.progress).toContain('.mission-desk__phase-heading strong { font-size: 1rem;');
    expect(styles.progress).toContain('color: var(--bb-color-muted); font-size: .82rem;');
    expect(styles.mission).toContain('.mission-desk__map-cards :deep(.mission-map-cards) {\n  border: 0; border-radius: 0; background: transparent; box-shadow: none;');
    expect(styles.mission).toContain('.mission-desk__map-legend h2 { margin: 0 0 .25rem; font-size: 1rem;');
    expect(styles.mission).toContain('.mission-desk__map-legend :deep(.bb-point-key) { display: grid;');
    expect(sources.mission).toContain('<MapPointKey :kinds=');
    expect(sources.mission).toContain('id="mission-tool-legend"');
    expect(sources.progress).toContain(':disabled="!desk.canAdvance.value" @click="desk.advanceStatus()"');
  });

  it("keeps the incident summary compact but exposes the complete approximate address", () => {
    const detail = sources.brief.slice(sources.brief.indexOf('<details class="mission-brief__details">'),
      sources.brief.indexOf('</details>'));
    expect(sources.brief).toContain('class="mission-brief__address-preview"');
    expect(sources.brief.match(/{{ address }}/g)).toHaveLength(1);
    expect(detail).not.toContain('{{ address }}');
    expect(detail).not.toContain('brief.description');
    expect(styles.brief).toContain('.mission-brief:has(.mission-brief__details[open]) .mission-brief__address-preview,');
    expect(detail).toContain('مختصات ثبت‌شدهٔ حادثه');
    expect(rule(styles.brief, '.mission-brief__address')).toContain('border-top: 1px solid var(--bb-color-outline);');
    expect(rule(styles.brief, '.mission-brief__address')).not.toContain('background:');
    expect(styles.brief).toContain('font-size: .875rem; line-height: 1.5;');
    expect(sources.trip).toContain('class="point-route__endpoint-address" dir="auto"');
  });

  it("retains compact team scrolling and makes idle offers one light/dark-safe map surface", () => {
    expect(styles.members).toContain('.live-panel__room-heading h2 { flex: 1; min-width: 0; margin: 0; font-size: 1rem;');
    expect(styles.members).toContain('.live-panel__member-list { list-style: none;');
    expect(styles.members).toContain('overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable;');
    expect(sources.members).toContain('@click="focusMember(member.role)"');
    expect(sources.mission).toContain('<p v-if="embedded" class="sr-only">در حال حاضر مأموریت فعالی ندارید؛');
    expect(sources.mission).toContain('<template v-else>');
    expect(styles.mission).toContain('.mission-desk--embedded .mission-desk__empty :deep(.offers__hero) {');
    expect(rule(styles.mission, '.mission-desk--embedded .mission-desk__empty :deep(.offers__hero)')).toContain('background: transparent; box-shadow: none; color: rgb(var(--v-theme-on-surface));');
    expect(rule(styles.mission, '.mission-desk--embedded .mission-desk__empty :deep(.offer-detail)')).toContain('box-shadow: none; background: transparent;');
    expect(styles.mission).toContain('.mission-desk--embedded .mission-desk__empty :deep(.offers__stat-number) { color: rgb(var(--v-theme-primary)); }');
    expect(styles.mission).toContain('.mission-desk__empty :deep(.offers__items) {\n  max-height: none; overflow: visible; padding: 0;');
  });

  it("compiles the adjusted mission surfaces without mounting any Vue component", () => {
    for (const [name, source] of Object.entries(sources)) {
      const { template, styles: styleBlocks } = parse(source).descriptor;
      expect(compileTemplate({ filename: `${name}.vue`, id: `mission-parity-${name}`, source: template!.content }).errors).toEqual([]);
      expect(compileStyle({ filename: `${name}.vue`, id: `mission-parity-${name}`, scoped: true,
        source: styleBlocks[0]!.content }).errors).toEqual([]);
    }
  });
});
