import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { designTokenStylesheet, radii } from "../styles/tokens";

const view = readFileSync(new URL("../views/_user/UserDevicesView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("../components/settings/DevicePriorityPanel.vue", import.meta.url), "utf8");
const globalCss = readFileSync(new URL("../styles/tailwind.css", import.meta.url), "utf8");

describe("configurable button corners", () => {
  it("emits editable normal and compact button radii from the shared design configuration", () => {
    const stylesheet = designTokenStylesheet();
    expect(radii.button).toBe(12);
    expect(radii["button-compact"]).toBe(8);
    expect(stylesheet).toContain(`--bb-radius-button: ${radii.button}px`);
    expect(stylesheet).toContain(`--bb-radius-button-compact: ${radii["button-compact"]}px`);
    expect(globalCss).toContain("border-radius: var(--bb-radius-button, 12px);");
    expect(globalCss).toContain("border-radius: var(--bb-radius-button-compact, 8px);");
    expect(globalCss).toContain(":is(.v-application, .v-overlay-container) .v-btn");
    expect(globalCss).toContain(':not(.v-btn--icon):not(.v-btn--tile):not([class*="rounded-"])');
  });

  it("uses the normal config for larger page and dialog actions without rounding the icon", () => {
    expect(view).not.toMatch(/\.user-devices__shares-link\s*\{[^}]*border-radius:/);
    expect(panel).not.toContain(".device-priority__header > .v-btn { border-radius:");
    for (const selector of [".device-priority__session > .v-btn", ".device-priority__confirm-actions :deep(.v-btn)"]) {
      expect(panel.split(`${selector} {`)[1]?.split("}")[0]).toContain("border-radius: var(--bb-radius-button, 12px);");
    }
    expect(view).toContain('class="user-devices__back"');
    expect(view).not.toMatch(/\.user-devices__back\s*\{[^}]*border-radius:/);
  });
});
