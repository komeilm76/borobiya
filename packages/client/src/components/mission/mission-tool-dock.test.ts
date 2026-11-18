import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { compileStyle, parse } from 'vue/compiler-sfc';

const mission = readFileSync(new URL('../../views/_user/UserMissionView.vue', import.meta.url), 'utf8');
const map = readFileSync(new URL('../../views/_user/UserMapView.vue', import.meta.url), 'utf8');
const members = readFileSync(new URL('./MissionLivePanel.vue', import.meta.url), 'utf8');
const transport = readFileSync(new URL('../map/PointTransportChoicesSheet.vue', import.meta.url), 'utf8');
const shell = readFileSync(new URL('../../styles/tailwind.css', import.meta.url), 'utf8');

describe('assigned-mission tools share the steps phone dock (source contracts, no SFC mount)', () => {
  it('docks members, route planner and its vehicle choice to the bottom with inner scrolling and safe-area padding', () => {
    expect(members).toContain('inset: auto 0 0; width: 100%;');
    expect(members).toContain('.live-panel--fullscreen .live-panel__member-list { max-height: none; flex: 0 1 auto; }');
    expect(mission).toContain('inset: auto 0 0; width: 100%; top: auto;');
    expect(mission).toContain('border-radius: var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0 !important;');
    expect(mission).toContain('.mission-desk--active .mission-route:has(.mission-route__route-details[open]) .mission-route__body--plan {');
    expect(transport).toContain('section.point-transport-choices-shell--mission {\n    left: 0; right: 0; bottom: 0; width: 100%;');
    expect(transport).toContain('.point-transport-choices-shell--mission .point-transport-choices.bb-map-navigation-card {');
    for (const [filename, source] of [['UserMissionView.vue', mission], ['MissionLivePanel.vue', members],
      ['PointTransportChoicesSheet.vue', transport]] as const) {
      const css = parse(source, { filename }).descriptor.styles[0]!.content;
      expect(compileStyle({ source: css, filename, id: 'docked', scoped: true }).errors).toEqual([]);
    }
  });

  it('measures whichever sheet is visible and clears the height on exit, keeping SOS and map controls reachable', () => {
    expect(mission).toContain("activeTool.value === 'team' ? 'mission-team-panel' : activeTool.value === 'route'");
    expect(mission).toContain("routeSection.value === 'transport' ? 'map-point-transport-choices-sheet' : 'mission-route-panel'");
    expect(mission).toContain('observer.observe(element);');
    expect(mission).toContain('document.documentElement.style.removeProperty("--bb-map-mission-sheet-height")');
    expect(mission).toContain('hasDockedToolSheet: computed(() => !!desk.activeMission.value');
    expect(map).toContain("'user-map-view--mission-docked': mode === 'missions' && !!missionWorkspace?.hasDockedToolSheet");
    expect(map).toContain('.user-map-view--mission-docked .user-map-view__search-action {');
    expect(map).toContain('.user-map-view--mission-active.user-map-view--mission-docked .user-map-view__share {');
    expect(mission).toContain('.mission-desk--docked-tool .mission-desk__info-action {');
    expect(mission).toContain('.mission-desk--active.mission-desk--docked-tool .mission-desk__map-focus,');
    expect(shell).toContain('.app-shell--map:has(.user-map-view--mission-docked) .sos-fab.sos-fab {');
    expect(members).toContain('aria-label="بستن پنل اعضای مأموریت"');
    expect(mission).toContain('aria-label="بستن پنل مسیر؛ مسیر روی نقشه می‌ماند"');
  });
});
