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
    expect(missionMap).not.toContain('<MapCanvas');
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
    expect(missionMap).toContain(':external-canvas="embedded"');
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
  it("offers one own-position button before guidance and reuses mission following during guidance", () => {
    expect(companionMap).toContain(':own-recenter-label="recenterLabel" :own-location-error="!!(own.error.value || recenterError)"');
    expect(companionMap).toContain('@focus-own="centerOnOwnLocation"');
    expect(companionMap).toContain("(mode !== 'missions' || !missionWorkspace?.hasActiveMission) && !(isPhone && activeTool)");
    expect(companionMap).toContain('if (!instance || !fix || !markerConstructor) {');
    expect(companionMap).toContain('user-map-view__own-marker--mission');
    expect(missionMap).toContain('hasActiveMission: computed(() => !!desk.activeMission.value)');
    expect(missionMap).toContain('if (navigation.active.value) return {');
    expect(missionMap).toContain('label: props.ownRecenterLabel');
    expect(missionMap).toContain("navigation.active.value ? resumeGuidanceFollow() : emit('focus-own')");
    expect(missionMap).not.toContain('useOwnMapPosition'); // No second private GPS watcher.
  });
  it("keeps the unverified-terminal panel readable and its retry action tappable", () => {
    const style = parse(missionMap).descriptor.styles[0]!.content;
    const compiled = compileStyle({ filename: "UserMissionView.vue", id: "data-v-verification", scoped: true, source: style });
    expect(compiled.errors).toEqual([]);
    expect(missionMap).toContain('<section v-if="desk.terminalHold.value" class="mission-desk__terminal-alert" role="alert"');
    expect(missionMap).toContain('در انتظار تأیید سرور');
    expect(missionMap).toContain('v-if="!desk.terminalHold.value && activeTool !== \'route\'');
    expect(style).toContain('pointer-events: auto;');
    expect(style).toContain('color: rgb(var(--v-theme-on-surface)); background: rgb(var(--v-theme-surface));');
    expect(missionMap).toContain('v-if="!desk.terminalHold.value && !pickingWaypoint && (!activeTool || activeTool === \'status\')"');
    expect(style).toContain('max-height: max(6rem, calc(100dvh - 10.5rem');
    expect(compiled.code).toContain('.mission-desk__terminal-alert[data-v-verification]');
    expect(missionMap).toContain('v-if="embedded && desk.cancelledMissionId.value"');
  });
  it("positions both mission compasses in the same physical-right action rail as /_user/map", () => {
    const liveStyle = parse(room).descriptor.styles[0]!.content;
    const viewStyle = parse(missionMap).descriptor.styles[0]!.content;
    const compiled = compileStyle({ filename: "UserMissionView.vue", id: "data-v-desk-compass", scoped: true, source: viewStyle });
    expect(compiled.errors).toEqual([]);
    expect(missionMap).toContain("'mission-desk--tool-open': !!desk.activeMission.value && !!activeTool");
    expect(liveStyle).not.toContain('.live-panel--fullscreen .live-panel__map :deep(.maplibregl-ctrl-top-right)');
    expect(compiled.code).toContain('.mission-desk[data-v-desk-compass] .map-canvas--action-compass .maplibregl-ctrl-top-right');
    const control = viewStyle.slice(viewStyle.indexOf('.mission-desk :deep(.map-canvas--action-compass .maplibregl-ctrl-top-right) {'));
    expect(control).toContain('position: fixed;');
    expect(control).toContain('right: 1.25rem;');
    expect(control).toContain('left: auto;');
    expect(control).toContain('bottom: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 10.5rem);');
    const mapPage = parse(companionMap).descriptor.styles[0]!.content;
    expect(mapPage).toContain('inset-inline-start: 1.25rem;');
    expect(mapPage).toContain('inset-block-end: calc(max(1.25rem, env(safe-area-inset-bottom, 0px)) + 7rem);');
    expect(viewStyle).toContain('.mission-desk__map-focus--pair');
    expect(missionMap).toContain('class="mission-desk__frame-action"');
    expect(viewStyle).toContain('.mission-desk__map-focus--pair :deep(.mission-desk__frame-action) {\n    position: absolute; right: 0; bottom: 10.5rem;');
    // At 600px the unshrunk tablet steps dock ends before the same-column frame action.
    expect(12 + (600 - 7.5 * 16) + 8).toBeLessThanOrEqual(600 - 1.25 * 16 - 48);
    expect(viewStyle).toContain('flex-direction: column;');
    expect(viewStyle).toContain('right: 1.25rem;');
    expect(viewStyle).toContain('width: 48px; min-width: 48px; height: 48px;');
    expect(viewStyle).toContain('inset: auto auto calc(5.5rem + env(safe-area-inset-bottom, 0px)) 1rem;');
    expect(liveStyle).toContain('inset: auto auto calc(5.5rem + env(safe-area-inset-bottom, 0px)) 1rem;');
  });
  it("keeps the phone rail clear of panels and SOS, including short screens", () => {
    const viewStyle = parse(missionMap).descriptor.styles[0]!.content;
    const phone = viewStyle.split('@media (max-width: 599px) {')[1]!;
    expect(phone).toContain('right: calc(.75rem + env(safe-area-inset-right, 0px));');
    expect(phone).toContain('bottom: calc(16rem + env(safe-area-inset-bottom, 0px));');
    expect(phone).toContain('bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));');
    expect(phone).toContain('.mission-desk__info-action, .mission-desk__legend-action { left: calc(.75rem + env(safe-area-inset-left, 0px)); }');
    expect(viewStyle).not.toContain('.mission-desk__dock {');
    expect(viewStyle).toContain('.mission-desk__route-action:focus-visible');
    expect(phone).toContain('.mission-desk--active :deep(.map-canvas--action-compass .maplibregl-ctrl-top-right)');
    expect(phone).toContain('bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));');
    expect(phone).toContain('.mission-desk--active .mission-desk__map-focus');
    expect(phone).toContain('right: calc(.75rem + env(safe-area-inset-right, 0px));');
    expect(phone).toContain('position: absolute; right: 7rem; bottom: 5rem;');
    expect(viewStyle).toContain('@media (max-width: 599px) and (max-height: 560px)');
    expect(viewStyle).toContain('bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));');
    expect(viewStyle).toContain('bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));');
    expect(viewStyle).toContain('bottom: calc(.75rem + env(safe-area-inset-bottom, 0px));');
    const desktopRail = viewStyle.slice(viewStyle.indexOf('@media (min-width: 1024px) {'));
    expect(desktopRail).toContain('left: calc(50% - 18rem - 4rem);');
    expect(desktopRail).toContain('bottom: calc(4.5rem + env(safe-area-inset-bottom, 0px));');
  });
  it("keeps the idle phone compass out of centered welcome/empty cards and clear of the top network control", () => {
    const css = parse(missionMap).descriptor.styles[0]!.content;
    const compiled = compileStyle({ filename: "UserMissionView.vue", id: "data-v-idle-compass", scoped: true, source: css });
    const network = readFileSync(new URL("../shell/NetworkStatusIcon.vue", import.meta.url), "utf8");
    expect(compiled.errors).toEqual([]);
    expect(missionMap).not.toContain('<MapCanvas');
    expect(css).toContain('margin: calc(4.5rem + env(safe-area-inset-top, 0px)) auto 0;');
    expect(network).toContain('right: calc(0.75rem + env(safe-area-inset-right, 0px));');
    expect(network).toContain('width: 48px; height: 48px;');
    const idle = css.lastIndexOf('.mission-desk:not(.mission-desk--active) :deep(.map-canvas--action-compass .maplibregl-ctrl-top-right) {');
    expect(idle).toBeGreaterThan(css.indexOf('@media (max-width: 599px) and (max-height: 560px)'));
    const rule = css.slice(idle, css.indexOf('}', idle));
    expect(rule).toContain('top: calc(.75rem + env(safe-area-inset-top, 0px));');
    expect(rule).toContain('right: calc(4.25rem + env(safe-area-inset-right, 0px));');
    expect(rule).toContain('bottom: auto;');
    expect(compiled.code).toContain('.mission-desk[data-v-idle-compass]:not(.mission-desk--active) .map-canvas--action-compass .maplibregl-ctrl-top-right');
    // Two matching 48px buttons have an 8px gap at the screen edge.
    expect(0.75 * 16 + 48 + 8).toBe(4.25 * 16);
    // The 48px compass finishes 12px before the first card starts at 4.5rem.
    expect((.75 * 16 + 48) + 12).toBe(4.5 * 16);
  });
  it("keeps members accessible without making automatic rescuer sharing look like a switch", () => {
    const start = missionMap.indexOf('<div class="mission-desk__header-actions">');
    const actions = missionMap.slice(start, missionMap.indexOf('</div>', start));
    expect(actions.match(/<v-btn\b/g)).toHaveLength(2);
    expect(actions).toContain('icon="mdi-routes"');
    expect(actions).not.toContain('mission-tool-status');
    expect(missionMap).toContain('id="mission-tool-status" class="mission-desk__info-action"');
    expect(actions).toContain('mission-tool-route');
    expect(actions).toContain('mission-tool-team');
    expect(missionMap).toContain('id="mission-tool-team" class="mission-desk__team-action" icon="mdi-account-group-outline"');
    expect(missionMap).toContain('aria-label="نمایش اعضای مأموریت"');
    expect(missionMap).toContain('aria-controls="mission-team-panel" :aria-expanded="false"');
    expect(missionMap).toContain('@click="toggleTool(\'team\')"');
    expect(room).toContain(':id="fullscreen ? \'mission-team-panel\' : undefined"');
    expect(room).toContain('aria-label="بستن پنل اعضای مأموریت"');
    expect(missionMap).toContain('<template #team>');
    expect(room).toContain('top: calc(.75rem + env(safe-area-inset-top, 0px));\n    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));');
    expect(missionMap).toContain('top: calc(.75rem + env(safe-area-inset-top, 0px));\n    bottom: calc(9.5rem + env(safe-area-inset-bottom, 0px));');
  });
});
