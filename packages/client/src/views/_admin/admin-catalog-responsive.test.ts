import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned structure only; repo convention forbids mounting Vue SFCs in unit tests.
const incidents = readFileSync(new URL("./AdminIncidentsView.vue", import.meta.url), "utf8");
const categories = readFileSync(new URL("./AdminCategoriesView.vue", import.meta.url), "utf8");

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

  it("keeps category actions reachable without rendering every member in either list", () => {
    expect(categories).toContain('<v-table class="admin-categories-table"');
    const table = categories.split('<v-table class="admin-categories-table"')[1]?.split('</v-table>')[0];
    expect(table).toContain('<th class="admin-categories-actions-heading">عملیات</th>');
    expect(table?.match(/<th(?:\s|>)/g)).toHaveLength(4);
    expect(table?.match(/colspan="4"/g)).toHaveLength(3);
    expect(table).not.toContain('v-for="member in category.members"');
    expect(table).toContain('category.members.length.toLocaleString(\'fa-IR\')');
    expect(table).toContain('class="admin-categories-actions__buttons"');
    expect(table).toContain('<v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-account-plus-outline"');
    expect(table).toContain('<v-btn size="small" variant="tonal" color="primary" prepend-icon="mdi-pencil-outline"');
    expect(categories).toContain('.admin-categories-actions__buttons :deep(.v-btn) { min-height: 36px;');
    expect(categories).toContain('<ul v-if="categories.length || listState === \'loading\'" class="admin-categories-mobile" aria-label="گروه‌های امدادگر" :aria-busy="loading" role="list">');
    const cards = categories.split('<ul v-if="categories.length || listState === \'loading\'" class="admin-categories-mobile"')[1]?.split("</ul>")[0];
    expect(cards).toContain('v-for="category in categories"');
    expect(cards).toContain("{{ category.name }}");
    expect(cards).toContain("{{ category.description || \"—\" }}");
    expect(cards).toContain('v-for="id in category.incidentTypeIds"');
    expect(cards).not.toContain('v-for="member in category.members"');
    expect(cards).toContain('category.members.length.toLocaleString(\'fa-IR\')');
    expect(cards).toContain('<v-btn variant="tonal" color="primary" prepend-icon="mdi-account-plus-outline"');
    expect(cards).toContain('<v-btn variant="tonal" color="primary" prepend-icon="mdi-pencil-outline"');
    expect(categories).toContain('.admin-categories-mobile__actions :deep(.v-btn) { min-height: 44px;');
    expect(cards).toContain('@click="openMembers(category, $event)"');
    expect(cards).toContain('@click="openEdit(category, $event)"');
    expect(categories.match(/@click="openMembers\(category, \$event\)"/g)).toHaveLength(2);
    expect(categories.match(/@click="openEdit\(category, \$event\)"/g)).toHaveLength(2);
    expect(cards).toContain('v-if="listState === \'loading\'"');
    expect(cards).not.toContain('listState === \'empty\'');
    expect(cards).not.toContain('listState === \'error\'');
    expect(categories).toContain('class="admin-categories-mobile admin-categories-mobile__card"');
    expect(categories).toContain('@click="load"');
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
        expect(dialog).toMatch(/<v-card-actions class="admin-catalog-dialog-actions(?: [^"]+)?">/);
        expect(dialog.indexOf("</v-card-text>")).toBeLessThan(dialog.indexOf("<v-card-actions"));
      }
    }
  });

  it("stacks catalog dialog actions into full-width touch targets on phones", () => {
    for (const source of [incidents, categories]) {
      expect(source).toMatch(/class="admin-catalog-dialog-actions(?: [^"]+)?"/);
      const phone = source.split("@media (max-width: 600px) {")[1]?.split("\n}")[0];
      expect(phone).toContain(".admin-catalog-dialog-actions { flex-direction: column;");
      expect(phone).toContain(".admin-catalog-dialog-actions :deep(.v-spacer) { display: none; }");
      expect(phone).toContain(".admin-catalog-dialog-actions :deep(.v-btn) { width: 100%; min-height: 44px;");
    }
  });
});
