import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";
import { palettes } from "@/styles/tokens";

// Project policy: source/compiled CSS contracts, not mounted Vue SFCs.
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");

function styleBlock(source: string, selector: string): string {
  const start = source.indexOf(selector + " {");
  expect(start, selector).toBeGreaterThan(-1);
  return source.slice(start, source.indexOf("}", start));
}

describe("map sharing quick action", () => {
  it("is icon-only and toggles the existing consentful broadcast store, not private own GPS", () => {
    expect(view).toContain('import { useBroadcastStore } from "@/stores/broadcast"');
    expect(view).toContain('const broadcast = useBroadcastStore()');
    const start = view.indexOf('class="user-map-view__share"');
    expect(start).toBeGreaterThan(-1);
    const button = view.slice(view.lastIndexOf('<v-btn', start), view.indexOf('/>', start));
    expect(button).toContain(':icon="broadcast.view.isActive ?');
    expect(button).toContain(':aria-label="broadcast.view.actionLabel"');
    expect(button).toContain(':aria-pressed="broadcast.view.isActive"');
    expect(button).toContain("broadcast.view.tone === 'error' || broadcast.view.tone === 'warn' ? 'warning'");
    expect(button).toContain("broadcast.view.isActive ? 'primary' : 'surface'");
    expect(view).toContain(":color=\"own.error.value || recenterError ? 'warning' : 'primary'\"");
    expect(view).not.toContain('id="map-route-choices-toggle"');
    expect(button).toContain(":class=\"{ 'user-map-view__share--idle': !broadcast.view.isActive && broadcast.view.tone === 'neutral' }\"");
    expect(button).toContain(':disabled="!auth.user || auth.mustCompleteSecurityQuestions || !broadcast.isSupported"');
    expect(button).toContain('@click="broadcast.toggle()"');
    expect(button).not.toContain('<span');
    expect(view).toContain('role="status" aria-live="polite"');
    // Starting a private foreground GPS watch never opts the owner into sending fixes.
    const autoGps = view.slice(view.indexOf('watch([map, () => auth.user?.id'), view.indexOf('const reverse ='));
    expect(autoGps).not.toContain('broadcast.toggle()');
  });

  it("keeps 48px share/recenter/SOS targets in a clear stack and makes short viewports usable", () => {
    const base = styleBlock(view, '.user-map-view__recenter, .user-map-view__share');
    expect(base).toContain('width: 48px;');
    expect(base).toContain('height: 48px;');
    expect(base).toContain('border-radius: 50%;');
    expect(view).toContain('v-show="!missionActive && !(isPhone && activeTool)"');
    const phone = view.split('@media (max-width: 599px) {')[1]!;
    const normalRail = phone.slice(phone.indexOf('  /* Search → SOS → broadcast → recenter → compass:'));
    const recenter = styleBlock(normalRail, '.user-map-view__recenter');
    const share = styleBlock(normalRail, '.user-map-view__share');
    const compass = styleBlock(phone.slice(phone.indexOf('/* On phones the compass')), '.user-map-view__canvas :deep(.maplibregl-ctrl-top-right)');
    const sos = styleBlock(shell, '.app-shell--map .sos-fab.sos-fab');
    expect(recenter).toContain('inset-block-end: calc(11.25rem + env(safe-area-inset-bottom, 0px))');
    expect(share).toContain('inset-block-end: calc(7.75rem + env(safe-area-inset-bottom, 0px))');
    expect(compass).toContain('inset-block-end: calc(14.75rem + env(safe-area-inset-bottom, 0px))');
    expect(sos).toContain('inset-block-end: calc(4.25rem + env(safe-area-inset-bottom, 0px))');
    // Adjacent 48px targets have an 8px gap, including broadcast above SOS.
    for (const [lower, upper] of [[4.25, 7.75], [7.75, 11.25], [11.25, 14.75]]) {
      expect(upper - lower - 3).toBe(.5);
    }
    const landscape = view.split('@media (min-width: 480px) and (max-width: 599px) and (max-height: 480px) {')[1]!;
    expect(styleBlock(landscape, '.user-map-view__recenter')).toContain('inset-block-end: calc(7.75rem + env(safe-area-inset-bottom, 0px))');
    expect(view).toContain('class="user-map-view__history-dialog"');
    expect(view).toContain('class="user-map-view__history-body"');
    expect(view).toContain('overflow-y: auto; overscroll-behavior: contain;');
    expect(view).toContain('inset-inline-start: calc(0.75rem + 3.5rem + env(safe-area-inset-right, 0px))'); // Short phones keep the bell clear.
    expect(shell).toContain('inset-block-end: calc(4.25rem + env(safe-area-inset-bottom, 0px))');
    expect(view).toContain('id="map-tool-search" class="user-map-view__search-action"');
    const { descriptor } = parse(view, { filename: "UserMapView.vue" });
    const result = compileStyle({ source: descriptor.styles[0]!.content, id: "data-v-share", filename: "UserMapView.vue", scoped: true });
    expect(result.errors).toEqual([]);
    expect(result.code).toContain('.user-map-view__share[data-v-share]');
    expect(result.code).toContain('.user-map-view__share--idle[data-v-share]');
    expect(styleBlock(view, '.user-map-view__share--idle')).toContain('border-color: var(--bb-color-outline);');
  });

  it("keeps the inactive icon and outline readable in both themes against the adjacent primary fill", () => {
    const luminance = (hex: string) => [1, 3, 5].reduce((sum, index, channel) => {
      const value = parseInt(hex.slice(index, index + 2), 16) / 255;
      const linear = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      return sum + linear * [0.2126, 0.7152, 0.0722][channel]!;
    }, 0);
    const contrast = (first: string, second: string) => {
      const [high, low] = [luminance(first), luminance(second)].sort((a, b) => b - a);
      return (high! + 0.05) / (low! + 0.05);
    };
    for (const palette of Object.values(palettes)) {
      expect(contrast(palette.outline, palette.surface)).toBeGreaterThanOrEqual(3);
      expect(contrast(palette.text, palette.surface)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.primary, palette.surface)).toBeGreaterThanOrEqual(3);
    }
  });
});
