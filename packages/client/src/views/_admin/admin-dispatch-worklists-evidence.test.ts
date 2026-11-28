import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const markup = template!.content;
const css = styles[0]!.content;

describe("dispatch worklists and incident evidence", () => {
  it("keeps the entire incident image visible, with a separate, usable full-size action", () => {
    const photo = markup.slice(markup.indexOf('<section v-if="adminSos.selectedRequest.photoUrl" class="admin-dispatch__photo"'),
      markup.indexOf('</section>', markup.indexOf('<section v-if="adminSos.selectedRequest.photoUrl" class="admin-dispatch__photo"')));
    expect(photo).toContain('<h3>تصویر پیوست حادثه</h3>');
    expect(photo).toContain('class="admin-dispatch__photo-preview"');
    expect(photo).toContain('class="admin-dispatch__photo-caption"');
    expect(photo).toContain('@click="openPhoto"');
    expect(photo).toContain('photoLoading ? "در حال دریافت تصویر حادثه…"');
    expect(photo).toContain('@click="photoRetryNonce++"');
    expect(css).toContain('object-fit: contain;');
    expect(css).not.toContain('object-fit: cover; }\n.admin-dispatch__photo-dialog');
    expect(css).toContain('.admin-dispatch__photo-preview { display: grid; place-items: center;');
    expect(css).toContain('.admin-dispatch__photo-caption { display: flex; align-items: center; justify-content: space-between;');
    expect(css).not.toContain('linear-gradient(transparent, rgba(0, 0, 0, .75))');
    expect(markup).toContain('class="admin-dispatch__photo-dialog-heading"');
    expect(source).toContain('Photo access URLs expire after 60 seconds. Issue a fresh URL for the full image.');
  });

  it("makes SOS priority, status and photographic evidence legible without changing triage selection", () => {
    const queue = markup.slice(markup.indexOf('id="dispatch-list-02"'), markup.indexOf('</v-list>', markup.indexOf('id="dispatch-list-02"')));
    expect(queue).toContain('@click="toggleQueueRequest(item)"');
    expect(queue).toContain(':aria-pressed="item.id === adminSos.selectedId"');
    expect(queue).toContain('class="dispatch-request-row__marker"');
    expect(queue).toContain('role="img" :aria-label="`اولویت: ${severityMeta(item.severity).label}`"');
    expect(queue).not.toContain('dispatch-chip-13');
    expect(queue).not.toContain('dispatch-request-row__priority');
    expect(queue).toContain('dispatch-request-row__status');
    expect(queue).toContain('class="dispatch-request-row__attachment" role="img"');
    expect(queue).toContain('title="تصویر پیوست حادثه؛ برای بررسی درخواست را انتخاب کنید"');
    expect(css).toContain('#dispatch-sidebar .dispatch-request-row {\n  min-height: 68px;');
    expect(css).toContain('#dispatch-sidebar .dispatch-request-row.v-list-item--active {\n  border-color: var(--bb-color-primary);');
  });

  it("keeps multi-selection visible without duplicating incident photo controls in the responder list", () => {
    const responders = markup.slice(markup.indexOf('id="dispatch-responders" tabindex="-1"'),
      markup.indexOf('</section>', markup.indexOf('id="dispatch-responders" tabindex="-1"')));
    expect(responders).not.toContain('admin-dispatch__responder-evidence');
    expect(responders).not.toContain('تصویر پیوست این حادثه در دسترس است');
    expect(responders).not.toContain('photoOpenError');
    expect(markup).toContain('<p v-if="photoOpenError" class="admin-dispatch__photo-error" role="alert">');
    expect(css).not.toContain('.admin-dispatch__responder-evidence');
    expect(responders).toContain('class="dispatch-responder-row__selection" aria-hidden="true"');
    expect(responders).toContain('adminSos.selectedResponderIds.includes(responder.userId) ? \'mdi-check\' : \'mdi-plus\'');
    expect(responders).toContain('@click="adminSos.toggleResponderSelection(responder.userId)"');
    expect(responders).toContain('class="dispatch-responder-row__map"');
    expect(css).toContain('#dispatch-sidebar .dispatch-responder-row__select { min-height: 68px;');
    expect(css).toContain('#dispatch-sidebar .dispatch-responder-row--selected .dispatch-responder-row__selection {');
    expect(markup).toContain('id="dispatch-button-03" v-if="photoSrc" type="button" class="admin-dispatch__photo-open"');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "evidence", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "evidence", scoped: true, source: css }).errors).toEqual([]);
  });
});
