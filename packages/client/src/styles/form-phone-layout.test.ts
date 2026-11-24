import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";
import { designTokenStylesheet, formDialogDensity, formPhoneLayout } from "./tokens";

const paths = [
  "../views/_admin/AdminCategoriesView.vue",
  "../views/_admin/AdminIncidentsView.vue",
  "../views/_admin/AdminCreateUserDialog.vue",
  "../components/sharing/ShareDialog.vue"
];
const sources = paths.map((path) => readFileSync(new URL(path, import.meta.url), "utf8"));

describe("modest editor density across desktop, tablet and phone", () => {
  it("keeps type and button density in configuration while retaining readable inputs and touch targets", () => {
    const tokens = designTokenStylesheet();
    expect(formDialogDensity.title).toBe("1.18rem");
    expect(formPhoneLayout.title).toBe("1.02rem");
    expect(parseFloat(formPhoneLayout.sectionTitle)).toBeLessThan(parseFloat(formDialogDensity.sectionTitle));
    expect(parseFloat(formPhoneLayout.buttonFont)).toBeLessThan(parseFloat(formDialogDensity.buttonFont));
    for (const [key, value] of Object.entries(formDialogDensity)) {
      expect(tokens).toContain(`--bb-form-dialog-${key}: ${value}`);
    }
    for (const [index, source] of sources.entries()) {
      const css = parse(source).descriptor.styles[0]!.content;
      const breakpoint = index === 3 ? 599 : 600;
      const [base, phone] = css.split(`@media (max-width: ${breakpoint}px) {`);
      expect(base, paths[index]).toContain("var(--bb-form-dialog-title)");
      expect(base, paths[index]).toContain("var(--bb-form-dialog-sectionTitle)");
      expect(base, paths[index]).toContain("var(--bb-form-dialog-buttonFont)");
      expect(base, paths[index]).toContain("var(--bb-form-dialog-buttonInline)");
      expect(phone, paths[index]).toContain("var(--bb-form-phone-sectionTitle)");
      expect(phone, paths[index]).toContain("var(--bb-form-phone-buttonFont)");
      expect(phone, paths[index]).toContain("var(--bb-form-phone-buttonInline)");
      expect(css, paths[index]).not.toMatch(/:deep\(\.v-field__input\)\s*\{[^}]*font-size:/);
      expect(css, paths[index]).toContain("min-height: 44px");
    }
    expect(sources[0]).toContain(".admin-category-members__section-head h3 { font-size: var(--bb-form-phone-sectionTitle); }");
    expect(sources[0]).toContain(".admin-category-members :deep(.v-btn:not(.v-btn--icon)) { font-size: var(--bb-form-phone-buttonFont);");
    expect(sources[3]).toContain(".share-dialog__live-presets .share-dialog__chip, .share-dialog__history-presets .share-dialog__chip { min-height: 44px; }");
  });

  it("keeps the mobile measurements in the shared style configuration", () => {
    const tokens = designTokenStylesheet();
    const consumers = sources.join("\n");
    for (const [key, value] of Object.entries(formPhoneLayout)) {
      expect(tokens).toContain(`--bb-form-phone-${key}: ${value}`);
      expect(consumers, key).toContain(`var(--bb-form-phone-${key})`);
    }
  });

  it("scopes reductions to phone breakpoints and preserves scrollable forms and touch targets", () => {
    for (const [index, source] of sources.entries()) {
      const css = parse(source).descriptor.styles[0]!.content;
      const breakpoint = index === 3 ? 599 : 600;
      const start = css.indexOf(`@media (max-width: ${breakpoint}px) {`);
      expect(start, paths[index]).toBeGreaterThan(-1);
      expect(css.slice(0, start), paths[index]).not.toContain("var(--bb-form-phone-");
      const phone = css.slice(start).split("\n}")[0]!;
      expect(phone).toContain("var(--bb-form-phone-title)");
      expect(phone).toContain("var(--bb-form-phone-bodyBlock)");
      expect(phone).toContain("var(--bb-form-phone-actionBlock)");
      expect(phone).toContain("env(safe-area-inset-bottom, 0px)");
      expect(css).toContain("min-height: 44px");
      expect(compileStyle({ filename: paths[index]!, id: "phone-form", scoped: true, source: css }).errors).toEqual([]);
    }
    const categoriesPhone = sources[0]!.split("@media (max-width: 600px) {")[1]!;
    expect(categoriesPhone).toContain("var(--bb-form-phone-compactBodyBlock)");
    expect(categoriesPhone).toContain(".admin-category-form__option :deep(.v-selection-control) { min-height: 52px; }");
    expect(categoriesPhone).toContain(".admin-catalog-dialog-actions.admin-category-members__actions { flex-direction: row; }");
    expect(sources[0]).toContain('max-width="760" scrollable persistent :fullscreen="isPhone"');
    expect(sources[1]).toContain('max-width="760" scrollable persistent :fullscreen="isPhone"');
    expect(sources[2]).toContain('max-width="720" scrollable persistent :fullscreen="isPhone"');
    expect(sources[3]).toContain('class="share-dialog__body"');
  });
});
