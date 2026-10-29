import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");

describe("rescuer mission progress announcements (no Vue SFC mount)", () => {
  it("exposes the current step semantically and announces confirmed status changes", () => {
    expect(view).toMatch(/<v-chip[^>]*role="status"[^>]*aria-live="polite"[\s\S]*?\{\{ currentStatusLabel \}\}/);
    expect(view).toMatch(/<div v-for="\(step, index\) in steps"[\s\S]*?:aria-current="index === activeStep \? 'step' : undefined"[^>]*role="listitem"/);
    expect(view).toContain('aria-label="مراحل مأموریت"');
    expect(view).toContain(':disabled="!desk.canAdvance.value"');
  });
});
