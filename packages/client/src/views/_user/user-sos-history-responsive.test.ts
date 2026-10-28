import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const history = readFileSync(new URL("./UserSosHistoryView.vue", import.meta.url), "utf8");
const live = readFileSync(new URL("../../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");
const rating = readFileSync(new URL("../../components/mission/MissionRatingPanel.vue", import.meta.url), "utf8");

describe("requester SOS history on narrow screens (source-pinned; no Vue mount)", () => {
  it("keeps an accessible bounded request list above the selected case without hiding pagination", () => {
    expect(history).toContain('<section class="history__list" aria-label="فهرست درخواست‌های امداد">');
    expect(history).toMatch(/<div class="history__items"[^>]*role="region"[^>]*:tabindex="history\.items\.value\.length > 1 \? 0 : -1"[^>]*>[\s\S]*?<button v-for="item in history\.items\.value"/);
    const list = history.split('<section class="history__list"')[1]!.split('</section>')[0]!;
    expect(list).toMatch(/<\/button>\s*<\/div>\s*<div v-if="history\.listVerified\.value && history\.totalPages\.value > 1" class="history__pages">/);
    expect(history.indexOf('class="history__panel" aria-label="جزئیات درخواست"')).toBeGreaterThan(
      history.indexOf('class="history__pages"')
    );
    expect(history).toContain('history.choose(item)');
    expect(history).toContain('<MissionLivePanel v-if="selectedMission"');
  });

  it("stacks cards before narrow two-column squeeze and confines scrolling to the card list", () => {
    expect(history).toContain('.history__list,.history__items { display: grid; gap: 10px; min-width: 0; }');
    expect(history).toContain('@media(max-width:880px)');
    const phone = history.split('@media(max-width:780px) {')[1]!.split('@media(max-width:530px)')[0]!;
    expect(phone).toContain('.history__items { grid-template-columns: 1fr; max-height: min(42vh, 22rem); max-height: min(42dvh, 22rem); overflow-y: auto; padding: 3px 4px 6px; }');
    expect(phone).toContain('.history__items:focus-visible { outline: 3px solid rgb(var(--v-theme-primary));');
    expect(phone).toContain('.history__toolbar { flex-wrap: wrap; }');
    expect(phone).not.toContain('history__panel { max-height');
  });

  it("keeps 48px rating targets usable and lets live member badges flow below labels on phones", () => {
    expect(rating).toContain('.rating__choices { display: flex; flex-wrap: wrap;');
    expect(rating).toContain('flex: 0 0 48px; width: 48px; height: 48px;');
    expect(live).toContain('.live-panel__map { min-height: 20rem;');
    expect(live).toContain('@media(max-width:599px)');
    expect(live).toContain('.live-panel__member { flex-wrap: wrap; }');
    expect(live).toContain('.live-panel__member > .v-chip { max-width: 100%; }');
    expect(live).toContain('.live-panel__members :deep(.v-btn) { height: auto; min-height: 44px; white-space: normal; }');
    expect(live).toContain('.live-panel__members :deep(.v-btn__content) { white-space: normal; text-align: center; }');
  });
});
