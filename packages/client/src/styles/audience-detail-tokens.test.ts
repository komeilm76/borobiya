import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { audienceDetailRadii, audienceDetails, designTokenStylesheet, palettes, sharingTypography } from "./tokens";

const auth = readFileSync(new URL("./auth.css", import.meta.url), "utf8");
const publicCss = readFileSync(new URL("./public.css", import.meta.url), "utf8");
const sharing = ["ShareDialog.vue", "ShareLists.vue"].map((file) =>
  readFileSync(new URL(`../components/sharing/${file}`, import.meta.url), "utf8"));

function contrast(first: string, second: string): number {
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5].map((index) => {
      const v = parseInt(hex.slice(index, index + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("auth/public content and sharing typography tokens", () => {
  it("emits every light/dark role and references it in auth or public CSS", () => {
    const sheet = designTokenStylesheet();
    expect(Object.keys(audienceDetails.light)).toEqual(Object.keys(audienceDetails.dark));
    for (const mode of ["light", "dark"] as const) {
      const rule = mode === "light" ? sheet.split(":root.dark {")[0]! : sheet.split(":root.dark {")[1]!;
      for (const [key, value] of Object.entries(audienceDetails[mode])) {
        expect(rule, `${mode}: ${key}`).toContain(`--bb-detail-${key}: ${value}`);
        expect(auth + publicCss, key).toContain(`var(--bb-detail-${key})`);
      }
    }
    for (const [key, value] of Object.entries(audienceDetailRadii)) {
      expect(sheet).toContain(`--bb-detail-radius-${key}: ${value}px`);
      expect(auth + publicCss).toContain(`var(--bb-detail-radius-${key})`);
    }
    for (const [key, value] of Object.entries(sharingTypography)) {
      expect(sheet).toContain(`--bb-sharing-font-${key}: ${value}`);
      expect(sharing.join("\n")).toContain(`var(--bb-sharing-font-${key})`);
    }
  });

  it("keeps help, form links and health text readable against their surfaces", () => {
    for (const mode of ["light", "dark"] as const) {
      const c = audienceDetails[mode];
      const card = palettes[mode].surface;
      for (const ink of [c.authHeading, c.authLink, c.publicHeading, c.publicHealthCopy,
        c.publicHealthSmall, c.publicFooterHeading]) {
        expect(contrast(ink, card), `${mode} ${ink} on ${card}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(c.publicValueCopy, card)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("separates health status variants and retains content-area contrast overrides", () => {
    for (const state of ["HealthBadge", "HealthOnline", "HealthOffline"] as const) {
      expect(publicCss).toContain(`var(--bb-detail-public${state})`);
      expect(publicCss).toContain(`var(--bb-detail-public${state}Fill)`);
    }
    expect(auth).toContain(":root.dark .auth-form .v-field {\n  background: var(--bb-detail-authField);");
    expect(publicCss).toContain(":root.dark .public-health__card { border-color: var(--bb-detail-publicHealthEdge); background: var(--bb-detail-publicHealthFill); }");
    expect(sharing[0]).toContain("border-radius: var(--bb-shell-radius-pill);");
  });
});
