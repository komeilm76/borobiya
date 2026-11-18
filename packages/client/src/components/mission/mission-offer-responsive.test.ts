import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const mission = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const offers = readFileSync(new URL("../shell/ProposalInboxContent.vue", import.meta.url), "utf8");

// Responsive source contracts; do not mount Vue SFCs in unit tests (docs/TASKS.md).
describe("offers inside the idle mission map", () => {
  it("opts the map into one bounded, list-first surface while preserving the full-page inbox", () => {
    expect(mission).toContain('<h3>در حال حاضر مأموریت فعالی ندارید</h3>');
    expect(mission).toContain('<ProposalInboxContent :selected-offer-id="null" :compact-map="embedded" :map="externalMap"');
    expect(mission).toContain(':marker-class="externalMarker" :own-position="ownPosition" :visible="visible"');
    expect(mission).toContain("@detail-change=\"offerDetailOpen = $event\"");
    expect(offers).toContain("'offers--map': compactMap, 'offers--detail-open': compactMap && detailOpen");
    expect(offers).toContain('.offers--map:not(.offers--detail-open) .offer-detail,');
    expect(offers).toContain('.offers--map.offers--detail-open .offers__list { display: none; }');
    expect(offers).toContain('v-if="!compactMap" class="offers__toolbar"');
    expect(offers).toContain('.offers__shell { max-width: 1260px; margin-inline: auto; container-type: inline-size; }');
    expect(offers).toContain('@container (max-width: 42rem) {\n  .offers__layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }');
    expect(mission).toContain('.mission-desk__empty :deep(.offers__items) {\n  max-height: none; overflow: visible; padding: 0;');
    expect(mission).toContain('.mission-desk__empty--offers {\n  height:');
    expect(mission).toContain('display: flex; flex-direction: column; overflow: hidden;');
    expect(mission).toContain('overflow-y: auto; overscroll-behavior: contain;\n  background: rgba(var(--v-theme-surface), .95);');
    expect(offers).toContain('.offers--map .offers__list, .offers--map .offer-detail { min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable; }');
  });

  it("keeps compact severity, title, summary and time legible, with full detail and decisions on demand", () => {
    expect(offers).toContain('.offers--map .offer-card { min-height: 64px;');
    expect(offers).toContain('.offers--map .offer-card__top { display: grid; grid-template-columns: minmax(0, 1fr) auto;');
    expect(offers).toContain('.offers--map .offer-card__description { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;');
    expect(offers).toContain('.offers--map .offer-card__foot span:last-child { display: none; }');
    expect(offers).toContain('.offers--map .offer-detail__buttons > * { flex: 1 1 8rem; min-width: 0; min-height: 44px;');
    expect(offers).toContain('aria-label="بازگشت به فهرست پیشنهادها"');
    expect(offers).toContain('aria-label="به‌روزرسانی پیشنهادها"');
    expect(offers).toContain('if (props.compactMap) detail.scrollTo({ top: 0, behavior: "auto" });');
    expect(offers).toContain('card.dataset.offerId === selectedId.value');
    expect(offers).toContain('?.focus({ preventScroll: true });');
    expect(offers).toContain('watch(() => inbox.page, () => { selectedId.value = null; detailOpen.value = false; });');
    expect(offers).toContain('void closeMapDetail();');
    expect(offers).toContain("compactMap ? 'list-item-two-line' : 'article, actions'");
    expect(offers).toContain('v-else-if="!inbox.proposals.length && !inbox.acceptedMissionId"');
    expect(offers).toContain('v-else-if="inbox.proposals.length" class="offers__layout"');
    expect(offers).toContain('v-if="inbox.acceptedMissionId && (!compactMap || !inbox.acceptedOffer?.details)"');
    expect(offers).toContain('.offers--map .offers__grid { grid-template-columns: 1fr; gap: .35rem; }');
    expect(offers).toContain('.offer-card__title { font-weight: 800; font-size: .95rem; line-height: 1.55; flex: 1; min-width: 0; white-space: normal; overflow-wrap: anywhere; }');
    expect(offers).toContain('.offer-card__description { font-size: .85rem; line-height: 1.65; opacity: .9; overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }');
    expect(offers).toContain('@container (max-width: 28rem) {');
    expect(offers).toContain('.offer-card__top { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 7px 9px; }');
    expect(offers).toContain('.offer-card__severity { grid-column: 2; justify-self: start; }');
    expect(offers).toContain(':aria-pressed="selected?.id === offer.id && (!compactMap || detailOpen)"');
    expect(offers).toContain('@click="selectOffer(offer.id)"');
    expect(offers).toContain("confirmAction = 'accept'");
    expect(offers).toContain("confirmAction = 'decline'");
    for (const [source, filename] of [[mission, "UserMissionView.vue"], [offers, "ProposalInboxContent.vue"]] as const) {
      const css = parse(source, { filename }).descriptor.styles[0]!.content;
      expect(compileStyle({ source: css, filename, id: "data-v-offer-responsive", scoped: true }).errors).toEqual([]);
    }
  });
});
