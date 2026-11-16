import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("../../components/mission/MissionStatusPanel.vue", import.meta.url), "utf8");

describe("rescuer mission progress announcements (no Vue SFC mount)", () => {
  it("exposes the current step semantically and announces confirmed status changes", () => {
    expect(view).toMatch(/<v-chip[^>]*role="status"[^>]*aria-live="polite"[\s\S]*?\{\{ currentStatusLabel \}\}/);
    expect(view).toContain('<ol class="mission-desk__phase-steps" aria-label="پیشرفت مأموریت">');
    expect(view).toMatch(/<li v-for="\(step, index\) in steps"[\s\S]*?:aria-current="index === activeStep \? 'step' : undefined"/);
    expect(view.match(/v-for="\(step, index\) in steps"/g)).toHaveLength(1);
    expect(view).toContain(':disabled="!desk.canAdvance.value"');
  });
});
