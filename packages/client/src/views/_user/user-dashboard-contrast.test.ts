import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "../../styles/tokens";

// Source-pinned CSS audit; the repository does not mount Vue SFCs in unit tests.
const source = readFileSync(new URL("./UserDashboardView.vue", import.meta.url), "utf8");
const styles = source.split("<style scoped>")[1] ?? "";

function rgb(hex: string): number[] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

function luminance(color: number[]): number {
  const [r, g, b] = color.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(foreground: string, background: number[]): number {
  const a = luminance(rgb(foreground));
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function overlay(foreground: string, background: string, alpha: number): number[] {
  const fg = rgb(foreground), bg = rgb(background);
  return fg.map((channel, index) => channel * alpha + bg[index]! * (1 - alpha));
}

function rule(selector: string, property?: RegExp): string {
  // Selectors can be comma-grouped or repeated in a media query; use the last rule declaring the
  // requested property, rather than mistaking a later spacing-only rule for a color override.
  let last: string | undefined;
  for (const block of styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (block[1]!.trim().split(",").map((item) => item.trim()).includes(selector) &&
        (!property || property.test(block[2]!))) last = block[2];
  }
  expect(last, `missing CSS rule for ${selector}`).toBeDefined();
  return last!;
}

function color(selector: string): string {
  const declaration = rule(selector, /(?:^|\s)color:/).match(/(?:^|\s)color:\s*([^;]+);/);
  expect(declaration, `missing foreground for ${selector}`).not.toBeNull();
  const value = declaration![1]!.trim();
  if (value === "var(--bb-color-muted)") return palettes.light.muted;
  expect(value, `unexpected foreground for ${selector}`).toMatch(/^#[0-9a-f]{6}$/i);
  return value;
}

describe("dashboard small text contrast (T4.4.3 partial)", () => {
  it("keeps small foregrounds above 4.5:1 on the light page and cards", () => {
    for (const selector of [".user-dashboard__eyebrow", ".user-dashboard__welcome"]) {
      expect(contrast(color(selector), rgb(palettes.light.background)), selector).toBeGreaterThanOrEqual(4.5);
    }
    for (const selector of [
      ".user-dashboard__card-kicker", ".user-dashboard__card-header p", ".user-dashboard__feature-card > p"
    ]) {
      expect(contrast(color(selector), rgb(palettes.light.surface)), selector).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps note-card copy readable on its translucent tint, even over the page background", () => {
    const tint = "#347c61";
    expect(rule(".user-dashboard__note-card")).toContain("background: rgba(52, 124, 97, 0.07);");
    for (const underneath of [palettes.light.surface, palettes.light.background]) {
      expect(contrast(color(".user-dashboard__note-card p"), overlay(tint, underneath, 0.07))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("retains readable light text on the dark card and tinted background", () => {
    expect(styles).toContain(":global(:root.dark) .user-dashboard__welcome,");
    expect(rule(":global(:root.dark) .user-dashboard__note-card p")).toContain("color: #a0b6b2;");
    expect(styles).toContain(":global(:root.dark) .user-dashboard__eyebrow,");
    expect(rule(":global(:root.dark) .user-dashboard__card-kicker")).toContain("color: #9fc4bc;");
    expect(contrast("#a0b6b2", rgb(palettes.dark.surface))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#a0b6b2", overlay("#6bbe93", palettes.dark.background, 0.1))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#9fc4bc", rgb(palettes.dark.background))).toBeGreaterThanOrEqual(4.5);
  });
});
