import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { designTokenStylesheet, palettes } from "../styles/tokens";

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
    const token = block[2]!.match(/(?:^|;)\s*color:\s*var\(--bb-color-([a-z-]+)\);/i)?.[1] as keyof typeof palettes.light | undefined;
    if (token && token in palettes.light) return palettes.light[token];
  }
  throw new Error(`Missing shared foreground token for ${selector}`);
}

describe("device settings small text contrast (T4.4.3 partial)", () => {
  it("sources this page's semantic colors from the global light/dark configuration", () => {
    const css = designTokenStylesheet();
    for (const theme of ["light", "dark"] as const) {
      for (const key of ["supporting-text", "error-text", "row-outline"] as const) {
        expect(css).toContain(`--bb-color-${key}: ${palettes[theme][key]}`);
      }
    }
    expect(view.split("<style scoped>")[1]).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(panel.split("<style scoped>")[1]).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(panel).toContain("border: 1px solid color-mix(in srgb, var(--bb-color-text) 8%, transparent);");
    expect(contrast(palettes.light["error-text"], palettes.light.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps small labels readable against the white cards and light page", () => {
    for (const selector of [
      ".device-priority__kicker", ".device-priority__hint", ".device-priority__meta", ".device-priority__icon"
    ]) {
      for (const background of [palettes.light.surface, palettes.light.inset]) {
        expect(contrast(lightColor(panel, selector), background), `${selector} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    const eyebrow = lightColor(view, ".user-devices__title-block p");
    expect(contrast(eyebrow, palettes.light.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(eyebrow, palettes.light.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("centers a restrained desktop card and separates session rows without changing their controls", () => {
    expect(panel).toMatch(/\.device-priority__card\s*\{[^}]*width: 100%;[^}]*max-width: 52rem;[^}]*align-self: center;/);
    expect(panel).toMatch(/\.device-priority__session\s*\{[^}]*border: 1px solid color-mix\(in srgb, var\(--bb-color-row-outline\) 32%, transparent\);[^}]*background: var\(--bb-color-inset\);/);
    expect(panel).toContain(":global(:root.dark .device-priority__session) {");
    expect(panel).toContain("border-color: var(--bb-color-outline);");
    // A longer Persian duration must not make the details' max-content width
    // push the icon onto a separate flex line on narrow screens.
    expect(panel).toContain(".device-priority__details { min-width: 0; flex: 1 1 0; }");
    expect(panel).toContain(".device-priority__session { display: grid; grid-template-columns: 22px minmax(0, 1fr); row-gap: 0.35rem; }");
    expect(panel).toContain(".device-priority__session > .v-btn { grid-column: 1 / -1; justify-self: end;");
    expect(panel).toContain('v-if="!row.isCurrent"');
  });

  it("keeps dark session labels and error feedback readable on their inset and card surfaces", () => {
    for (const background of [palettes.dark.surface, palettes.dark.inset]) {
      expect(contrast(palettes.dark.muted, background), `muted on ${background}`).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast(palettes.dark.text, palettes.dark.inset)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(palettes.dark["error-text"], palettes.dark.surface)).toBeGreaterThanOrEqual(4.5);
    expect(panel).toContain(":global(:root.dark .device-priority__hint--error) { color: var(--bb-color-error-text); }");
  });

  it("preserves dark-theme overrides for the same labels", () => {
    for (const selector of [
      ".device-priority__kicker", ".device-priority__hint", ".device-priority__meta", ".device-priority__icon"
    ]) {
      expect(panel).toContain(`:global(:root.dark ${selector})`);
    }
    expect(view).toContain(":global(:root.dark .user-devices__title-block p)");
    for (const background of [palettes.dark.surface, palettes.dark.background]) {
      expect(contrast(palettes.dark["supporting-text"], background)).toBeGreaterThanOrEqual(4.5);
    }
  });
});
