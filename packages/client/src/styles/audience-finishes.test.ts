import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  audienceContentLayout, audienceContentMotion, audienceContentRadii, audienceContentType,
  audienceFinishes, designTokenStylesheet, palettes
} from "./tokens";

const auth = readFileSync(new URL("./auth.css", import.meta.url), "utf8");
const publicCss = readFileSync(new URL("./public.css", import.meta.url), "utf8");
const sharing = ["ShareDialog.vue", "ShareLists.vue", "LiveBroadcastBar.vue", "HistoryDateTimeField.vue", "PublicProfileFacts.vue"].map((file) =>
  readFileSync(new URL(`../components/sharing/${file}`, import.meta.url), "utf8")).join("\n");
const consumers = auth + publicCss + sharing;

describe("guest decorative finishes, typography and major layout", () => {
  it("emits every themed finish and references each role in a guest or sharing consumer", () => {
    const stylesheet = designTokenStylesheet();
    expect(Object.keys(audienceFinishes.light)).toEqual(Object.keys(audienceFinishes.dark));
    for (const theme of ["light", "dark"] as const) {
      const rule = theme === "light" ? stylesheet.split(":root.dark {")[0]! : stylesheet.split(":root.dark {")[1]!;
      for (const [key, value] of Object.entries(audienceFinishes[theme])) {
        expect(rule, `${theme} ${key}`).toContain(`--bb-finish-${key}: ${value}`);
        expect(consumers, key).toContain(`var(--bb-finish-${key})`);
      }
    }
    for (const [family, values] of [
      ["content-layout", audienceContentLayout], ["content-motion", audienceContentMotion],
      ["content-radius", audienceContentRadii], ["content-font", audienceContentType.sizes],
      ["content-weight", audienceContentType.weights], ["content-leading", audienceContentType.leading]
    ] as const) {
      for (const [key, value] of Object.entries(values)) {
        expect(stylesheet).toContain(`--bb-${family}-${key}: ${value}`);
        expect(consumers, `${family}-${key}`).toContain(`var(--bb-${family}-${key})`);
      }
    }
  });

  it("keeps state colors, border syntax and light/dark surface differences", () => {
    expect(audienceFinishes.dark.authQuestionEdge).toBe("rgba(139, 210, 200, 0.17)");
    expect(audienceFinishes.dark.authFieldEdge).toBe("rgba(139, 210, 200, 0.16)");
    expect(audienceFinishes.dark.authIntroFill).not.toBe(audienceFinishes.light.authIntroFill);
    expect(audienceFinishes.dark.shareListRowFill).toBe("var(--bb-color-inset)");
    expect(audienceFinishes.dark.shareListRowEdge).toBe("var(--bb-color-outline)");
    expect(audienceFinishes.light.publicValueNumber).toBe("var(--bb-color-muted)");
    expect(audienceFinishes.dark.publicValueNumber).toBe("#b0c5bc");
    expect(sharing).toContain("border-inline-start: 3px solid var(--bb-finish-shareSelectedEdge);");
    for (const css of [auth, publicCss, sharing]) {
      expect(css).not.toMatch(/\bborder(?:-top|-bottom|-inline-start)?:\s*var\(--bb-finish-/);
    }
    expect(auth).toContain("border: 1px solid var(--bb-finish-authQuestionEdge);");
    expect(publicCss).toContain("border: 8px solid var(--bb-finish-publicNetworkCoreEdge);");
  });

  it("preserves color-free CSS and the distinction between decorative and functional geometry", () => {
    expect(auth.replace("rgb(var(--v-theme-primary))", "")).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
    expect(publicCss).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
    // The button outline follows the globally configurable primary palette.
    expect(auth).toContain("rgb(var(--v-theme-primary))");
    // These govern hit areas, route layout or decorative diagram positions, not theme paint.
    expect(auth).toContain("min-width: 44px; width: 44px; height: 44px;");
    expect(publicCss).toContain("top: 22%; left: 20%");
    expect(sharing).toContain("min-height: 44px");
    expect(palettes.dark.primary).not.toBe(palettes.light.primary);
  });
});
