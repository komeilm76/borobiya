import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned: the repository does not mount Vue SFCs in unit tests.
const view = readFileSync(new URL("./AdminUsersView.vue", import.meta.url), "utf8");

function block(start: string, end: string): string {
  const from = view.indexOf(start);
  expect(from).toBeGreaterThan(-1);
  const to = view.indexOf(end, from);
  expect(to).toBeGreaterThan(from);
  return view.slice(from, to);
}

describe("admin users list states", () => {
  it("renders the shared panel for every state the table can be in", () => {
    expect(view).toContain('import AdminStatePanel from "../../components/admin/AdminStatePanel.vue";');
    for (const state of ["loading", "offline", "error", "empty"]) {
      expect(view).toMatch(new RegExp(`listState === ['"]${state}['"]`));
    }
    expect(view).toContain('state="offline"');
    expect(view).toContain('state="error"');
    expect(view).toContain('state="empty"');
    // The ad-hoc spinner and alert markup are gone; a screen cannot grow two dialects of the same state.
    expect(view).not.toContain('class="admin-users-state-alert"');
    expect(view).not.toContain("admin-users-empty-icon");
  });

  it("orders the state machine so an empty list never wins over a failure", () => {
    const machine = block("const listState = computed", "});");
    expect(machine).toContain('if (loading.value) return "loading";');
    expect(machine).toContain('if (listError.value) return listOffline.value ? "offline" : "error";');
    expect(machine).toContain('if (users.value.length === 0) return "empty";');
    expect(machine.indexOf('return "loading"')).toBeLessThan(machine.indexOf("listError.value"));
    expect(machine.indexOf("listError.value")).toBeLessThan(machine.indexOf("users.value.length === 0"));
  });

  it("decides offline at the failure, from the browser, not from the error text", () => {
    expect(view).toContain('const listOffline = ref(false);');
    const failed = block("  } catch (error) {", "  } finally {");
    expect(failed).toContain('listOffline.value = typeof navigator !== "undefined" && navigator.onLine === false;');
    // A retry must clear the old verdict, otherwise the panel would keep claiming "offline" while it loads.
    expect(view.match(/listError\.value = "";\n  listOffline\.value = false;/g)?.length).toBe(2);
  });

  it("offers a retry that re-runs the read, and takes it by itself when the connection returns", () => {
    const offlinePanel = block('v-else-if="listState === \'offline\'"', "@retry");
    expect(offlinePanel).toContain('action-label="تلاش دوباره"');
    const errorPanel = block('v-else-if="listState === \'error\'"', "@retry");
    expect(errorPanel).toContain(":description=\"listError\"");
    expect(view.match(/@retry="loadUsers"/g)?.length).toBe(2);
    expect(view).toContain("function retryWhenBackOnline(): void {");
    expect(view).toContain('window.addEventListener("online", retryWhenBackOnline);');
    expect(view).toContain('window.removeEventListener("online", retryWhenBackOnline);');
  });

  it("lets an empty result be fixed from the panel instead of hunting the toolbar", () => {
    expect(view).toContain("const hasActiveFilters = computed(");
    const emptyPanel = block('v-else-if="listState === \'empty\'"', "@retry");
    expect(emptyPanel).toContain(':action-label="hasActiveFilters ? \'پاک‌کردن جست‌وجو و پالایه‌ها\' : \'\'"');
    expect(emptyPanel).toContain("hasActiveFilters ? 'حسابی با این مشخصات پیدا نشد' : 'هنوز کاربری ثبت نشده است'");

    const clear = block("function clearFilters(): void {", "\n}");
    expect(clear).toContain('if (search.value !== "") search.value = "";');
    expect(clear).toContain('statusFilter.value = "all";');
    expect(clear).toContain('categoryFilter.value = "all";');
    // Going back to page 1 already re-reads; doing both would fire two list requests.
    expect(clear).toContain("if (page.value !== 1) page.value = 1;\n  else void loadUsers();");
  });
});
