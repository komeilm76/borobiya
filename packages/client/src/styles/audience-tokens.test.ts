import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { audienceColors, audienceFinishes, audienceRadii, audienceTypography, designTokenStylesheet, palettes } from "./tokens";

const auth = readFileSync(new URL("./auth.css", import.meta.url), "utf8");
const publicCss = readFileSync(new URL("./public.css", import.meta.url), "utf8");
const lists = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");
const dialog = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");
const broadcast = readFileSync(new URL("../components/sharing/LiveBroadcastBar.vue", import.meta.url), "utf8");

function contrast(foreground: string, background: string): number {
  const luminance = (value: string): number => {
    const hex = value.length === 4 ? `#${[...value.slice(1)].map((digit) => digit + digit).join("")}` : value;
    const [r, g, b] = [1, 3, 5].map((index) => {
      const channel = Number.parseInt(hex.slice(index, index + 2), 16) / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const a = luminance(foreground), b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("guest chrome and sharing feedback tokens", () => {
  it("emits every audience role for both themes and wires it to a consumer", () => {
    const output = designTokenStylesheet();
    expect(Object.keys(audienceColors.light)).toEqual(Object.keys(audienceColors.dark));
    const consumers = [auth, publicCss, lists, dialog, broadcast].join("\n");
    for (const mode of ["light", "dark"] as const) {
      const rule = mode === "light" ? output.split(":root.dark {")[0]! : output.split(":root.dark {")[1]!;
      for (const [key, value] of Object.entries(audienceColors[mode])) {
        expect(rule, `${mode} ${key}`).toContain(`--bb-audience-${key}: ${value}`);
        if (key === "shareSelected") {
          expect(audienceFinishes.dark.shareResultSelected).toBe("var(--bb-audience-shareSelected)");
          expect(dialog).toContain("background: var(--bb-finish-shareResultSelected);");
        } else {
          expect(consumers, key).toContain(`var(--bb-audience-${key})`);
        }
      }
    }
    for (const [key, value] of Object.entries(audienceTypography)) {
      expect(output).toContain(`--bb-audience-font-${key}: ${value}`);
      expect(consumers).toContain(`var(--bb-audience-font-${key})`);
    }
    for (const [key, value] of Object.entries(audienceRadii)) {
      expect(output).toContain(`--bb-audience-radius-${key}: ${value}px`);
      expect(consumers).toContain(`var(--bb-audience-radius-${key})`);
    }
  });

  it("preserves legible chrome and sharing status text on both themes", () => {
    for (const mode of ["light", "dark"] as const) {
      const colors = audienceColors[mode];
      expect(contrast(colors.publicBrand, colors.publicCanvas)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.publicNav, colors.publicCanvas)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.publicJoinInk, colors.publicJoinFill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(colors.shareSuccess, palettes[mode].surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palettes[mode]["error-text"], palettes[mode].surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps device success/error messages semantic, including dark overrides", () => {
    expect(lists).toContain(".share-lists__device-status--ok { color: var(--bb-audience-shareSuccess); }");
    expect(lists).toContain(".share-lists__device-status--error { color: var(--bb-color-error-text); }");
    expect(lists).toContain(":global(:root.dark .share-lists__device-status--ok) { color: var(--bb-audience-shareSuccess); }");
    expect(lists).toContain(":global(:root.dark .share-lists__device-status--error) { color: var(--bb-color-error-text); }");
    expect(broadcast).toContain("box-shadow: var(--bb-audience-broadcastHalo);");
    expect(dialog).toContain("background-color: var(--bb-audience-shareChipOn);");
  });
});
