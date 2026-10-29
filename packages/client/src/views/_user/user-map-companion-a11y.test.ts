import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "../../styles/tokens";

// CSS/markup regression only: unit tests do not mount Vue SFCs in this repository.
const map = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const companion = readFileSync(new URL("../../components/map/LiveCompanionPanel.vue", import.meta.url), "utf8");

function rgb(hex: string): number[] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}
function blend(foreground: string, background: string, alpha: number): string {
  return `#${rgb(foreground).map((value, index) =>
    Math.round(value * alpha + rgb(background)[index]! * (1 - alpha)).toString(16).padStart(2, "0")
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
function rule(source: string, selector: string): string {
  const css = source.split("<style scoped>")[1] ?? "";
  const match = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find((block) => block[1]!.split(",").map((part) => part.trim()).includes(selector));
  expect(match, `missing ${selector}`).toBeDefined();
  return match![2]!;
}
function color(source: string, selector: string): string {
  const match = rule(source, selector).match(/(?:^|;)\s*color:\s*(#[0-9a-f]{6});/i);
  expect(match, `missing foreground for ${selector}`).not.toBeNull();
  return match![1]!;
}

describe("map toolbar and live companions accessibility (T4.4.3 partial)", () => {
  it("keeps small light labels legible over even a black tile beneath translucent cards", () => {
    const toolbarBackground = blend(palettes.light.surface, "#000000", 0.95);
    const companionBackground = blend(palettes.light.surface, "#000000", 0.94);
    expect(rule(map, ".user-map-view__toolbar-card")).toContain("background: rgba(var(--v-theme-surface), 0.95);");
    expect(rule(companion, ".live-companions")).toContain("background: rgba(var(--v-theme-surface), 0.94);");
    expect(contrast(color(map, ".user-map-view__title-block p"), toolbarBackground)).toBeGreaterThanOrEqual(4.5);
    for (const selector of [".live-companions__title-block p", ".live-companions__age"]) {
      expect(contrast(color(companion, selector), companionBackground), selector).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("retains 4.5:1 dark labels over a white tile beneath the translucent panels", () => {
    const darkBackground = blend(palettes.dark.surface, "#ffffff", 0.94);
    expect(rule(map, ":global(:root.dark) .user-map-view__toolbar-card"))
      .toContain("background: rgba(27, 41, 42, 0.94);");
    expect(rule(companion, ":global(:root.dark) .live-companions"))
      .toContain("background: rgba(27, 41, 42, 0.94);");
    for (const [source, selector] of [
      [map, ":global(:root.dark) .user-map-view__title-block p"],
      [companion, ":global(:root.dark) .live-companions__title-block p"],
      [companion, ":global(:root.dark) .live-companions__age"]
    ]) {
      expect(contrast(color(source, selector), darkBackground), selector).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("makes the scrolling peer list keyboard reachable without replacing its list semantics", () => {
    // list-style: none can suppress implicit list semantics in some screen readers.
    expect(companion).toMatch(/<ul v-if="api\.peers\.value\.length" class="live-companions__peers" role="list" tabindex="0" aria-label="[^"]+">/);
    expect(rule(companion, ".live-companions__peers")).toContain("overflow-y: auto;");
    expect(rule(companion, ".live-companions__peers:focus-visible"))
      .toContain("outline: 2px solid var(--bb-color-primary);");
    expect(contrast(palettes.light.primary, blend(palettes.light.surface, "#000000", 0.94)))
      .toBeGreaterThanOrEqual(3);
    expect(contrast(palettes.dark.primary, blend(palettes.dark.surface, "#ffffff", 0.94)))
      .toBeGreaterThanOrEqual(3);
  });
});
