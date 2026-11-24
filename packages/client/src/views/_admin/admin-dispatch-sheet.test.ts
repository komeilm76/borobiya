import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const source = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
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
    expect(rail).toContain('id="dispatch-sheet-size" v-if="compactDispatch"');
    expect(rail).toContain(':aria-expanded="sheetExpanded" aria-controls="dispatch-sidebar-content"');
    expect(rail).toContain('id="dispatch-sheet-queue" type="button"');
    expect(rail).toContain('id="dispatch-sheet-responders" type="button"');
    expect(rail).toContain(':aria-current="sheetTab === \'queue\' ? \'step\' : undefined"');
    expect(rail).toContain('admin-dispatch__section--hidden');
    expect(rail.indexOf('id="dispatch-notice-04"')).toBeLessThan(rail.indexOf('id="dispatch-queue-region"'));
    expect(rail.indexOf('id="dispatch-queue-region"')).toBeLessThan(rail.indexOf('id="dispatch-nearby"'));
    expect(css).toContain('#dispatch-sidebar.admin-dispatch__sidebar--expanded { height: min(82dvh, 46rem); }');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__section--hidden { display: none; }');
    expect(css).toContain('max-height: none; overflow: visible;');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__responders { overflow: visible !important; }');
    expect(css).toContain('#dispatch-sidebar .admin-dispatch__submit { position: sticky; bottom: 0; }');
  });

  it("reveals responder controls from an SOS choice or detail action, without bypassing dispatch validation", () => {
    expect(source).toContain('if (compactDispatch.value) selectSheetTab("responders");');
    expect(source).toContain('if (tab === "responders") sheetExpanded.value = true;');
    expect(source).toContain('if (content) content.scrollTop = 0;');
    expect(source).toContain('void nextTick(focusResponders);');
    expect(source).toContain('if (!adminSos.canDispatchSelected) return;');
    expect(source).toContain('if (selectedDispatchWarnings.value.length) manualDispatchConfirmation.value = true;');
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "dispatch-sheet", source: markup }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "dispatch-sheet", scoped: true, source: css }).errors).toEqual([]);
  });
});
