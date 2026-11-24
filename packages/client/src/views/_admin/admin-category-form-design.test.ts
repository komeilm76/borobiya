import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// The repository checks Vue source/compiled CSS rather than mounting SFCs in unit tests.
const source = readFileSync(new URL("./AdminCategoriesView.vue", import.meta.url), "utf8");
const form = source.slice(source.indexOf('<v-dialog v-model="formOpen"'), source.indexOf('<v-dialog v-model="membersOpen"'));
const css = parse(source).descriptor.styles[0]!.content;

describe("category edit/create dialog", () => {
  it("groups identity and assignment decisions with an honest replacement warning", () => {
    expect(form).toContain('aria-labelledby="admin-category-form-title"');
    expect(form).toContain(':fullscreen="isPhone"');
    expect(form).toContain('id="admin-category-identity-title"');
    expect(form).toContain('id="admin-category-types-title"');
    expect(form).toContain('role="group" aria-labelledby="admin-category-types-title"');
    expect(form).toContain('aria-describedby="admin-category-types-hint"');
    expect(form).toContain('هنگام ذخیره جایگزین فهرست فعلی می‌شوند');
    expect(form).toContain("draft.incidentTypeIds.length.toLocaleString('fa-IR')");
    expect(form).toContain('بدون انتخاب نوع رویداد هم می‌توانید گروه را ذخیره کنید');
    expect(form).toContain('افزودن یا حذف اعضا در بخش جداگانهٔ فهرست انجام می‌شود');
    expect(form).toContain("editing ? 'ذخیرهٔ تغییرات' : 'ساخت گروه'");
  });

  it("makes each event type a labelled, keyboard-focusable selection without changing its save contract", () => {
    expect(form).toContain('v-for="type in incidentTypes"');
    expect(form).toContain(':model-value="draft.incidentTypeIds.includes(type.id)"');
    expect(form).toContain('@update:model-value="toggleType(type.id, $event as boolean)"');
    expect(form).toContain('<template #label>');
    expect(form).toContain('{{ type.name }}');
    expect(form).toContain('<small dir="ltr">{{ type.slug }}</small>');
    expect(form).toContain('data-test="category-name"');
    expect(form).toContain(':error-messages="fieldErrors.name ?? \'\'"');
    expect(form).toContain('role="alert">{{ fieldErrors.incidentTypeIds }}');
    expect(source).toContain('clearFormFeedback("incidentTypeIds");');
    expect(source).toContain('categoryPatchBody(editing.value, draft.value)');
    expect(source).toContain('categoryCreateBody(draft.value)');
  });

  it("separates form steps without nested card outlines while keeping selection and focus visible", () => {
    expect(css).toContain('.admin-category-form__section { min-width: 0; padding: 0; border: 0; background: transparent; }');
    expect(css).toContain('.admin-category-form__section + .admin-category-form__section { padding-block-start: 1.15rem;');
    expect(css).toContain('.admin-category-form__option { min-width: 0; border-radius: .85rem;');
    expect(css).toContain('box-shadow: inset 0 0 0 2px rgb(var(--v-theme-primary));');
    expect(css).toContain('.admin-category-form__option--selected { outline: 2px solid Highlight;');
    expect(css).not.toContain('.admin-category-form__section { padding: 1rem; }');
  });

  it("keeps controls legible, touch-sized and recoverable after closing", () => {
    expect(form).toContain('@after-leave="restoreFormFocus"');
    expect(source).toContain('formTrigger = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;');
    expect(source).toContain('if (formTrigger?.isConnected) formTrigger.focus({ preventScroll: true });');
    expect(css).toContain('.admin-category-form__option :deep(.v-selection-control) { min-height: 58px;');
    expect(css).toContain('.admin-category-form__option :deep(.v-selection-control--focus-visible)');
    expect(css).toContain('.admin-categories-picker { grid-template-columns: minmax(0, 1fr); }');
    const descriptor = parse(source).descriptor;
    expect(compileTemplate({ filename: "AdminCategoriesView.vue", id: "category-form", source: descriptor.template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminCategoriesView.vue", id: "category-form", scoped: true, source: css }).errors).toEqual([]);
  });
});
