import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const mission = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const offers = readFileSync(new URL("../shell/ProposalInboxContent.vue", import.meta.url), "utf8");

// Responsive source contracts; do not mount Vue SFCs in unit tests (docs/TASKS.md).
describe("offers inside the idle mission map", () => {
  it("stacks list and details at the card's width, even on desktop viewports", () => {
    expect(mission).toContain('<h3>در حال حاضر مأموریت فعالی ندارید</h3>');
    expect(mission).toContain('<ProposalInboxContent :selected-offer-id="null" />');
    expect(mission).toContain('.mission-desk__empty :deep(.offers__layout) { grid-template-columns: minmax(0, 1fr); gap: .75rem; }');
    expect(offers).toContain('.offers__shell { max-width: 1260px; margin-inline: auto; container-type: inline-size; }');
    expect(offers).toContain('@container (max-width: 42rem) {\n  .offers__layout { grid-template-columns: minmax(0, 1fr); gap: 12px; }');
    expect(mission).toContain('.mission-desk__empty :deep(.offers__items) {\n  max-height: none; overflow: visible; padding: 0;');
    expect(mission).toContain('overflow-y: auto; overscroll-behavior: contain;');
  });

  it("keeps full incident titles and meaningful summaries readable at phone/card widths", () => {
    expect(offers).toContain('.offer-card__title { font-weight: 800; font-size: .95rem; line-height: 1.55; flex: 1; min-width: 0; white-space: normal; overflow-wrap: anywhere; }');
    expect(offers).toContain('.offer-card__description { font-size: .85rem; line-height: 1.65; opacity: .9; overflow: hidden; overflow-wrap: anywhere; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }');
    expect(offers).toContain('@container (max-width: 28rem) {');
    expect(offers).toContain('.offer-card__top { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 7px 9px; }');
    expect(offers).toContain('.offer-card__severity { grid-column: 2; justify-self: start; }');
    expect(offers).toContain(':aria-pressed="selected?.id === offer.id"');
    expect(offers).toContain('@click="selectOffer(offer.id)"');
    expect(offers).toContain("confirmAction = 'accept'");
    expect(offers).toContain("confirmAction = 'decline'");
    for (const [source, filename] of [[mission, "UserMissionView.vue"], [offers, "ProposalInboxContent.vue"]] as const) {
      const css = parse(source, { filename }).descriptor.styles[0]!.content;
      expect(compileStyle({ source: css, filename, id: "data-v-offer-responsive", scoped: true }).errors).toEqual([]);
    }
  });
});
