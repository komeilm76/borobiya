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
    expect(dashboard).toContain('@retry="loadAll()"');
  });

  it("keeps the last good numbers visible when the network drops", () => {
    expect(dashboard).toContain("v-if=\"!isOnline\" class=\"admin-banner admin-banner--offline\"");
    // Connectivity is the shared composable's job, so the dashboard and the dispatch board agree on "offline".
    expect(dashboard).toContain('import { useOnlineStatus } from "../../composables/online-status";');
    expect(dashboard).toContain("const { isOnline } = useOnlineStatus();");
    expect(dashboard).not.toContain('window.addEventListener("offline"');
  });

  it("never fabricates data past the pages it actually read", () => {
    expect(dashboard).toContain("const PAGES_TO_READ = 3;");
    expect(dashboard).toContain("truncated.value = firstPage.totalPages > PAGES_TO_READ;");
    expect(dashboard).toContain('v-if="truncated" class="admin-hint"');
  });

  it("follows the admin room and coalesces event bursts into one silent refresh", () => {
    expect(dashboard).toContain("client.socket.on(SOS_NEW_REQUEST_EVENT, scheduleLiveRefresh);");
    expect(dashboard).toContain("client.socket.on(MISSION_CANCELLED_BY_RESCUER_EVENT, scheduleLiveRefresh);");
    expect(dashboard).toContain("const LIVE_REFRESH_DELAY_MS = 1500;");
    expect(dashboard).toContain("void loadAll({ silent: true });");
    // A live refresh keeps the previous numbers on screen instead of flashing a skeleton.
    expect(dashboard).toContain("if (!options.silent) loading.value = true;");
  });

  it("tears the live socket down with the view", () => {
    expect(dashboard).toContain("  stopLive();");
    expect(dashboard).toContain("live?.close();");
    expect(dashboard).toContain('class="admin-live"');
    expect(dashboard).toContain("{{ liveConnected ? \"جریان زنده\" : \"اتصال زنده برقرار نیست\" }}");
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

  it("says so when the window only covers the newest slice of records", () => {
    // `MAX_PAGES` caps the fetched set; a report that silently analysed a slice would be a lie.
    expect(reports).toContain("const truncated = computed(");
    expect(reports).toContain("برای پوشش کامل، بازه یا فیلتر را محدودتر کنید.");
    expect(reports).toContain('v-if="truncated" class="report-truncation" role="status"');
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

  it("delegates member search to the tested picker instead of its own debounce", () => {
    // One debounce/abort implementation for the whole panel; the dialog only renders its result.
    expect(services).toContain("useCategoryMemberSearch(");
    expect(services).toContain('v-model="memberSearch"');
    expect(services).toContain('@update:model-value="queueSearch"');
    expect(services).not.toContain("searchTimer");
    expect(services).toContain("{{ isMember(user.id) ? \"عضو است\" : \"افزودن\" }}");
  });

  it("gives the group table a card list on phones instead of a 720px scroll", () => {
    expect(services).toContain('<ul class="groups-mobile" aria-label="گروه‌های امداد" role="list">');
    expect(services).toContain(".groups-mobile {");
    expect(services).toContain(".groups-mobile__card {");
    const phone = services.split("@media (max-width: 850px) {")[1]?.split("\n}")[0];
    expect(phone).toContain(".groups-table {");
    expect(phone).toContain("display: none;");
    expect(phone).toContain(".groups-mobile {");
    expect(phone).toContain("display: grid;");
  });

  it("shows the coverage gap the dispatch board depends on", () => {
    expect(services).toContain("const uncoveredTypes = computed(");
    expect(services).toContain('class="groups-summary__warn"');
  });
});
