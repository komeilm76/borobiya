import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");
const cards = readFileSync(new URL("../../components/mission/MissionMapCards.vue", import.meta.url), "utf8");

describe("rescuer mission progress announcements (no Vue SFC mount)", () => {
  it("exposes the current step semantically and announces confirmed status changes", () => {
    expect(view).toMatch(/<span role="status" aria-live="polite">\{\{ currentStatusLabel \}\}<\/span>/);
    expect(cards).toContain('<ol class="mission-desk__phase-steps" aria-label="پیشرفت مأموریت">');
    expect(cards).toMatch(/<li v-for="\(step, index\) in steps"[\s\S]*?:aria-current="index === activeStep \? 'step' : undefined"/);
    expect(cards.match(/v-for="\(step, index\) in steps"/g)).toHaveLength(1);
    expect(cards).toContain(':disabled="!desk.canAdvance.value"');
  });
});
