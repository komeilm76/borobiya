import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const missions = readFileSync(new URL("./UserRescuerHistoryView.vue", import.meta.url), "utf8");
const offers = readFileSync(new URL("./UserProposalsView.vue", import.meta.url), "utf8");

/** Source-pinned responsive structure; the repo convention is not to mount Vue SFCs in unit tests. */
describe("rescuer stacked master/detail screens (T4.4.1)", () => {
  it("keeps mission pagination and the selected timeline outside a bounded, accessible card list", () => {
    expect(missions).toMatch(/<div class="history__items" role="region"[^>]*:tabindex="history\.items\.value\.length > 1 \? 0 : -1"[^>]*>[\s\S]*?<button v-for="item in history\.items\.value"/);
    expect(missions).toMatch(/<\/button>\s*<\/div>\s*<div v-if="history\.listVerified\.value && history\.totalPages\.value > 1" class="history__pages">/);
    expect(missions.indexOf('class="history__detail" aria-label="جزئیات مأموریت"')).toBeGreaterThan(missions.indexOf('class="history__pages"'));
    expect(missions).toContain('@click="history.choose(item.id)"');
    expect(missions).toContain('<MissionTimelinePanel');
    const stacked = missions.split('@media(max-width:780px) {')[1]!.split('</style>')[0]!;
    expect(stacked).toContain('.history__grid { grid-template-columns: 1fr; }');
    expect(stacked).toContain('.history__items { grid-template-columns: 1fr; max-height: min(42vh, 22rem); max-height: min(42dvh, 22rem); overflow-y: auto;');
    expect(stacked).not.toContain('.history__list { max-height:');
  });

  it("keeps proposal pagination and the incident map/decision buttons outside the bounded list", () => {
    expect(offers).toMatch(/<div class="offers__items" role="region"[^>]*:tabindex="inbox\.proposals\.length > 1 \? 0 : -1"[^>]*>[\s\S]*?<button v-for="offer in inbox\.proposals"/);
    expect(offers).toMatch(/<\/button>\s*<\/div>\s*<div v-if="inbox\.totalPages > 1" class="offers__pages"/);
    expect(offers.indexOf('class="offer-detail" aria-label="جزئیات پیشنهاد انتخاب‌شده"')).toBeGreaterThan(offers.indexOf('class="offers__pages"'));
    expect(offers).toContain('@click="selectedId = offer.id"');
    // The details default to the first offer (or fall back after paging); the visible/ARIA
    // selected state must track that computed offer, not only an explicit click.
    expect(offers).toContain(":class=\"{ 'offer-card--selected': selected?.id === offer.id }\"");
    expect(offers).toContain(':aria-pressed="selected?.id === offer.id"');
    expect(offers.indexOf('class="offer-detail__map"')).toBeLessThan(offers.indexOf('class="offer-detail__actions"'));
    expect(offers).toContain("confirmAction = 'accept'");
    const stacked = offers.split('@media (max-width: 850px) {')[1]!.split('@media (max-width: 580px)')[0]!;
    expect(stacked).toContain('.offers__layout { grid-template-columns: 1fr; }');
    expect(stacked).toContain('.offers__items { max-height: min(45vh, 26rem); max-height: min(45dvh, 26rem); overflow-y: auto;');
    expect(stacked).not.toContain('.offers__list { max-height:');
  });

  it("lets long consent-based map controls wrap inside phone-width proposal panels", () => {
    expect(offers).toContain('class="accepted-map__intro"');
    expect(offers).toContain('class="offer-detail__locate mt-2"');
    const phone = offers.split('@media (max-width: 580px) {')[1]!.split('@media (prefers-reduced-motion: reduce)')[0]!;
    expect(phone).toContain('.accepted-map__intro :deep(.v-btn),.offer-detail .offer-detail__locate { max-width: 100%; min-width: 0; min-height: 44px; height: auto; }');
    expect(phone).toContain('.accepted-map__intro :deep(.v-btn__content),.offer-detail__locate :deep(.v-btn__content) { white-space: normal; text-align: center; }');
  });
});
