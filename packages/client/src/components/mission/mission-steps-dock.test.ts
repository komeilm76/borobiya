import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

// Source/compiled SFC contracts only; docs/TASKS.md forbids mounting Vue SFCs.
const mission = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const map = readFileSync(new URL("../../views/_user/UserMapView.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
const navigation = parse(map).descriptor.styles[0]!.content;
const steps = parse(mission).descriptor.styles[0]!.content;

function rule(source: string, selector: string): string {
  const start = source.indexOf(selector + " {");
  expect(start, selector).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("}", start));
}

describe("mission steps beside Navigate's bottom dock", () => {
  it("docks steps only, keeping information separate and retaining the guarded action", () => {
    expect(navigation).toContain('.user-map-view__journey-stack { position: fixed;');
    expect(navigation).toContain('bottom: calc(1rem + env(safe-area-inset-bottom, 0px)); width: min(36rem, calc(100vw - 1.5rem));');
    expect(steps).toContain('.mission-desk--steps-visible .mission-desk__bottom-stack {');
    expect(rule(steps, '.mission-desk--steps-visible .mission-desk__bottom-stack')).toContain('bottom: calc(1rem + env(safe-area-inset-bottom, 0px));');
    expect(rule(steps, '.mission-desk--steps-visible .mission-desk__bottom-stack')).toContain('width: min(36rem, calc(100% - 1.5rem));');
    expect(steps).toContain('@media (min-width: 600px) and (max-width: 1023px) {');
    expect(steps).toContain('width: min(30rem, calc(100% - 7.5rem');
    expect(steps).toContain('.mission-desk--steps-visible .mission-desk__bottom-panel { flex: 0 1 auto; }');
    expect(steps).toContain('.mission-desk__bottom-stack--information { max-height:');
    expect(steps).toContain('overflow-y: auto; overscroll-behavior: contain; pointer-events: auto;');
    expect(mission).toContain('id="mission-steps-stack" class="mission-desk__bottom-stack"');
    expect(mission).toContain('<MissionStatusPanel v-if="activeTool === \'status\'"');
    expect(mission).toContain('<MissionMapCards :desk="desk" :steps="steps"');
    const cards = readFileSync(new URL("./MissionMapCards.vue", import.meta.url), "utf8");
    expect(cards).toContain('@click="desk.advanceStatus()"');
    expect(cards).toContain(':disabled="!desk.canAdvance.value"');
    expect(compileTemplate({ filename: "UserMissionView.vue", id: "steps-dock", source: parse(mission).descriptor.template!.content }).errors).toEqual([]);
  });

  it("measures changing sheet height, moves every phone control above it, and cleans up on exit", () => {
    expect(navigation).toContain('.user-map-view__journey-stack { left: 0; right: 0;');
    expect(rule(steps, '.mission-desk--steps-visible .mission-desk__bottom-stack')).toContain('left: 50%;');
    expect(steps).toContain('left: 0; right: 0; transform: none; bottom: 0; width: 100%;');
    expect(steps).toContain('padding-bottom: env(safe-area-inset-bottom, 0px);');
    expect(steps).toContain('border-radius: var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0;');
    expect(steps).toContain('.mission-desk--steps-visible #mission-steps-stack {'); // Beats short-phone cap.
    expect(mission).toContain('observer.observe(element);');
    expect(mission).toContain('window.innerHeight - rect.top');
    expect(mission).toContain('document.documentElement.style.removeProperty("--bb-map-mission-sheet-height")');
    expect(mission).toContain('hasStepsSheet: computed(() => !!desk.activeMission.value && !desk.terminalHold.value && !activeTool.value && !pickingWaypoint.value)');
    expect(mission).toContain("'mission-desk--steps-guidance': !!desk.activeMission.value");
    expect(map).toContain("'user-map-view--mission-steps': mode === 'missions' && !!missionWorkspace?.hasStepsSheet");
    expect(shell).toContain(':root { --bb-map-mission-sheet-height: min(65dvh, 32rem, max(7rem, calc(100dvh - 14rem');
    expect(shell).toContain(':root:has(.user-map-view--mission-steps .mission-desk--steps-guidance) {');
    expect(steps).toContain('.mission-desk--steps-visible.mission-desk--steps-guidance #mission-steps-stack {');
    expect(rule(shell, '.app-shell--map:has(.user-map-view--mission-steps) .sos-fab.sos-fab'))
      .toContain('var(--bb-map-mission-sheet-height, 15rem) + 4rem');
    expect(rule(map, '.user-map-view--mission-steps .user-map-view__search-action'))
      .toContain('var(--bb-map-mission-sheet-height, 15rem) + .5rem');
    expect(rule(steps, '.mission-desk--steps-visible .mission-desk__legend-action'))
      .toContain('var(--bb-map-mission-sheet-height, 15rem) + 4rem');
    expect(rule(steps, '.mission-desk--steps-visible .mission-desk__info-action'))
      .toContain('var(--bb-map-mission-sheet-height, 15rem) + .5rem');
    expect(steps).toContain('.mission-desk--active.mission-desk--steps-visible .mission-desk__map-focus,');
    expect(steps).toContain('right: calc(.75rem + env(safe-area-inset-right, 0px)); flex-direction: row;');
    expect(rule(steps, '.mission-desk--active.mission-desk--steps-visible .mission-desk__map-focus--pair :deep(.v-btn:last-child)'))
      .toContain('bottom: 3.5rem;');
    expect(rule(map, '.user-map-view--mission-active.user-map-view--mission-steps\n    .user-map-view__canvas :deep(.maplibregl-ctrl-top-right)'))
      .toContain('right: calc(4.25rem + env(safe-area-inset-right, 0px));');
    expect(shell).toContain('.app-shell--map:has(.user-map-view) .sos-fab.sos-fab');
    expect(compileStyle({ filename: "UserMissionView.vue", id: "steps-dock", scoped: true, source: steps }).errors).toEqual([]);
    expect(compileStyle({ filename: "UserMapView.vue", id: "steps-dock", scoped: true, source: navigation }).errors).toEqual([]);
    // A 320px phone keeps 112px for idle stages; with guidance it reserves
    // the banner lane and keeps a 76px scrollable sheet instead.
    expect(Math.max(7 * 16, 320 - 14 * 16)).toBe(112);
    const sheet = Math.max(4.75 * 16, 320 - 17.5 * 16);
    expect(320 - sheet - 4 * 16 - 48).toBeGreaterThan(5 * 16);
    expect((4 - .5) * 16 - 48).toBe(8);
    expect(320 - 11.25 * 16 - 48).toBeGreaterThan(.75 * 16 + 48);
  });

  it("makes Route icon-only, with readiness and opening behavior still available to assistive technology", () => {
    const actions = mission.slice(mission.indexOf('<div class="mission-desk__header-actions">'), mission.indexOf('</div>', mission.indexOf('<div class="mission-desk__header-actions">')));
    expect(actions).toContain('id="mission-tool-team"');
    expect(actions).toContain('id="mission-tool-route"');
    expect(actions).toContain('icon="mdi-routes"');
    expect(actions).not.toContain('<strong>مسیر</strong>');
    expect(actions).toContain(':aria-label="`مسیر مأموریت: ${routeCue.label}؛ باز کردن پنل مسیر`"');
    expect(actions).toContain(':title="`مسیر مأموریت: ${routeCue.label}`"');
    expect(actions).toContain(':color="routeCue.tone === \'warning\' ? \'warning\' : \'primary\'"');
    expect(actions).toContain('aria-controls="mission-route-panel"');
    expect(actions).toContain('@click="toggleTool(\'route\')"');
    expect(rule(steps, '.mission-desk__route-action')).toContain('min-width: 44px; min-height: 44px;');
  });
});
