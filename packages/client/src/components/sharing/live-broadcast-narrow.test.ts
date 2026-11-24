import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeBroadcastState } from "@/live/broadcast-status";

const bar = readFileSync(new URL("./LiveBroadcastBar.vue", import.meta.url), "utf8");
const map = readFileSync(new URL("../../views/_user/UserMapView.vue", import.meta.url), "utf8");
const sharing = readFileSync(new URL("../../views/_user/UserLocationSharesView.vue", import.meta.url), "utf8");

describe("broadcast controls in a narrow host / zoomed viewport (source-pinned)", () => {
  it("keeps the companion dialog button-free and avoids restoring the broadcast bar on the shares page", () => {
    expect(map).not.toContain("<LiveBroadcastBar"); // Map sharing stays on the icon outside Companions.
    expect(sharing).not.toContain("<LiveBroadcastBar");
    expect(bar).toMatch(/\.broadcast-bar \{[^}]*container-type: inline-size;/);
    // At 200% zoom a 320px CSS viewport can be only ~160px; the old 12rem
    // minimum copy width (192 CSS px) cannot fit before card padding/actions.
    expect(12 * 16).toBeGreaterThan(320 / 2);
    const narrow = bar.slice(bar.indexOf("@container (max-width: 380px)"));
    expect(narrow).toContain("grid-template-columns: auto minmax(0, 1fr);");
    expect(narrow).toMatch(/\.broadcast-bar__copy \{[^}]*min-width: 0;/);
    expect(narrow).not.toContain(".broadcast-bar__actions");
  });

  it("keeps status legible without offering a manual action", () => {
    const unsupported = describeBroadcastState({
      status: "idle", lastErrorCode: null, peerCount: 0, isSupported: false,
      priority: { hasMultipleDevices: true, broadcastingCount: 0, ignoredCount: 0, hasShares: false }
    });
    expect(unsupported.headline).toBeTruthy();
    expect(bar).not.toContain('@click="broadcast.toggle()"');
    expect(bar).toContain('role="status" aria-live="polite"');
  });
});
