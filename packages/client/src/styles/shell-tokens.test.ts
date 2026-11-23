import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { designTokenStylesheet, palettes, shellColors, shellLayout, shellRadii, shellTypography } from "./tokens";

const shell = readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");
const profile = readFileSync(new URL("../components/shell/AccountProfileMenu.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../App.vue", import.meta.url), "utf8");

function contrast(first: string, second: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((index) => {
      const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("shared chrome and workspace welcome tokens", () => {
  it("exports every light/dark shell role and every shared size from the one stylesheet", () => {
    const output = designTokenStylesheet();
    expect(Object.keys(shellColors.light)).toEqual(Object.keys(shellColors.dark));
    for (const mode of ["light", "dark"] as const) {
      const rule = mode === "light" ? output.split(":root.dark {")[0]! : output.split(":root.dark {")[1]!;
      for (const [key, value] of Object.entries(shellColors[mode])) {
        expect(rule, `${mode} ${key}`).toContain(`--bb-shell-${key}: ${value}`);
        expect(shell, key).toContain(`var(--bb-shell-${key})`);
      }
    }
    for (const [key, value] of Object.entries(shellTypography)) {
      expect(output).toContain(`--bb-shell-font-${key}: ${value}`);
    }
    for (const [key, value] of Object.entries(shellLayout)) {
      expect(output).toContain(`--bb-shell-layout-${key}: ${value}`);
      expect(shell).toContain(`var(--bb-shell-layout-${key})`);
    }
    for (const [key, value] of Object.entries(shellRadii)) {
      expect(output).toContain(`--bb-shell-radius-${key}: ${value}px`);
    }
    expect(profile).toContain("border-radius: var(--bb-shell-radius-profileTheme)");
    expect(app).toContain("border-radius: var(--bb-shell-radius-toastAction)");
    expect(shell).toContain("--bb-map-action-radius: var(--bb-radius-nested)");
  });

  it("keeps the shell's formerly literal colors in configuration, not CSS", () => {
    // The few root fallbacks are deliberate pre-mount defaults. Vuetify theme
    // channels and forced-colors system keywords also remain intentional.
    const withoutFallbacks = shell.replace(/var\(--bb-color-[\w-]+,\s*#[0-9a-f]{6}\)/gi, "var(--bb-color-fallback)");
    expect(withoutFallbacks).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(shell).toContain("background: var(--bb-shell-mainBackdrop)");
    expect(shell).toContain("background: var(--bb-shell-welcomeBackdrop) !important");
    expect(shell).toContain("background: var(--bb-shell-footerFill)");
    expect(shell).toContain("background: var(--bb-shell-alertFill)");
  });

  it("retains legible navigation, status and brand text across themes", () => {
    for (const mode of ["light", "dark"] as const) {
      expect(contrast(shellColors[mode].navInk, palettes[mode].surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(shellColors[mode].brandInk, palettes[mode].brand)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(shellColors[mode].statusInk, shellColors[mode].statusFill)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
