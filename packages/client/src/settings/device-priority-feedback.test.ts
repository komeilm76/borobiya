import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned view checks; do not mount Vue SFCs in unit tests.
const panel = readFileSync(new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url), "utf8");
const view = readFileSync(new URL("../views/_user/UserDevicesView.vue", import.meta.url), "utf8");
const termination = readFileSync(new URL("./device-termination.ts", import.meta.url), "utf8");

describe("active-device read feedback", () => {
  it("binds the panel to the account identity and does not claim a device count for an unresolved read", () => {
    expect(view).toContain("accountId: computed(() => auth.user?.id ?? null)");
    expect(view).toContain("auth.isAuthenticated && settings.loaded.value && !settings.failed.value && !settings.loading.value");
  });

  it("shows a first-load skeleton for sessions and retains rows with a refresh indicator", () => {
    expect(panel.match(/v-skeleton-loader/g)).toHaveLength(1);
    expect(panel).toContain('v-if="api.loading.value && !api.loaded.value"');
    expect(panel).toContain('v-if="api.loading.value && api.loaded.value"');
    expect(panel).toContain('<span>در حال خواندن دستگاه‌ها…</span>');
    expect(panel.match(/class="device-priority__skeleton" role="status"/g)).toHaveLength(1);
    expect(panel.match(/aria-hidden="true"/g)).toHaveLength(2); // Session icon + skeleton.
  });

  it("explains stale, disabled session rows before they appear and keeps the IP caveat close to IP", () => {
    const staleWarning = 'v-if="api.failed.value && api.deviceRows.value.length"';
    expect(panel.split(staleWarning)).toHaveLength(2); // Announce it once, ahead of the rows.
    expect(panel.indexOf(staleWarning)).toBeLessThan(panel.indexOf('<ul v-else-if="api.deviceRows.value.length"'));
    expect(panel).toContain("نشست‌های زیر ممکن است دیگر فعال نباشند");
    expect(panel).toContain("IP محل دقیق ورود را نشان نمی‌دهد.");
    expect(view).not.toContain("IP نشان‌دهندهٔ محل دقیق ورود نیست");
    expect(view).toContain('to="/_user/location-shares"');
  });

  it("never claims no sessions on a failed or still-running read and keeps a manual retry", () => {
    expect(panel).toContain('v-else-if="api.loading.value"');
    expect(panel).toContain('v-else-if="api.failed.value"');
    expect(panel).toContain('v-else class="device-priority__hint"');
    expect(panel).toContain('@click="api.refresh()"');
    expect(panel).toContain('role="alert"');
    expect(panel).toContain(':disabled="api.loading.value || api.failed.value || terminating"');
    expect(panel).toContain('useDeviceTermination({');
    expect(termination).toContain('if (row.isCurrent || options.failed.value || options.loading.value || terminating.value || disposed) return;');
  });
});
