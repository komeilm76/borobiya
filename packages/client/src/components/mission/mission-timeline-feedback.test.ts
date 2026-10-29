import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const panel = readFileSync(new URL("./MissionTimelinePanel.vue", import.meta.url), "utf8");

describe("mission timeline refresh feedback (source-pinned, no SFC mount)", () => {
  it("identifies retained rows as last-known after a failed refresh and offers in-context retry", () => {
    expect(panel).toContain('v-if="timeline.error.value && timeline.entries.value.length"');
    expect(panel).toContain("آخرین خواندن موفق");
    expect(panel).toMatch(/v-if="timeline.error.value && timeline.entries.value.length"[\s\S]*?@click="timeline.load\(\)"/);
    expect(panel).toContain('v-else-if="!timeline.loading.value && !timeline.error.value"');
  });
});
