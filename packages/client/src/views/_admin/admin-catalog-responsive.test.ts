import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned structure only; repo convention forbids mounting Vue SFCs in unit tests.
const incidents = readFileSync(new URL("./AdminIncidentsView.vue", import.meta.url), "utf8");
const categories = readFileSync(new URL("./AdminCategoriesView.vue", import.meta.url), "utf8");

describe("admin catalog lists on narrow screens", () => {
  it("keeps incident details and editing reachable without scrolling a wide table", () => {
    expect(incidents).toContain('<v-table class="admin-incidents-table"');
    expect(incidents).toContain('<ul class="admin-incidents-mobile" aria-label="نوع رویدادها" :aria-busy="loading">');
    const cards = incidents.split('<ul class="admin-incidents-mobile"')[1]?.split("</ul>")[0];
    expect(cards).toContain('v-for="type in types"');
    expect(cards).toContain("{{ type.name }}");
    expect(cards).toContain("{{ type.slug }}");
    expect(cards).toContain("{{ type.description || \"—\" }}");
    expect(cards).toContain("{{ type.color || \"—\" }}");
    expect(cards).toContain('v-if="type.icon"');
    expect(cards).toContain('@click="openEdit(type)"');
    expect(incidents.match(/@click="openEdit\(type\)"/g)).toHaveLength(2); // desktop + mobile, one handler
    for (const state of ["loading", "error", "empty"]) {
      expect(cards).toContain(`v-if="listState === '${state}'"`);
    }
    expect(cards).toContain('@click="load"');
    const narrow = incidents.split("@media (max-width: 850px) {")[1]?.split("\n}")[0];
    expect(narrow).toContain(".admin-incidents-table { display: none; }");
    expect(narrow).toContain(".admin-incidents-mobile { display: grid;");
  });

  it("preserves category assignments and both actions in a single-column mobile list", () => {
    expect(categories).toContain('<v-table class="admin-categories-table"');
    expect(categories).toContain('<ul class="admin-categories-mobile" aria-label="گروه‌های امدادگر" :aria-busy="loading">');
    const cards = categories.split('<ul class="admin-categories-mobile"')[1]?.split("</ul>")[0];
    expect(cards).toContain('v-for="category in categories"');
    expect(cards).toContain("{{ category.name }}");
    expect(cards).toContain("{{ category.description || \"—\" }}");
    expect(cards).toContain('v-for="id in category.incidentTypeIds"');
    expect(cards).toContain('v-for="member in category.members"');
    expect(cards).toContain('@click="openMembers(category)"');
    expect(cards).toContain('@click="openEdit(category)"');
    expect(categories.match(/@click="openMembers\(category\)"/g)).toHaveLength(2);
    expect(categories.match(/@click="openEdit\(category\)"/g)).toHaveLength(2);
    for (const state of ["loading", "error", "empty"]) {
      expect(cards).toContain(`v-if="listState === '${state}'"`);
    }
    expect(cards).toContain('@click="load"');
    const narrow = categories.split("@media (max-width: 850px) {")[1]?.split("\n}")[0];
    expect(narrow).toContain(".admin-categories-table { display: none; }");
    expect(narrow).toContain(".admin-categories-mobile { display: grid;");
  });

  it("keeps all three persistent catalog dialogs' actions outside a scrollable body", () => {
    for (const [source, count] of [[incidents, 1], [categories, 2]] as const) {
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
    for (const source of [incidents, categories]) {
      expect(source).toContain('class="admin-catalog-dialog-actions"');
      const phone = source.split("@media (max-width: 600px) {")[1]?.split("\n}")[0];
      expect(phone).toContain(".admin-catalog-dialog-actions { flex-direction: column;");
      expect(phone).toContain(".admin-catalog-dialog-actions :deep(.v-spacer) { display: none; }");
      expect(phone).toContain(".admin-catalog-dialog-actions :deep(.v-btn) { width: 100%; min-height: 44px;");
    }
  });
});
