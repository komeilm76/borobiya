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

  it("lets a narrow-screen operator switch steps and enlarge the sheet without losing alerts", () => {
    const rail = markup.slice(markup.indexOf('id="dispatch-sidebar"'), markup.indexOf('</aside>'));
    expect(rail).toContain('id="dispatch-sheet-handle" v-if="compactDispatch"');
    expect(rail).not.toContain('id="dispatch-sheet-size"');
    expect(rail).toContain('@pointerdown="startSheetDrag" @pointermove="moveSheetDrag" @pointerup="endSheetDrag"');
    expect(rail).toContain('@pointercancel="cancelSheetDrag" @lostpointercapture="cancelSheetDrag"');
    expect(rail).toContain('@keydown.up.prevent="setSheetExpanded(true)" @keydown.down.prevent="setSheetExpanded(false)"');
    expect(rail).toContain(':aria-expanded="sheetExpanded" aria-controls="dispatch-sidebar-content"');
    expect(rail).toContain('id="dispatch-sheet-queue" type="button"');
    expect(rail).toContain('id="dispatch-sheet-responders" type="button"');
    expect(rail).toContain(':aria-current="sheetTab === \'queue\' ? \'step\' : undefined"');
    expect(rail).toContain('admin-dispatch__section--hidden');
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
    expect(shell).toContain('.app-shell--map:has(.admin-dispatch__sidebar--dragging) .sos-fab.sos-fab {');
    expect(shell).toContain('visibility: hidden; pointer-events: none;');
    expect(css).toContain('order: 3; flex: none; padding: .5rem 0 .1rem; gap: .3rem;');
    expect(css).toContain('border-top: 1px solid var(--bb-color-outline);\n    background: rgb(var(--v-theme-surface));');
    expect(css).toContain('order: 2; flex: 1 1 auto; overflow-y: auto; padding-bottom: .5rem;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__queue { flex: none; border-top: 0; }');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__nearby:not(.admin-dispatch__section--hidden) {\n    display: flex; flex: 1 0 auto; flex-direction: column; min-height: 0;\n    border-top: 0;\n  }');
    expect(rail.indexOf('class="admin-dispatch__sheet-nav"')).toBeLessThan(rail.indexOf('id="dispatch-sidebar-content"')); // Logical keyboard order.
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

  it("uses one spaced divider between the mobile worklist and fixed tabs", () => {
    const start = css.indexOf('  #dispatch-sidebar.admin-dispatch__sidebar {\n    display: flex; flex-direction: column;');
    const mobile = css.slice(start, css.indexOf('@media (max-width: 480px)', start));
    expect(start).toBeGreaterThan(0);
    expect(mobile.match(/border-top: 1px solid var\(--bb-color-outline\)/g)).toHaveLength(1);
    expect(mobile).toContain('order: 2; flex: 1 1 auto; overflow-y: auto; padding-bottom: .5rem;');
    expect(mobile).toContain('order: 3; flex: none; padding: .5rem 0 .1rem; gap: .3rem;');
    expect(mobile).toContain('padding: .35rem .2rem .15rem !important; border-top: 0;');
  });

  it("reveals responder controls from an SOS choice or detail action, without bypassing dispatch validation", () => {
    expect(markup).toContain(`@click="selectSheetTab('responders')"`);
    expect(source).toContain('if (compactDispatch.value) selectSheetTab("responders", true);');
    expect(source).toContain('if (expand) sheetExpanded.value = true;');
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
