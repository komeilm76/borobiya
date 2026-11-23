import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { designTokenStylesheet, rescueColors } from "./tokens";

const files = [
  "components/mission/MissionLivePanel.vue", "components/mission/MissionTimelinePanel.vue",
  "components/mission/MissionRatingPanel.vue", "components/mission/MissionTracePanel.vue",
  "components/sos/SosTriggerButton.vue", "components/sos/SosRequestSheet.vue",
  "views/_user/UserSosHistoryView.vue", "views/_user/UserRescuerHistoryView.vue"
];
const styles = files.map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("<style scoped>")[1]!);

// The rescue slice is paint-only. Spacing/positioning/target sizing and the
// state-machine/route templates are intentionally not part of this palette.
describe("rescue presentation palette", () => {
  it("emits matching light/dark keys and wires every role to a consumer", () => {
    const output = designTokenStylesheet();
    expect(Object.keys(rescueColors.light)).toEqual(Object.keys(rescueColors.dark));
    for (const theme of ["light", "dark"] as const) {
      const rule = theme === "light" ? output.split(":root.dark {")[0]! : output.split(":root.dark {")[1]!;
      for (const [key, value] of Object.entries(rescueColors[theme])) {
        expect(rule, `${theme} ${key}`).toContain(`--bb-rescue-${key}: ${value}`);
        expect(styles.join("\n"), key).toContain(`var(--bb-rescue-${key})`);
      }
    }
  });

  it("retains legacy light treatments and dark overrides without raw paint literals", () => {
    expect(rescueColors.light.sosFabFill).toBe("linear-gradient(135deg, #dc2626 0%, #b91c1c 100%)");
    expect(rescueColors.dark.sosBadgeFill).toBe("#422b2b");
    expect(rescueColors.dark.historyRowSelected).toBe("var(--bb-color-primary)");
    expect(rescueColors.dark.timelineDot).toBe("var(--bb-color-primary)");
    expect(styles[0]).toContain("border: 1px solid var(--bb-rescue-livePanelEdge)");
    expect(styles[5]).toContain("border: 1.5px solid var(--bb-rescue-sosSeverityEdge)");
    expect(styles[6]).toContain("border: 1px solid var(--bb-rescue-historyRowEdge)");
    for (const style of styles) {
      // Configured Vuetify RGB variables are theme semantics, not new paint constants.
      const withoutVuetify = style.replaceAll(/rgba?\(var\(--v-theme-[^)]+\)(?:,\s*[\d.]+)?\)/g, "");
      expect(withoutVuetify).not.toMatch(/#[\da-f]{3,8}\b|rgba?\(/i);
      expect(style).not.toContain("solid border-color:");
    }
  });

  it("keeps SOS touch geometry and mission map dimensions local", () => {
    expect(styles[4]).toContain("width: 48px;");
    expect(styles[4]).toContain("height: 48px;");
    expect(styles[5]).toContain("min-width: 44px;");
    expect(styles[0]).toContain("min-height: 20rem;");
    expect(styles[3]).toContain("height: min(52dvh, 380px)");
  });
});
