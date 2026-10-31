import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

// Source and compiled CSS contracts only; never mount Vue SFCs in unit tests.
const sheet = readFileSync(new URL("../../components/map/PointRouteSheet.vue", import.meta.url), "utf8");
const map = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const css = (source: string, filename: string) => {
  const { descriptor } = parse(source, { filename });
  const result = compileStyle({ source: descriptor.styles[0]!.content, id: "data-v-route-panel", filename, scoped: true });
  expect(result.errors).toEqual([]);
  return result.code;
};

describe("map-visible trip planner", () => {
  it("is a standard nonmodal preview with optional expansion, not a full-screen overlay", () => {
    expect(sheet).not.toContain("<v-bottom-sheet");
    expect(sheet).not.toContain("role=\"dialog\"");
    expect(sheet).toContain('v-if="api.point.value && api.sheetOpen.value"');
    expect(sheet).toContain('id="map-point-route-sheet"');
    expect(sheet).toContain(':class="{ \'point-route-shell--expanded\': expanded }"');
    expect(sheet).toContain('aria-controls="point-route-content"');
    expect(sheet).toContain(':aria-expanded="expanded"');
    expect(sheet).toContain('watch(() => props.api.point.value, () => { expanded.value = false; })');
    expect(sheet).toContain('emit(\'layout-change\')');
    expect(sheet).toContain('tabindex="0" aria-label="جزئیات و گزینه‌های مسیر"');
    expect(sheet).toContain('@keydown.esc.stop.prevent="onEscape"');
    expect(sheet).toContain("function dismiss(): void { props.api.sheetOpen.value = false; emit('dismiss'); }");
    expect(map).toContain('@dismiss="focusDestinationMarker"');
    expect(map).toContain('destinationMarker?.getElement() ?? map.value?.getCanvas()');
    expect(sheet).toContain("function clearDestination(): void { props.api.clear(); emit('dismiss'); }");
    expect(map).toContain("document.querySelector('.user-map-view__journey-bar .v-btn')");
    const styles = css(sheet, "PointRouteSheet.vue");
    expect(styles).toContain("pointer-events: none");
    expect(styles).toContain("pointer-events: auto");
    expect(styles).toContain("max-height: min(48dvh, 21rem)");
    expect(styles).toContain("max-height: min(70dvh, 36rem)");
    expect(styles).toContain("(min-width: 600px) and (max-width: 1023px)");
    expect(styles).toContain("position: relative; order: 3");
    expect(styles).toContain("max-height: min(42dvh, 21rem)");
    expect(styles).toContain("safe-area-inset-bottom");
    expect(styles).toContain("overflow-y: auto");
    expect(styles).toContain("min-height: 44px");
  });

  it("keeps transport, route selection and start accessible while the map shows all alternatives", () => {
    for (const label of ["زمان تقریبی", "مسافت مسیر", "خودرو", "دوچرخه", "پیاده", "مسیر دیگر", "شروع راهبری", "حذف مقصد"]) {
      expect(sheet).toContain(label);
    }
    expect(sheet).toContain('api.choose((api.index.value + 1) % api.routes.value.length)');
    expect(sheet).toContain('خط نارنجی');
    expect(map).toContain('pointRouteFeatures(geometries, journey.index.value, journey.navigating.value)');
    expect(map).toContain('id: ROUTE_ALT_LAYER');
    expect(map).toContain('id: ROUTE_LAYER');
    expect(map).toContain('instance.on("click", ROUTE_ALT_LAYER, onAlternativeRouteClick)');
    expect(map).toContain('instance.off("click", ROUTE_ALT_LAYER, onAlternativeRouteClick)');
    expect(map).toContain('journey.choose(index)');
    expect(map).toContain('!instance.getLayer(ROUTE_ALT_LAYER)');
    expect(map).toContain('pointRouteExtent(geometries)');
    expect(map).toContain('pointRouteOverviewBottom(canvas, sheet)');
    expect(map).toContain('aria-controls", "map-point-route-sheet"');
    expect(map).toContain('@layout-change="fitPointRoute"');
    expect(map).toContain('if (journey.sheetOpen.value) fitPointRoute()');
    expect(map).toContain("'user-map-view--route-preview': journey.sheetOpen.value");
    expect(css(map, "UserMapView.vue")).toContain(".user-map-view--route-preview .user-map-view__canvas");
  });
});
