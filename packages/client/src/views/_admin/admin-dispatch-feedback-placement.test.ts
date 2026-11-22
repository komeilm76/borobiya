import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// The dispatch view is source-tested rather than mounted (docs/TASKS.md).
const view = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(view).descriptor;
const markup = template!.content;
const css = styles[0]!.content;

describe("dispatch proposal feedback", () => {
  it("shows results as an unclipped top toast, outside both scrollable worklists", () => {
    const resultIndex = markup.indexOf('id="dispatch-notice-05"');
    const railIndex = markup.indexOf('id="dispatch-sidebar"');
    expect(resultIndex).toBeGreaterThan(0);
    expect(resultIndex).toBeLessThan(railIndex);
    expect(markup.slice(resultIndex, railIndex)).toContain('location="top" variant="flat"');
    expect(markup.slice(resultIndex, railIndex)).toContain("admin-sos-toast__wrapper dispatch-feedback-toast__wrapper");
    expect(markup.slice(resultIndex, railIndex)).toContain('adminSos.dispatchFeedback.message');
    expect(markup.slice(resultIndex, railIndex)).toContain('role');
    expect(markup.slice(resultIndex, railIndex)).toContain("adminSos.dispatchFeedback.type === 'error' ? 'assertive' : 'polite'");
    expect(markup.slice(resultIndex, railIndex)).toContain("adminSos.dispatchFeedback?.type === 'success' ? 6500 : -1");
    expect(markup.slice(resultIndex, railIndex)).toContain('id="dispatch-action-28"');
    expect(markup.slice(resultIndex, railIndex)).toContain('adminSos.dispatchFeedback = null');
    expect(markup.slice(railIndex, markup.indexOf('</aside>'))).not.toContain('id="dispatch-notice-05"');
    expect(view).toContain('function dismissDispatchFeedback(isOpen: boolean): void {');
    expect(css).toContain(':global(.dispatch-feedback-toast__wrapper .admin-sos-toast__message > .v-icon.text-success)');
  });

  it("names every send control as an offer, not as a completed assignment", () => {
    const manual = markup.slice(markup.indexOf('id="dispatch-action-17"'), markup.indexOf('</v-btn>', markup.indexOf('id="dispatch-action-17"')));
    expect(manual).toContain('ارسال پیشنهاد ({{ adminSos.selectedResponderIds.length }})');
    expect(manual).toContain('ارسال پیشنهاد مأموریت به ${adminSos.selectedResponderIds.length} امدادگر انتخاب‌شده');
    expect(manual).toContain(':disabled="!adminSos.canDispatchSelected"');
    expect(manual).toContain(':loading="adminSos.dispatchSubmitting"');
    expect(manual).toContain('@click="requestDispatch"');
    for (const id of ['dispatch-action-07', 'dispatch-action-24']) {
      const button = markup.slice(markup.indexOf(`id="${id}"`), markup.indexOf('</v-btn>', markup.indexOf(`id="${id}"`)));
      expect(button).toContain('>ارسال پیشنهاد');
      expect(button).toContain('aria-label="ارسال پیشنهاد جایگزین به امدادگران نزدیک"');
    }
    expect(markup).not.toContain('اعزام خودکار');
    expect(compileTemplate({ filename: 'AdminDispatchView.vue', id: 'dispatch-feedback', source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: 'AdminDispatchView.vue', id: 'dispatch-feedback', source: css, scoped: true }).errors).toEqual([]);
  });
});
