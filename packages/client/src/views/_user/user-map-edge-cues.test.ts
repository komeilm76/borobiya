import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Contract checks only: docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const userMap = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const dispatch = readFileSync(new URL("../_admin/AdminDispatchView.vue", import.meta.url), "utf8");
const { styles } = parse(userMap).descriptor;
const userCss = styles[0]!.content;
const edgeCss = userCss.slice(userCss.indexOf("/* Only the user's *offscreen* captions"));

describe("user map offscreen pin cues", () => {
  it("matches Dispatch's compact shadowed direction chip without changing on-map pins", () => {
    expect(edgeCss).toContain(':global(.user-map-view [data-bb-point-edge] :is(.bb-map-point__caption, .user-map-view__selected-place-label:not([hidden])))');
    expect(edgeCss).toContain('height: 30px; min-height: 30px; padding: 0;');
    expect(edgeCss).toContain('max-width: min(138px, var(--bb-point-edge-map-width');
    expect(edgeCss).toContain('padding-inline-start: calc(30px + .35rem); padding-inline-end: .4rem;');
    expect(edgeCss).toContain('border: 0; border-radius: .7rem;');
    expect(edgeCss).toContain('box-shadow: 0 3px 12px rgba(8, 21, 38, .28), 0 1px 3px rgba(8, 21, 38, .14);');
    expect(edgeCss).toContain('width: 30px; height: 100%');
    expect(edgeCss).toContain('width: 17px; height: 17px;');
    expect(edgeCss).toContain('M12%2020V4%20M5%2011l7-7%207%207');
    expect(edgeCss).toContain('mask: var(--bb-edge-arrow) center / contain no-repeat;');
    expect(edgeCss).toContain('--bb-edge-color: var(--bb-pin, #0868c8)');
    for (const side of ['left', 'right', 'bottom'])
      expect(edgeCss).toContain(`[data-bb-point-edge="${side}"]`);
    expect(edgeCss).toContain('direction: ltr;');
    expect(edgeCss).toContain('@media (forced-colors: active)');
    expect(dispatch).toContain('width: max-content; max-width: min(138px, calc(100% - 24px)); height: 30px;');
    expect(dispatch).toContain('width: 30px; height: 100%; border-radius: .65rem 0 0 .65rem;');
    expect(compileStyle({ source: userCss, filename: "UserMapView.vue", id: "user-edge-cues", scoped: true }).errors).toEqual([]);
  });

  it("makes only edge chips pointer and keyboard actionable, including the named POI callout", () => {
    expect(edgeCss).toContain('pointer-events: auto; cursor: pointer; touch-action: manipulation;');
    expect(edgeCss).toContain('[data-bb-point-edge]:focus-visible');
    expect(userMap).toContain('syncUserMapEdgeCue(instance, marker, label, edge);');
    expect(userMap).toContain('if (label.hidden) { syncUserMapEdgeCue(instance, marker, label, null); return; }');
    expect(edgeCss).not.toContain('pointer-events: none;');
  });

  it("measures both on-map and offscreen forms before clamping, without moving the pin", () => {
    expect(userMap).toContain('element.removeAttribute("data-bb-point-edge"); // Re-measure its on-map form');
    expect(userMap).toContain('({ y } = pointLabelPlacement(canvas, anchor, label.getBoundingClientRect()));');
    expect(userMap).toContain('const edgeRect = edge ? label.getBoundingClientRect() : rect;');
    expect(userMap).toContain('element.style.setProperty("--bb-point-edge-map-width"');
    expect(edgeCss).not.toContain('.bb-map-point__sign {');
  });
});
