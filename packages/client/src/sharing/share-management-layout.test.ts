import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source contracts only. docs/TASKS.md prohibits mounting Vue components in unit tests.
const shares = readFileSync(new URL("../components/sharing/ShareLists.vue", import.meta.url), "utf8");
const devices = readFileSync(new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url), "utf8");
const shareView = readFileSync(new URL("../views/_user/UserLocationSharesView.vue", import.meta.url), "utf8");
const deviceView = readFileSync(new URL("../views/_user/UserDevicesView.vue", import.meta.url), "utf8");

describe("share and signed-in device management layout", () => {
  it("separates outgoing and incoming lists without hiding owned history or received playback", () => {
    expect(shares).toContain('<v-tabs v-model="activeTab"');
    expect(shares).toContain('v-if="activeTab === \'owned\'"');
    expect(shares).toContain('v-if="activeTab === \'received\'"');
    expect(shares).toContain("activeTab === 'owned' && historyRows.length > 0");
    expect(shares).toContain('receivedHistoryRows');
    expect(shares).toContain('historyShare: row.id');
  });

  it("edits each owner's pin alongside that person, not alongside account sessions", () => {
    expect(shares).toContain('deviceSettings.choicesFor(row.share)');
    expect(shares).toContain('deviceSettings.assign(row.id, choice)');
    expect(shares).toContain('deviceSettings.assignCurrentDevice()');
    expect(shares).toContain(':disabled="!canApplyDevice(row)"');
    expect(shares).toContain('row.kind !== "expired"');
    expect(shareView).toContain(':device-settings="deviceSettings"');
    expect(devices).not.toContain('api.assign(');
    expect(deviceView).toContain('includeShares: false');
  });

  it("confirms a remote termination, warns about broadcast interruption and refuses stale writes", () => {
    expect(devices).toContain('v-dialog v-model="confirmOpen"');
    expect(devices).toContain('row.isCurrent || api.failed.value || api.loading.value || terminating.value');
    expect(devices).toContain('device.isCurrentDevice');
    expect(devices).toContain('revokeUserDevice(device.id, token)');
    expect(devices).toContain('identity !== session() || disposed');
    expect(devices).toContain('اگر این دستگاه موقعیت اشتراکی را پخش می‌کند');
    expect(devices).toContain('role="status" aria-live="polite"');
  });
});
