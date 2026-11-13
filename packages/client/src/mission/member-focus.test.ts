import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";
import { freshMissionMemberCamera } from "./member-focus";

const panel = readFileSync(new URL("../components/mission/MissionLivePanel.vue", import.meta.url), "utf8");

// Pure decision and source-pinned UI: never mount a Vue SFC in unit tests.
describe("full-screen mission member focus", () => {
  const statuses = [
    { role: "requester", entry: { lon: 51.4, lat: 35.7 }, fresh: true },
    { role: "rescuer", entry: { lon: 51.5, lat: 35.8 }, fresh: false },
    { role: "admin", entry: null, fresh: false }
  ] as const;
  it("centers only a currently fresh shared fix, not an old, missing, or withdrawn location", () => {
    expect(freshMissionMemberCamera(statuses, "requester")).toEqual([51.4, 35.7]);
    expect(freshMissionMemberCamera(statuses, "rescuer")).toBeNull();
    expect(freshMissionMemberCamera(statuses, "admin")).toBeNull();
    expect(freshMissionMemberCamera([], "requester")).toBeNull();
    expect(freshMissionMemberCamera([{ role: "requester", entry: null, fresh: true }], "requester")).toBeNull();
    expect(freshMissionMemberCamera(statuses, "requester")).toEqual([51.4, 35.7]);
  });
  it("leaves the map mounted and a single role action adjacent to its freshness label", () => {
    expect(panel).toContain('v-if="fullscreen" icon="mdi-crosshairs-gps"');
    expect(panel).toContain(':disabled="!member.fresh || !map"');
    expect(panel).toContain('@click="focusMember(member.role)"');
    expect(panel).toContain('freshMissionMemberCamera(live.participantStatus.value, role)');
    expect(panel).toContain('cameraIntent.noteGesture();');
    expect(panel).toContain('emit("camera-selected");');
    expect(panel).toContain('if (!center || !map.value) return;');
    expect(panel).toContain('if (props.fullscreen) emit("close-room"); // The sheet otherwise covers the centered marker on phones.');
    expect(panel).toContain('if (props.fullscreen) emit("close-room"); // Reveal the points rather than covering them with the sheet.');
    expect(panel).toContain('v-if="fullscreen" class="live-panel__presence-details"');
    expect(panel).toContain('v-if="fullscreen" class="live-panel__presence-chips" role="status"');
    expect(panel.indexOf('v-for="member in live.participantStatus.value"')).toBeLessThan(panel.indexOf('class="live-panel__presence-chips"'));
    expect(panel.indexOf('class="live-panel__presence-chips"')).toBeLessThan(panel.indexOf('class="live-panel__presence-details"'));
    expect(panel).toContain('موقعیت قدیمی برای راهبری مناسب نیست');
    expect(panel).toContain('role="region" aria-label="اعضا و اشتراک موقعیت مأموریت"');
    expect(panel).toContain('v-else-if="canPublish"'); // Embedded requester/admin sharing remains voluntary.
  });
  it("uses accessible tap targets and legible inset rows in light and dark modes", () => {
    const css = parse(panel).descriptor.styles[0]!.content;
    const compiled = compileStyle({ source: css, filename: "MissionLivePanel.vue", id: "data-v-member-focus", scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(css).toContain('.live-panel__member :deep(.v-btn)');
    expect(css).toContain('min-width: 44px; height: 44px;');
    expect(css).toContain('.live-panel__member :deep(.v-btn:focus-visible)');
    expect(css).toContain('background: var(--bb-color-inset);');
    expect(css).toContain('border: 1px solid var(--bb-color-outline);');
  });
});
