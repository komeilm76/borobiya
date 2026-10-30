import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Source/compiled CSS contracts only: docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const search = readFileSync(new URL("../../components/map/PlaceSearchPanel.vue", import.meta.url), "utf8");
const history = readFileSync(new URL("../../components/map/HistoryPlaybackPanel.vue", import.meta.url), "utf8");
const companions = readFileSync(new URL("../../components/map/LiveCompanionPanel.vue", import.meta.url), "utf8");
const vuetifyDialog = readFileSync(new URL("../../../node_modules/vuetify/lib/components/VDialog/VDialog.css", import.meta.url), "utf8");
const phone = view.split("@media (max-width: 599px) {")[1] ?? "";

function compiled(source: string, filename: string): string {
  const { descriptor } = parse(source, { filename });
  const result = compileStyle({ source: descriptor.styles[0]!.content, filename, id: "data-v-modal-surfaces", scoped: true });
  expect(result.errors).toEqual([]);
  return result.code;
}

describe("all three phone map modal surfaces", () => {
  it("uses one safe-area gutter and one scrollable dialog body, with full-height content", () => {
    for (const tool of ["search", "history", "live"]) {
      expect(view).toContain(`class="user-map-view__${tool}-body"`);
      expect(phone).toContain(`.user-map-view__${tool}-dialog`);
      expect(view).toContain(`class="user-map-view__${tool}-dialog"`);
    }
    // Vuetify adds 24px around VCardText and makes the outer VCard scroll;
    // our selector adds a map-dialog class, outranking both in the CSS cascade.
    expect(vuetifyDialog).toContain("padding: 16px 24px 24px;");
    expect(vuetifyDialog).toContain(".v-dialog > .v-overlay__content > .v-card > .v-card-text");
    expect(vuetifyDialog).toContain("overflow-y: auto;");
    expect(phone).toContain(".v-dialog > .v-overlay__content > .v-card > .v-card-text");
    expect(phone).toContain(".v-dialog > .v-overlay__content > .v-card > .v-card-title");
    expect(phone).toContain("overflow: hidden; background: rgb(var(--v-theme-surface));"); // No outer card scrollbar.
    expect(phone).toContain("padding: 0.75rem 1rem calc(1rem + env(safe-area-inset-bottom, 0px));");
    expect(phone).toContain("padding-left: calc(1rem + env(safe-area-inset-left, 0px));");
    expect(phone).toContain("padding-right: calc(1rem + env(safe-area-inset-right, 0px));");
    expect(phone).toContain("overflow-y: auto; overscroll-behavior: contain;");
    expect(phone).toContain(".place-search .place-search__results) { max-height: none; overflow: visible; }");
    expect(phone).toContain(".live-companions .live-companions__peers) { max-height: none; overflow: visible; }");
    expect(phone).toContain(".history-playback) { max-height: none !important; overflow: visible; }");
    expect(compiled(view, "UserMapView.vue")).toContain(":is(.user-map-view__search-dialog, .user-map-view__history-dialog, .user-map-view__live-dialog).v-dialog > .v-overlay__content");
  });

  it("flattens only nested phone cards and ornamental history subcards, not selectable rows or desktop widgets", () => {
    expect(phone).toContain(".user-map-view__search-dialog .place-search.v-card");
    expect(phone).toContain(".user-map-view__history-dialog .history-playback.v-card");
    expect(phone).toContain(".user-map-view__live-dialog .live-companions.v-card");
    expect(phone).toContain("width: 100%; padding: 0; border: 0; border-radius: 0 !important;");
    expect(phone).toContain("overflow: visible; background: transparent; backdrop-filter: none; box-shadow: none !important;");
    expect(phone).toContain(".history-playback__grants, .history-playback__range, .history-playback__transport");
    expect(phone).toContain("padding: 0; border: 0; border-radius: 0; background: transparent;");
    expect(search).toContain('class="place-search__result"');
    expect(search).toContain(".place-search__result--selected");
    expect(companions).toContain('class="live-companions__peer-button"');
    for (const [component, name] of [[search, "place-search"], [history, "history-playback"], [companions, "live-companions"]]) {
      expect(component).toContain(`class="${name} bb-floating-card"`);
      expect(compiled(component, `${name}.vue`)).toContain(`.${name}[data-v-modal-surfaces]`);
    }
    expect(compiled(view, "UserMapView.vue")).toContain(".user-map-view__live-dialog .live-companions.v-card");
  });

  it("has one visible semantic title per modal while preserving status, actions and close targets", () => {
    for (const [tool, title] of [["search", "جست‌وجوی مکان"], ["history", "تاریخچهٔ مسیر"], ["live", "همراهان"]]) {
      expect(view).toContain(`<v-card-title v-if="isPhone" class="user-map-view__${tool}-title">`);
      expect(view).toContain(`<h2>${title}</h2>`);
      expect(phone).toContain(`.user-map-view__${tool}-title h2`);
    }
    expect(phone).toContain(".user-map-view__search-dialog .place-search__headline");
    expect(phone).toContain(".user-map-view__history-dialog .history-playback__title-block h2");
    expect(phone).toContain(".user-map-view__live-dialog .live-companions__title-block h2");
    expect(view).toContain('aria-label="بستن جست‌وجو"');
    expect(view).toContain('aria-label="بستن تاریخچه"');
    expect(view).toContain('aria-label="بستن همراهان"');
    expect(search).toContain('class="place-search__diagnostic"');
    expect(history).toContain('class="history-playback__transport"');
    expect(companions).toContain('aria-label="نمایش همراهان روی نقشه"');
  });
});
