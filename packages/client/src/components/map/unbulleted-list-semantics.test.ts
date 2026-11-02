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
      ["../../views/_admin/AdminIncidentsView.vue", "admin-incidents-mobile"]
    ]) {
      const view = source(path!);
      expect(view, path).toMatch(new RegExp(`<ul[^>]*class="${klass}"[^>]*role="list"[^>]*>`));
      expect(view, path).toContain(`.${klass} {`);
      expect(view, path).toMatch(new RegExp(`\\.${klass} \\{[^}]*list-style: none;`));
      if (klass !== "admin-users-mobile") {
        // The incidents cards list now renders only rows; error and empty moved into the shared state panel, so the
        // list must not have kept its own copies of them.
        const rows = view.split(`<ul class="${klass}"`)[1]?.split("</ul>")[0];
        expect(rows, path).toBeDefined();
        expect(rows, path).not.toContain("listState === 'error'");
        expect(rows, path).not.toContain("listState === 'empty'");
        expect(rows, path).not.toContain("listState === 'loading'");
      }
    }
  });

  it("keeps the role on the admin lists that CSS flattens into cards and rows", () => {
    for (const [path, klass] of [
      ["../../views/_admin/AdminDashboardView.vue", "admin-groups"],
      ["../../views/_admin/AdminReportsView.vue", "report-legend"],
      ["../../views/_admin/AdminReportsView.vue", "report-ranking"],
      ["../../views/_admin/AdminServiceGroupsView.vue", "groups-mobile"],
      ["../../views/_admin/AdminServiceGroupsView.vue", "groups-members__list"]
    ]) {
      const view = source(path!);
      expect(view, `${path} ${klass}`).toMatch(new RegExp(`<ul[^>]*class="${klass}"[^>]*role="list"[^>]*>`));
      expect(view, `${path} ${klass}`).toMatch(new RegExp(`\\.${klass}[^{]*\\{[^}]*list-style: none;`));
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
