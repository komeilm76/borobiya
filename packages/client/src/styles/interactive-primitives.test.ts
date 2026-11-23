import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { audienceDetails, palettes } from "./tokens";

const src = fileURLToPath(new URL("../", import.meta.url));
const read = (path: string) => readFileSync(join(src, path), "utf8");
const css = read("styles/tailwind.css");
const auth = read("styles/auth.css");
const publicCss = read("styles/public.css");
function contrast(fg: string, bg: string): number {
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => {
      const value = parseInt(hex.slice(i, i + 2), 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const [a, b] = [luminance(fg), luminance(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// Audit every page/component source without mounting any .vue files (docs/TASKS.md).
describe("cards, actions and fields across the app", () => {
  it("reviews the full component inventory while preserving deliberate card and icon tiers", () => {
    const directories = ["components/map", "components/mission", "components/settings", "components/sharing",
      "components/shell", "components/sos", "views/_admin", "views/_auth", "views/_public", "views/_user"];
    const pages = ["App.vue", "views/PlaceholderPage.vue", ...directories.flatMap((dir) =>
      readdirSync(join(src, dir)).filter((name) => name.endsWith(".vue")).map((name) => `${dir}/${name}`))];
    expect(pages.length).toBeGreaterThanOrEqual(51);
    let buttons = 0;
    let fields = 0;
    for (const path of pages) {
      const template = read(path).split("<script")[0]!;
      buttons += (template.match(/<(?:v-btn|button)(?=[\s>])/g) ?? []).length;
      fields += (template.match(/<(?:v-text-field|v-textarea|v-select)(?=[\s>])/g) ?? []).length;
      for (const card of template.match(/<v-card(?=[\s>])[^>]*>/gs) ?? []) {
        expect(card, path).toMatch(/\brounded="(?:xl|t-xl)"/);
      }
    }
    expect(buttons).toBeGreaterThan(150);
    expect(fields).toBeGreaterThan(35);
    expect(css).not.toMatch(/\.v-card\s*\{[^}]*box-shadow:/); // Never elevate modal and inset cards universally.
    expect(css).toContain('.v-card.bb-surface-card {\n  box-shadow: var(--bb-shadow-surface) !important;');
    expect(css).toContain('.v-card.bb-floating-card {\n  box-shadow: var(--bb-shadow-overlay) !important;');
    expect(css).toContain(':not(.v-btn--icon):not(.v-btn--tile):not([class*="rounded-"])');
    expect(css).toContain('border-radius: var(--bb-radius-nested, 16px);');
  });

  it("keeps Persian button/field type and readable outlines in both themes, not faint auth-only strokes", () => {
    expect(css).toContain(':is(.app-shell, .v-overlay-container) button { font-family: inherit; }');
    expect(css).toContain(':is(.app-shell, .v-overlay-container) .v-btn {\n  font-family: var(--bb-font-family');
    expect(css).toContain('letter-spacing: normal; text-indent: 0; text-transform: none;');
    expect(css).toContain(':is(.app-shell, .v-overlay-container) .v-field--variant-outlined:not([class*="rounded-"])');
    expect(css).toContain(':not(.v-field--focused):not(.v-field--error):not(.v-field--disabled) .v-field__outline {\n  color: var(--bb-color-outline);\n  --v-field-border-opacity: 1;');
    expect(css).toContain('.v-field-label {\n  color: var(--bb-color-muted); opacity: 1;');
    expect(css).toContain('color: CanvasText;'); // OS high-contrast mode.
    expect(auth).not.toContain('--v-field-border-opacity: 0.16;');
    for (const mode of ["light", "dark"] as const) {
      const { outline, muted, surface, inset } = palettes[mode];
      for (const background of [surface, inset]) {
        expect(contrast(outline, background), `${mode} field border`).toBeGreaterThanOrEqual(3);
        expect(contrast(muted, background), `${mode} field label`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(css).not.toMatch(/\.v-btn\s*\{[^}]*box-shadow:/); // Disabled, SOS and icons retain their meaning.
  });

  it("keeps small shell and auth copy legible on light surfaces without erasing dark overrides", () => {
    expect(contrast(palettes.light.muted, palettes.light.inset)).toBeGreaterThanOrEqual(4.5);
    const shellForegrounds = {
      ".brand-tagline": "brandTagline", ".hero-copy": null, ".welcome-copy": "welcomeCopy",
      ".note-copy": "noteCopy", ".note-version": "noteCopy", ".app-footer": "footerInk"
    } as const;
    for (const [selector, role] of Object.entries(shellForegrounds)) {
      const token = role ? `var(--bb-shell-${role})` : "var(--bb-color-muted)";
      expect(css.split(`${selector} {`).slice(1).some((block) =>
        block.split("}")[0]!.includes(`color: ${token};`)), selector).toBe(true);
    }
    const authForegrounds = {
      ".auth-trust-row small": "--bb-color-muted",
      ".auth-divider": "--bb-detail-authDivider",
      ".auth-switch-copy": "--bb-detail-authSwitch",
      ".auth-privacy-note": "--bb-detail-authPrivacy",
      ".auth-form-intro": "--bb-color-muted",
      ".auth-success-state > p:not(.auth-eyebrow)": "--bb-color-muted"
    } as const;
    for (const [selector, role] of Object.entries(authForegrounds)) {
      expect(auth.split(`${selector} {`).slice(1).some((block) =>
        block.split("}")[0]!.includes(`color: var(${role});`)), selector).toBe(true);
    }
    expect(css).toContain(':root.dark .app-footer {');
    expect(auth).toContain(':root.dark .auth-switch-copy {');
    expect(auth).toContain(':root.dark .auth-privacy-note,');
  });

  it("raises formerly indistinct public dark cards and fixes low-contrast light card numbers", () => {
    expect(contrast(palettes.dark.surface, palettes.dark.background)).toBeGreaterThanOrEqual(1.5);
    expect(contrast(palettes.light.muted, palettes.light.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(audienceDetails.light.publicValueEdge, palettes.light.surface)).toBeGreaterThanOrEqual(1.5); // Noninteractive card boundary.
    expect(publicCss).toContain('border: 1px solid var(--bb-detail-publicValueEdge); border-radius: var(--bb-radius-card, 24px); background: var(--bb-detail-publicValueFill); box-shadow: var(--bb-shadow-item);');
    expect(publicCss).toContain('.public-value__number {');
    expect(publicCss).toContain('color: var(--bb-finish-publicValueNumber); font-size: var(--bb-font-body); font-weight: var(--bb-content-weight-strong);');
    expect(publicCss).toContain(':root.dark .public-value { border-color: var(--bb-detail-publicValueEdge); background: var(--bb-detail-publicValueFill); }');
    expect(publicCss).toContain(':root.dark .public-health__card { border-color: var(--bb-detail-publicHealthEdge); background: var(--bb-detail-publicHealthFill); }');
    expect(publicCss).toContain(':root.dark .public-steps { border-color: var(--bb-detail-publicValueEdge); background: var(--bb-detail-publicStepsFill); }');
    expect(publicCss).toContain(':root.dark .public-health__note { border: 1px solid var(--bb-color-outline);');
    expect(publicCss).toContain('.public-button {');
    expect(publicCss).toContain('.public-button--primary { color: var(--bb-audience-publicJoinInk); background: var(--bb-audience-publicJoinFill); box-shadow: var(--bb-shadow-item-hover); }');
    expect(publicCss).toContain('border-radius: var(--bb-radius-nested, 16px); font-size: var(--bb-content-font-button);');
    expect(publicCss).toContain('border-radius: var(--bb-radius-nested, 16px); color: var(--bb-detail-publicRetryInk);');
  });
});
