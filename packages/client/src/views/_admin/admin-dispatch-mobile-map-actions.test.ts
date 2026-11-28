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

  it("keeps SOS and the incident-details map action usable without an extra floating button", () => {
    expect(markup).toContain('aria-controls="dispatch-map" @click="focusSelectedIncidentMap"');
    expect(markup).toContain('<MapCanvas id="dispatch-canvas-01" tabindex="-1"');
    expect(source).toContain('document.getElementById("dispatch-canvas-01")?.focus({ preventScroll: true });');
    expect(source).toContain('map.flyTo({ center: [incident.location.lon, incident.location.lat], offset: dispatchFocusOffset()');
    expect(shell).toContain('inset-block-end: calc(var(--dispatch-expanded-sheet-height) + 3.75rem + env(safe-area-inset-bottom, 0px));');
    expect(shell).toContain('visibility: hidden; pointer-events: none;'); // Only while dragging.
    for (const [height, safeTop] of [[844, 0], [568, 47]]) {
      const { peek, expanded } = dispatchSheetBounds(height, 16, safeTop);
      expect(expanded).toBeGreaterThan(peek);
      expect(height - expanded).toBeGreaterThanOrEqual(12.5 * 16 + safeTop);
    }
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "mobile-map-actions", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "mobile-map-actions", scoped: true, source: css }).errors).toEqual([]);
  });
});
