import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const css = parse(page).descriptor.styles[0]!.content;

// Source/compiled-style contract: Vue SFCs must not be mounted in unit tests (docs/TASKS.md).
describe("mission guidance over the full-screen map", () => {
  it("keeps the stage heading and guidance in distinct top slots on desktop and phones", () => {
    const compiled = compileStyle({ source: css, filename: "UserMissionView.vue", id: "data-v-guidance", scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(css).toContain('.mission-desk__map-heading {\n  position: absolute; z-index: 7; top: calc(.75rem + env(safe-area-inset-top, 0px));');
    expect(css).toContain('.mission-desk__guidance {\n  position: absolute; z-index: 7; top: calc(5.75rem + env(safe-area-inset-top, 0px));');
    expect(css).not.toContain('.mission-desk__guidance { top: calc(4.25rem');
    // Stage trigger is at least 44px, header padding is 16px and border 2px.
    expect(5.75 * 16 - (.75 * 16 + 44 + 16 + 2)).toBeGreaterThanOrEqual(12);
    expect(compiled.code).toContain('.mission-desk__guidance[data-v-guidance]');
  });
  it("gives short-phone banners a scrollable corridor above the map actions and the dock", () => {
    expect(css).toContain('@media (max-width: 599px) and (max-height: 560px)');
    expect(css).toContain('bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('top: calc(5.25rem + env(safe-area-inset-top, 0px));');
    expect(css).toContain('max-height: max(3.5rem, min(12rem, calc(100dvh - 14.75rem - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px))));');
    expect(css).toContain('.mission-desk__guidance--warning span {\n    max-height: max(1.5rem, min(10rem, calc(100dvh - 16.5rem');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain;');
    expect(css).toContain('.mission-desk__guidance--warning :deep(.v-btn) { min-height: 44px; height: auto; }');
    expect(css).toContain('overflow: hidden;');
    expect(css).toContain('.mission-desk__guidance--active .mission-desk__guidance-copy small');
    expect(css).toContain('clip: rect(0, 0, 0, 0);'); // Still available to assistive tech.
    // Height 320 and 560: banner ends before the 48px bottom-row controls, with a 12px gap.
    for (const height of [320, 360, 560]) {
      const bannerBottom = 5.25 * 16 + Math.max(3.5 * 16, Math.min(12 * 16, height - 14.75 * 16));
      const controlsTop = height - 5.75 * 16 - 48;
      expect(controlsTop - bannerBottom).toBeGreaterThanOrEqual(12);
    }
    // Tall phones use the vertical rail; its first button starts at H - 19rem.
    for (const height of [561, 600]) {
      const bannerBottom = 5.75 * 16 + Math.max(3.5 * 16, Math.min(12 * 16, height - 25.5 * 16));
      const compassTop = height - 19 * 16;
      expect(compassTop - bannerBottom).toBeGreaterThanOrEqual(12);
    }
  });
  it("does not claim a GPS fix proves the rescuer is on route or replace the emergency controls", () => {
    expect(page).not.toContain('در مسیر محل حادثه');
    expect(page).toContain('راهبری GPS فعال است');
    expect(page).toContain('زمان رسیدن زنده در دسترس نیست');
    expect(page).toContain('role="alert"');
    expect(page).toContain('@click="stopGuidance"');
    expect(page).toContain('id="mission-tool-team"');
    expect(page).toContain('class="mission-desk__dock"');
  });
});
