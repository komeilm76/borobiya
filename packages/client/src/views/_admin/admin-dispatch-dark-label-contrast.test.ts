import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";
import { palettes } from "@/styles/tokens";

// CSS contract only: map labels are MapLibre-owned DOM, not mounted Vue nodes.
const view = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const userMap = readFileSync(new URL("../_user/UserMapView.vue", import.meta.url), "utf8");
const css = parse(view).descriptor.styles[0]!.content;
const darkLabels = css.slice(css.indexOf("/* Match the user map's dark-mode POI labels."), css.indexOf(".admin-dispatch__map-note"));

function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const values = [1, 3, 5].map((i) => {
      const x = parseInt(hex.slice(i, i + 2), 16) / 255;
      return x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4;
    });
    return values[0]! * .2126 + values[1]! * .7152 + values[2]! * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

describe("dark dispatch map labels", () => {
  it("brightens on-map SOS/responder chips and offscreen cues, not the legend, light mode or forced colors", () => {
    expect(darkLabels).toContain('@media (forced-colors: none)');
    expect(darkLabels).toContain(':global(:root.dark .dispatch-map-wrapper :is(.dispatch-sos-label, .dispatch-map-edge-cue))');
    expect(darkLabels).not.toContain('.dispatch-map-key');
    expect(darkLabels).not.toContain('.map-selected-alert-card');
    expect(darkLabels).toContain(`background: ${palettes.light.inset}; color: ${palettes.light.text};`);
    const userCss = parse(userMap).descriptor.styles[0]!.content;
    const silhouette = 'box-shadow: 0 0 0 2px #152b2d, 0 6px 18px rgba(0, 0, 0, .72);';
    expect(darkLabels).toContain(silhouette);
    expect(userCss).toContain(silhouette);
    const compiled = compileStyle({ source: css, filename: "AdminDispatchView.vue", id: "dark-dispatch-labels", scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain(':root.dark .dispatch-map-wrapper :is(.dispatch-sos-label, .dispatch-map-edge-cue)');
    expect(compiled.code).not.toContain(':root.dark {');
    expect(css).toContain('.dispatch-map-edge-cue__arrow { background: CanvasText; color: Canvas; }');
    expect(css).toContain(':global(.dispatch-sos-label) { border-color: CanvasText; background: Canvas; color: CanvasText; box-shadow: none; }');
  });

  it("keeps text legible and label boundaries visible across dark land and bright roads", () => {
    const label = palettes.light.inset, text = palettes.light.text, outline = "#152b2d";
    expect(contrast(text, label)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(label, "#171b1d")).toBeGreaterThanOrEqual(7);
    expect(contrast(outline, "#dfbd88")).toBeGreaterThanOrEqual(5);
    expect(contrast(outline, label)).toBeGreaterThanOrEqual(7);
    // Existing severity/responder colors continue to identify the pin and cue arrow.
    expect(css).toContain('border-left: 3px solid var(--dispatch-label-color, #dc2626)');
    expect(css).toContain('background: var(--dispatch-edge-color, #0868c8);');
  });
});
