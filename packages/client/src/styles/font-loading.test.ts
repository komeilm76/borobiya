import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");
const client = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};

// No mounted SFCs: verify the real font asset package and its entry imports.
describe("self-hosted Persian typography", () => {
  it("loads Vazirmatn on every browser, not only when it happens to be installed on the OS", () => {
    expect(client.dependencies["@fontsource/vazirmatn"]).toBeDefined();
    for (const weight of [400, 500, 600, 700, 800, 900]) {
      const importPath = `@fontsource/vazirmatn/${weight}.css`;
      expect(main).toContain(`import "${importPath}";`);
      const fontCss = readFileSync(require.resolve(importPath), "utf8");
      expect(fontCss).toContain(`font-weight: ${weight};`);
      expect(fontCss).toContain("font-display: swap;");
      for (const subset of ["arabic", "latin", "latin-ext"]) {
        expect(fontCss).toContain(`vazirmatn-${subset}-${weight}-normal.woff2`);
        expect(fontCss).toContain(`vazirmatn-${subset}-${weight}-normal.woff`);
      }
      // Safari can fall back to WOFF when WOFF2 is unsupported; Persian glyphs
      // and digits must be present even when the OS has no Vazirmatn installed.
      expect(fontCss).toContain("format('woff2')");
      expect(fontCss).toContain("format('woff')");
      expect(fontCss).toContain("U+0600-06FF");
    }
    expect(main).not.toMatch(/https?:\/\/[^"']*font/i);
  });

  it("uses the loaded family for Vuetify pages as well as the base RTL page", () => {
    expect(appStyles).toContain('font-family: var(--bb-font-family, "Vazirmatn", "Segoe UI", Tahoma, sans-serif)');
    expect(appStyles).toContain(".v-application.app-shell {");
    expect(appStyles).toContain(".app-shell :is(.text-h1, .text-h2, .text-h3, .text-h4, .text-h5, .text-h6,");
    expect(appStyles).toContain(".text-subtitle-1, .text-subtitle-2, .text-body-1, .text-body-2,");
  });
});
