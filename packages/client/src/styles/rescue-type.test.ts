import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { designTokenStylesheet, rescueType } from "./tokens";

const sources = [
  "views/_user/UserSosHistoryView.vue", "views/_user/UserRescuerHistoryView.vue",
  "components/sos/SosRequestSheet.vue", "components/mission/MissionTimelinePanel.vue",
  "components/mission/MissionRatingPanel.vue", "components/mission/MissionLivePanel.vue",
  "components/mission/MissionTracePanel.vue", "components/mission/MissionBriefDetails.vue",
  "components/mission/MissionMapCards.vue", "components/mission/MissionStatusPanel.vue"
].map((file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8").split("<style scoped>")[1]!);
const combined = sources.join("\n");

describe("rescue flow type scale", () => {
  it("emits each semantic size, weight, leading and tracking role and connects it to CSS", () => {
    const sheet = designTokenStylesheet();
    for (const [family, values] of [
      ["font", rescueType.sizes], ["weight", rescueType.weights],
      ["leading", rescueType.leading], ["tracking", rescueType.tracking]
    ] as const) {
      for (const [key, value] of Object.entries(values)) {
        expect(sheet, `${family} ${key}`).toContain(`--bb-rescue-${family}-${key}: ${value}`);
        expect(combined, `${family} ${key}`).toContain(`var(--bb-rescue-${family}-${key})`);
      }
    }
  });

  it("preserves distinct headline caps, readable small text and existing SOS touch geometry", () => {
    expect(rescueType.sizes.requesterHero).toBe("clamp(1.55rem,2.5vw,2.2rem)");
    expect(rescueType.sizes.rescuerHero).toBe("clamp(1.55rem,2.5vw,2.15rem)");
    expect(rescueType.sizes.tiny).toBe("0.8rem");
    expect(rescueType.sizes.caption).toBe("0.82rem");
    expect(sources[0]).toContain("font-size: var(--bb-rescue-font-requesterHero)");
    expect(sources[1]).toContain("font-size: var(--bb-rescue-font-rescuerHero)");
    expect(sources[2]).toContain("min-width: 44px;");
    expect(sources[2]).toContain("height: 15.5rem;");
    expect(sources[4]).toContain("width: 48px; height: 48px;");
  });
});
