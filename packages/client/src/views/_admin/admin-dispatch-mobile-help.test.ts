import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const markup = template!.content;
const css = styles[0]!.content;
const worklist = markup.slice(markup.indexOf('id="dispatch-nearby"'), markup.indexOf('id="dispatch-map-region"'));
const guide = markup.slice(markup.indexOf('id="dispatch-help-dialog"'), markup.indexOf('</v-dialog>', markup.indexOf('id="dispatch-help-dialog"')));

describe("compact dispatch search and on-demand guidance", () => {
  it("keeps the search action beside its field on narrow screens, as an accessible icon", () => {
    const form = worklist.slice(worklist.indexOf('id="dispatch-form-01"'), worklist.indexOf('</form>'));
    expect(form.indexOf('id="dispatch-field-01"')).toBeLessThan(form.indexOf('id="dispatch-action-13"'));
    expect(form).toContain('icon="mdi-magnify"');
    expect(form).toContain('type="submit"');
    expect(form).toContain(':aria-label="responderSearchInput.trim()');
    expect(form).toContain(':disabled="responderSearchInput.trim().length === 1"');
    expect(css).toContain('flex-wrap: nowrap; padding: .3rem .3rem .1rem !important;');
    expect(css).toContain('flex: 1 1 auto; min-width: 0; width: 0;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__responder-search-submit { flex: none; }');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__responder-search :deep(.v-btn) { height: 44px; }');
  });

  it("shows SOS-only controls on the queue, not the mobile responder step", () => {
    const header = markup.slice(markup.indexOf('id="dispatch-header-01"'), markup.indexOf('</header>'));
    expect(markup).toContain('<header v-if="!compactDispatch || !adminSos.selectedId" id="dispatch-header-01"');
    expect(header).toContain('id="dispatch-select-01"');
    expect(header).toContain('id="dispatch-voice-settings"');
    expect(header).toContain('id="dispatch-action-06"');
    expect(header).toContain('id="dispatch-help-button"');
    expect(markup).toContain('id="dispatch-sheet-handle" v-if="compactDispatch"');
    expect(source).toContain('if (compact && adminSos.selectedId) {\n    soundSettingsOpen.value = false;\n    helpDialogOpen.value = false;');
    expect(source).toContain('if (selectedId) {\n    soundSettingsOpen.value = false;\n    helpDialogOpen.value = false;');
    expect(source).toContain('active.closest(selectedId ? "#dispatch-queue-region, #dispatch-header-01" : "#dispatch-nearby")');
    expect(worklist).toContain('id="dispatch-action-29"');
  });

  it("moves non-actionable information out of the scrollport without hiding dispatch safeguards", () => {
    expect(markup).toContain('id="dispatch-help-button" icon="mdi-help-circle-outline"');
    expect(markup).toContain('aria-controls="dispatch-help-dialog" :aria-expanded="helpDialogOpen"');
    expect(guide).toContain('معیارهای فهرست امدادگران');
    expect(guide).toContain('جست‌وجوی دستی فاصله و تخصص را تأیید نمی‌کند');
    expect(guide).toContain("adminSos.selectedResponderIds.length.toLocaleString('fa-IR')");
    expect(worklist).not.toContain('معیارهای فهرست امدادگران');
    expect(worklist).not.toContain('جست‌وجوی دستی فاصله و تخصص را تأیید نمی‌کند');
    expect(worklist).not.toContain('امدادگر انتخاب شده است.');
    expect(worklist).toContain('ارسال پیشنهاد ({{ adminSos.selectedResponderIds.length }})');
    expect(markup).toContain('v-model="manualDispatchConfirmation"');
    expect(source).toContain('if (selectedDispatchWarnings.value.length) manualDispatchConfirmation.value = true;');
  });

  it("keeps the help readable and the responder actions reachable with compact mobile spacing", () => {
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__nearby { padding-top: .3rem; }');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__responder-search { padding: .1rem .2rem .15rem !important; }');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__responders .responder-list { padding: .15rem .1rem .2rem; }');
    expect(css).toContain('padding: .35rem .2rem .15rem !important; border-top: 0;');
    expect(css).toContain('.admin-dispatch__help-content { min-height: 0; overflow-y: auto; overscroll-behavior: contain; }');
    expect(css).toContain('max-height: calc(100dvh - 2rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "dispatch-help", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "dispatch-help", scoped: true, source: css }).errors).toEqual([]);
  });
});
