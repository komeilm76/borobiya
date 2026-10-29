import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");

describe("mission live panel in narrow desktop sidebars (no Vue mount)", () => {
  it("stacks its map and members by available panel width, not viewport width", () => {
    expect(source).toMatch(/\.live-panel \{[^}]*container-type: inline-size;/);
    expect(source).toContain('@container (max-width: 720px) { .live-panel__grid { grid-template-columns: minmax(0,1fr); } }');
    expect(source).toContain('@container (max-width: 599px) {');
    expect(source).not.toContain('@media(max-width:720px) { .live-panel__grid');
  });
});
