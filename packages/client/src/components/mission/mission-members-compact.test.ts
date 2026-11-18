import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const css = styles[0]!.content;

// Source/compiled contracts; do not mount Vue SFCs in unit tests (docs/TASKS.md).
describe("compact mission member room", () => {
  it("shows each participant's freshness and presence together instead of duplicating rows of chips", () => {
    expect(source).toContain('class="live-panel__member-copy"');
    expect(source).toContain('class="live-panel__member-state"');
    expect(source).toContain('class="live-panel__member-presence"');
    expect(source).toContain('class="live-panel__connection"');
    expect(source).not.toContain('class="live-panel__presence-chips"');
    expect(source).toContain('<details v-if="fullscreen" class="live-panel__presence-details">');
    expect(source).toContain(':disabled="!member.fresh || !map"');
    expect(compileTemplate({ source: template!.content, filename: "MissionLivePanel.vue", id: "members" }).errors).toEqual([]);
  });
  it("keeps the room a bounded, scrollable map card with a sticky close action", () => {
    expect(css).toContain('width: min(24rem, calc(100vw - 1.5rem)); max-height: min(48dvh, 25rem);');
    expect(css).toContain('padding: .75rem; overflow-y: auto; overscroll-behavior: contain;');
    expect(css).toContain('.live-panel--fullscreen .live-panel__room-heading {\n  position: sticky;');
    expect(css).toContain('.live-panel--fullscreen .live-panel__member { flex-wrap: nowrap;');
    expect(css).toContain('max-height: min(48dvh, calc(100dvh - 19rem');
    expect(css).toContain('border: 1px solid var(--bb-color-outline); border-radius: var(--bb-radius-card, 24px);');
    expect(compileStyle({ source: css, filename: "MissionLivePanel.vue", id: "members", scoped: true }).errors).toEqual([]);
  });
});
