import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const canvas = readFileSync(new URL("../map/MapCanvas.vue", import.meta.url), "utf8");
const companionMap = readFileSync(new URL("../../views/_user/UserMapView.vue", import.meta.url), "utf8");
const missionMap = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const room = readFileSync(new URL("./MissionLivePanel.vue", import.meta.url), "utf8");

// Source-pinned wiring; never mount Vue SFCs in unit tests (docs/TASKS.md).
describe("mission map controls", () => {
  it("keeps the shared MapCanvas compass while removing impractical +/- on full-screen and idle mission maps", () => {
    expect(companionMap).toContain(':show-zoom="false"');
    expect(missionMap).toContain(':constrain-bounds="false" :show-zoom="false" aria-label="نقشهٔ عمومی؛ مأموریت فعالی ندارید"');
    expect(room).toContain(':constrain-bounds="false" :show-zoom="!fullscreen"');
    expect(canvas).toContain('showCompass: true,');
    expect(canvas).toContain('showZoom: props.showZoom,');
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
