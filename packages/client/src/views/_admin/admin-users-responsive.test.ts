import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned structure only: repo convention forbids mounting Vue SFCs in unit tests.
const source = readFileSync(new URL("./AdminUsersView.vue", import.meta.url), "utf8");

describe("admin user management at narrow widths", () => {
  it("offers the same paged users and status-change handler in a mobile card layout", () => {
    expect(source).toContain('<div v-else class="admin-users-results">');
    expect(source).toContain('<v-table class="admin-users-table">');
    expect(source).toContain('<ul class="admin-users-mobile" aria-label="کاربران">');
    expect(source).toContain('<li v-for="user in users" :key="user.id" class="admin-mobile-card">');
    expect(source.match(/@update:model-value="requestStatusChange\(user, \$event\)"/g)).toHaveLength(2);
    expect(source.match(/:aria-label="statusSwitchLabel\(user\)"/g)).toHaveLength(2);
    expect(source.match(/:disabled="loading \|\| statusSavingUserId !== null \|\| isCurrentAdmin\(user\)"/g)).toHaveLength(2);
    expect(source).toContain('v-if="!loading && !listError && users.length > 0" class="admin-users-pagination"');
  });

  it("replaces horizontal table scrolling with one-column cards before the table stops fitting", () => {
    const narrow = source.split("@media (max-width: 850px) {")[1]?.split("\n}\n")[0];
    expect(narrow).toBeDefined();
    expect(narrow).toContain(".admin-users-table-wrap { display: none; }");
    expect(narrow).toContain(".admin-users-mobile { display: grid;");
    expect(source).toContain(".admin-mobile-username { overflow-wrap: anywhere;");
    const phone = source.split("@media (max-width: 520px) {")[1];
    expect(phone).toContain(".admin-status-dialog-actions { flex-direction: column;");
    expect(phone).toContain(".admin-status-dialog-actions :deep(.v-spacer) { display: none; }");
    expect(phone).toContain(".admin-status-dialog-actions :deep(.v-btn) { width: 100%; min-height: 44px;");
  });
});
