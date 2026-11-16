import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "./tokens";

// Source-level regression: no mounting Vue components (docs/TASKS.md).
const css = readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");
const login = readFileSync(new URL("../views/_auth/LoginView.vue", import.meta.url), "utf8");
const share = readFileSync(new URL("../components/sharing/ShareDialog.vue", import.meta.url), "utf8");
const mission = readFileSync(new URL("../components/shell/ProposalInboxContent.vue", import.meta.url), "utf8");
const errors = readFileSync(new URL("../api/error-message.ts", import.meta.url), "utf8");

function luminance(hex: string): number {
  const channels = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}
function contrast(first: string, second: string): number {
  const [a, b] = [luminance(first), luminance(second)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

describe("network error cards", () => {
  it("keeps the existing network-failure copy and semantic error alerts across card contexts", () => {
    expect(errors).toContain("ارتباط با سرویس برقرار نشد. اتصال اینترنت را بررسی و دوباره تلاش کنید.");
    for (const view of [login, share, mission]) {
      expect(view).toMatch(/<v-alert[^>]*type="error"[^>]*variant="tonal"[^>]*role="alert"/);
    }
  });

  it("uses opaque light and dark surfaces with readable body text and error icon", () => {
    const selector = ":is(.app-shell, .v-overlay-container) .v-alert.v-alert--variant-tonal.text-error";
    expect(css).toContain(`${selector} {\n  color: var(--bb-color-text) !important;\n  background: #fff0ee;`);
    expect(css).toContain(`:root.dark ${selector} {\n  background: #422f35;`);
    expect(css).toContain(`${selector} .v-alert__underlay {\n  display: none;`);
    expect(css).toContain(`${selector} .v-alert__prepend {\n  color: rgb(var(--v-theme-error));`);
    expect(css).toContain("border-inline-start-width: 4px;");
    expect(css).toContain("overflow-wrap: anywhere;");
    for (const [theme, surface] of [[palettes.light, "#fff0ee"], [palettes.dark, "#422f35"]] as const) {
      expect(contrast(theme.text, surface)).toBeGreaterThanOrEqual(7);
      expect(contrast(theme.error, surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(css).toContain("color: CanvasText !important;\n    background: Canvas;\n    border-color: CanvasText;");
  });
});
