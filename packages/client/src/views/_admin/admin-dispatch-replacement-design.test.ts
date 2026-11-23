import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source-pinned by design: docs/TASKS.md forbids mounting Vue components in unit tests.
const dispatch = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const dispatchSfc = parse(dispatch).descriptor;
const appSfc = parse(app).descriptor;
const markup = dispatchSfc.template!.content;
const appMarkup = appSfc.template!.content;
const css = dispatchSfc.styles[0]!.content;
const appCss = appSfc.styles[0]!.content;

describe("compact, consistent admin SOS notifications", () => {
  it("uses one neutral toast pattern for both SOS events without long red banners", () => {
    const latest = appMarkup.slice(appMarkup.indexOf(':model-value="Boolean(adminSos.latestAlert) && !adminSos.urgentReplacement"'),
      appMarkup.indexOf('</v-snackbar>', appMarkup.indexOf(':model-value="Boolean(adminSos.latestAlert) && !adminSos.urgentReplacement"')));
    const replacement = appMarkup.slice(appMarkup.indexOf(':model-value="Boolean(adminSos.urgentReplacement) && route.name !== \'admin-dispatch\'"'),
      appMarkup.indexOf('</v-snackbar>', appMarkup.indexOf(':model-value="Boolean(adminSos.urgentReplacement) && route.name !== \'admin-dispatch\'"')));
    for (const toast of [latest, replacement]) {
      expect(toast).toContain(':content-props="{ class: \'admin-sos-toast__wrapper\' }"');
      expect(toast).toContain('location="top" variant="flat" :timeout="-1"');
      expect(toast).toContain('class="admin-sos-toast__message" role="alert" aria-live="assertive"');
      expect(toast).toContain('color="primary" size="small" variant="tonal"');
      expect(toast).not.toContain('color="error"');
      expect(toast).not.toContain('NEEDS REPLACEMENT');
    }
    expect(latest).toContain('shortSosNotice(adminSos.latestAlert.description)');
    expect(app).toContain('description.replace(/\\s+/g, " ").trim()');
    expect(replacement).toContain("route.name !== 'admin-dispatch'"); // The sidebar already shows this alert on the dispatch page.
    expect(replacement).toContain('adminSos.urgentReplacement.reviewRequired');
    expect(replacement).toContain('openReplacementOnMap');
    expect(replacement).toContain('dismissUrgentReplacement()');
    expect(appCss).toContain(':global(.v-snackbar__wrapper.admin-sos-toast__wrapper) {');
    expect(appCss).toContain('width: min(30rem, calc(100vw - 1rem));');
    expect(appCss).toContain('background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));');
    expect(appCss).toContain('min-width: 38px; min-height: 38px; height: 38px;');
    expect(appCss).toContain('min-width: 44px; min-height: 44px; height: 44px;');
  });

  it("keeps the sidebar action clear, reversible and compact without hiding safety facts", () => {
    const replacement = markup.slice(markup.indexOf('id="dispatch-notice-04"'),
      markup.indexOf('id="dispatch-queue-region"'));
    expect(replacement).toContain('role="alert" aria-live="assertive"');
    expect(replacement).toContain('امدادگر مأموریت را لغو کرد.');
    expect(replacement).toContain('نیازمند بررسی مدیریتی');
    expect(replacement).toContain('<details v-if="adminSos.urgentReplacement.rescuerLocation"');
    expect(replacement).toContain('class="dispatch-replacement__location"');
    expect(replacement).toContain('adminSos.dismissUrgentReplacement()');
    expect(replacement).toContain('focusReplacement(adminSos.urgentReplacement.sosRequestId)');
    expect(replacement).toContain('quickRedispatch(adminSos.urgentReplacement.sosRequestId)');
    expect(replacement).toContain(':loading="adminSos.dispatchSubmitting" :disabled="adminSos.dispatchSubmitting"');
    expect(replacement).not.toContain('NEEDS REPLACEMENT');
    expect(replacement).not.toContain('replacement-flash');
    expect(css).toContain('#dispatch-sidebar .dispatch-replacement {');
    expect(css).toContain('border-radius: var(--bb-radius-nested, 16px);');
    expect(css).toContain('min-width: 0; min-height: 36px; height: 36px;');
    expect(css).toContain('min-height: 44px; height: 44px;');
    expect(css).toContain('.dispatch-replacement__location summary { min-height: 44px; }');
    expect(css).not.toContain('@keyframes replacement-arrival');
    expect(dispatch).toContain('void adminSos.redispatchNearest(requestId);');
    const feedback = markup.slice(markup.indexOf('id="dispatch-notice-03"'), markup.indexOf('</v-alert>', markup.indexOf('id="dispatch-notice-03"')));
    expect(feedback).toContain('closable');
    expect(feedback).toContain("adminSos.quickDispatchFeedback.type === 'error' ? 'alert' : 'status'");
    expect(feedback).toContain('@click:close="adminSos.quickDispatchFeedback = null"');
  });

  it("keeps a concise fallback in the selected SOS panel after the toast is dismissed", () => {
    const detail = markup.slice(markup.indexOf('id="dispatch-notice-08"'),
      markup.indexOf('id="dispatch-action-25"'));
    expect(detail).toContain("adminSos.urgentReplacement?.sosRequestId !== adminSos.selectedRequest.id");
    expect(detail).toContain('اعزام جایگزین لازم است.');
    expect(detail).toContain('reviewRequired');
    expect(detail).toContain('class="dispatch-replacement__location"');
    expect(detail).toContain('id="dispatch-action-24"');
    expect(detail).not.toContain('NEEDS REPLACEMENT');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "replacement-dispatch", source: markup }).errors).toEqual([]);
    expect(compileTemplate({ filename: "App.vue", id: "replacement-app", source: appMarkup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "replacement-dispatch", source: css, scoped: true }).errors).toEqual([]);
    expect(compileStyle({ filename: "App.vue", id: "replacement-app", source: appCss, scoped: true }).errors).toEqual([]);
  });
});
