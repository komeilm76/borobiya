import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const view = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const { template, styles } = parse(view).descriptor;
const css = styles[0]!.content;

// Source contracts, never mount the map SFC in unit tests (docs/TASKS.md).
describe("compact mission route planner", () => {
  it("puts guidance first; keeps transport, alternatives, stop editor and incident details available", () => {
    const primary = view.indexOf('class="mission-route__decision"');
    const links = view.indexOf('class="mission-route__section-links"');
    const incident = view.indexOf('class="mission-route__endpoint-mark mission-route__endpoint-mark--incident"');
    const stops = view.indexOf('class="mission-route__stops"');
    expect(primary).toBeGreaterThan(0);
    expect(links).toBeGreaterThan(primary);
    expect(incident).toBeGreaterThan(links);
    expect(stops).toBeGreaterThan(incident);
    expect(view).toContain('class="mission-route__route-details"');
    expect(view).toContain('مقصد نهایی · ثابت');
    expect(view).toContain('@click="startGuidance"');
    expect(view).toContain('@click="stopGuidance"');
    expect(view).toContain('@click="openStopsSection"');
    expect(view).toContain('@click="routeDeleteConfirmOpen = true"');
  });

  it("edits stops separately, scrolling only the list during normal use", () => {
    const editor = view.slice(view.indexOf('<section v-if="routeSection === \'stops\'" class="mission-route__stops"'),
      view.indexOf('class="mission-route__preview-note"'));
    expect(editor).toContain('class="mission-route__map-stop"');
    expect(editor).toContain('class="mission-route__manual"');
    expect(editor.indexOf('class="mission-route__map-stop"')).toBeLessThan(editor.indexOf('class="mission-route__manual"'));
    expect(editor).not.toContain('<details class="mission-route__manual" open');
    expect(editor).toContain('aria-label="عرض جغرافیایی ایستگاه"');
    expect(editor).toContain('aria-label="طول جغرافیایی ایستگاه"');
    expect(editor).toContain('@click="addTypedWaypoint"');
    expect(editor).toContain('@click="routing.moveWaypoint(index, index - 1)"');
    expect(editor).toContain('@click="routing.removeWaypoint(index)"');
    expect(editor).toContain('v-if="routing.via.value.length" :model-value="routing.optimize.value"');
    expect(css).toContain('.mission-route__stop-list { flex: 0 1 auto; min-height: 0; max-height: min(14rem, 24dvh); overflow-y: auto;');
    expect(css).toContain('.mission-desk--active .mission-route { display: flex; flex-direction: column;');
    expect(css).toContain('max-height: min(48dvh, 23rem); padding: .7rem; overflow: hidden;');
    expect(css).toContain('.mission-route__body--stops:has(.mission-route__manual[open]) { overflow-y: auto;');
    expect(css).toContain('.mission-route__body--stops:has(.mission-route__manual[open]) .mission-route__stop-list {');
    expect(css).toContain('.mission-route__choices { flex: 1 1 auto; min-height: 0; overflow-y: auto;');
    expect(css).toContain('/* Accessibility fallback for a landscape/zoomed phone: keep all actions');
    expect(compileTemplate({ source: template!.content, filename: "UserMissionView.vue", id: "compact-route" }).errors).toEqual([]);
  });

  it("keeps configuration buttons concise and expands settings naturally instead of scrolling on every screen", () => {
    const start = view.indexOf('class="mission-route__section-links"');
    const controls = view.slice(start, view.indexOf('</div>', start));
    expect(controls.match(/<button\b/g)).toHaveLength(3);
    expect(controls).not.toContain('<small>');
    expect(controls).not.toContain('mdi-chevron-left');
    expect(controls).toContain('aria-label="`انتخاب وسیله؛');
    expect(controls).toContain('aria-label="`انتخاب مسیر؛');
    expect(controls).toContain('aria-label="`ویرایش ایستگاه‌ها؛');
    expect(view).toContain('<details class="mission-route__advanced">');
    expect(css).toContain('.mission-route__route-details-body { padding: .1rem 0 .35rem; }');
    expect(css).not.toMatch(/\.mission-route__route-details-body\s*\{[^}]*max-height/);
    expect(css).toContain('.mission-desk--active .mission-route:has(.mission-route__route-details[open]) { max-height: min(74dvh, 38rem); }');
    expect(css).toContain('.mission-route__body--plan:has(.mission-route__advanced[open]) { overflow-y: auto;');
    expect(css).toContain('.mission-route__section-links button { min-height: 44px; }');
  });

  it("uses one calm card surface, readable type and touch-sized controls", () => {
    const decision = css.slice(css.indexOf('.mission-route__decision {'), css.indexOf('}', css.indexOf('.mission-route__decision {')));
    const endpoints = css.slice(css.indexOf('.mission-route__endpoints {'), css.indexOf('}', css.indexOf('.mission-route__endpoints {')));
    const tabs = css.slice(css.indexOf('.mission-route__section-links button {'), css.indexOf('}', css.indexOf('.mission-route__section-links button {')));
    for (const rule of [decision, endpoints, tabs]) expect(rule).not.toContain('border: 1px');
    expect(css).toContain('.mission-route__decision-heading strong { font-size: 1rem; }');
    expect(css).toContain('.mission-route__decision-heading small { font-size: .875rem;');
    expect(css).toContain('.mission-route__heading small { display: block; font-size: .875rem;');
    expect(css).toContain('.mission-route__section-links button strong { font-size: .875rem;');
    expect(css).toContain('.mission-route__route-details summary { display: flex; align-items: center; min-height: 44px;');
  });

  it("uses shared inset, radius, focus and elevation tokens", () => {
    expect(css).toContain('.mission-route__section-links { grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(css).toContain('.mission-route__manual-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(css).toContain('box-shadow: var(--bb-shadow-overlay);');
    expect(css).toContain('.mission-route__manual summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary));');
    expect(css).toContain('.mission-route__choice--selected { border-color: rgb(var(--v-theme-primary)); box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));');
    expect(compileStyle({ source: css, filename: "UserMissionView.vue", id: "compact-route", scoped: true }).errors).toEqual([]);
  });
});
