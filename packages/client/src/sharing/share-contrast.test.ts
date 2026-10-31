import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "../styles/tokens";

// CSS/source audit only: the repository deliberately does not mount Vue SFCs in unit tests.
const dialog = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");
const lists = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");

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
function colorOf(source: string, selector: string): string {
  const css = source.split("<style scoped>")[1] ?? "";
  const block = Array.from(css.matchAll(/([^{}]+)\{([^{}]*)\}/g))
    .find((match) => match[1]!.split(",").map((part) => part.trim()).includes(selector));
  const color = block?.[2]?.match(/(?:^|;)\s*color:\s*([^;]+);/)?.[1]?.trim();
  if (!color) throw new Error(`Missing foreground for ${selector}`);
  return color;
}

describe("share privacy flow small text contrast (T4.4.3 partial)", () => {
  it("uses theme-aware text on both share cards and dialogs, not light-only dark ink", () => {
    for (const [source, selectors, token] of [
      [lists, [".share-lists__kicker", ".share-lists__row-state", ".share-lists__row-sub", ".share-lists__empty", ".share-lists__pending"], "muted"],
      [lists, [".share-lists__header h2", ".share-lists__section h3", ".share-lists__row-title"], "text"],
      [dialog, [".share-dialog__label", ".share-dialog__hint", ".share-dialog__result-meta", ".share-dialog__slider-limits"], "muted"],
      [dialog, [".share-dialog__title", ".share-dialog__chip", ".share-dialog__lead", ".share-dialog__duration-value"], "text"],
      [dialog, [".share-dialog__status"], "success"]
    ] as const) {
      for (const selector of selectors) {
        expect(colorOf(source, selector), selector).toBe(`var(--bb-color-${token})`);
        for (const theme of ["light", "dark"] as const) {
          expect(contrast(palettes[theme][token], palettes[theme].surface), `${selector} on ${theme} card`)
            .toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("keeps selected preset, keyboard focus and warning text legible in both themes", () => {
    expect(dialog).toMatch(/\.share-dialog__chip:focus-visible \{[^}]*outline: 2px solid var\(--bb-color-text\);/);
    expect(contrast("#ffffff", "#2f6b46")).toBeGreaterThanOrEqual(4.5);
    expect(colorOf(dialog, ".share-dialog__chip--on")).toBe("#ffffff");
    expect(contrast("#a8560e", palettes.light.surface)).toBeGreaterThanOrEqual(4.5);
    expect(colorOf(dialog, ".share-dialog__warn")).toBe("#a8560e");
    expect(colorOf(dialog, ":global(:root.dark .share-dialog__warn)")).toBe("var(--bb-color-secondary)");
    expect(contrast(palettes.dark.secondary, palettes.dark.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
