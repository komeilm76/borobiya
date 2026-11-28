import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const shell = readFileSync(new URL("../../styles/tailwind.css", import.meta.url), "utf8");
const { template, styles } = parse(source).descriptor;
const markup = template!.content;
const css = styles[0]!.content;

describe("dispatch sidebar across desktop, tablet and phone", () => {
  it("keeps both worklists on desktop within a single bounded scroll surface", () => {
    expect(markup).toContain('id="dispatch-sidebar-content" class="admin-dispatch__content"');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__content {\n  display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0;');
    expect(css).toContain('overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__surface {\n  border: 0 !important; border-radius: 0 !important;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__queue { border-top: 1px solid');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__nearby { border-top: 1px solid');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__submit {\n  margin-top: auto;');
  });

  it("shows only the SOS queue until selection, then nearby responders with a back action", () => {
    const rail = markup.slice(markup.indexOf('id="dispatch-sidebar"'), markup.indexOf('</aside>'));
    expect(rail).toContain('id="dispatch-sheet-handle" v-if="compactDispatch"');
    expect(rail).not.toContain('id="dispatch-sheet-size"');
    expect(rail).toContain('@pointerdown="startSheetDrag" @pointermove="moveSheetDrag" @pointerup="endSheetDrag"');
    expect(rail).toContain('@pointercancel="cancelSheetDrag" @lostpointercapture="cancelSheetDrag"');
    expect(rail).toContain('@keydown.up.prevent="setSheetExpanded(true)" @keydown.down.prevent="setSheetExpanded(false)"');
    expect(rail).toContain(':aria-expanded="sheetExpanded" aria-controls="dispatch-sidebar-content"');
    expect(rail).not.toContain('admin-dispatch__sheet-nav');
    expect(source).not.toContain('sheetTab');
    expect(rail).toContain(':class="{ \'admin-dispatch__section--hidden\': compactDispatch && !!adminSos.selectedId }"');
    expect(rail).toContain(':class="{ \'admin-dispatch__section--hidden\': compactDispatch && !adminSos.selectedId }"');
    const actions = rail.slice(rail.indexOf('class="admin-dispatch__submit'), rail.indexOf('</v-card-actions>'));
    expect(actions).toContain('v-if="compactDispatch" id="dispatch-action-29"');
    expect(actions.indexOf('id="dispatch-action-29"')).toBeLessThan(actions.indexOf('id="dispatch-action-17"'));
    expect(actions).toContain('icon="mdi-arrow-right" size="small" variant="tonal"');
    expect(rail).toContain('id="dispatch-action-30"\n              class="admin-dispatch__back-to-queue" icon="mdi-arrow-right" size="small" variant="tonal"');
    expect(actions).toContain('aria-label="بازگشت به فهرست درخواست‌های SOS و لغو انتخاب درخواست"');
    expect(actions).toContain('aria-controls="dispatch-queue-region" @click="returnToSosQueue"');
    expect(rail).toContain('v-if="compactDispatch && adminSos.selectedId" id="dispatch-action-30"'); // Back remains possible while a deep link is loading.
    expect(rail.indexOf('id="dispatch-notice-04"')).toBeLessThan(rail.indexOf('id="dispatch-queue-region"'));
    expect(rail.indexOf('id="dispatch-queue-region"')).toBeLessThan(rail.indexOf('id="dispatch-nearby"'));
    expect(css).toContain('#dispatch-sidebar.admin-dispatch__sidebar--expanded { height: var(--dispatch-expanded-sheet-height); }');
    expect(shell).toContain('--dispatch-expanded-sheet-height: min(68dvh, 38rem,');
    expect(css).toContain('#dispatch-sidebar.admin-dispatch__sidebar--dragging { transition: none; }');
    expect(css).toContain('width: 100%; height: 44px;');
    expect(css).toContain('cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__intro { display: none; }');
    expect(markup).toContain('<h1>مرکز پایش و اعزام اضطراری (SOS)</h1>'); // Desktop title remains.
    expect(css).toContain('height: min(40dvh, 21rem);');
    expect(css).toContain('inset: 0 0 min(40dvh, 21rem) 0;');
    expect(shell).toContain('inset-block-end: calc(min(40dvh, 21rem) + 3.75rem');
    expect(shell).toContain('.app-shell--map:has(.admin-dispatch__sidebar--dragging) .sos-fab.sos-fab,');
    expect(shell).toContain('visibility: hidden; pointer-events: none;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__back-to-queue {\n    display: inline-flex; flex: none; padding: 0;');
    expect(css).toContain('width: 44px; min-width: 44px; height: 44px; min-height: 44px;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__submit :deep(.admin-dispatch__back-to-queue) {\n    flex: 0 0 44px; width: 44px; min-width: 44px; padding: 0;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__submit :deep(#dispatch-action-17) {\n    flex: 1 1 auto; min-width: 0; width: auto;');
    expect(css).toContain('flex: 1 1 auto; overflow-y: auto; padding-bottom: .5rem;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__queue { flex: none; border-top: 0; }');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__nearby:not(.admin-dispatch__section--hidden) {\n    display: flex; flex: 1 0 auto; flex-direction: column; min-height: 0;\n    border-top: 0;\n  }');
    expect(rail.indexOf('id="dispatch-action-29"')).toBeGreaterThan(rail.indexOf('class="responder-list"')); // Back shares the bottom action row.
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__section--hidden { display: none; }');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__queue :deep(.v-card-title) { display: none; }');
    expect(css).toContain('max-height: none; overflow: visible;'); // Queue still scrolls with the sheet.
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__nearby:not(.admin-dispatch__section--hidden) {\n    display: flex; flex: 1 0 auto; flex-direction: column; min-height: 0;');
    expect(css).toContain('flex: 1 1 auto; height: 17rem; min-height: 17rem;');
    expect(css).toContain('flex: 1 1 auto; min-height: 4.5rem; max-height: none;\n    overflow-y: auto; overscroll-behavior: contain;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__responders { overflow: visible !important; }');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__submit { position: sticky; bottom: 0; }');
    expect(rail.indexOf('class="responder-list"')).toBeLessThan(rail.indexOf('class="admin-dispatch__submit'));
    expect(rail).toContain('id="dispatch-responders" tabindex="-1"');
  });

  it("gives the expanded sheet the map controls' space and returns to incident details on tap", () => {
    expect(markup).toContain(':class="{ \'admin-dispatch--incident-at-top\': incidentAtMapTop }"');
    expect(markup).toContain(":class=\"{ 'admin-dispatch__search--hidden': hideDispatchSearch }\" :inert=\"hideDispatchSearch\"");
    expect(markup).toContain('@click.self="collapseSheetForIncident"'); // Child actions can still expand the sheet.
    expect(markup).toContain('@click="toggleIncidentPanel"');
    expect(css).toContain('--dispatch-incident-top: 6rem;');
    expect(css).toContain('--dispatch-incident-top: 1rem;');
    expect(css).toContain('top: calc(var(--dispatch-incident-top) + env(safe-area-inset-top, 0px));');
    expect(css).toContain('.admin-dispatch--incident-at-top { --dispatch-incident-top: 1rem; }');
    expect(css).toContain('.admin-dispatch__search--hidden { visibility: hidden; pointer-events: none; }');
    expect(css).not.toContain('.admin-dispatch:has(.admin-dispatch__sidebar--expanded) .admin-dispatch__search');
    expect(source).toContain('dispatchMapPanelState(compactDispatch.value, !!adminSos.selectedRequest,\n  sheetExpanded.value, sheetDragging.value, incidentExpanded.value)');
    expect(source).toContain('watch(hideDispatchSearch, (hidden) => {');
    expect(source).toContain('document.getElementById(sheetExpanded.value ? "dispatch-sheet-handle" : "dispatch-incident-toggle")?.focus({ preventScroll: true });');
    expect(shell).toContain('.app-shell--map:has(.admin-dispatch__sidebar--expanded) .sos-fab.sos-fab,');
    expect(shell).toContain('.app-shell--map:has(.admin-dispatch__sidebar--expanded) .app-general-share,');
    expect(shell).toContain('.app-shell--map:has(.admin-dispatch--incident-at-top) .sos-fab.sos-fab,');
    expect(shell).toContain('.app-shell--map:has(.admin-dispatch--incident-at-top) .app-general-share,');
    expect(shell).toContain('.app-shell--map:has(.admin-dispatch__sidebar--dragging) .app-general-share {\n    visibility: hidden; pointer-events: none;');
    const toggle = source.slice(source.indexOf('function collapseSheetForIncident()'), source.indexOf('const showLivePanel = ref(false);'));
    expect(toggle).toContain('if (compactDispatch.value && sheetExpanded.value) setSheetExpanded(false);');
    expect(toggle).toContain('const wasExpandedSheet = compactDispatch.value && sheetExpanded.value;');
    expect(toggle).toContain('incidentExpanded.value = wasExpandedSheet || !incidentExpanded.value;');
    expect(source).toContain('watch([sheetExpanded, incidentAtMapTop], ([expanded, atTop]) => {');
    expect(source).toContain('document.getElementById(expanded ? "dispatch-sheet-handle" : "dispatch-incident-toggle")?.focus({ preventScroll: true });');
  });

  it("leaves mobile space for the worklist rather than a fixed tab bar", () => {
    const start = css.indexOf('  #dispatch-sidebar.admin-dispatch__sidebar {\n    display: flex; flex-direction: column;');
    const mobile = css.slice(start, css.indexOf('@media (prefers-reduced-motion: reduce)', start));
    expect(start).toBeGreaterThan(0);
    expect(mobile).not.toContain('admin-dispatch__sheet-nav');
    expect(mobile).toContain('flex: 1 1 auto; overflow-y: auto; padding-bottom: .5rem;');
    expect(mobile).toContain('flex-wrap: nowrap !important; padding: .35rem .2rem .15rem !important; border-top: 0;');
  });

  it("reveals responder controls from an SOS choice or detail action, without bypassing dispatch validation", () => {
    expect(source).toContain('if (compactDispatch.value) setSheetExpanded(true);');
    const back = source.slice(source.indexOf('function returnToSosQueue()'), source.indexOf('function toggleQueueRequest('));
    expect(back).toContain('pendingDeepLinkId = null;');
    expect(back).toContain('adminSos.selectRequest(null);');
    expect(back).toContain('document.getElementById("dispatch-queue")?.focus({ preventScroll: true })');
    expect(markup).toContain('<v-card id="dispatch-queue" tabindex="-1"');
    expect(source).toContain('watch(() => adminSos.selectedId, (selectedId) => {\n  if (!compactDispatch.value) return;');
    expect(source).toContain('active.closest(selectedId ? "#dispatch-queue-region" : "#dispatch-nearby")');
    expect(source).toContain('adminSos.selectedRequest ? "dispatch-responders" : "dispatch-action-30"');
    expect(source).toContain(': "dispatch-queue")?.focus({ preventScroll: true });');
    expect(source).toContain('if (!compactDispatch.value || !event.isPrimary || event.button !== 0 || sheetPointer) return;');
    expect(source).toContain('if (pointer.moved) {');
    expect(source).toContain('if (suppressSheetClick) return;');
    expect(source).toContain('if (content) content.scrollTop = 0;');
    expect(source).toContain('void nextTick(focusResponders);');
    expect(source).toContain('if (!adminSos.canDispatchSelected) return;');
    expect(source).toContain('if (selectedDispatchWarnings.value.length) manualDispatchConfirmation.value = true;');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "dispatch-sheet", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "dispatch-sheet", scoped: true, source: css }).errors).toEqual([]);
  });
});
