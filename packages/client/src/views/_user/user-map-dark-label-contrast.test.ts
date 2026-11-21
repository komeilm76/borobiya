import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";
import { palettes } from "@/styles/tokens";

// Source/compiled CSS checks; the repo deliberately does not mount Vue SFCs in unit tests.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const css = parse(view).descriptor.styles[0]!.content;
const darkLabels = css.slice(css.indexOf("/* Dark tiles and the dark UI surface nearly merge."));

function contrast(a: string, b: string): number {
  const luminance = (hex: string) => {
    const channels = [1, 3, 5].map((i) => {
      const value = parseInt(hex.slice(i, i + 2), 16) / 255;
      return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
    });
    return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}

describe("dark user map POI labels", () => {
  it("uses a solid contrasting surface on every visible caption without restyling other maps or light mode", () => {
    expect(darkLabels).toContain('@media (forced-colors: none)');
    const selectors = [".bb-map-point__caption", ".bb-map-point__tooltip",
      ".user-map-view__selected-place-label:not([hidden])", ".user-map-view__result-marker__tooltip"];
    for (const selector of selectors) expect(darkLabels).toContain(selector);
    expect(darkLabels).toContain(':global(:root.dark .user-map-view :is(');
    expect(darkLabels).toContain(`background: ${palettes.light.inset}; color: ${palettes.light.text};`);
    expect(darkLabels).toContain('box-shadow: 0 0 0 2px #152b2d, 0 6px 18px rgba(0, 0, 0, .72);');
    const compiled = compileStyle({ source: css, filename: "UserMapView.vue", id: "dark-map-cues", scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain(':root.dark .user-map-view :is(');
    expect(compiled.code).not.toContain(':root.dark {'); // A broken scoped :global would recolor the entire app.
  });

  it("separates the label from dark land and bright roads while keeping text and arrows legible", () => {
    const label = palettes.light.inset, text = palettes.light.text, ring = "#152b2d";
    expect(contrast(text, label)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(label, "#171b1d")).toBeGreaterThanOrEqual(7); // dark.json background
    expect(contrast(ring, "#dfbd88")).toBeGreaterThanOrEqual(5); // dark.json bright roads
    expect(contrast(ring, label)).toBeGreaterThanOrEqual(7);
    expect(darkLabels).toContain('--bb-edge-color: #0e6666;');
    expect(contrast("#ffffff", "#0e6666")).toBeGreaterThanOrEqual(4.5);
  });
});
