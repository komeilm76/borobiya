import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned structure only: repo convention forbids mounting Vue SFCs in unit tests.
const dashboard = readFileSync(new URL("./AdminDashboardView.vue", import.meta.url), "utf8");
const reports = readFileSync(new URL("./AdminReportsView.vue", import.meta.url), "utf8");
const services = readFileSync(new URL("./AdminServiceGroupsView.vue", import.meta.url), "utf8");

describe("admin dashboard states", () => {
  it("renders loading, forbidden and error panels before any data-dependent markup", () => {
    const template = dashboard.slice(0, dashboard.indexOf("<script"));
    expect(template.indexOf('state="loading"')).toBeLessThan(template.indexOf("admin-kpis"));
    expect(dashboard).toContain('v-else-if="state === \'forbidden\'"');
    expect(dashboard).toContain('v-else-if="state === \'error\'"');
    expect(dashboard).toContain(':reference="errorReference"');
    expect(dashboard).toContain('@retry="loadAll"');
  });

  it("keeps the last good numbers visible when the network drops", () => {
    expect(dashboard).toContain("v-if=\"!isOnline\" class=\"admin-banner admin-banner--offline\"");
    expect(dashboard).toContain("window.addEventListener(\"offline\", updateConnectivity)");
    expect(dashboard).toContain("window.removeEventListener(\"offline\", updateConnectivity)");
  });

  it("never fabricates data past the pages it actually read", () => {
    expect(dashboard).toContain("const PAGES_TO_READ = 3;");
    expect(dashboard).toContain("truncated.value = firstPage.totalPages > PAGES_TO_READ;");
    expect(dashboard).toContain('v-if="truncated" class="admin-hint"');
  });

  it("treats a missing token as forbidden rather than showing an empty dashboard", () => {
    expect(dashboard).toContain("if (!accessToken) {");
    expect(dashboard).toContain("forbidden.value = true;");
  });
});

describe("admin reports", () => {
  it("filters the window client-side and explains the data source", () => {
    expect(reports).toContain("const cutoff = Date.now() - range.value * 24 * 60 * 60 * 1000;");
    expect(reports).toContain("برای شاخص‌های زیرساختی مثل زمان پاسخ سرور، سرویس تجمیعی سرور لازم است.");
  });

  it("offers an empty panel with a way out of the empty state", () => {
    expect(reports).toContain('state="empty"');
    expect(reports).toContain('action-label="بازهٔ ۳۰ روز"');
    expect(reports).toContain('@retry="range = 30"');
  });
});

describe("admin service groups", () => {
  it("covers every CRUD path the catalog exposes", () => {
    for (const fn of ["createCategory", "updateCategory", "assignCategoryUsers", "removeCategoryUser"]) {
      expect(services).toContain(fn);
    }
    expect(services).toContain("const payload = {");
    expect(services).toContain("description: form.description.trim() || undefined,");
  });

  it("debounces member search and disables already-assigned responders", () => {
    expect(services).toContain("searchTimer = setTimeout(() => void searchUsers(), 320);");
    expect(services).toContain(':disabled="isMember(user.id)"');
    expect(services).toContain("{{ isMember(user.id) ? \"عضو است\" : \"افزودن\" }}");
  });

  it("shows the coverage gap the dispatch board depends on", () => {
    expect(services).toContain("const uncoveredTypes = computed(");
    expect(services).toContain('class="groups-summary__warn"');
  });
});
