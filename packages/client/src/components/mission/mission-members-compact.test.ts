import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const css = styles[0]!.content;

// Source/compiled contracts; do not mount Vue SFCs in unit tests (docs/TASKS.md).
describe("compact mission member profiles", () => {
  it("keeps only role profiles in the room, and moves consent, recovery and presence elsewhere", () => {
    const card = source.slice(source.indexOf('class="live-panel__members"'), source.indexOf('<v-alert v-if="fullscreen && live.error.value"'));
    expect(card).toContain('class="live-panel__member-list"');
    expect(card).toContain('v-for="member in live.participantStatus.value"');
    expect(card).toContain('class="live-panel__avatar"');
    expect(card).toContain('class="live-panel__member-copy"');
    expect(card).toContain('new Date(member.entry.timestamp).toLocaleTimeString(\'fa-IR\')');
    expect(card).toContain('aria-label="بستن پنل اعضای مأموریت"');
    expect(card).not.toContain('live.startSharing()');
    expect(card).not.toContain('locationPolicy');
    expect(card).not.toContain('presence.requester');
    expect(source).toContain('v-if="!fullscreen && isAdmin" class="live-panel__privacy"');
    expect(source).toContain('v-if="!fullscreen && isAdmin && policyError"');
    expect(source).toContain('v-if="fullscreen && live.error.value"');
    expect(source).toContain('v-if="!fullscreen && !isAdmin"');
    expect(compileTemplate({ source: template!.content, filename: "MissionLivePanel.vue", id: "members" }).errors).toEqual([]);
  });
  it("scrolls only the inner keyboard-reachable list, never the compact outer card", () => {
    expect(css).toContain('width: min(18rem, calc(100vw - 1.5rem)); max-height: min(15.5rem, 42dvh);');
    expect(css).toContain('.live-panel__member-list { list-style: none;');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain; scrollbar-gutter: stable;');
    expect(css).toContain('overflow: hidden; backdrop-filter: blur(12px);');
    expect(source).toContain('aria-label="فهرست اعضای مأموریت" tabindex="0"');
    expect(css).toContain('.live-panel__member-list:focus-visible, .live-panel__member:focus-visible');
    expect(css).toContain('top: calc(.75rem + env(safe-area-inset-top, 0px));');
    expect(css).toContain('bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));');
    expect(compileStyle({ source: css, filename: "MissionLivePanel.vue", id: "members", scoped: true }).errors).toEqual([]);
  });
});
