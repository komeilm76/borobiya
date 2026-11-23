import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { audienceContentLayout, audienceContentOptics, audienceContentWidths, audienceIconSizes, audienceRhythm, designTokenStylesheet } from "./tokens";

const paths = [
  "./auth.css", "./public.css", "../components/sharing/ShareDialog.vue",
  "../components/sharing/ShareLists.vue", "../components/sharing/LiveBroadcastBar.vue",
  "../components/sharing/HistoryDateTimeField.vue", "../components/sharing/PublicProfileFacts.vue"
];
const styles = paths.map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));
const spacing = /(?<![\w-])(?:margin|padding)(?:-(?:top|bottom|left|right|inline|block|inline-start|inline-end|block-start|block-end))?\s*:\s*([^;{}]+);|(?<![\w-])(?:gap|row-gap|column-gap)\s*:\s*([^;{}]+);/g;
const literalRem = /(?<![\w.])-?(?:\d*\.)?\d+rem\b/;

describe("guest and sharing spacing audit", () => {
  it("configures every repeated rem rhythm step and consumes it in the scoped styles", () => {
    const tokens = designTokenStylesheet();
    const consumers = styles.join("\n");
    for (const [key, value] of Object.entries(audienceRhythm)) {
      expect(tokens).toContain(`--bb-rhythm-${key}: ${value}`);
      expect(consumers, key).toContain(`var(--bb-rhythm-${key})`);
      expect(key).toMatch(/^[nr]\d{3}$/);
      expect(value).toMatch(/^-?\d+(?:\.\d+)?rem$/);
      expect(Math.round(Math.abs(parseFloat(value)) * 100)).toBe(Number(key.slice(1)));
      expect(value.startsWith("-")).toBe(key.startsWith("n"));
    }
    for (const role of ["authHeroTop", "authDividerTop", "authPasswordRevealTop",
      "authFormIntroTop", "authTrustPhoneTop", "publicActionInline",
      "publicHeroTitleTop", "publicNetworkTagBlock", "publicStepsWideGap", "publicFinalTop"] as const) {
      expect(tokens).toContain(`--bb-content-layout-${role}: ${audienceContentLayout[role]}`);
      expect(consumers).toContain(`var(--bb-content-layout-${role})`);
    }
  });

  it("configures content measures and decorative symbol sizing without moving touch targets", () => {
    const tokens = designTokenStylesheet();
    const consumers = styles.join("\n");
    for (const [family, values] of [
      ["content-width", audienceContentWidths], ["content-icon", audienceIconSizes],
      ["content-optics", audienceContentOptics]
    ] as const) {
      for (const [key, value] of Object.entries(values)) {
        expect(tokens).toContain(`--bb-${family}-${key}: ${value}`);
        expect(consumers, `${family}-${key}`).toContain(`var(--bb-${family}-${key})`);
      }
    }
    expect(audienceContentWidths.sharingDialog).toBe("45rem");
    expect(audienceIconSizes.publicHealth).toBe("64px");
    expect(styles[0]).toContain("min-width: 44px; width: 44px; height: 44px;");
    expect(styles[1]).toContain(".public-network__core { width: 84px; height: 84px;");
  });

  it("leaves no hardcoded rem gap/margin/padding while preserving functional resets", () => {
    for (const [index, source] of styles.entries()) {
      const css = source.includes("<style scoped>") ? source.slice(source.indexOf("<style scoped>")) : source;
      for (const declaration of css.matchAll(spacing)) {
        expect(declaration[0], `${paths[index]}: ${declaration[0]}`).not.toMatch(literalRem);
      }
    }
    expect(styles[0]).toContain(".auth-button-row .auth-submit { margin-top: 0; }");
    expect(styles[1]).toContain("padding: 0 !important;");
    expect(styles[2]).toContain("min-height: 44px");
    expect(styles[3]).toContain("min-width: 50px; min-height: 44px;");
  });
});
