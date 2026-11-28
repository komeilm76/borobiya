import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const dispatch = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../../components/shell/MapSidebar.vue", import.meta.url), "utf8");
const dispatchSfc = parse(dispatch).descriptor;
const sidebarSfc = parse(sidebar).descriptor;

describe("map menu within compact dispatch search", () => {
  it("hosts the original map menu beside the search field on compact dispatch", () => {
    const search = dispatchSfc.template!.content.slice(
      dispatchSfc.template!.content.indexOf('<section id="dispatch-search"'),
      dispatchSfc.template!.content.indexOf('</section>', dispatchSfc.template!.content.indexOf('<section id="dispatch-search"'))
    );
    const menu = sidebarSfc.template!.content;
    expect(search).toContain('id="dispatch-search-menu-slot" class="admin-dispatch__search-menu-slot"');
    const form = search.slice(search.indexOf('class="admin-dispatch__search-form"'), search.indexOf('</div>', search.indexOf('class="admin-dispatch__search-form"')));
    expect(form.indexOf('id="dispatch-search-input"')).toBeLessThan(form.indexOf('id="dispatch-search-menu-slot"'));
    expect(search).not.toContain('<h2>جست‌وجو روی نقشه</h2>');
    expect(search).toContain('aria-label="جست‌وجو روی نقشه"');
    expect(search).toContain('label="جست‌وجو در نقشه"');
    expect(menu).toContain('<Teleport :to="launcherTarget ?? \'body\'" :disabled="!launcherTarget">');
    expect(menu.match(/class="map-sidebar__menu-button"/g)).toHaveLength(1);
    expect(menu).toContain('v-bind="activatorProps"');
    expect(menu).toContain('<NetworkStatusIcon class="map-sidebar__network" />');
    expect(dispatchSfc.styles[0]!.content).toContain('.admin-dispatch__search-menu-slot { display: none; }');
    expect(dispatchSfc.styles[0]!.content).toContain('display: flex; flex: none; align-items: center; gap: .4rem; min-width: 0;');
    expect(dispatchSfc.styles[0]!.content).toContain('.admin-dispatch__search-form :deep(.v-input) { flex: 1 1 auto; min-width: 0; }');
    expect(dispatchSfc.styles[0]!.content).toContain('display: grid; place-items: center; flex: none; width: 48px; height: 48px;');
    expect(dispatchSfc.styles[0]!.content).toContain('top: calc(1rem + env(safe-area-inset-top, 0px)); right: .75rem;');
    expect(dispatchSfc.styles[0]!.content).toContain('left: .75rem; width: auto; max-height: min(38dvh, 15rem);\n    padding: .6rem; gap: .3rem;');
    expect(dispatchSfc.styles[0]!.content).not.toContain('top: calc(2.75rem + env(safe-area-inset-top, 0px)); right: .75rem;');
    expect(dispatchSfc.styles[0]!.content).toContain('top: calc(.75rem + env(safe-area-inset-top, 0px));'); // Desktop unchanged.
    expect(sidebarSfc.styles[0]!.content).toContain('.map-sidebar__launcher--inline {\n  position: relative;');
  });

  it("waits for the async dispatch view and restores the shared fixed launcher elsewhere", () => {
    expect(sidebar).toContain('route.name !== "admin-dispatch" || !compactMap.value');
    expect(sidebar).toContain('new MutationObserver(findTarget)');
    expect(sidebar).toContain('if (target) { launcherObserver?.disconnect(); launcherObserver = null; }');
    expect(sidebar).toContain('launcherTarget.value = null;');
    expect(sidebar).toContain('onBeforeUnmount(() => { launcherObserver?.disconnect(); });');
    expect(sidebarSfc.styles[0]!.content).toContain('.map-sidebar__launcher {\n  position: fixed;');
    expect(compileTemplate({ filename: "MapSidebar.vue", id: "map-menu", source: sidebarSfc.template!.content }).errors).toEqual([]);
    expect(compileTemplate({ filename: "AdminDispatchView.vue", id: "dispatch-search", source: dispatchSfc.template!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "MapSidebar.vue", id: "map-menu", scoped: true, source: sidebarSfc.styles[0]!.content }).errors).toEqual([]);
    expect(compileStyle({ filename: "AdminDispatchView.vue", id: "dispatch-search", scoped: true, source: dispatchSfc.styles[0]!.content }).errors).toEqual([]);
  });
});
