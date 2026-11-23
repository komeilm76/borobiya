import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// The repo checks source and compiled SFCs instead of mounting admin views in unit tests.
const source = readFileSync(new URL("./AdminIncidentsView.vue", import.meta.url), "utf8");
const form = source.slice(source.indexOf('<v-dialog v-model="formOpen"'), source.indexOf('<v-snackbar'));
const style = parse(source).descriptor.styles[0]!.content;

describe("incident type edit/create dialog", () => {
  it("groups identity, appearance, and description without nested bordered cards", () => {
    expect(form).toContain('aria-labelledby="admin-incident-form-title"');
    expect(form).toContain(':fullscreen="isPhone"');
    expect(form).toContain('id="admin-incident-identity-title"');
    expect(form).toContain('id="admin-incident-appearance-title"');
    expect(form).toContain('id="admin-incident-description-title"');
    expect(form).toContain('مشخصات نمایشی و شناسهٔ این نوع رویداد');
    expect(style).toContain('.admin-incident-form__section + .admin-incident-form__section { padding-block-start: 1rem;');
    expect(style).toContain('background: var(--bb-color-inset);');
    expect(style).not.toContain('.admin-incident-form__section { border: 1px');
  });

  it("explains slug renames and optional appearance while previewing the draft", () => {
    for (const field of ["name", "slug", "icon", "color", "description"]) {
      expect(form).toContain(`v-model="draft.${field}"`);
      expect(form).toContain(`@update:model-value="clearFormFeedback('${field}')"`);
      expect(form).toContain(`:error-messages="fieldErrors.${field} ?? ''"`);
    }
    expect(form).toContain(':hint="slugHint"');
    expect(form).toContain("? 'نامک (برای این نام لازم است)' : 'نامک (اختیاری)'");
    expect(form).toContain(':aria-required="!editing && !!draft.name.trim() && !incidentSlugPreview(draft.name)"');
    expect(source).toContain('تغییرش ارجاع‌های بیرونی را می‌شکند');
    expect(form).toContain('خالی‌کردن آن‌ها هنگام ویرایش مقدار فعلی را حذف می‌کند');
    expect(form).toContain('role="group" aria-label="پیش‌نمایش نوع رویداد"');
    expect(form).toContain('draft.icon.trim() || \'mdi-image-off-outline\'');
    expect(form).toContain(':style="{ backgroundColor: draft.color.trim() }"');
    expect(form).toContain('editing?.slug ?? incidentSlugPreview(draft.name)');
    expect(source).toContain('incidentPatchBody(editing.value, draft.value)');
    expect(source).toContain('incidentCreateBody(draft.value)');
  });

  it("keeps actions outside the scroll region, submits via the form, and restores focus", () => {
    expect(form).toContain('id="admin-incident-form-fields"');
    expect(form).toContain('@submit.prevent="submit"');
    expect(form).toContain('type="submit" form="admin-incident-form-fields"');
    expect(form.indexOf('</v-card-text>')).toBeLessThan(form.indexOf('<v-card-actions'));
    expect(form).toContain('@after-leave="restoreFormFocus"');
    expect(source).toContain('if (formTrigger?.isConnected) formTrigger.focus({ preventScroll: true });');
    expect(form).toContain('role="alert">{{ formError }}');
    expect(form).toContain('role="status" aria-live="polite">{{ formNotice }}');
    expect(style).toContain('.admin-incident-form__actions :deep(.v-btn) { min-height: 44px;');
    expect(style).toContain('.admin-incident-form__fields, .admin-incident-form__appearance-fields { grid-template-columns: minmax(0, 1fr);');
    const descriptor = parse(source).descriptor;
    expect(compileTemplate({ filename: "AdminIncidentsView.vue", id: "incident-form", source: descriptor.template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminIncidentsView.vue", id: "incident-form", scoped: true, source: style }).errors).toEqual([]);
  });
});
