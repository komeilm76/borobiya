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
  it("makes the entire fresh, authorized role row the map-focus target", () => {
    expect(panel).toContain('type="button" class="live-panel__member"');
    expect(panel).toContain(':disabled="!member.fresh || !member.entry || !map || !visible"');
    expect(panel).toContain('@click="focusMember(member.role)"');
    expect(panel).toContain('freshMissionMemberCamera(live.participantStatus.value, role)');
    expect(panel).toContain('cameraIntent.noteGesture();');
    expect(panel).toContain('emit("camera-selected");');
    expect(panel).toContain('if (!props.visible || !center || !map.value) return;');
    expect(panel).toContain('map.value.easeTo({ center, zoom: 15, duration: 350 });');
    expect(panel).toContain('if (props.fullscreen) emit("close-room"); // The sheet otherwise covers the centered marker on phones.');
    expect(panel).toContain('if (props.fullscreen) emit("close-room"); // Reveal the points rather than covering them with the sheet.');
    expect(panel).toContain('role="region" aria-label="اعضای مأموریت"');
    expect(panel).toContain('v-if="!fullscreen && isAdmin" class="live-panel__privacy"');
  });
  it("frames all and only fresh authorized members via a small header control", () => {
    expect(panel).toContain('icon="mdi-fit-to-screen" size="small" variant="tonal"');
    expect(panel).toContain('aria-label="نمایش همهٔ اعضای دارای موقعیت تازه روی نقشه"');
    expect(panel).toContain(':disabled="!hasFreshMembers || !map || !visible" @click="focusMembers(true)"');
    expect(panel).toContain('.filter((member) => member.fresh && member.entry).map((member) => member.entry!)');
    expect(panel).toContain('if (!props.visible || !map.value) return;');
    expect(panel).toContain('cameraIntent.noteGesture(); // Explicit framing must not be stolen by later GPS/peer updates.');
    expect(panel).toContain('emit("camera-selected"); // Preserve this explicit view against GPS follow.');
    expect(panel).toContain('if (props.fullscreen) emit("close-room"); // Reveal the points rather than covering them with the sheet.');
  });
  it("has accessible tap targets and legible role avatars in light and dark modes", () => {
    const css = parse(panel).descriptor.styles[0]!.content;
    const compiled = compileStyle({ source: css, filename: "MissionLivePanel.vue", id: "data-v-member-focus", scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(css).toContain('min-height: 52px; gap: .65rem;');
    expect(css).toContain('.live-panel__member-list:focus-visible, .live-panel__member:focus-visible');
    expect(css).toContain('border: 1px solid var(--bb-color-outline);');
    expect(css).toContain(':global(:root.dark .live-panel__member:not(:disabled):hover)');
  });
});
