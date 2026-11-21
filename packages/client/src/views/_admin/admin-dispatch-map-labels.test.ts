import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";
import { SOS_MAP_MARKER_COLORS } from "@/admin/sos-alerts";

// Source/compiler checks only; docs/TASKS.md forbids mounting Vue SFCs in unit tests.
const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;

describe("SOS center on-map labels and offscreen directions", () => {
  it("names selected incidents only, qualified nearby responders and selected responder names", () => {
    expect(source).toContain('chip.textContent = incidentLabel(incident.incidentTypeId)');
    expect(source).not.toContain('"text-field": ["get", "mapTitle"]');
    expect(source).toContain('selectedSosLabelMarker = new mapLabelMarkerClass({ element, anchor: "center" })');
    expect(source).toMatch(/element\.hidden = false;[\s\S]*?chip\.offsetWidth, chip\.offsetHeight, hasPin \? -35 : 0\);[\s\S]*?element\.hidden = !placement\.visible;/);
    expect(source).toContain('element.style.setProperty("--dispatch-label-color"');
    expect(source).toContain('element.className = "dispatch-sos-label-anchor dispatch-responder-label-anchor"');
    expect(source).toContain('chip.className = "dispatch-sos-label dispatch-responder-label"');
    expect(source).toContain('chip.textContent = feature.properties.username');
    expect(source).toContain('element.style.setProperty("--dispatch-label-color", themeStore.isDark ? "#205fd1" : "#0868c8")');
    expect(source).toContain('positionResponderLabels(map)');
    expect(source).toContain('placeResponderLabels(candidates, (id, side) => {');
    expect(source).toContain('setDispatchLabelSide(element, chip, pixel.x, canvas.clientWidth, side)');
    expect(source).toContain('reserved.push(selectedSosPinBounds(viewport.left + pin.x, viewport.top + pin.y, pinReady))');
    expect(source).toContain('box.right > viewport.right - 8 || box.top < viewport.top + 8');
    expect(source).toMatch(/const DISPATCH_LAYER_ORDER = \[[\s\S]*?SOS_SELECTED_PIN_LAYER_ID\s*\] as const/);
    expect(source).toContain('raiseDispatchLayers(map, DISPATCH_LAYER_ORDER)');
    expect(source).toContain('id: SOS_SELECTED_PIN_LAYER_ID, type: "symbol", source: SOS_SOURCE_ID');
    expect(source).toContain('id: SOS_SELECTED_CORE_LAYER_ID, type: "circle", source: SOS_SOURCE_ID');
    expect(source).toContain('id: SOS_SELECTED_GLYPH_LAYER_ID, type: "symbol", source: SOS_SOURCE_ID');
    expect(source).toContain('feature.layer.id === SOS_SELECTED_PIN_LAYER_ID');
    expect(source).not.toContain('RESPONDER_SELECTED_NAME_LAYER_ID');
    expect(source).not.toContain('DISPATCH_PIN_IMAGES.name');
    expect(source).toContain('!adminSos.responderSearch');
    // Selection alone (before/without a nearest fetch) updates the opaque on-map title.
    expect(source).toMatch(/watch\(\(\) => \[adminSos\.visibleRequests, adminSos\.selectedId\][\s\S]*?syncMapData\(\); syncSelectedSosLabel\(\); updateMapEdgeCues\(\)/);
    expect(source).toContain('watch(incidentNameById, () => { syncMapData(); syncSelectedSosLabel(); updateMapEdgeCues(); });');
    expect(styles[0]!.content).toContain(':global(.dispatch-sos-label) { position: absolute; top: -35px; left: 16px;');
    expect(styles[0]!.content).toContain('border-radius: 999px; background: rgb(var(--v-theme-surface)); color: rgb(var(--v-theme-on-surface));');
    const labelCss = styles[0]!.content;
    expect(labelCss).toContain('border-left: 3px solid var(--dispatch-label-color, #dc2626)');
    expect(labelCss).not.toContain('border-inline-start: 3px solid var(--dispatch-label-color');
    expect(labelCss).toContain(':global(.dispatch-sos-label::after)');
    expect(labelCss).toContain('left: -8px; top: calc(50% - 4px);');
    expect(labelCss).toContain(':global(.dispatch-sos-label-anchor--left .dispatch-sos-label)');
    expect(labelCss).toContain('border-right: 3px solid var(--dispatch-label-color');
    expect(labelCss).toContain(':global(.dispatch-sos-label-anchor--center .dispatch-sos-label::after)');
    expect(labelCss).toContain(':global(.dispatch-sos-label-anchor--center.dispatch-sos-label-anchor--above .dispatch-sos-label::after)');
    expect(labelCss).toMatch(/--center\.dispatch-sos-label-anchor--above \.dispatch-sos-label\) \{[^}]*top: auto; bottom: 51px;[^}]*border-bottom: 3px/);
    expect(labelCss).toMatch(/--center\.dispatch-sos-label-anchor--above \.dispatch-sos-label::after\) \{[^}]*top: auto; bottom: -8px/);
    expect(labelCss).toContain('top: auto; bottom: 18px;'); // Circle fallback stays attached above too.
    expect(source).toContain('element.classList.toggle("dispatch-sos-label-anchor--above", side === "above")');
    expect(source).toContain('element.classList.toggle("dispatch-sos-label-anchor--below", side === "below")');
    expect(source).toContain('filter: ["==", ["get", "isSelected"], false]');
    expect(source).toContain('"circle-color": ["get", "color"], "circle-radius": 23');
    expect(source).toContain('"circle-stroke-color": ["get", "color"]');
    expect(source).toContain('element.style.setProperty("--dispatch-label-color", SOS_MAP_MARKER_COLORS[sosMapPriority(incident.status, incident.severity)])');
    // Clustered responders otherwise lose both their pin and username at low zoom.
    expect(source).toContain('features: nearbyFeatures.value.features.filter((feature) => feature.properties.isSelected)');
    expect(source).toContain('visibleResponderLabelIds(map.queryRenderedFeatures({ layers })');
    expect(source).toContain('syncResponderLabels(); // The new cluster/pin frame is now queryable.');
    expect(source).toContain('clearResponderLabels();');
    expect(source).toContain('map.off("render", onRender);');
    expect(styles[0]!.content).toContain(':global(.dispatch-sos-label-anchor) { width: 0; height: 0; z-index: 4;');
    expect(styles[0]!.content).toContain(':global(.dispatch-responder-label-anchor) { z-index: 3; }');
    expect(source).toContain('id: RESPONDER_SELECTED_DOT_LAYER_ID, type: "circle", source: RESPONDER_SELECTED_SOURCE_ID');
    expect(source).toContain('feature.layer.id === RESPONDER_SELECTED_DOT_LAYER_ID');
    expect(source).toContain('RESPONDER_SELECTED_DOT_LAYER_ID, RESPONDER_SELECTED_GLYPH_LAYER_ID,');
    expect(source).toContain('adminSos.nearestRequestId === adminSos.selectedRequest.id');
    expect(source).not.toContain('createMapPointElement('); // Dispatch pins remain WebGL; labels share the attached DOM chip.
  });

  it("makes responder and SOS labels keyboard-clickable without selecting underlying map points", () => {
    const responder = source.slice(source.indexOf('if (!entry) {\n      const element = document.createElement("div")'),
      source.indexOf('positionResponderLabels(map);\n}'));
    const sos = source.slice(source.indexOf('if (!selectedSosLabelMarker) {'), source.indexOf('updateSelectedSosLabelPosition();\n}'));
    for (const label of [responder, sos]) {
      expect(label).toContain('document.createElement("button")');
      expect(label).toContain('chip.type = "button"');
      expect(label).toContain('stopLabelMapEvents(chip)');
      expect(label).toContain('chip.addEventListener("click", (event) => {');
      expect(label).toContain('event.stopPropagation()');
      expect(label).not.toContain('element.setAttribute("aria-hidden", "true")');
    }
    expect(responder).toContain('activateMapChoice({ kind: "responder", id, label: "" })');
    expect(responder).toContain('chip.setAttribute("aria-pressed", String(feature.properties.isSelected))');
    expect(sos).toContain('activateMapChoice({ kind: "sos", id: selected.id, label: "" })');
    expect(sos).toContain('chip.setAttribute("aria-pressed", "true")');
    expect(source).toContain('adminSos.selectRequest(toggleSosQueueSelection(adminSos.selectedId, choice.id))');
    expect(source).toContain('for (const type of ["pointerdown", "mousedown", "touchstart", "dblclick", "keydown"])');
    expect(styles[0]!.content).toContain('text-align: start; pointer-events: auto;');
    expect(styles[0]!.content).toContain(':global(.dispatch-sos-label:focus-visible)');
    expect(styles[0]!.content).toContain('cursor: pointer;');
  });

  it("dims only unselected SOS symbols, including circle fallback and animated pulse", () => {
    expect(source).toContain('"icon-opacity": ["case", ["boolean", ["get", "isDimmed"], false], SOS_DIMMED_OPACITY, 1]');
    expect(source).toContain('"circle-opacity": pinReady ? 0 : ["case", ["boolean", ["get", "isDimmed"], false], SOS_DIMMED_OPACITY, 1]');
    expect(source).toContain('"circle-stroke-opacity": pinReady ? 0 : ["case", ["boolean", ["get", "isDimmed"], false], SOS_DIMMED_OPACITY, 1]');
    expect(source).toContain('"text-opacity": pinReady ? 0 :\n      ["case", ["boolean", ["get", "isDimmed"], false], SOS_DIMMED_OPACITY, 1]');
    expect(source).toContain('0.35 * SOS_DIMMED_OPACITY, 0.35');
    expect(source).toContain('opacity * SOS_DIMMED_OPACITY, opacity');
    const selected = source.slice(source.indexOf('if (!map.getLayer(SOS_SELECTED_CORE_LAYER_ID))'), source.indexOf('function syncMapData()'));
    expect(selected).not.toContain('isDimmed');
    expect(source).toContain('filter: ["==", ["get", "isSelected"], false]');
    expect(source).toContain('filter: ["==", ["get", "isSelected"], true]');
  });

  it("uses contrasting blue responder glyphs, severity-coded SOS markers and a context-aware legend", () => {
    const contrastWithWhite = (hex: string) => {
      const channels = [1, 3, 5].map((offset) => {
        const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 1.05 / (0.05 + channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722);
    };
    for (const color of [...Object.values(SOS_MAP_MARKER_COLORS), "#205fd1", "#0868c8"])
      expect(contrastWithWhite(color), color).toBeGreaterThanOrEqual(4.5);
    expect(source).toContain('const responderPin = themeStore.isDark ? "#205fd1" : "#0868c8"');
    expect(source).toContain('"circle-stroke-color": "#f7b632"');
    expect(source).toContain('paint: { "text-color": "#ffffff" }');
    expect(template!.content).toContain('class="dispatch-map-key" aria-label="راهنمای نشانگرهای نقشه"');
    expect(template!.content).toContain('v-for="item in sosSeverityKey"');
    expect(template!.content).toContain('SOS_MAP_MARKER_COLORS[item.severity]');
    expect(template!.content).toContain('nearbyFeatures.features.length > 1');
    expect(template!.content).toContain('dispatch-map-key__icon--selected-sos');
    expect(source).toContain('id: SOS_AURA_LAYER_ID, type: "circle", source: SOS_SOURCE_ID');
    expect(source).toContain('id: SOS_SELECTED_CORE_LAYER_ID, type: "circle", source: SOS_SOURCE_ID');
    expect(source).toMatch(/id: SOS_SELECTED_CORE_LAYER_ID,[\s\S]*?paint: \{ "circle-color": \["get", "color"\]/);
    expect(template!.content).toContain('SOS_MAP_MARKER_COLORS[sosMapPriority(adminSos.selectedRequest.status, adminSos.selectedRequest.severity)]');
    // The 64×72 canvas map icons draw a 46×64 teardrop at .72–.76 scale.
    // Keep the legend's height but widen its previously too-narrow silhouette.
    expect(styles[0]!.content).toContain('flex: 0 0 46px; width: 46px; height: 48px;');
    expect(styles[0]!.content).toContain('width: 27px; height: 27px; border: 2px solid #fff;');
    expect(styles[0]!.content).toContain('transform: scale(1, 1.1) rotate(-45deg)');
    expect(styles[0]!.content).toContain('.dispatch-map-key__icon::before, .dispatch-map-key__selected > .mdi { transform: translateY(-5px); }');
    expect(styles[0]!.content).toContain('box-shadow: 0 0 0 5px color-mix(in srgb, var(--dispatch-sos-color, #dc2626) 19%, transparent)');
    expect(styles[0]!.content).not.toContain('.dispatch-map-key__icon--selected-sos::after { background: #dc2626');
    expect(source).not.toContain("isFireIncidentLabel");
    expect(template!.content).not.toContain("mdi-fire");
    expect(styles[0]!.content).toContain('background: var(--dispatch-helper-color, #0868c8)');
    expect(template!.content).toContain('<li v-if="adminSos.selectedRequest">');
    expect(source).toContain('window.matchMedia?.("(prefers-reduced-motion: reduce)").matches');
    expect(source).toContain('watch(() => themeStore.isDark, () => {');
    expect(source).toContain('map.setPaintProperty(id, "circle-color", responderPin)');
  });

  it("places bounded screen-edge buttons for the selected SOS and authorised responders", () => {
    expect(source).toContain('<div v-if="mapEdgeCues.length" class="dispatch-map-edge-cues"');
    expect(source).toContain('@click="focusEdgeCue(cue)"');
    expect(source).toContain('dispatchMapEdgeCues(canvas.clientWidth, canvas.clientHeight');
    expect(source).toContain('map.on("move", updateMapEdgeCues);');
    expect(source).toContain('map.on("resize", updateMapEdgeCues);');
    expect(source).toContain('map.off("move", updateMapEdgeCues);');
    expect(source).toContain('nearbyFeatures.value.features.some((feature) => feature.id === cue.id)');
    expect(styles[0]!.content).toContain('pointer-events: none;');
    expect(template!.content).toContain(':style="{ left: `${cue.x}px`, top: `${cue.y}px`, \'--dispatch-edge-color\': edgeCueColor(cue) }"');
    expect(template!.content).toContain('class="dispatch-map-edge-cue__arrow" aria-hidden="true"');
    expect(template!.content).toContain('stroke-width="3.5"');
    expect(source).toContain('return themeStore.isDark ? "#205fd1" : "#0868c8"');
    expect(styles[0]!.content).toContain('width: min(138px, calc(100% - 24px)); height: 36px; padding: 0;');
    expect(styles[0]!.content).toContain('padding-inline-end: .4rem;');
    expect(styles[0]!.content).toContain('grid-template-columns: 24px minmax(0, 1fr)');
    expect(styles[0]!.content).toContain('align-items: center; gap: .35rem;');
    expect(styles[0]!.content).toContain('width: 24px; height: 100%;');
    expect(styles[0]!.content).toContain('width: 17px; height: 17px;');
    expect(styles[0]!.content).toContain('font: 800 .78rem/1.15 var(--bb-font-family)');
    expect(styles[0]!.content).toContain('color: #fff; background: var(--dispatch-edge-color, #0868c8)');
    for (const side of ["bottom", "left", "right"])
      expect(styles[0]!.content).toContain(`.dispatch-map-edge-cue__arrow--${side}`);
    expect(styles[0]!.content).toContain('-webkit-line-clamp: 2');
    expect(compileTemplate({ source: template!.content, filename: "AdminDispatchView.vue", id: "dispatch-labels" }).errors).toEqual([]);
    expect(compileStyle({ source: styles[0]!.content, filename: "AdminDispatchView.vue", id: "dispatch-labels", scoped: true }).errors).toEqual([]);
  });
});
