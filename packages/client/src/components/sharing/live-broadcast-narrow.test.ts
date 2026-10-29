import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeBroadcastState } from "@/live/broadcast-status";

const bar = readFileSync(new URL("./LiveBroadcastBar.vue", import.meta.url), "utf8");
const map = readFileSync(new URL("../../views/_user/UserMapView.vue", import.meta.url), "utf8");
const dashboard = readFileSync(new URL("../../views/_user/UserDashboardView.vue", import.meta.url), "utf8");

describe("broadcast controls in a narrow host / zoomed viewport (source-pinned)", () => {
  it("uses the available card width rather than the global viewport for compact and inset bars", () => {
    expect(map).toContain("<LiveBroadcastBar compact />");
    expect(dashboard).toContain("<LiveBroadcastBar inset />");
    expect(bar).toMatch(/\.broadcast-bar \{[^}]*container-type: inline-size;/);
    // At 200% zoom a 320px CSS viewport can be only ~160px; the old 12rem
    // minimum copy width (192 CSS px) cannot fit before card padding/actions.
    expect(12 * 16).toBeGreaterThan(320 / 2);
    const narrow = bar.slice(bar.indexOf("@container (max-width: 380px)"));
    expect(narrow).toContain("grid-template-columns: auto minmax(0, 1fr);");
    expect(narrow).toMatch(/\.broadcast-bar__copy \{[^}]*min-width: 0;/);
    expect(narrow).toMatch(/\.broadcast-bar__actions \{[^}]*grid-column: 1 \/ -1;[^}]*width: 100%;/);
  });

  it("keeps both device and toggle actions reachable with wrapping 44px targets in all status states", () => {
    const unsupported = describeBroadcastState({
      status: "idle", lastErrorCode: null, peerCount: 0, isSupported: false,
      priority: { hasMultipleDevices: true, broadcastingCount: 0, ignoredCount: 0, hasShares: false }
    });
    expect(unsupported.showDevicesLink).toBe(true);
    expect(unsupported.actionLabel.length).toBeGreaterThan(20);
    expect(bar).toContain('v-if="state.showDevicesLink"');
    expect(bar).toContain('@click="broadcast.toggle()"');
    expect(bar).toContain(':disabled="!broadcast.isSupported"');
    const narrow = bar.slice(bar.indexOf("@container (max-width: 380px)"));
    expect(narrow).toMatch(/\.broadcast-bar__actions :deep\(\.v-btn\) \{[^}]*flex: 1 1 100%;[^}]*min-width: 0;[^}]*min-height: 44px;[^}]*height: auto;/);
    expect(narrow).toMatch(/\.broadcast-bar__actions :deep\(\.v-btn__content\) \{[^}]*white-space: normal;[^}]*overflow-wrap: anywhere;/);
  });
});
