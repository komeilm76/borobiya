import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";
import { dispatchSheetBounds } from "../../admin/dispatch-sheet-gesture";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const markup = template!.content;
const css = styles[0]!.content;

describe("dispatch map controls across screen sizes", () => {
  it("removes both selected-SOS focus icons while preserving the desktop legend", () => {
    expect(markup).not.toContain('id="dispatch-recenter"');
    expect(markup).not.toContain('id="dispatch-recenter-mobile"');
    expect(markup).not.toContain('class="map-selected-alert-card"');
    expect(source).not.toContain('function focusSelectedSosOnMap()');
    expect(css).not.toContain('.admin-dispatch__recenter-mobile');
    expect(css).not.toContain('.map-selected-alert-card');
    expect(markup).toContain('v-if="!compactDispatch" id="dispatch-legend-toggle"');
    expect(markup).toContain('v-show="legendOpen && !compactDispatch"');
    expect(markup).toContain('v-for="item in sosSeverityKey"');
    expect(css).toContain('.admin-dispatch__legend-toggle {\n  position: absolute; z-index: 5; right: 1.125rem;');
  });

  it("keeps the incident-details map action usable without a dispatch SOS floating button", () => {
    expect(markup).toContain('class="admin-dispatch__incident-header"');
    expect(markup).toContain('icon="mdi-map-marker-radius-outline"');
    expect(markup).toContain('@click.stop="focusSelectedIncidentMap"');
    expect(markup).toContain('<MapCanvas id="dispatch-canvas-01" tabindex="-1"');
    expect(source).toContain('document.getElementById("dispatch-canvas-01")?.focus({ preventScroll: true });');
    expect(source).toContain('map.flyTo({ center: [incident.location.lon, incident.location.lat], offset: dispatchFocusOffset()');
    expect(shell).toContain('--dispatch-expanded-sheet-height: min(68dvh, 38rem,');
    expect(shell).not.toContain('.app-shell--map:has(.admin-dispatch) .sos-fab');
    expect(css).toContain('.admin-dispatch__search--hidden { visibility: hidden; pointer-events: none; }');
    for (const [height, safeTop] of [[844, 0], [568, 47]]) {
      const { peek, expanded } = dispatchSheetBounds(height, 16, safeTop);
      expect(expanded).toBeGreaterThan(peek);
      expect(height - expanded).toBeGreaterThanOrEqual(12.5 * 16 + safeTop);
    }
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "mobile-map-actions", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "mobile-map-actions", scoped: true, source: css }).errors).toEqual([]);
  });
});
