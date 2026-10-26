import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source-pinned view checks; do not mount Vue SFCs in unit tests.
const panel = readFileSync(new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url), "utf8");

describe("active-device read feedback", () => {
  it("shows a first-load skeleton for both sources and retains rows with a refresh indicator", () => {
    expect(panel.match(/v-skeleton-loader/g)).toHaveLength(2);
    expect(panel).toContain('v-if="api.loading.value && !api.loaded.value"');
    expect(panel).toContain('v-if="api.loading.value && api.loaded.value"');
    expect(panel).toContain('<span>در حال خواندن دستگاه‌ها…</span>');
    expect(panel).toContain('<span>در حال خواندن اشتراک‌ها…</span>');
    expect(panel.match(/class="device-priority__skeleton" role="status"/g)).toHaveLength(2);
    expect(panel.match(/aria-hidden="true"/g)).toHaveLength(2);
  });

  it("never claims no shares on a failed or still-running read and keeps a manual retry", () => {
    expect(panel).toContain('v-else-if="api.loading.value"');
    expect(panel).toContain('v-else-if="api.failed.value"');
    expect(panel).toContain('v-else class="device-priority__hint"');
    expect(panel).toContain('@click="api.refresh()"');
    expect(panel).toContain('role="alert"');
    expect(panel).toContain(':disabled="api.loading.value || api.failed.value"');
    expect(panel).toContain('|| props.api.loading.value || props.api.failed.value) return false;');
  });
});
