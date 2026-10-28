import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned: the repository does not mount Vue SFCs in unit tests.
const view = readFileSync(new URL("./AdminUsersView.vue", import.meta.url), "utf8");
const searchHandler = view.split("function updateSearch(value: unknown): void {")[1]?.split("\n}\n")[0];

describe("admin user search feedback while typing", () => {
  it("invalidates the old read and hides old rows before the debounced search", () => {
    expect(searchHandler).toBeDefined();
    expect(searchHandler).toMatch(/search\.value = next;[\s\S]*?\+\+listRequestVersion;[\s\S]*?activeListController\?\.abort\(\);/);
    expect(searchHandler).toContain("activeListController = null;");
    expect(searchHandler).toContain("users.value = [];");
    expect(searchHandler).toContain("total.value = 0;");
    expect(searchHandler).toContain("totalPages.value = 0;");
    expect(searchHandler).toContain('listError.value = "";');
    expect(searchHandler).toContain("loading.value = true;");
    expect(searchHandler).toContain("searchTimer = setTimeout(");
    expect(searchHandler!.indexOf("loading.value = true;")).toBeLessThan(searchHandler!.indexOf("searchTimer = setTimeout("));
    expect(view).toContain('v-if="loading" class="admin-users-state" role="status"');
    const searchInput = view.split('class="admin-users-search"')[1]?.split("/>")[0];
    expect(searchInput).not.toContain(':disabled="loading && !users.length"');
    expect(view).toContain('if (loading.value) return "در حال دریافت فهرست کاربران…";');
    expect(view).toContain('if (listError.value) return "تعداد حساب‌ها در دسترس نیست";');
    expect(view).toContain('if (loading.value || typeof value !== "boolean"');
  });

  it("waits for debounce even when the query resets pagination, but allows explicit filter/refresh reads", () => {
    expect(searchHandler).toContain("if (page.value !== 1) page.value = 1;");
    const pageWatcher = view.split("watch(page, () => {")[1]?.split("});")[0];
    expect(pageWatcher).toContain("if (searchTimer !== null) return;");
    expect(pageWatcher).toContain("void loadUsers();");
    expect(view).not.toContain("watch(search,");
    expect(view).toContain('@click="loadUsers"');
    expect(view).toMatch(/function updateStatusFilter[\s\S]*?clearSearchTimer\(\);[\s\S]*?if \(page.value !== 1\) page.value = 1;\s*else void loadUsers\(\);/);
    expect(view).toMatch(/if \(requestVersion !== listRequestVersion\) return;[\s\S]*?users.value = response.items;/);
  });
});
