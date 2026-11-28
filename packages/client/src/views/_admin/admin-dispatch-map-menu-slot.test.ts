import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, compileTemplate, parse } from "vue/compiler-sfc";

const dispatch = readFileSync(new URL("./AdminDispatchView.vue", import.meta.url), "utf8");
const sidebar = readFileSync(new URL("../../components/shell/MapSidebar.vue", import.meta.url), "utf8");
const dispatchSfc = parse(dispatch).descriptor;
const sidebarSfc = parse(sidebar).descriptor;

describe("map menu within compact dispatch search", () => {
  it("hosts the original map menu and network badge inside the search heading on compact dispatch", () => {
    const search = dispatchSfc.template!.content.slice(
      dispatchSfc.template!.content.indexOf('<section id="dispatch-search"'),
      dispatchSfc.template!.content.indexOf('</section>', dispatchSfc.template!.content.indexOf('<section id="dispatch-search"'))
    );
    const menu = sidebarSfc.template!.content;
    expect(search).toContain('id="dispatch-search-menu-slot" class="admin-dispatch__search-menu-slot"');
    expect(search.indexOf('id="dispatch-search-menu-slot"')).toBeLessThan(search.indexOf('id="dispatch-search-input"'));
    expect(menu).toContain('<Teleport :to="launcherTarget ?? \'body\'" :disabled="!launcherTarget">');
    expect(menu.match(/class="map-sidebar__menu-button"/g)).toHaveLength(1);
    expect(menu).toContain('v-bind="activatorProps"');
    expect(menu).toContain('<NetworkStatusIcon class="map-sidebar__network" />');
    expect(dispatchSfc.styles[0]!.content).toContain('.admin-dispatch__search-menu-slot { display: none; }');
    expect(dispatchSfc.styles[0]!.content).toContain('display: grid; place-items: center; flex: none; width: 48px; height: 48px;');
    expect(dispatchSfc.styles[0]!.content).toContain('top: calc(2.75rem + env(safe-area-inset-top, 0px)); right: .75rem;');
    expect(dispatchSfc.styles[0]!.content).not.toContain('top: calc(4.25rem + env(safe-area-inset-top, 0px)); right: .75rem;');
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
