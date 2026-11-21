import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const dispatch = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../../components/map/MapCanvas.vue", import.meta.url), "utf8");
const live = readFileSync(new URL("../../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");
const timeline = readFileSync(new URL("../../components/mission/MissionTimelinePanel.vue", import.meta.url), "utf8");
const trace = readFileSync(new URL("../../components/mission/MissionTracePanel.vue", import.meta.url), "utf8");
const shellCss = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
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

  it("removes redundant rail rules, aligns RTL content and keeps compact actions usable", () => {
    const markup = template!.content;
    const railMarkup = markup.slice(markup.indexOf('id="dispatch-sidebar"'), markup.indexOf('</aside>'));
    expect(railMarkup).not.toContain('<v-divider');
    const rail = css.slice(css.indexOf('/* The pinned rail is one surface'));
    expect(rail).not.toContain('#dispatch-sidebar .admin-dispatch__surface :deep(.v-divider)');
    expect(css).toContain('.admin-dispatch__queue, .admin-dispatch__nearby {\n  display: flex; flex: 1 1 0; flex-direction: column; min-height: 18rem;');
    expect(css).toContain('flex: 1 1 auto; min-height: 0; max-height: none; overflow-y: auto;');
    expect(css).toContain('.admin-dispatch__nearby-empty { display: flex; flex: 1 1 auto;');
    expect(css).toContain('.admin-dispatch__queue, .admin-dispatch__nearby { display: block; min-height: 0; }');
    expect(rail).toContain('margin-inline-start: auto; justify-content: flex-end; max-width: 100%;');
    expect(markup).toContain('class="admin-dispatch__request-chips d-flex flex-wrap align-center ga-1"');
    expect(markup).toContain('class="admin-dispatch__intro-top"');
    expect(markup).toContain('متصل به اتاق زندهٔ ادمین');
    expect(rail).toContain('border-top: 0; justify-content: flex-start !important;');
    expect(rail).toContain('justify-content: flex-start !important;');
    expect(markup).toContain('aria-label="انتخاب همهٔ امدادگران"');
    expect(markup).toContain('aria-label="پاک‌سازی انتخاب امدادگران"');
    expect(markup).toContain(':aria-label="`اعزام امدادگران انتخاب‌شده (${adminSos.selectedResponderIds.length})`"');
    expect(rail).toContain('#dispatch-sidebar .admin-dispatch__surface :deep(.v-card-text[role="status"])');
    expect(shellCss).toContain('.app-shell--map:has(.admin-dispatch) .sos-fab.sos-fab,');
    expect(shellCss).toContain('inset-inline-start: calc(clamp(20rem, 28vw, 25rem) + 1rem);');
    expect(shellCss).toContain('inset-block-end: calc(8.75rem + env(safe-area-inset-bottom, 0px));');
    expect(shellCss).toContain('inset-inline-start: calc(.75rem + env(safe-area-inset-right, 0px));');
    expect(shellCss).toContain('inset-block-start: calc(7.75rem + env(safe-area-inset-top, 0px));');
  });

  it("uses a single map search widget and a compact recenter action in its heading", () => {
    const markup = template!.content;
    const widget = markup.slice(markup.indexOf('<section id="dispatch-search"'), markup.indexOf('</section>', markup.indexOf('<section id="dispatch-search"')));
    expect(widget).toContain('class="admin-dispatch__search-header"');
    expect(widget).toContain('class="admin-dispatch__search-indicator"');
    expect(widget).toContain('id="dispatch-recenter" class="map-selected-alert-card"');
    expect(widget).toContain('icon="mdi-crosshairs-gps"');
    expect(widget).toContain('variant="outlined" rounded="lg"');
    expect(widget).toContain('id="dispatch-search-results"');
    expect(css).toContain('width: min(25rem, calc(100% - var(--dispatch-sidebar-width) - 8.25rem));');
    expect(css).toContain('border-radius: var(--bb-radius-card, 24px);\n  background: rgba(var(--v-theme-surface), .95);');
    expect(css).toContain('min-height: 0; overflow-y: auto; overscroll-behavior: contain;\n  padding: .15rem;');
    expect(dispatch).toContain('document.getElementById("dispatch-recenter")?.focus({ preventScroll: true });');
    expect(css).not.toContain('.admin-dispatch__map-and-actions .map-selected-alert-card {');
  });

  it("fits the selected SOS actions and facts without losing their labels or touch targets", () => {
    const markup = template!.content;
    const panel = css.slice(css.indexOf('/* Keep the information and actions on the RTL start edge.'));
    expect(panel).toContain('.admin-dispatch__detail-heading { justify-content: flex-start;');
    expect(panel).toContain('grid-template-columns: 2rem minmax(0, 1fr) auto;');
    expect(panel).toContain('gap: .4rem; padding: .35rem .6rem .5rem;');
    expect(panel).toContain('min-height: 44px; height: 44px; padding-inline: .5rem;');
    expect(markup).toContain('aria-label="مشاهدهٔ پروفایل ارسال‌کننده"');
    expect(markup).toContain('aria-label="نمایش حادثه روی نقشه"');
    expect(markup).toContain('aria-label="انتخاب امدادگر و اعزام"');
    expect(markup).toContain('aria-label="بازخوانی مأموریت‌ها"');
    expect(markup).toContain('aria-controls="dispatch-responders" @click="focusResponders"');
  });

  it("uses one rail surface without nested card elevation, borders or oversized desktop actions", () => {
    expect(css).toContain('--dispatch-sidebar-width: clamp(20rem, 28vw, 25rem);');
    const rail = css.slice(css.indexOf('/* The pinned rail is one surface'));
    expect(rail).toContain('#dispatch-sidebar .admin-dispatch__surface {\n  border: 0 !important; border-radius: 0 !important; box-shadow: none !important;');
    expect(rail).toContain('background: transparent !important; backdrop-filter: none !important;');
    expect(rail).toContain('border: 0; border-radius: .5rem; background: transparent;');
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
