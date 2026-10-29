import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "../styles/tokens";

// Source-pinned CSS audit. This repository does not mount Vue SFCs in unit tests.
const panel = readFileSync(new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url), "utf8");
const view = readFileSync(new URL("../views/_user/UserDevicesView.vue", import.meta.url), "utf8");

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

function contrast(first: string, second: string): number {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function lightColor(source: string, selector: string): string {
  const lightStyles = source.split(":global(:root.dark ")[0]!;
  for (const block of lightStyles.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!block[1]!.split(",").map((part) => part.trim()).includes(selector)) continue;
    const color = block[2]!.match(/(?:^|;)\s*color:\s*(#[0-9a-f]{6});/i)?.[1];
    if (color) return color;
  }
  throw new Error(`Missing literal foreground color for ${selector}`);
}

describe("device settings small text contrast (T4.4.3 partial)", () => {
  it("keeps small labels readable against the white cards and light page", () => {
    for (const selector of [
      ".device-priority__kicker", ".device-priority__table th", ".device-priority__muted", ".device-priority__share-now"
    ]) {
      expect(contrast(lightColor(panel, selector), palettes.light.surface), selector).toBeGreaterThanOrEqual(4.5);
    }
    const eyebrow = lightColor(view, ".user-devices__title-block p");
    expect(contrast(eyebrow, palettes.light.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(eyebrow, palettes.light.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("preserves dark-theme overrides for the same labels", () => {
    for (const selector of [
      ".device-priority__kicker", ".device-priority__table th", ".device-priority__muted", ".device-priority__share-now"
    ]) {
      expect(panel).toContain(`:global(:root.dark ${selector})`);
    }
    expect(view).toContain(":global(:root.dark .user-devices__title-block p)");
    for (const background of [palettes.dark.surface, palettes.dark.background]) {
      expect(contrast("#a0b6b2", background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
