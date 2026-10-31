import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parse, compileStyle } from "vue/compiler-sfc";
import { palettes } from "../../styles/tokens";

const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const companions = readFileSync(new URL("../../components/map/LiveCompanionPanel.vue", import.meta.url), "utf8");
const { descriptor } = parse(view);
const compiled = compileStyle({ filename: "UserMapView.vue", id: "data-v-warning", scoped: true,
  source: descriptor.styles[0]!.content });

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((offset) => {
    const value = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function ratio(first: string, second: string): number {
  const [lo, hi] = [luminance(first), luminance(second)].sort((a, b) => a - b);
  return (hi! + 0.05) / (lo! + 0.05);
}

// Source/compiled-style contracts; don't mount Vue SFCs in unit tests.
describe("map visual status and compass", () => {
  it("puts the broadcast error inside the companions card instead of plain map text", () => {
    expect(view).not.toContain('<p v-if="broadcast.view.tone === \'warn\' || broadcast.view.tone === \'error\'"');
    expect(view).toContain(':broadcast-status="broadcast.view.tone === \'warn\' || broadcast.view.tone === \'error\' ? broadcast.view : null"');
    expect(companions).toContain('v-if="broadcastStatus"');
    expect(companions).toContain('class="live-companions__broadcast-alert"');
    expect(companions).toContain('role="status"');
    expect(companions).toContain('broadcastStatus.headline');
    expect(companions).toContain('broadcastStatus.detail');
    expect(companions).toContain("broadcastStatus.tone === 'error' ? 'error' : 'warning'");
    expect(companions).toContain('overflow-wrap: anywhere;');
    for (const [foreground, background] of [
      ["#6e2023", "#fcecec"], ["#553b0a", "#fff2d5"],
      ["#ffe2df", "#422b2b"], ["#fff1cc", "#443522"]
    ]) {
      expect(companions).toContain(`color: ${foreground} !important;`);
      expect(companions).toContain(`background: ${background} !important;`);
      expect(ratio(foreground!, background!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("renders a two-tone legible compass in both themes with native reset/drag behavior", () => {
    expect(compiled.errors).toEqual([]);
    expect(view).toContain(':show-zoom="false"');
    expect(view).toContain("fill='%23ffffff'");
    expect(view).toContain("fill='%23f4c06a'");
    expect(view).toContain("fill='%23111c1d'");
    expect(view).toContain("fill='%23315555'");
    for (const [background, arrows] of [
      [palettes.light.primary, ["#ffffff", "#f4c06a"]],
      [palettes.dark.primary, ["#111c1d", "#315555"]]
    ] as const) {
      for (const arrow of arrows) expect(ratio(background, arrow)).toBeGreaterThanOrEqual(4);
    }
    expect(view).not.toContain("filter: invert(1)");
    expect(compiled.code).toContain(".maplibregl-ctrl-compass .maplibregl-ctrl-icon");
    expect(view).toContain("@media (forced-colors: active)");
  });
});
