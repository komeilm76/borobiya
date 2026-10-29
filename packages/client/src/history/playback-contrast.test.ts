import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "../styles/tokens";

// Source-level CSS check; the map and its Vue panel are not mounted in unit tests.
const panel = readFileSync(new URL("../components/map/HistoryPlaybackPanel.vue", import.meta.url), "utf8");

function rgb(hex: string): number[] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}
function blend(foreground: string, background: string, alpha: number): string {
  return `#${rgb(foreground).map((value, index) =>
    Math.round(value! * alpha + rgb(background)[index]! * (1 - alpha)).toString(16).padStart(2, "0")
  ).join("")}`;
}
function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light! + 0.05) / (dark! + 0.05);
}
function rule(selector: string): string {
  const css = panel.split("<style scoped>")[1]!;
  const match = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .find((block) => block[1]!.split(",").map((part) => part.trim()).includes(selector));
  if (!match) throw new Error(`Missing CSS selector ${selector}`);
  return match[2]!;
}
function color(selector: string): string {
  return rule(selector).match(/(?:^|;)\s*color:\s*([^;]+);/)?.[1]?.trim() ?? "";
}

describe("map history playback small-text contrast (T4.4.3 partial)", () => {
  it("keeps header and manual-range labels readable over the translucent light map card", () => {
    // The light panel uses 95% opaque white, but a map tile beneath it can be dark.
    const darkestCard = blend(palettes.light.surface, "#000000", 0.95);
    expect(rule(".history-playback")).toContain("background: rgba(var(--v-theme-surface), 0.95);");
    for (const selector of [".history-playback__title-block p", ".history-playback__field", ".history-playback__hint"]) {
      expect(color(selector), selector).toBe("#536d6c");
      expect(contrast(color(selector), darkestCard), selector).toBeGreaterThanOrEqual(4.5);
    }
    expect(rule(".history-playback__field input")).toContain("color: inherit;");
    // The input boundary itself must be visible, not just its label.
    expect(rule(".history-playback__field input")).toContain("border: 1px solid var(--bb-color-muted);");
    expect(contrast(palettes.light.muted, darkestCard)).toBeGreaterThanOrEqual(3);
    expect(rule(".history-playback__field input:focus-visible"))
      .toContain("outline: 2px solid var(--bb-color-primary);");
    expect(contrast(palettes.light.primary, darkestCard)).toBeGreaterThanOrEqual(3);
  });

  it("retains readable muted labels on the translucent dark map card", () => {
    // A white tile beneath the 94% opaque dark panel is the least favorable dark backdrop.
    const lightestCard = blend(palettes.dark.surface, "#ffffff", 0.94);
    expect(rule(":global(:root.dark .history-playback)")).toContain("background: rgba(27, 41, 42, 0.94);");
    for (const selector of [".history-playback__title-block p", ".history-playback__field", ".history-playback__hint"]) {
      expect(color(`:global(:root.dark ${selector})`), selector).toBe("#a0b6b2");
      expect(contrast("#a0b6b2", lightestCard), selector).toBeGreaterThanOrEqual(4.5);
    }
    expect(rule(":global(:root.dark .history-playback__field input)"))
      .toContain("border-color: var(--bb-color-muted);");
    expect(contrast(palettes.dark.muted, lightestCard)).toBeGreaterThanOrEqual(3);
    expect(contrast(palettes.dark.primary, lightestCard)).toBeGreaterThanOrEqual(3);
  });

  it("keeps the sticky header and inset sections readable on a narrow dark map", () => {
    expect(rule(":global(:root.dark .history-playback__header)"))
      .toContain("background: rgba(27, 41, 42, 0.98);");
    const lightestHeader = blend("#1b292a", "#ffffff", 0.98);
    expect(contrast("#a0b6b2", lightestHeader)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#edf5f2", lightestHeader)).toBeGreaterThanOrEqual(4.5);
    expect(rule(".history-playback__source")).toContain("background: rgba(var(--v-theme-on-surface), 0.035);");
    expect(rule(".history-playback__range")).toContain("background: rgba(var(--v-theme-on-surface), 0.035);");
  });
});
