import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source contract only: docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const source = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const guidance = source.slice(source.indexOf('class="user-map-view__journey-bar"'), source.indexOf('class="user-map-view__navigation-status"'));

describe("guidance screen-reader announcements", () => {
  it("keeps frequently changing distance visible but out of the live region", () => {
    expect(guidance).toContain('class="user-map-view__journey-label" :title="journeyBarLabel">{{ journeyBarLabel }}</span>');
    expect(guidance).toContain('<span class="sr-only" role="status" aria-live="polite">{{ journeyAnnouncement }}</span>');
    expect(source).toContain('navigationStatusAnnouncement({');
  });
});
