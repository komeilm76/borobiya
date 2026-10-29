import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

// WebKit/VoiceOver can omit the implicit list role of a native list whose markers
// have been removed by CSS. Pin the semantics without mounting Vue SFCs.
describe("unbulleted lists retain screen-reader list semantics", () => {
  it("identifies both the mission timeline and scrolling place-search results as lists", () => {
    const timeline = source("../mission/MissionTimelinePanel.vue");
    const search = source("./PlaceSearchPanel.vue");
    expect(timeline).toMatch(/<ol[^>]*class="timeline__list"[^>]*role="list"[^>]*>/);
    expect(timeline).toContain('.timeline__list { list-style: none;');
    expect(search).toMatch(/<ul[^>]*aria-label="نتایج جست‌وجوی مکان"[^>]*role="list"[^>]*>/);
    expect(search).toContain('.place-search__results ul { margin: 0; padding: 0; list-style: none; }');
  });

  it("preserves the list role of responsive admin cards instead of silently flattening the rows", () => {
    for (const [path, klass] of [
      ["../../views/_admin/AdminUsersView.vue", "admin-users-mobile"],
      ["../../views/_admin/AdminCategoriesView.vue", "admin-categories-mobile"],
      ["../../views/_admin/AdminIncidentsView.vue", "admin-incidents-mobile"]
    ]) {
      const view = source(path!);
      expect(view, path).toMatch(new RegExp(`<ul[^>]*class="${klass}"[^>]*role="list"[^>]*>`));
      expect(view, path).toContain(`.${klass} {`);
      expect(view, path).toMatch(new RegExp(`\\.${klass} \\{[^}]*list-style: none;`));
      if (klass !== "admin-users-mobile") {
        const rows = view.split(`<ul v-if=`)[1]?.split("</ul>")[0];
        expect(rows, path).not.toContain("listState === 'error'");
        expect(rows, path).not.toContain("listState === 'empty'");
        expect(view, path).toMatch(new RegExp(`<div v-if="listState === 'error'" class="${klass} ${klass}__card">`));
        expect(view, path).toMatch(new RegExp(`<p v-if="listState === 'empty'" class="${klass} ${klass}__card" role="status">`));
      }
    }
  });

  it("retains distinct lists for owned, received and history grants, within their named sections", () => {
    const shares = source("../sharing/ShareLists.vue");
    expect(shares.match(/<ul[^>]*class="share-lists__rows"[^>]*role="list"[^>]*>/g)).toHaveLength(3);
    for (const id of ["share-lists-owned-title", "share-lists-received-title", "share-lists-history-title"])
      expect(shares).toContain(`aria-labelledby="${id}"`);
    expect(shares).toMatch(/\.share-lists__rows \{[^}]*list-style: none;/);
  });
});
