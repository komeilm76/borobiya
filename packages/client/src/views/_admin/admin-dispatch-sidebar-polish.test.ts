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

  it("uses one rail surface without nested card elevation, borders or oversized desktop actions", () => {
    expect(css).toContain('--dispatch-sidebar-width: clamp(20rem, 28vw, 25rem);');
    const rail = css.slice(css.indexOf('/* The pinned rail is one surface'));
    expect(rail).toContain('#dispatch-sidebar .admin-dispatch__surface {\n  border: 0 !important; border-radius: 0 !important; box-shadow: none !important;');
    expect(rail).toContain('background: transparent !important; backdrop-filter: none !important;');
    expect(rail).toContain('border: 0; border-bottom: 1px solid rgba(var(--v-theme-on-surface), .09);');
    expect(rail).toContain('font-size: .9rem !important;');
    expect(rail).toContain('height: 38px; min-height: 38px;');
    expect(rail).toContain('min-height: 44px;'); // Emergency and touch actions stay reachable.
    expect(rail).not.toContain('#dispatch-incident .admin-dispatch__surface');
    const compiled = compileStyle({ filename: "AdminDispatchView.vue", id: "dispatch-rail", scoped: true, source: css });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain('#dispatch-sidebar .admin-dispatch__surface[data-v-dispatch-rail]');
  });
});
