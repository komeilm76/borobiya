import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned structure only: repo convention forbids mounting Vue SFCs in unit tests.
const shell = readFileSync(new URL("./AdminShell.vue", import.meta.url), "utf8");

describe("admin shell", () => {
  it("is right-to-left and starts with the right-hand navigation rail", () => {
    expect(shell).toContain('<div class="admin-shell" dir="rtl"');
    expect(shell).toContain("grid-template-columns: 248px minmax(0, 1fr);");
    expect(shell).toContain("border-inline-start: 1px solid var(--admin-line);");
  });

  it("groups the three sections and links every one of the nine pages", () => {
    expect(shell).toContain('label: "عملیات"');
    expect(shell).toContain('label: "مدیریت"');
    expect(shell).toContain('label: "سامانه"');
    // Every section is served now: no dead span, no "coming soon" badge, no disabled entry.
    expect(shell).not.toContain("admin-nav__item--pending");
    expect(shell).not.toContain("به‌زودی");
    expect((shell.match(/key: "/g) ?? []).length).toBe(9);
  });

  it("keeps the active route visible and wires every real admin route", () => {
    expect(shell).toContain(":class=\"{ 'admin-nav__item--active': item.key === active }\"");
    for (const path of [
      "/_admin/dashboard",
      "/_admin/dispatch",
      "/_admin/reports",
      "/_admin/users",
      "/_admin/services",
      "/_admin/categories",
      "/_admin/audit",
      "/_admin/alerts",
      "/_admin/settings"
    ]) {
      expect(shell).toContain(`to: "${path}"`);
    }
  });

  it("collapses to an off-canvas drawer before the rail crowds the table", () => {
    expect(shell).toContain("@media (max-width: 1023px)");
    expect(shell).toContain("transform: translateX(100%);");
    expect(shell).toContain(".admin-shell--nav-open .admin-shell__nav {");
    expect(shell).toContain(".admin-shell--nav-open .admin-shell__scrim {");
    // The scrim has to be dismissible with a click, not only with the menu button.
    expect(shell).toContain('@click="navOpen = false"');
  });

  it("labels the breadcrumb trail and the account footer for screen readers", () => {
    expect(shell).toContain('aria-label="ناوبری پنل مدیریت"');
    expect(shell).toContain('aria-label="مسیر صفحه"');
    expect(shell).toContain('aria-label="هشدارها"');
    expect(shell).toContain("const crumbList = computed(() => props.crumbs ?? []);");
  });
});
