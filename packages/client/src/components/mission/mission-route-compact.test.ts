import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const view = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const { template, styles } = parse(view).descriptor;
const css = styles[0]!.content;

// Source contracts, never mount the map SFC in unit tests (docs/TASKS.md).
describe("compact mission route planner", () => {
  it("keeps guidance and the fixed destination visible before optional waypoints", () => {
    const primary = view.indexOf('class="mission-route__decision"');
    const incident = view.indexOf('class="mission-route__endpoint-mark mission-route__endpoint-mark--incident"');
    const stops = view.indexOf('class="mission-route__stops"');
    expect(primary).toBeGreaterThan(0);
    expect(incident).toBeGreaterThan(primary);
    expect(stops).toBeGreaterThan(incident);
    expect(view).toContain('مقصد نهایی · ثابت');
    expect(view).toContain('@click="startGuidance"');
    expect(view).toContain('@click="stopGuidance"');
  });

  it("discloses manual coordinates on demand without hiding the map picker, reorder or optimize controls", () => {
    const editor = view.slice(view.indexOf('<details v-if="routeSection === \'plan\'" class="mission-route__stops"'),
      view.indexOf('class="mission-route__step-control"'));
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
    expect(view).toContain('if (event.target !== event.currentTarget) return;');
    expect(compileTemplate({ source: template!.content, filename: "UserMissionView.vue", id: "compact-route" }).errors).toEqual([]);
  });

  it("bounds the map sheet and uses shared inset, radius, outline and elevation tokens", () => {
    expect(css).toContain('.mission-desk--active .mission-route { width: min(27rem, calc(100vw - 1.5rem)); max-height: min(52dvh, 28rem); padding: .85rem; }');
    expect(css).toContain('max-height: min(48dvh, calc(100dvh - 19rem');
    expect(css).toContain('.mission-route__section-links { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(css).toContain('.mission-route__manual-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));');
    expect(css).toContain('.mission-route__stops { margin-block: .65rem; border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-nested, 16px); background: var(--bb-color-inset); }');
    expect(css).toContain('box-shadow: var(--bb-shadow-overlay);');
    expect(css).toContain('.mission-route__manual summary:focus-visible { outline: 3px solid rgb(var(--v-theme-primary));');
    expect(css).toContain('.mission-route__choice--selected { border-color: rgb(var(--v-theme-primary)); box-shadow: inset 0 0 0 1px rgb(var(--v-theme-primary));');
    expect(compileStyle({ source: css, filename: "UserMissionView.vue", id: "compact-route", scoped: true }).errors).toEqual([]);
  });
});
