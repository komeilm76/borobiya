import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";
import { palettes } from "@/styles/tokens";

// Project policy: source/compiled CSS contracts, not mounted Vue SFCs.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");

function styleBlock(source: string, selector: string): string {
  const start = source.indexOf(selector + " {");
  expect(start, selector).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("}", start));
}

describe("map sharing quick action", () => {
  it("does not show manual broadcast controls on the map or in the companion dialog", () => {
    expect(view).not.toContain('class="user-map-view__share"');
    expect(view).not.toContain('@click="broadcast.toggle()"');
    expect(view).toContain('void broadcast.refreshPriority()');
    expect(view).toContain('class="user-map-view__history-dialog"');
    expect(view).toContain('id="map-tool-search" class="user-map-view__search-action"');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    expect(compileStyle({ source: descriptor.styles[0]!.content, id: "data-v-share", filename: "UserMapView.vue", scoped: true }).errors).toEqual([]);
  });

  it("keeps the inactive icon and outline readable in both themes against the adjacent primary fill", () => {
    const luminance = (hex: string) => [1, 3, 5].reduce((sum, index, channel) => {
      const value = parseInt(hex.slice(index, index + 2), 16) / 255;
      const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][channel]!;
    }, 0);
    const contrast = (first: string, second: string) => {
      const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (high! + 0.05) / (low! + 0.05);
    };
    for (const palette of Object.values(palettes)) {
      expect(contrast(palette.outline, palette.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(palette.text, palette.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.primary, palette.surface)).toBeGreaterThanOrEqual(3);
    }
  });
});
