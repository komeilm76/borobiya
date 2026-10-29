import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";
import { radii, shadows, typography } from "../../styles/tokens";

// Source and compiled CSS only; the project does not mount .vue components in unit tests.
const filename = new URL("./AdminDispatchView.vue", import.meta.url);
const source = readFileSync(filename, "utf8");
const template = source.split("<script setup")[0]!;
const styles = parse(source, { filename: filename.pathname }).descriptor.styles[0]!;

function cssRule(selector: string): string {
  const start = styles.content.indexOf(`${selector} {`);
  expect(start, `missing ${selector}`).toBeGreaterThanOrEqual(0);
  return styles.content.slice(start, styles.content.indexOf("}", start) + 1);
}

describe("dispatch surface and type hierarchy", () => {
  it("uses the same themed surface tier and xl corners as other top-level admin cards", () => {
    expect((template.match(/<v-card\b[^>]*class="[^"]*admin-dispatch__surface[^"]*"[^>]*>/g) ?? []).length).toBe(4);
    expect(template).not.toMatch(/<v-card\b[^>]*variant="outlined"/);
    expect(template.match(/<v-card\b[^>]*admin-dispatch__surface[^>]*elevation="0"[^>]*rounded="xl"/g)).toHaveLength(4);
    expect(cssRule(".admin-dispatch__surface")).toContain("border: 1px solid rgba(var(--v-theme-on-surface), 0.12);");
    expect(cssRule(".admin-dispatch__surface")).toContain("background: rgb(var(--v-theme-surface));");
    expect(template.match(/bb-surface-card/g)).toHaveLength(4);
    expect(radii.card).toBe(24);
    expect(shadows.light.surface).not.toBe(shadows.dark.surface);
  });

  it("retains floating-only map details, inset timeline and readable Persian typography", () => {
    expect(template).toContain('class="map-selected-alert-card bb-floating-card"');
    expect(cssRule(".map-selected-alert-card")).toContain("background: rgba(var(--v-theme-surface), 0.96);");
    expect(cssRule(".dispatch-mission-timeline")).toContain("border-radius: var(--bb-radius-nested, 16px);");
    expect(cssRule(".admin-dispatch")).toContain("font-family: var(--bb-font-family);");
    expect(styles.content).toMatch(/\.admin-dispatch :deep\(\.text-h5\),[\s\S]*?font-family: var\(--bb-font-family\) !important;/);
    expect(cssRule(".mission-timeline-select")).toContain("font: inherit;");
    expect(typography.fontFamily).toContain("Vazirmatn");
    const compiled = compileStyle({ source: styles.content, filename: filename.pathname, id: "data-v-test", scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(compiled.code).toContain(".admin-dispatch[data-v-test] .text-subtitle-1");
  });
});
