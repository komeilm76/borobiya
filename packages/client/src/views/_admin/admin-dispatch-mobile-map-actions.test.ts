import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";
import { dispatchSheetBounds } from "../../admin/dispatch-sheet-gesture";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const markup = template!.content;
const css = styles[0]!.content;

describe("compact dispatch map actions", () => {
  it("keeps the desktop legend and recenter control, but hides both legend UI elements on mobile", () => {
    expect(markup).toContain('v-if="!compactDispatch" id="dispatch-legend-toggle"');
    expect(markup).toContain('v-show="legendOpen && !compactDispatch"');
    expect(markup).toContain('v-if="adminSos.selectedRequest && !compactDispatch" id="dispatch-recenter"');
    expect(markup).toContain('v-for="item in sosSeverityKey"');
    expect(css).toContain('.admin-dispatch__legend-toggle {\n  position: absolute; z-index: 5; right: 1.125rem;');
  });

  it("puts a selected-SOS locator in the former legend slot, clear of the SOS action", () => {
    const locatorStart = markup.indexOf('<v-btn v-if="compactDispatch && adminSos.selectedRequest" id="dispatch-recenter-mobile"');
    const locator = markup.slice(locatorStart, markup.indexOf('/>', locatorStart));
    expect(locator).toContain('v-if="compactDispatch && adminSos.selectedRequest"');
    expect(locator).toContain('class="admin-dispatch__recenter-mobile map-selected-alert-card"');
    expect(locator).toContain('icon="mdi-crosshairs-gps" color="primary" variant="flat" size="small"');
    expect(locator).toContain('aria-label="نمایش محل حادثه روی نقشه"');
    expect(locator).toContain('@click="focusSelectedSosOnMap"');
    expect(css).toContain('right: calc(.875rem + env(safe-area-inset-right, 0px));');
    expect(css).toContain('bottom: calc(.5rem + env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('border: 2px solid #fff; border-radius: var(--bb-map-action-radius, 1rem);');
    expect(css).toContain('box-shadow: 0 0 0 2px rgba(8, 35, 38, .82), 0 5px 16px rgba(8, 21, 38, .55) !important;');
    expect(css).toContain(':global(:root.dark .admin-dispatch__recenter-mobile) { border-color: #fff; }');
    expect(css).toContain('.admin-dispatch__recenter-mobile :deep(.v-icon) { font-size: 24px; }');
    expect(css).toContain('border-color: ButtonText; box-shadow: none !important;');
    expect(css).toContain('bottom: calc(var(--dispatch-expanded-sheet-height) - min(40dvh, 21rem) + .5rem + env(safe-area-inset-bottom, 0px));');
    expect(css).toContain('#dispatch-workspace:has(.admin-dispatch__sidebar--dragging) .admin-dispatch__recenter-mobile {\n    visibility: hidden; pointer-events: none;');
    expect(shell).toContain('--dispatch-expanded-sheet-height: min(68dvh, 38rem,');
    expect(shell).toContain('max(min(40dvh, 21rem), calc(100dvh - 12.5rem - env(safe-area-inset-top, 0px))));');
    expect(shell).toContain('inset-block-end: calc(var(--dispatch-expanded-sheet-height) + 3.75rem + env(safe-area-inset-bottom, 0px));');
    expect(shell).not.toContain('.app-shell--map:has(.admin-dispatch__sidebar--expanded) .sos-fab.sos-fab,\n  .app-shell--map:has(.admin-dispatch__sidebar--dragging)');
    expect(css).toContain('.map-selected-alert-card {\n  flex: none; width: 44px; height: 44px;');
    expect(source).toContain('map.flyTo({ center: [incident.location.lon, incident.location.lat],');
    expect(source).toContain('compactDispatch.value ? "dispatch-recenter-mobile" : "dispatch-recenter"');
    for (const [height, safeTop] of [[844, 0], [568, 47]]) {
      const { peek, expanded } = dispatchSheetBounds(height, 16, safeTop);
      expect(expanded).toBeGreaterThan(peek);
      // Both controls clear the expanded sheet, with the 44px locator 8px below the 48px SOS button.
      expect((expanded + 3.75 * 16) - (expanded + .5 * 16 + 44)).toBe(8);
      expect(height - expanded).toBeGreaterThanOrEqual(12.5 * 16 + safeTop);
    }
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "mobile-map-actions", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "mobile-map-actions", scoped: true, source: css }).errors).toEqual([]);
  });
});
