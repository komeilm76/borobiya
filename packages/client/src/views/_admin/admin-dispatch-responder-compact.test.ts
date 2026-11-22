import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const markup = template!.content;
const css = styles[0]!.content;
const responders = markup.slice(markup.indexOf('id="dispatch-list-01"'),
  markup.indexOf('</v-list>', markup.indexOf('id="dispatch-list-01"')));
const requests = markup.slice(markup.indexOf('id="dispatch-list-02"'),
  markup.indexOf('</v-list>', markup.indexOf('id="dispatch-list-02"')));

describe("compact SOS and nearby responder worklists", () => {
  it("softens only the SOS priority tag and gives both rows intentional rounded corners", () => {
    expect(requests).toContain('class="dispatch-request-row" rounded="lg"');
    expect(responders).toContain('class="dispatch-responder-row" rounded="lg"');
    expect(css).toContain('#dispatch-sidebar .dispatch-request-row__priority {\n  min-height: 20px; padding: 0 .35rem; line-height: 1.25; font-weight: 600;');
    expect(css).toMatch(/#dispatch-sidebar \.dispatch-request-row \{[\s\S]*?border-radius: var\(--bb-radius-nested, 16px\) !important; background: var\(--bb-color-inset\);/);
    expect(css).toMatch(/#dispatch-sidebar \.dispatch-responder-row \{[\s\S]*?border-radius: var\(--bb-radius-nested, 16px\) !important; background: var\(--bb-color-inset\);/);
    expect(css).toContain('#dispatch-sidebar .dispatch-responder-row.v-list-item--active::before {');
    expect(css).toContain('box-shadow: 0 2px 7px rgba(14, 42, 45, .12); overflow: hidden;');
  });

  it("puts username/distance first and keeps specialty, rating, activity and sent-offer state in a concise detail line", () => {
    const title = responders.indexOf('class="dispatch-responder-row__title"');
    const meta = responders.indexOf('class="dispatch-responder-row__meta"');
    expect(title).toBeGreaterThan(0);
    expect(meta).toBeGreaterThan(title);
    expect(responders).toContain('dir="ltr">@{{ responder.username }}');
    expect(responders).toContain("responder.distance === null ? 'فاصله نامشخص' : formatDistance(responder.distance)");
    expect(responders).toContain("responder.categoryName ? `تخصص: ${responder.categoryName}` : 'تخصص مرتبط ثبت نشده'");
    expect(responders).toContain("responder.avgRating !== null ? responder.avgRating.toFixed(1) : 'بدون امتیاز'");
    expect(responders).toContain('formatQueueTimestamp(responder.lastActiveAt)');
    expect(responders).toContain('formatTimestamp(responder.lastActiveAt)');
    expect(responders).toContain('پیشنهاد ارسال‌شده');
    expect(responders).not.toContain('<v-chip');
    expect(css).toContain('--v-list-prepend-gap: .25rem;');
    expect(css).toContain('min-height: 52px; border: 1px solid color-mix(');
    expect(css).toContain('min-width: 0; overflow-wrap: anywhere;');
  });

  it("keeps checkbox and map controls independent and manual-search qualification warnings visible", () => {
    expect(responders).toContain(':aria-pressed="adminSos.selectedResponderIds.includes(responder.userId)"');
    expect(responders).toContain('@click.stop="adminSos.toggleResponderSelection(responder.userId)"');
    expect(responders).toContain('@click="adminSos.toggleResponderSelection(responder.userId)"');
    expect(responders).toContain(':aria-label="`انتخاب امدادگر ${responder.username}`"');
    expect(responders).toContain("!adminSos.responderSearch && nearbyFeatures.features.some((feature) => feature.id === responder.userId)");
    expect(responders).toContain('@click.stop="focusNearbyResponder(responder.userId)"');
    expect(markup).toContain('جست‌وجوی دستی فاصله و تخصص را تأیید نمی‌کند');
    expect(css).toContain('#dispatch-sidebar .dispatch-responder-row__specialty--missing { flex-basis: 100%; color: var(--bb-color-error); }');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "compact-responders", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "compact-responders", scoped: true, source: css }).errors).toEqual([]);
  });
});
