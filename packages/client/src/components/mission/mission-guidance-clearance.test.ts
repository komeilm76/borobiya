import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const page = readFileSync(new URL("../../views/_user/UserMissionView.vue", import.meta.url), "utf8");
const css = parse(page).descriptor.styles[0]!.content;

// Source/compiled-style contract: Vue SFCs must not be mounted in unit tests (docs/TASKS.md).
describe("mission guidance over the full-screen map", () => {
  it("keeps top guidance independent of the bottom-docked stages on desktop and phones", () => {
    const compiled = compileStyle({ source: css, filename: "UserMissionView.vue", id: "data-v-guidance", scoped: true });
    expect(compiled.errors).toEqual([]);
    expect(css).toContain('.mission-desk__guidance {\n  position: absolute; z-index: 10; top: calc(5.75rem + env(safe-area-inset-top, 0px));');
    expect(css).toContain('.mission-desk__bottom-stack { position: absolute; z-index: 9;');
    expect(page).not.toContain('mission-desk__map-heading');
    expect(compiled.code).toContain('.mission-desk__guidance[data-v-guidance]');
  });
  it("gives short-phone banners a scrollable corridor above the map actions and the dock", () => {
    expect(css).toContain('@media (max-width: 599px) and (max-height: 560px)');
    expect(css).toContain('bottom: calc(5.75rem + env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('top: calc(5.25rem + env(safe-area-inset-top, 0px));');
    expect(css).toContain('@media (max-width: 599px) and (max-height: 700px)');
    expect(css).toContain('.mission-desk__guidance.mission-desk__guidance--warning,\n  .mission-desk__guidance.mission-desk__guidance--active {');
    expect(css).toContain('top: calc(5.25rem + env(safe-area-inset-top, 0px)); max-height: 5rem;');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain;');
    expect(css).toContain('.mission-desk__guidance--warning span { flex: 1 1 100%; max-height: none; overflow: visible; }');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain;');
    expect(css).toContain('.mission-desk__guidance--warning :deep(.v-btn) { position: sticky; bottom: 0; min-height: 44px; height: auto;');
    expect(css).toContain('.mission-desk__guidance--active .mission-desk__planned-distance');
    expect(css).toContain('.mission-desk__direct-distance { line-height: 1.25; }');
    expect(css).toContain('clip: rect(0, 0, 0, 0);'); // Still available to assistive tech.
    // Guidance clears the bottom action row; at usable short-phone heights
    // the progress sheet also starts at least 16px below the banner.
    for (const height of [480, 560]) {
      const bannerBottom = (5.25 + 5) * 16;
      const controlsTop = height - 5.75 * 16 - 48;
      const sheetTop = height - 9.5 * 16 - Math.max(7 * 16, Math.min(height * .48, height - 20.75 * 16));
      expect(controlsTop - bannerBottom).toBeGreaterThanOrEqual(12);
      expect(sheetTop - bannerBottom).toBeGreaterThanOrEqual(16);
    }
    for (const height of [360, 400]) {
      const bannerBottom = (5.25 + 3) * 16;
      const sheetTop = height - 9.5 * 16 - Math.max(4.5 * 16, Math.min(height * .48, height - 20.75 * 16));
      expect(sheetTop - bannerBottom).toBeGreaterThanOrEqual(4);
    }
    // Medium-height phones use the vertical rail; expanded stages cannot cover guidance.
    for (const height of [561, 600, 700]) {
      const bannerBottom = (5.25 + 5) * 16;
      const sheetTop = height - 9.5 * 16 - Math.min(height * .6, height - 20.75 * 16);
      expect(sheetTop - bannerBottom).toBeGreaterThanOrEqual(16);
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
