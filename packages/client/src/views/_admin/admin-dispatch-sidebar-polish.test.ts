import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const dispatch = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../../components/map/MapCanvas.vue", import.meta.url), "utf8");
const live = readFileSync(new URL("../../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../../components/mission/MissionTimelinePanel.vue", import.meta.url), "utf8");
const trace = readFileSync(new URL("../../components/mission/MissionTracePanel.vue", import.meta.url), "utf8");
const { template, styles } = parse(dispatch).descriptor;
const css = styles[0]!.content;

describe("dispatch pinned rail and uncluttered map", () => {
  it("removes the entire zoom and compass control only on dispatch, retaining the map scale", () => {
    expect(template!.content).toContain(':show-navigation="false"');
    expect(canvas).toContain('showNavigation?: boolean;');
    expect(canvas).toContain('showNavigation: true'); // Other map consumers retain navigation.
    expect(canvas).toContain('if (props.showNavigation) instance.addControl(new NavigationControl({');
    expect(canvas).toContain('instance.addControl(new ScaleControl({ maxWidth: 120, unit: "metric" })');
    expect(template!.content).toMatch(/<MissionLivePanel[^>]*:show-navigation="false"/);
    expect(template!.content).toMatch(/<MissionTimelinePanel[^>]*:show-navigation="false"/);
    expect(live).toContain(':show-navigation="showNavigation"');
    expect(timeline).toContain(':show-navigation="showNavigation"');
    expect(trace).toContain(':show-navigation="showNavigation"');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "dispatch-nav", source: template!.content }).errors).toEqual([]);
    expect(compileTemplate({ filename: "MapCanvas.vue", id: "canvas-nav", source: parse(canvas).descriptor.template!.content }).errors).toEqual([]);
  });

  it("keeps the SOS queue above nearby responders and moves sound controls into settings", () => {
    const markup = template!.content;
    const queue = markup.indexOf('id="dispatch-queue-region"');
    const nearby = markup.indexOf('id="dispatch-nearby"');
    const map = markup.indexOf('id="dispatch-map-region"');
    expect(queue).toBeGreaterThan(0);
    expect(queue).toBeLessThan(nearby);
    expect(nearby).toBeLessThan(map);
    const settings = markup.slice(markup.indexOf('<v-menu v-model="soundSettingsOpen"'), markup.indexOf('</v-menu>') + 9);
    expect(settings).toContain('aria-label="تنظیمات صدا"');
    expect(settings).toContain('id="dispatch-action-04"');
    expect(settings).toContain('id="dispatch-action-05"');
    expect(settings).toContain('size="small"');
    expect(settings).toContain('v-if="soundTestError"');
    expect(dispatch).toContain('const soundSettingsOpen = ref(false);');
    expect(css).toContain('width: min(16rem, calc(100vw - 1rem));');
  });

  it("keeps the desktop incident panel taller with scroll contained within its single surface", () => {
    const panel = css.slice(css.indexOf('.admin-dispatch__incident-panel {'),
      css.indexOf('.admin-dispatch__search {', css.indexOf('.admin-dispatch__incident-panel {')));
    expect(panel).toContain('max-height: min(86dvh, calc(100dvh - 6rem));');
    expect(panel).toContain('flex-direction: column; overflow: hidden;');
    expect(panel).toContain('#dispatch-incident-content {\n  min-height: 0; overflow-y: auto;');
    expect(panel).toContain('scrollbar-width: thin; padding-inline: .15rem; border-radius: .65rem;');
    expect(panel).toContain('.admin-dispatch__incident-panel #dispatch-incident {\n  border: 0 !important; border-radius: 0 !important; box-shadow: none !important;');
    expect(panel).toContain('.admin-dispatch__incident-panel .admin-dispatch__facts > div,');
    expect(panel).toContain('.admin-dispatch__incident-panel :deep(.live-panel)');
    expect(panel).not.toContain('scrollbar-gutter: stable');
  });

  it("uses one rail surface without nested card elevation, borders or oversized desktop actions", () => {
    expect(css).toContain('--dispatch-sidebar-width: clamp(20rem, 28vw, 25rem);');
    const rail = css.slice(css.indexOf('/* The pinned rail is one surface'));
    expect(rail).toContain('#dispatch-sidebar .admin-dispatch__surface {\n  border: 0 !important; border-radius: 0 !important; box-shadow: none !important;');
    expect(rail).toContain('background: transparent !important; backdrop-filter: none !important;');
    expect(rail).toContain('border: 0; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .09);');
    expect(rail).toContain('font-size: .9rem !important;');
    expect(css).toContain('width: var(--dispatch-sidebar-width); padding: .4rem .5rem;');
    expect(rail).toContain('padding: .1rem .15rem; background: transparent;');
    expect(rail).toContain('margin: 0; padding: .2rem .25rem; min-height: 44px;');
    expect(rail).toContain('font-size: .8rem; line-height: 1.35; gap: .25rem !important;');
    expect(rail).toContain('font-size: .8rem; line-height: 1.3; gap: .25rem !important;');
    expect(rail).toContain('height: 38px; min-height: 38px;');
    expect(rail).toContain('min-height: 44px;'); // Emergency and touch actions stay reachable.
    expect(rail).not.toContain('#dispatch-incident .admin-dispatch__surface');
    const compiled = compileStyle({ filename: "AdminDispatchView.vue", id: "dispatch-rail", scoped: true, source: css });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain('#dispatch-sidebar .admin-dispatch__surface[data-v-dispatch-rail]');
  });
});
