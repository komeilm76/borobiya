import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const canvas = readFileSync(new URL("../map/MapCanvas.vue", import.meta.url), "utf8");
const companionMap = readFileSync(new URL("../../views/_user/UserMapView.vue", import.meta.url), "utf8");
const missionMap = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const room = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");

// Source-pinned wiring; never mount Vue SFCs in unit tests (docs/TASKS.md).
describe("mission map controls", () => {
  it("keeps the shared MapCanvas compass while removing impractical +/- on full-screen and idle mission maps", () => {
    expect(companionMap).toContain(':show-zoom="false"');
    expect(missionMap).toContain(':constrain-bounds="false" :show-zoom="false" compass-action aria-label="نقشهٔ عمومی؛ مأموریت فعالی ندارید"');
    expect(room).toContain(':constrain-bounds="false" :show-zoom="!fullscreen"');
    expect(canvas).toContain('showCompass: true,');
    expect(canvas).toContain('showZoom: props.showZoom,');
    expect(room).toContain(':compass-action="fullscreen"');
  });
  it("shares the map-page action paint with the rescuer compass, without changing embedded requester/admin controls", () => {
    const sharedStyle = parse(canvas).descriptor.styles[0]!.content;
    const compiled = compileStyle({ filename: "MapCanvas.vue", id: "data-v-mission-compass", scoped: true, source: sharedStyle });
    expect(compiled.errors).toEqual([]);
    expect(canvas).toContain("'map-canvas--action-compass': compassAction");
    expect(companionMap).toContain(':show-zoom="false" compass-action');
    expect(missionMap).toContain(':show-zoom="false" compass-action');
    expect(room).toContain(':show-zoom="!fullscreen"');
    expect(room).toContain(':compass-action="fullscreen"');
    expect(sharedStyle).toContain('.map-canvas--action-compass :deep(.maplibregl-ctrl-top-right .maplibregl-ctrl-compass)');
    expect(sharedStyle).toContain('width: 48px;\n  height: 48px;');
    expect(sharedStyle).toContain("fill='%23ffffff'");
    expect(sharedStyle).toContain("fill='%23f4c06a'");
    expect(sharedStyle).toContain("fill='%23111c1d'");
    expect(sharedStyle).toContain("fill='%23315555'");
    expect(sharedStyle).toContain('.maplibregl-ctrl-compass:hover');
    expect(sharedStyle).toContain('.maplibregl-ctrl-compass:focus-visible');
    expect(sharedStyle).toContain('@media (forced-colors: active)');
    expect(compiled.code).toContain('.map-canvas--action-compass[data-v-mission-compass] .maplibregl-ctrl-top-right .maplibregl-ctrl-compass');
    expect(sharedStyle).toContain('.map-canvas:not(.map-canvas--action-compass) .maplibregl-ctrl-icon');
    expect(canvas).toContain('showCompass: true');
    expect(canvas).toContain('visualizePitch: true');
  });
  it("keeps the physical-left mission rail beside camera actions, below sheets and above the safe-area dock", () => {
    const liveStyle = parse(room).descriptor.styles[0]!.content;
    const viewStyle = parse(missionMap).descriptor.styles[0]!.content;
    const liveCompiled = compileStyle({ filename: "MissionLivePanel.vue", id: "data-v-room-compass", scoped: true, source: liveStyle });
    const viewCompiled = compileStyle({ filename: "UserMissionView.vue", id: "data-v-desk-compass", scoped: true, source: viewStyle });
    expect(liveCompiled.errors).toEqual([]);
    expect(viewCompiled.errors).toEqual([]);
    expect(liveCompiled.code).toContain('.live-panel--fullscreen .live-panel__map[data-v-room-compass] .maplibregl-ctrl-top-right');
    const activeSlot = liveStyle.slice(liveStyle.indexOf('.live-panel--fullscreen .live-panel__map :deep(.maplibregl-ctrl-top-right) {'));
    expect(activeSlot).toContain('top: auto; right: auto; bottom: auto;');
    expect(activeSlot).toContain('left: calc(.75rem + env(safe-area-inset-left, 0px));');
    expect(activeSlot).toContain('inset-block-end: calc(5.75rem + env(safe-area-inset-bottom, 0px));');
    expect(viewStyle).toContain('.mission-desk__idle-map :deep(.maplibregl-ctrl-top-right) {');
    expect(viewStyle).toContain('left: calc(4.25rem + env(safe-area-inset-left, 0px));');
    expect(viewStyle).toContain('bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));');
    expect(viewStyle).toContain('bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));');
  });
  it("keeps members accessible without making automatic rescuer sharing look like a switch in the dock", () => {
    const start = missionMap.indexOf('<nav class="mission-desk__dock"');
    const dock = missionMap.slice(start, missionMap.indexOf('</nav>', start));
    expect(dock.match(/<button\b/g)).toHaveLength(2);
    expect(dock).toContain('mission-tool-status');
    expect(dock).toContain('mission-tool-route');
    expect(dock).not.toContain('mission-tool-team');
    expect(missionMap).toContain('id="mission-tool-team" icon="mdi-account-group-outline"');
    expect(missionMap).toContain(":aria-label=\"activeTool === 'team' ? 'بستن پنل اعضای مأموریت' : 'نمایش اعضای مأموریت'\"");
    expect(missionMap).toContain('aria-controls="mission-team-panel" :aria-expanded="activeTool === \'team\'"');
    expect(missionMap).toContain('@click="toggleTool(\'team\')"');
    expect(room).toContain(':id="fullscreen ? \'mission-team-panel\' : undefined"');
    expect(room).toContain('aria-label="بستن پنل اعضای مأموریت"');
    expect(missionMap).toContain('.mission-desk__map-heading :deep(.v-btn) { flex: none; width: 44px; min-width: 44px; height: 44px; }');
    expect(room).toContain('max-height: max(5rem, calc(100dvh - 16rem');
    expect(missionMap).toContain('max-height: max(5rem, calc(100dvh - 16rem');
  });
});
