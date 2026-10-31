import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("../../components/shell/ProposalInboxContent.vue", import.meta.url), "utf8");

describe("proposal card footer at zoomed/narrow widths (source-pinned)", () => {
  it("allows the time and detail prompt to flow onto separate rows without clipping the card", () => {
    expect(view).toContain('class="offer-card__foot"');
    expect(view).toMatch(/\.offer-card__foot \{[^}]*flex-wrap: wrap;[^}]*\}/);
    expect(view).toMatch(/\.offer-card__foot span \{[^}]*min-width: 0;[^}]*overflow-wrap: anywhere;/);
    expect(view).toContain('.offer-card { width: 100%;');
  });
});
