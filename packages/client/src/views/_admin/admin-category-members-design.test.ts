import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source/compiled-CSS contracts; this repository does not mount SFCs in unit tests.
const source = readFileSync(new URL("./AdminCategoriesView.vue", import.meta.url), "utf8");
const dialog = source.slice(source.indexOf('<v-dialog v-model="membersOpen"'), source.indexOf('<v-snackbar'));
const style = parse(source).descriptor.styles[0]!.content;

describe("category member management dialog", () => {
  it("prioritizes finding new accounts and distinguishes search states", () => {
    expect(dialog).toContain('v-model="membersOpen" max-width="800"');
    expect(style).toContain('grid-template-columns: minmax(0, 1.35fr) minmax(0, .8fr)');
    expect(dialog).toContain('aria-labelledby="admin-category-members-title"');
    expect(dialog).toContain(':fullscreen="isPhone"');
    expect(dialog.indexOf('id="admin-category-add-title"')).toBeLessThan(dialog.indexOf('id="admin-category-current-title"'));
    expect(dialog).toContain('data-test="member-search"');
    expect(dialog).toContain('@update:model-value="queueSearch($event)"');
    expect(dialog).toContain('aria-describedby="admin-category-search-hint"');
    expect(dialog).toContain('v-if="!memberSearch.trim()"');
    expect(dialog).toContain('v-else-if="searching"');
    expect(dialog).toContain('v-else-if="searchError"');
    expect(dialog).toContain('v-else-if="candidates.length === 0"');
    expect(dialog).toContain('role="group" aria-label="نتایج جست‌وجوی حساب‌ها"');
    expect(dialog).toContain('فقط حساب‌های فعالِ خارج از این گروه');
    expect(dialog).toContain('v-if="candidates.length === 10" class="admin-category-members__results-hint"');
  });

  it("keeps chosen names available across searches and clears them only when removed, closed or added", () => {
    expect(dialog).toContain('v-if="selectedIds.length"');
    expect(dialog).toContain('class="admin-category-members__selection" role="group" aria-label="حساب‌های انتخاب‌شده برای افزودن"');
    expect(dialog.indexOf('class="admin-category-members__selection"')).toBeLessThan(dialog.indexOf('data-test="current-members"'));
    expect(dialog).toContain('v-for="id in selectedIds"');
    expect(dialog).toContain("selectedUsernames[id] ?? 'کاربر'");
    expect(dialog).toContain('@click:close="toggleMember(id, false)"');
    expect(source).toContain('selectedUsernames.value = { ...selectedUsernames.value, [id]: candidate.username };');
    expect(source).toContain('selectedIds.value = [...next];');
    expect(source).toContain('delete remaining[id];');
    expect(source).toContain('if (!open) {\n    resetSearch();\n    selectedIds.value = [];\n    selectedUsernames.value = {};');
    const write = source.indexOf('await assignCategoryUsers(category.id, selectedIds.value, accessToken);');
    const visible = source.indexOf('categories.value = categories.value.map((row) => withConfirmedMembers(row, category.id, confirmed));', write);
    const refreshed = source.indexOf('await load();', visible);
    expect(write).toBeGreaterThan(-1);
    expect(visible).toBeGreaterThan(write);
    expect(refreshed).toBeGreaterThan(visible);
    expect(dialog).toContain(':close-label="`حذف ${selectedUsernames[id] ?? \'کاربر\'} از انتخاب‌ها`"');
    expect(dialog).toContain(':disabled="saving || removingMemberId !== null || selectedIds.length === 0"');
  });

  it("separates current memberships from pending selections and protects in-flight changes", () => {
    expect(dialog).toContain('data-test="current-members"');
    expect(dialog).toContain('v-for="member in membersFor.members"');
    expect(dialog).toContain(':aria-label="`حذف ${member.username} از ${membersFor.name}`"');
    expect(dialog).toContain(':disabled="saving || removingMemberId !== null"');
    expect(dialog).toContain('@click="removeMember(member)"');
    expect(dialog).toContain('role="alert">{{ membersError }}');
    expect(dialog).toContain('@after-leave="restoreMembersFocus"');
    expect(source).toContain('if (membersTrigger?.isConnected) membersTrigger.focus({ preventScroll: true });');
    expect(source).toContain('membersFor.value = withoutConfirmedMember(membersFor.value, category.id, member.id);');
  });

  it("uses compact disclosure and actions on phones without hiding member management", () => {
    expect(dialog).toContain(':aria-expanded="currentMembersExpanded"');
    expect(dialog).toContain('aria-controls="admin-category-current-list"');
    expect(dialog).toContain('v-show="currentMembersExpanded"');
    expect(source).toContain('currentMembersExpanded.value = !isPhone.value;');
    expect(style).toContain('.admin-category-members__disclosure { display: flex;');
    expect(style).toContain('align-items: start; padding: .85rem 1.1rem;');
    expect(style).toContain('min-height: 44px;');
    expect(style).toContain('.admin-category-members__results { max-height: min(34dvh, 14rem); }');
    expect(style).toContain('.admin-catalog-dialog-actions.admin-category-members__actions { flex-direction: row; }');
    expect(dialog).not.toContain('admin-category-members__action-hint');
  });

  it("gives search a raised work surface, a tonal member rail, and selections beside search", () => {
    expect(style).toContain('background: var(--bb-color-inset);\n}');
    expect(style).toContain('.admin-category-members__section { min-width: 0; padding: .85rem; border: 0;');
    expect(style).toContain('background: rgb(var(--v-theme-surface)); box-shadow: var(--bb-shadow-item);');
    expect(style).toContain('background: rgba(var(--v-theme-primary), .09);');
    expect(style).toContain('.admin-category-members__selection { display: flex;');
    expect(style).not.toContain('.admin-category-members__selection { grid-column: 1 / -1;');
    expect(style).toContain('.admin-category-members__person + .admin-category-members__person { border-top:');
    expect(style).toContain('.admin-categories-member--selected { background: rgba(var(--v-theme-primary), .1);');
    expect(style).toContain('.admin-categories-member--selected { outline: 2px solid Highlight;');
  });

  it("keeps touch targets, focus, theme and phone layout intact", () => {
    expect(style).toContain('.admin-category-members__person :deep(.v-btn) { min-width: 44px; min-height: 44px;');
    expect(style).toContain('.admin-categories-member :deep(.v-selection-control--focus-visible)');
    expect(style).toContain('.admin-category-members__section--search { grid-column: 1; grid-row: 1;');
    expect(style).toContain('.admin-category-members__section--current { grid-column: 2; grid-row: 1;');
    expect(style).toContain('.admin-category-members__section--search, .admin-category-members__section--current { grid-column: 1; grid-row: auto; }');
    expect(style).toContain('background: var(--bb-color-inset)');
    const descriptor = parse(source).descriptor;
    expect(compileTemplate({ filename: "AdminCategoriesView.vue", id: "member-dialog", source: descriptor.template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminCategoriesView.vue", id: "member-dialog", scoped: true, source: style }).errors).toEqual([]);
  });
});
