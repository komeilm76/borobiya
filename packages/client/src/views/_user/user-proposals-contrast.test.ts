import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "../../styles/tokens";

// Source-pinned CSS audit; do not mount Vue SFCs in unit tests (TASKS.md convention).
const source = readFileSync(new URL("./UserProposalsView.vue", import.meta.url), "utf8");
const styles = source.split("<style scoped>")[1] ?? "";

function rule(selector: string): string {
  const block = [...styles.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .find((match) => match[1]?.trim() === selector);
  expect(block, `missing ${selector} CSS rule`).toBeDefined();
  return block![2]!;
}

function rgb(hex: string): number[] {
  return [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
}

function luminance(color: number[]): number {
  const channels = color.map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

function contrast(foreground: number[], background: number[]): number {
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function composite(foreground: number[], background: number[], alpha: number): number[] {
  return foreground.map((channel, index) => channel * alpha + background[index]! * (1 - alpha));
}

describe("proposal card timestamp contrast (T4.4.3 partial)", () => {
  it("keeps the small clock label at least 4.5:1 on the card in both themes", () => {
    expect(source).toContain('<span><v-icon icon="mdi-clock-outline" size="16" /> {{ proposalTime(offer.createdAt) }}</span>');
    expect(rule(".offer-card")).toContain("background: rgb(var(--v-theme-surface))");
    const foot = rule(".offer-card__foot");
    expect(foot).toContain("color: rgb(var(--v-theme-primary))");
    expect(parseFloat(foot.match(/font-size:\s*([\d.]+)rem/)?.[1] ?? "NaN")).toBeLessThan(1.125);
    const alpha = parseFloat(rule(".offer-card__foot span:first-child").match(/opacity:\s*([\d.]+)/)?.[1] ?? "NaN");
    expect(alpha).toBeGreaterThan(0);
    expect(alpha).toBeLessThanOrEqual(1);
    for (const palette of [palettes.light, palettes.dark]) {
      const background = rgb(palette.surface);
      const foreground = composite(rgb(palette.primary), background, alpha);
      expect(contrast(foreground, background), `${palette.primary} at opacity ${alpha} on ${palette.surface}`)
        .toBeGreaterThanOrEqual(4.5);
    }
  });
});
