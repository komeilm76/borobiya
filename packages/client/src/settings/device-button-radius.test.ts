import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { radii } from "../styles/tokens";

const view = readFileSync(new URL("../views/_user/UserDevicesView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url), "utf8");

describe("device settings button corners", () => {
  it("uses the shared nested radius for this page's text actions and confirmation", () => {
    expect(radii.nested).toBe(16);
    expect(view).toMatch(/\.user-devices__shares-link \{[^}]*border-radius: var\(--bb-radius-nested, 16px\);/);
    for (const selector of [
      ".device-priority__header > .v-btn",
      ".device-priority__session > .v-btn",
      ".device-priority__confirm-actions :deep(.v-btn)"
    ]) {
      expect(panel).toContain(`${selector} {`);
      expect(panel.split(`${selector} {`)[1]?.split("}")[0]).toContain("border-radius: var(--bb-radius-nested, 16px);");
    }
    expect(view).toContain('class="user-devices__back"'); // Keep the icon action circular.
    expect(view).not.toMatch(/\.user-devices__back\s*\{[^}]*border-radius:/);
  });
});
