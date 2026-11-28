import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const markup = template!.content;
const css = styles[0]!.content;
const responders = markup.slice(markup.indexOf('id="dispatch-list-01"'),
  markup.indexOf('</div>\n          <v-card-text v-else', markup.indexOf('id="dispatch-list-01"')));
const requests = markup.slice(markup.indexOf('id="dispatch-list-02"'),
  markup.indexOf('</v-list>', markup.indexOf('id="dispatch-list-02"')));

describe("compact SOS and nearby responder worklists", () => {
  it("keeps the SOS shape and gives responders a compact card with no right stripe or checkbox", () => {
    expect(requests).toContain('class="dispatch-request-row" rounded="lg"');
    expect(responders).toContain('class="dispatch-responder-row"');
    expect(responders).not.toContain('v-checkbox-btn');
    expect(responders).not.toContain('<v-list-item');
    expect(css).toContain('#dispatch-sidebar .dispatch-request-row__marker {\n  display: block; flex: none; width: 9px; height: 9px;');
    expect(css).not.toContain('.dispatch-request-row__priority');
    expect(css).toMatch(/#dispatch-sidebar \.dispatch-request-row \{[\s\S]*?border-radius: var\(--bb-radius-nested, 16px\) !important; background: var\(--bb-color-inset\);/);
    const row = css.slice(css.indexOf('#dispatch-sidebar .dispatch-responder-row {'),
      css.indexOf('#dispatch-sidebar .dispatch-responder-row:last-child'));
    expect(row).toContain('min-height: 0; margin-bottom: .25rem; padding: 0;');
    expect(row).toContain('border-radius: .75rem; background: var(--bb-color-inset);');
    expect(row).not.toContain('::before');
    expect(css).not.toContain('.dispatch-responder-row.v-list-item--active::before');
    expect(css).toContain('#dispatch-sidebar .dispatch-responder-row--selected {');
    expect(css).toContain('box-shadow: 0 2px 7px rgba(14, 42, 45, .12);');
  });

  it("puts identity and distance above specialty, rating and activity without hiding caveats", () => {
    const title = responders.indexOf('class="dispatch-responder-row__title"');
    const meta = responders.indexOf('class="dispatch-responder-row__meta"');
    expect(title).toBeGreaterThan(0);
    expect(meta).toBeGreaterThan(title);
    expect(responders).toContain('dir="ltr" :title="responder.username">@{{ responder.username }}');
    expect(responders).toContain("responder.distance === null ? 'فاصله نامشخص' : formatDistance(responder.distance)");
    expect(responders).toContain("responder.categoryName ?? 'تخصص مرتبط ثبت نشده'");
    expect(responders).toContain('<span class="sr-only">تخصص:</span>');
    expect(responders).toContain("responder.avgRating !== null ? responder.avgRating.toFixed(1) : 'بدون امتیاز'");
    expect(responders).toContain('<span v-if="responder.avgRating !== null" class="sr-only">امتیاز از ۵:</span>');
    expect(responders).toContain('formatQueueTimestamp(responder.lastActiveAt)');
    expect(responders).toContain('formatTimestamp(responder.lastActiveAt)');
    expect(responders).toContain('پیشنهاد ارسال‌شده');
    expect(css).toContain('min-height: 48px; padding: .3rem .5rem;');
    expect(css).toContain('text-overflow: ellipsis; white-space: nowrap; font-weight: 700;');
    expect(css).toContain('#dispatch-sidebar .dispatch-responder-row__specialty--missing { color: var(--bb-color-error); }');
  });

  it("makes each row a multi-select pressed button and keeps map and hidden selections independent", () => {
    expect(responders).toContain('class="responder-list" role="group"');
    expect(responders).toContain('type="button" class="dispatch-responder-row__select"');
    expect(responders).toContain(':aria-pressed="adminSos.selectedResponderIds.includes(responder.userId)"');
    expect(responders).toContain(':aria-describedby="`dispatch-chip-06-${responder.userId} dispatch-meta-${responder.userId}`"');
    expect(responders).toContain("'لغو انتخاب' : 'انتخاب'");
    expect(responders).toContain('@click="adminSos.toggleResponderSelection(responder.userId)"');
    expect(responders).toContain('class="dispatch-responder-row__map"');
    expect(responders).toContain("!adminSos.responderSearch && nearbyFeatures.features.some((feature) => feature.id === responder.userId)");
    expect(responders).toContain('@click="focusNearbyResponder(responder.userId)"');
    expect(markup).toContain('v-if="hiddenSelectedResponderIds.length"');
    expect(source).toContain('!adminSos.nearestResponders.some((responder) => responder.userId === id)');
    expect(markup).toContain('@click:close="adminSos.toggleResponderSelection(id)"');
    expect(markup.slice(markup.indexOf('id="dispatch-nearby"'), markup.indexOf('id="dispatch-map-region"')))
      .not.toContain('جست‌وجوی دستی فاصله و تخصص را تأیید نمی‌کند');
    expect(markup).toContain('id="dispatch-help-dialog" v-model="helpDialogOpen"');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "compact-responders", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "compact-responders", scoped: true, source: css }).errors).toEqual([]);
  });
});
