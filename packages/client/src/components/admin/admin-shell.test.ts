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
      "/_admin/incidents",
      "/_admin/audit",
      "/_admin/alerts",
      "/_admin/settings"
    ]) {
      expect(shell).toContain(`to: "${path}"`);
    }
  });

  it("keeps sign-out reachable now that the global app bar is gone", () => {
    // Hiding the app bar on `/_admin*` removed the only account menu an admin had. The rail owns it now:
    // a real menu with theme, the user-facing map, and logout behind the same confirmation App.vue uses.
    const app = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
    expect(app).toContain("&& !isAdminRoute"); // no app bar above the shell
    expect(app).toContain('!isAdminRoute" class="app-footer"'); // and no footer under it
    expect(shell).toContain('class="admin-account"');
    expect(shell).toContain('data-test="admin-logout"');
    expect(shell).toContain('data-test="admin-logout-confirm"');
    expect(shell).toContain("useLogoutConfirmation(");
    expect(shell).toContain("logout: () => auth.logout()");
    expect(shell).toContain('router.replace("/_auth/login")');
    expect(shell).toContain("theme.toggleTheme()");
  });

  it("collapses to an off-canvas drawer before the rail crowds the table", () => {
    expect(shell).toContain("@media (max-width: 1023px)");
    expect(shell).toContain("transform: translateX(100%);");
    expect(shell).toContain(".admin-shell--nav-open .admin-shell__nav {");
    expect(shell).toContain(".admin-shell--nav-open .admin-shell__scrim {");
    // The scrim has to be dismissible with a click, not only with the menu button.
    expect(shell).toContain('@click="navOpen = false"');
    // ...and the rail must leave the tab order while it is parked off-screen.
    expect(shell).toContain("visibility: hidden;");
    expect(shell).toContain(".admin-shell--nav-open .admin-shell__nav {");
    expect(shell).toContain('if (event.key === "Escape" && navOpen.value) navOpen.value = false;');
  });

  it("makes the toolbar controls real: a page palette and a bell that navigates", () => {
    expect(shell).toContain('@click="paletteOpen = true"');
    expect(shell).toContain("if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === \"k\") {");
    expect(shell).toContain('onMounted(() => window.addEventListener("keydown", onKeydown));');
    expect(shell).toContain('window.removeEventListener("keydown", onKeydown);');
    // The palette searches the panel's own pages and says so; records it cannot search are not promised.
    expect(shell).toContain("return pages.value.filter((hit) => `${hit.label} ${hit.group}`.includes(term));");
    expect(shell).toContain('placeholder="جست‌وجوی بخش، حساب یا درخواست…"');
    expect(shell).toContain('to="/_admin/alerts" aria-label="هشدارها"');
    expect(shell).not.toContain("$emit('search')");
    expect(shell).not.toContain("$emit('alerts')");
  });

  it("searches accounts from the palette and opens them on the users screen", () => {
    expect(shell).toContain('import { listAdminUsers } from "../../api/admin-users";');
    expect(shell).toContain("listAdminUsers({ q: term, page: 1, limit: 5 }, accessToken, active.signal),");
    // Two characters before a request: every palette keystroke must not become a query.
    expect(shell).toContain("if (term.length < 2) {");
    expect(shell).toContain("recordTimer = setTimeout(() => void searchRecords(term), 250);");
    // A slower reply for an older term must not replace the newer one.
    expect(shell).toContain("if (current !== recordRequest) return;");
    expect(shell).toContain('open(`/_admin/users?user=${encodeURIComponent(id)}`);');
    expect(shell).toContain('aria-label="حساب‌ها"');
    // Closing the palette drops the results and the pending timer, so the next open starts clean.
    expect(shell).toContain("watch(paletteOpen, (open) => {");
    expect(shell).toContain("clearRecordSearch();");
  });

  it("searches the request queue too, and opens a hit on the dispatch board", () => {
    expect(shell).toContain('import { listAdminSosRequests } from "../../api/admin-sos";');
    expect(shell).toContain("listAdminSosRequests(accessToken, { q: term, limit: 5, signal: active.signal })");
    expect(shell).toContain('aria-label="درخواست‌های اضطراری"');
    expect(shell).toContain('open(`/_admin/dispatch?request=${encodeURIComponent(id)}`);');
    // The row carries the request's own status, not a raw enum value.
    expect(shell).toContain("function statusLabel(status: SosRequestRecord[\"status\"]): string {");
    expect(shell).toContain("return SOS_STATUS_PRESENTATION[status]?.label ?? status;");
    // Both records come back from one debounced round trip; one failing endpoint must not hide the other's hits.
    expect(shell).toContain("await Promise.allSettled([");
    expect(shell).toContain('if (accounts.status === "fulfilled") accountMatches.value = accounts.value.items;');
    expect(shell).toContain('if (requests.status === "fulfilled") requestMatches.value = requests.value.items;');
    expect(shell).toContain('else if (!isAbort(requests.reason)) requestError.value = failureText("requests");');
    // Enter opens the highlighted row, and the flat hit list is in the order the three lists are drawn.
    const hits = shell.slice(shell.indexOf("const allHits = computed<PaletteHit[]>"), shell.indexOf("const activeIndex"));
    expect(hits.indexOf("...matches.value")).toBeLessThan(hits.indexOf("...accountMatches.value"));
    expect(hits.indexOf("...accountMatches.value")).toBeLessThan(hits.indexOf("...requestMatches.value"));
    expect(shell).toContain('if (hit.kind === "account") openUser(hit.id);\n  else openRequest(hit.id);');
  });

  it("says the connection is down on every screen, not only where a page keeps a banner", () => {
    expect(shell).toContain('import { useOnlineStatus } from "../../composables/online-status";');
    expect(shell).toContain("const { isOnline } = useOnlineStatus();");
    expect(shell).toContain('v-if="!isOnline"');
    expect(shell).toContain('aria-label="اتصال به سرور برقرار نیست"');
    // The word is decorative next to the icon's accessible name, and it is the first thing dropped on phones.
    expect(shell).toContain('<span class="admin-tool--offline__label" aria-hidden="true">آفلاین</span>');
    expect(shell).toContain(".admin-tool--offline__label {\n    display: none;\n  }");
  });

  it("lets the arrow keys walk the palette instead of forcing Enter on the first hit", () => {
    expect(shell).toContain('@keydown.down.prevent="moveActive(1)"');
    expect(shell).toContain('@keydown.up.prevent="moveActive(-1)"');
    expect(shell).toContain('@keydown.home.prevent="activeIndex = 0"');
    // Wrapping, so the last row's Down reaches the first one; an empty palette must not divide by zero.
    const mover = shell.slice(shell.indexOf("function moveActive(delta: number): void {"), shell.indexOf("/** `Enter` opens the highlighted row"));
    expect(mover).toContain("if (total === 0) return;");
    expect(mover).toContain("activeIndex.value = (activeIndex.value + delta + total) % total;");
    // The input keeps focus, so the browser will not bring the highlighted row into view on its own.
    expect(mover).toContain('document.getElementById(id)?.scrollIntoView({ block: "nearest" });');
    // A shrinking list must not leave the highlight past the end.
    expect(shell).toContain("if (activeIndex.value >= allHits.value.length) activeIndex.value = 0;");
  });

  it("tells assistive technology which row is highlighted", () => {
    expect(shell).toContain('role="combobox"');
    expect(shell).toContain('aria-controls="admin-palette-results"');
    expect(shell).toContain(':aria-activedescendant="activeOptionId"');
    expect(shell).toContain('<div id="admin-palette-results" class="admin-palette__results" role="listbox" aria-label="نتایج">');
    expect(shell).toContain('role="group" aria-label="حساب‌ها"');
    expect(shell).toContain('role="option"');
    expect(shell).toContain(':aria-selected="activeKey === `account-${hit.id}`"');
    // `role="option"` needs a listbox parent, and the grouped items are inside `role="presentation"` lists.
    expect(shell).toContain('<ul class="admin-palette__list" role="presentation">');
  });

  it("labels the breadcrumb trail and the account footer for screen readers", () => {
    expect(shell).toContain('aria-label="ناوبری پنل مدیریت"');
    expect(shell).toContain('aria-label="مسیر صفحه"');
    expect(shell).toContain('aria-label="هشدارها"');
    expect(shell).toContain("const crumbList = computed(() => props.crumbs ?? []);");
  });
});
