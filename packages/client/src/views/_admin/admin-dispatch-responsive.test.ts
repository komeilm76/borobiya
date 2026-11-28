import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../App.vue", import.meta.url), "utf8");
const template = parse(source).descriptor.template!.content;
const css = parse(source).descriptor.styles[0]!.content;

describe("fullscreen dispatch workspace (source-pinned; no Vue mount)", () => {
  it("uses the map shell and preserves map state across incident query changes", () => {
    expect(shell).toContain('route.name === "admin-dispatch"');
    expect(shell).toContain("route.name === 'admin-dispatch' ? route.path : route.fullPath");
    expect(css).toContain('height: 100dvh; max-width: none;');
    expect(css).toContain('.admin-dispatch__map-and-actions { position: absolute; inset: 0;');
    expect(css).toContain('.admin-dispatch__map-and-actions .dispatch-map-wrapper > :deep(.map-canvas)');
    expect(css).toContain('width: 100%; height: 100%; min-height: 0;');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "dispatch-layout", source: template }).errors).toEqual([]);
  });

  it("pins the SOS queue ahead of nearby responders, with the selected incident over the map", () => {
    const nearby = template.indexOf('id="dispatch-nearby"');
    const queue = template.indexOf('id="dispatch-queue"');
    const map = template.indexOf('id="dispatch-map"');
    const incident = template.indexOf('id="dispatch-incident"');
    expect(nearby).toBeGreaterThan(0);
    expect(queue).toBeLessThan(nearby);
    expect(nearby).toBeLessThan(map);
    expect(map).toBeLessThan(incident);
    expect(template).toContain('id="dispatch-sidebar"');
    expect(template).toContain('id="dispatch-incident-panel"');
    expect(template).toContain('id="dispatch-incident-toggle"');
    expect(template).toContain('v-show="incidentExpanded" id="dispatch-incident-content"');
    expect(source).toContain('const compactDispatch = useMediaQuery("(max-width: 900px)")');
    expect(source).toContain('incidentExpanded.value = !compactDispatch.value;');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain;');
    expect(css).toContain('.admin-dispatch__incident-panel {');
    expect(css).toContain('display: flex; flex-direction: column; overflow: hidden; pointer-events: auto;');
    expect(css).toContain('#dispatch-incident-content {\n  min-height: 0; overflow-y: auto; overscroll-behavior: contain;');
    expect(template).toContain('@click="toggleQueueRequest(item)"');
    expect(template).toContain('aria-controls="dispatch-map" @click="focusSelectedIncidentMap"');
    expect(source).toContain('frameSelectedIncident();');
    expect(template).toContain('id="dispatch-map-legend"');
    expect(template).toContain('id="dispatch-map-choices"');
  });

  it("provides local SOS search, admin user lookup and same-origin place/POI search", () => {
    expect(template).toContain('id="dispatch-search-input"');
    expect(template).toContain('v-for="item in matchedRequests"');
    expect(template).toContain('v-for="user in searchedUsers"');
    expect(template).toContain('v-for="(place, index) in searchedPlaces"');
    expect(source).toContain('listAdminUsers({ q: query, page: 1, limit: 8 }, token, controller.signal)');
    expect(source).toContain('searchPlaces({ q: query, limit: 8 }, controller.signal)');
    expect(source).toContain('placeSearchController?.abort();');
    expect(source).toContain('userSearchController?.abort();');
    expect(source).toContain('focusRequest(item);');
    expect(source).toContain('new mapLabelMarkerClass({ element: marker, anchor: "bottom" })');
    expect(source).toContain('marker.id = "dispatch-place-marker";');
    expect(source).toContain('title.textContent = place.name;');
    expect(source).toContain('query.startsWith("@")');
    expect(source).toContain('searchQuery.value.replace(/^@/, "")');
    expect(source).toContain('profileUserId.value = user.id;');
    expect(template).toContain('موقعیت تأییدشده‌ای در دسترس نیست');
    expect(template).toContain('id="dispatch-search-retry"');
    expect(template).toContain('id="dispatch-users-retry"');
  });

  it("assigns CSS IDs to every dispatch button, card and input widget", () => {
    type Node = { type: number; tag?: string; props?: { type: number; name?: string;
      arg?: { content?: string }; value?: { content?: string } }[]; children?: Node[] };
    const controls = new Set(["v-btn", "button", "v-card", "v-list-item", "v-select",
      "v-text-field", "v-btn-toggle", "v-dialog", "v-checkbox-btn", "MapCanvas"]);
    const staticIds: string[] = [];
    function walk(node: Node): void {
      if (node.tag && controls.has(node.tag)) {
        const id = node.props?.find((prop) => prop.name === "id" ||
          (prop.name === "bind" && prop.arg?.content === "id"));
        expect(id, `${node.tag} at ${node.props?.[0]?.value?.content ?? "unnamed"}`).toBeDefined();
        if (id?.name === "id") staticIds.push(id.value!.content!);
      }
      for (const child of node.children ?? []) walk(child);
    }
    walk(parse(source).descriptor.template!.ast as Node);
    expect(new Set(staticIds).size).toBe(staticIds.length);
  });

  it("keeps the narrow layout usable and its actions identifiable", () => {
    expect(css).toContain('@media (max-width: 900px) {');
    expect(css).toContain('height: min(40dvh, 21rem);');
    const compactLayout = css.slice(css.indexOf('@media (max-width: 900px) {', css.indexOf('.admin-dispatch__search {')),
      css.indexOf('/* Dispatch rail: one calm surface'));
    expect(compactLayout).toContain('top: calc(6rem + env(safe-area-inset-top, 0px)); left: .75rem; right: .75rem;');
    expect(compactLayout).toContain('width: auto; max-height: calc(100dvh - var(--dispatch-current-sheet-height) - 6.75rem - env(safe-area-inset-top, 0px));');
    expect(compactLayout).toContain('max-height: min(45dvh, 24rem, calc(100dvh - var(--dispatch-current-sheet-height) - 6.75rem - env(safe-area-inset-top, 0px)));');
    expect(compactLayout).toContain('max-width: 100%; height: auto; min-height: 32px; white-space: normal;');
    expect(compactLayout).toContain('.admin-dispatch__detail-badges :deep(.v-chip__content)');
    expect(css).toContain('padding: .5rem .65rem .35rem; line-height: 1.35;\n  white-space: normal; overflow-wrap: anywhere;');
    expect(css).toContain('.admin-dispatch__sender { display: grid; grid-template-columns: 44px minmax(0, 1fr);');
    expect(css).not.toContain('.admin-dispatch__incident-panel .admin-dispatch__sender { grid-template-columns: 2rem');
    expect(css).toContain('#dispatch-incident-content {\n  min-height: 0; overflow-y: auto; overscroll-behavior: contain;');
    expect(source).toContain("'--dispatch-current-sheet-height': `${sheetDragHeight}px`");
    expect(compactLayout).toContain('--dispatch-current-sheet-height: var(--dispatch-expanded-sheet-height);');
    // Child map controls use offsets within the map card, not the outer sidebar width twice.
    expect(css).toContain('right: 4.25rem; left: 24rem;');
    expect(css).toContain('max-width: calc(100% - 28.5rem);');
    expect(css).not.toContain('max-width: calc(100% - var(--dispatch-sidebar-width) - 26rem);');
    expect(css).toContain('.admin-dispatch__map-and-actions .dispatch-map-choices {');
    expect(css).toContain('position: absolute; z-index: 15; right: calc(44px + 2rem);');
    expect(css).toContain('width: min(17rem, calc(100% - 44px - 2.75rem));');
    expect(css).not.toContain('right: .75rem; bottom: 4.5rem;'); // Phone must not undo the rail clearance.
    expect(css).toContain('flex-wrap: nowrap; overflow-x: auto; overflow-y: hidden;');
    expect(source).toContain('offset: dispatchFocusOffset()');
    expect(template).toContain(':id="`dispatch-sos-${item.id}`"');
    expect(template).toContain(':id="`dispatch-responder-${responder.userId}`"');
    expect(template).not.toContain('id="dispatch-recenter"');
    expect(template).toContain('<MapCanvas id="dispatch-canvas-01" tabindex="-1"');
    expect(template).toContain('id="dispatch-responders"');
    expect(template).toContain('id="dispatch-incident"');
    expect(template).not.toContain('صف را بررسی کنید، شواهد و موقعیت را بسنجید');
  });
});
