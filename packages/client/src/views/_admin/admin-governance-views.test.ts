import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned structure only: repo convention forbids mounting Vue SFCs in unit tests.
const audit = readFileSync(new URL("./AdminAuditView.vue", import.meta.url), "utf8");
const alerts = readFileSync(new URL("./AdminAlertsView.vue", import.meta.url), "utf8");
const settings = readFileSync(new URL("./AdminSettingsView.vue", import.meta.url), "utf8");

describe("audit trail view", () => {
  it("covers the four states before rendering the table", () => {
    const template = audit.slice(0, audit.indexOf("<script"));
    expect(template).toContain('v-if="state === \'loading\'"');
    expect(template).toContain('v-else-if="state === \'forbidden\'"');
    expect(template).toContain('v-else-if="state === \'error\'"');
    expect(template).toContain('state="empty"');
    expect(template.indexOf('state="empty"')).toBeLessThan(template.indexOf("audit-card__scroll"));
  });

  it("filters server-side and resets to the first page when the filter changes", () => {
    expect(audit).toContain("function applyFilters(): void {");
    expect(audit).toContain("  page.value = 1;\n  void load();");
    expect(audit).toContain("targetType: targetType.value === \"\" ? undefined : targetType.value");
  });

  it("exports exactly what is on screen, quoted for CSV", () => {
    expect(audit).toContain("function csvCell(value: string): string {");
    expect(audit).toContain("return /[\",\\n]/.test(value)");
    expect(audit).toContain("const rows = entries.value.map((entry) => [");
    expect(audit).toContain("new Blob([`\\uFEFF${csv}`]");
  });

  it("offers a card layout instead of a horizontally scrolling table on phones", () => {
    expect(audit).toContain('<ul class="audit-mobile" aria-label="رویدادها" role="list">');
    expect(audit).toContain(".audit-card__scroll {\n    display: none;\n  }");
  });
});

describe("alerts queue view", () => {
  it("opens on the unresolved queue and can switch to resolved or all", () => {
    expect(alerts).toContain('const filter = ref<Filter>("open");');
    expect(alerts).toContain('resolved: filter.value === "all" ? undefined : filter.value === "resolved"');
    expect((alerts.match(/value: "(open|resolved|all)", label:/g) ?? []).length).toBe(3);
  });

  it("links an alert to the dispatch board by its SOS request", () => {
    expect(alerts).toContain(':to="{ path: \'/_admin/dispatch\', query: { request: alert.sosRequestId } }"');
  });

  it("resolves in place and keeps the row out of the open filter", () => {
    expect(alerts).toContain("alerts.value = alerts.value.map((item) => (item.id === updated.id ? updated : item));");
    expect(alerts).toContain('alerts.value = alerts.value.filter((item) => item.resolvedAt === null);');
    expect(alerts).toContain(":disabled=\"resolvingId !== null\"");
  });

  it("moves the counters and the page with a resolved row instead of lying about them", () => {
    expect(alerts).toContain("total.value = Math.max(0, total.value - 1);");
    expect(alerts).toContain("totalPages.value = Math.max(1, Math.ceil(total.value / PAGE_SIZE));");
    expect(alerts).toContain("if (alerts.value.length === 0 && page.value > 1) {");
  });

  it("refreshes the session before the write, not only before the read", () => {
    // A queue left open past the access token's 15 minutes used to answer every resolve with a 401.
    expect(alerts).toContain("const accessToken = await adminSessionToken(auth);");
    expect(alerts).toContain("نشست مدیر منقضی شده است؛ دوباره وارد شوید.");
  });

  it("reports failures without losing the queue", () => {
    expect(alerts).toContain("snackbarText.value = friendlyErrorMessage(caught, \"ثبت بررسی ناموفق بود.\");");
    expect(alerts).toContain(":reference=\"errorReference\"");
  });
});

describe("settings view", () => {
  it("edits only the keys the server reads back", () => {
    expect(settings).toContain('key: "alerts.cancellation_daily_threshold"');
    expect(settings).toContain('key: "alerts.other_reason_notify"');
    expect(settings).toContain('suffix: "لغو"');
  });

  it("saves a number only when it differs and reverts a failed switch", () => {
    expect(settings).toContain("function isNumberDirty(key: AdminSettingKey): boolean {");
    expect(settings).toContain(":disabled=\"!isNumberDirty(row.key)\"");
    expect(settings).toContain("if (!saved) settings.value = new Map(settings.value).set(key, previous);");
  });

  it("keeps the counters a separate failure from the editable values", () => {
    expect(settings).toContain("// The counters are supplementary: a failure here must not blank out editable settings.");
    expect(settings).toContain("statsState.value = \"error\";");
    expect(settings).toContain("v-if=\"statsState === 'error'\"");
  });

  it("refreshes the session before writing a setting or reading the counters", () => {
    // Both used to read `auth.accessToken` directly: saving worked until the token expired, then silently
    // reported a failed write.
    expect((settings.match(/await adminSessionToken\(auth\)/g) ?? []).length).toBe(2);
    expect(settings).not.toContain("const accessToken = auth.accessToken;\n  if (!accessToken) return false;");
  });

  it("passes the request-time token, never a stale one, into the API module", () => {
    const persist = settings.slice(settings.indexOf("async function persist("), settings.indexOf("async function saveNumber("));
    expect(persist.indexOf("adminSessionToken(auth)")).toBeLessThan(persist.indexOf("updateAdminSetting(accessToken"));
  });

  it("names who changed a value and when", () => {
    expect(settings).toContain("<small v-if=\"row.updatedAt\">آخرین تغییر: {{ dateOf(row.updatedAt) }} — {{ row.updatedBy ?? \"نامشخص\" }}</small>");
    expect(settings).toContain("settingsMeta[key] = updated;");
  });
});
