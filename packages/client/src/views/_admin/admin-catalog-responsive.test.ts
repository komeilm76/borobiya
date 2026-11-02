import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned structure only; repo convention forbids mounting Vue SFCs in unit tests.
const incidents = readFileSync(new URL("./AdminIncidentsView.vue", import.meta.url), "utf8");

describe("admin catalog lists on narrow screens", () => {
  it("keeps incident details and editing reachable without scrolling a wide table", () => {
    expect(incidents).toContain('<v-table class="admin-incidents-table"');
    expect(incidents).toContain('<ul v-if="types.length || listState === \'loading\'" class="admin-incidents-mobile" aria-label="نوع رویدادها" :aria-busy="loading" role="list">');
    const cards = incidents.split('<ul v-if="types.length || listState === \'loading\'" class="admin-incidents-mobile"')[1]?.split("</ul>")[0];
    expect(cards).toContain('v-for="type in types"');
    expect(cards).toContain("{{ type.name }}");
    expect(cards).toContain("{{ type.slug }}");
    expect(cards).toContain("{{ type.description || \"—\" }}");
    expect(cards).toContain("{{ type.color || \"—\" }}");
    expect(cards).toContain('v-if="type.icon"');
    expect(cards).toContain('@click="openEdit(type)"');
    expect(incidents.match(/@click="openEdit\(type\)"/g)).toHaveLength(2); // desktop + mobile, one handler
    expect(cards).toContain('v-if="listState === \'loading\'"');
    expect(cards).not.toContain('listState === \'empty\'');
    expect(cards).not.toContain('listState === \'error\'');
    expect(incidents).toContain('class="admin-incidents-mobile admin-incidents-mobile__card"');
    expect(incidents).toContain('@click="load"');
    const narrow = incidents.split("@media (max-width: 850px) {")[1]?.split("\n}")[0];
    expect(narrow).toContain(".admin-incidents-table { display: none; }");
    expect(narrow).toContain(".admin-incidents-mobile { display: grid;");
  });

  it("keeps the persistent catalog dialog's actions outside a scrollable body", () => {
    for (const [source, count] of [[incidents, 1]] as const) {
      const dialogs = [...source.matchAll(/<v-dialog\b[^>]*>[\s\S]*?<\/v-dialog>/g)];
      expect(dialogs).toHaveLength(count);
      for (const [dialog] of dialogs) {
        const opening = dialog.slice(0, dialog.indexOf(">") + 1);
        expect(opening).toMatch(/\bscrollable\b/);
        expect(opening).toMatch(/\bpersistent\b/);
        expect(dialog).toMatch(/<v-card-text\b/);
        expect(dialog).toMatch(/<v-card-actions class="admin-catalog-dialog-actions">/);
        expect(dialog.indexOf("</v-card-text>")).toBeLessThan(dialog.indexOf("<v-card-actions"));
      }
    }
  });

  it("stacks catalog dialog actions into full-width touch targets on phones", () => {
    for (const source of [incidents]) {
      expect(source).toContain('class="admin-catalog-dialog-actions"');
      const phone = source.split("@media (max-width: 600px) {")[1]?.split("\n}")[0];
      expect(phone).toContain(".admin-catalog-dialog-actions { flex-direction: column;");
      expect(phone).toContain(".admin-catalog-dialog-actions :deep(.v-spacer) { display: none; }");
      expect(phone).toContain(".admin-catalog-dialog-actions :deep(.v-btn) { width: 100%; min-height: 44px;");
    }
  });
});
