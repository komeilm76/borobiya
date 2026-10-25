import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  designTokenStylesheet, gridUnit, installDesignTokenStyles, palettes, spacing,
  typography, vuetifyThemeColors
} from "./tokens";

const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const css = readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");
const vuetify = readFileSync(new URL("../plugins/vuetify.ts", import.meta.url), "utf8");
const prePaint = readFileSync(new URL("../../public/theme-init.js", import.meta.url), "utf8");

function contrast(foreground: string, background: string): number {
  function luminance(hex: string): number {
    const channel = (index: number) => {
      const value = parseInt(hex.slice(index, index + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  }
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("T4.4.5 design primitives", () => {
  it("uses an 8px grid for major spacing with one documented half-step", () => {
    expect(gridUnit).toBe(8);
    expect(spacing.half).toBe(4);
    expect(Object.entries(spacing).filter(([key]) => key !== "half")
      .every(([, pixels]) => pixels % gridUnit === 0)).toBe(true);
    expect(typography.fontFamily).toContain("Vazirmatn");
    expect(typography.sizes.body).toBe("1rem");
  });

  it("keeps Vuetify, plain CSS and pre-paint backgrounds in sync without a flash", () => {
    const output = designTokenStylesheet();
    for (const mode of ["light", "dark"] as const) {
      const palette = palettes[mode];
      expect(vuetifyThemeColors(mode).background).toBe(palette.background);
      expect(vuetifyThemeColors(mode).primary).toBe(palette.primary);
      expect(output).toContain(`--bb-color-background: ${palette.background}`);
      expect(prePaint).toContain(palette.background); // tiny synchronous script runs before the bundle
      expect(prePaint).toContain(palette.text);
      expect(contrast(palette.text, palette.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast("#ffffff", palette.brand)).toBeGreaterThanOrEqual(4.5);
    }
    expect(output).toContain(":root.dark {");
    expect(output).toContain("--bb-space-two: 16px");
    expect(output).toContain("--bb-font-family:");
    expect(vuetify).toContain('colors: vuetifyThemeColors("light")');
    expect(vuetify).toContain('colors: vuetifyThemeColors("dark")');
    expect(main).toContain("installDesignTokenStyles(document);");
    expect(css).toContain("background: var(--bb-color-background");
    expect(css).toContain("gap: var(--bb-space-two");
  });

  it("installs one style element and updates it idempotently", () => {
    const nodes = new Map<string, { id: string; textContent: string }>();
    const root = {
      getElementById: (id: string) => nodes.get(id) ?? null,
      createElement: () => ({ id: "", textContent: "" }),
      head: { appendChild: (node: { id: string; textContent: string }) => { nodes.set(node.id, node); } }
    } as unknown as Pick<Document, "getElementById" | "createElement" | "head">;
    installDesignTokenStyles(root);
    installDesignTokenStyles(root);
    expect(nodes.size).toBe(1);
    expect(nodes.get("borobiya-design-tokens")?.textContent).toBe(designTokenStylesheet());
  });
});
