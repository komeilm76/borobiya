import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Source contract only: docs/TASKS.md prohibits mounting Vue SFCs in unit tests.
const panel = readFileSync(new URL("./OwnPositionBar.vue", import.meta.url), "utf8");

describe("private map position accessibility", () => {
  it("keeps coordinates visible on demand but does not announce every GPS fix", () => {
    const visible = panel.match(/<p class="own-position__detail"[^>]*>[\s\S]*?<\/p>/)?.[0];
    expect(visible).toContain("ownPositionLabel(api.position.value, api.active.value, api.error.value)");
    expect(visible).not.toMatch(/role="status"|aria-live=/);
    const announcement = panel.match(/<p class="sr-only"[^>]*>[\s\S]*?<\/p>/)?.[0];
    expect(announcement).toContain('role="status"');
    expect(announcement).toContain('aria-atomic="true"');
    expect(announcement).toContain("ownPositionAnnouncement(api.position.value, api.active.value, api.error.value, ready)");
  });
});
