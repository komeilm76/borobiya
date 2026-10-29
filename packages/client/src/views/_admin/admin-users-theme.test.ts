import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { palettes } from "../../styles/tokens";

// CSS source invariants: this repository does not mount Vue SFCs in unit tests.
const source = readFileSync(new URL("./AdminUsersView.vue", import.meta.url), "utf8");
const styles = source.split("<style scoped>")[1] ?? "";

function rule(selector: string): string {
  const start = styles.indexOf(`${selector} {`);
  expect(start, `missing ${selector}`).toBeGreaterThanOrEqual(0);
  return styles.slice(start, styles.indexOf("}", start) + 1);
}

function contrast(a: string, b: string): number {
  function luminance(hex: string): number {
    const rgb = [1, 3, 5].map((index) => {
      const v = parseInt(hex.slice(index, index + 2), 16) / 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * rgb[0]! + 0.7152 * rgb[1]! + 0.0722 * rgb[2]!;
  }
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

describe("admin users table theme", () => {
  it("uses the active surface for the entire card/table and semantic tinted statuses", () => {
    expect(rule(".admin-users-card")).toContain("background: rgb(var(--v-theme-surface)) !important;");
    expect(rule(".admin-users-table-wrap")).toContain("--v-theme-on-surface");
    expect(rule(".admin-users-table :deep(th)")).toContain("--v-theme-on-surface");
    expect(rule(".admin-account-status.is-active")).toContain("background: rgba(var(--v-theme-success), 0.12)");
    expect(rule(".admin-account-status.is-inactive")).toContain("background: rgba(var(--v-theme-error), 0.12)");
    expect(rule(".admin-role-pill.is-admin")).toContain("background: rgba(var(--v-theme-secondary), 0.15)");
    expect(rule(".admin-dialog-icon.is-activate")).toContain("--v-theme-success");
    expect(rule(".admin-deactivation-note")).toContain("--v-theme-secondary");
    expect(styles).not.toMatch(/background:\s*#(?:fff7e6|eff8f3|fff2f1|fff9ed)/i);
  });

  it("keeps badge labels readable in both themes, including the dark admin badge", () => {
    expect(rule(":global(:root.dark .admin-role-pill.is-admin)")).toContain("color: #f3ca7f;");
    for (const palette of [palettes.light, palettes.dark]) {
      expect(contrast(palette.success, palette.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.error, palette.surface)).toBeGreaterThanOrEqual(4.5);
    }
    expect(contrast("#8b641f", palettes.light.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#f3ca7f", palettes.dark.surface)).toBeGreaterThanOrEqual(4.5);
  });
});
