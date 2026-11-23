import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { typography } from "./tokens";

const require = createRequire(import.meta.url);
const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
const appStyles = readFileSync(new URL("./tailwind.css", import.meta.url), "utf8");
const client = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  dependencies: Record<string, string>;
};

describe("self-hosted Persian typography", () => {
  it("loads a single variable font per script with all weights on slow networks", () => {
    expect(client.dependencies["@fontsource-variable/vazirmatn"]).toBeDefined();
    expect(main).toContain('import "@fontsource-variable/vazirmatn/wght.css";');
    expect(main).not.toContain('@fontsource/vazirmatn/');
    const fontCss = readFileSync(require.resolve("@fontsource-variable/vazirmatn/wght.css"), "utf8");
    expect(fontCss).toContain("font-family: 'Vazirmatn Variable';");
    expect(fontCss).toContain("font-weight: 100 900;");
    expect(fontCss).toContain("font-display: swap;");
    for (const subset of ["arabic", "latin", "latin-ext"]) {
      expect(fontCss).toContain(`vazirmatn-${subset}-wght-normal.woff2`);
    }
    expect(fontCss).toContain("U+0600-06FF");
    expect(typography.fontFamily).toContain('"Vazirmatn Variable"');
    expect(main).not.toMatch(/https?:\/\/[^"']*font/i);
  });

  it("uses the loaded family for Vuetify pages as well as the base RTL page", () => {
    expect(appStyles).toContain('font-family: var(--bb-font-family, "Vazirmatn", "Segoe UI", Tahoma, sans-serif)');
    expect(appStyles).toContain(".v-application.app-shell {");
    expect(appStyles).toContain(".app-shell :is(.text-h1, .text-h2, .text-h3, .text-h4, .text-h5, .text-h6,");
    expect(appStyles).toContain(".text-subtitle-1, .text-subtitle-2, .text-body-1, .text-body-2,");
  });
});
