import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

const from = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");
const map = from("./UserMapView.vue");
const point = from("../../components/map/PointRouteSheet.vue");
const routes = from("../../components/map/PointRouteChoicesSheet.vue");
const transport = from("../../components/map/PointTransportChoicesSheet.vue");
const common = from("../../styles/tailwind.css");

function css(source: string, name: string): string {
  const { descriptor } = parse(source);
  const result = compileStyle({ source: descriptor.styles[0]!.content, filename: name,
    id: "data-v-navigation", scoped: true });
  expect(result.errors).toEqual([]);
  return result.code;
}

describe("map navigation card visual language (nonmounted)", () => {
  it("gives preview, route/transport choices and guidance the same floating widget surface", () => {
    expect(point).toContain('class="point-route bb-floating-card bb-map-navigation-card"');
    expect(routes).toContain('class="point-route-choices bb-floating-card bb-map-navigation-card"');
    expect(transport).toContain('class="point-transport-choices bb-floating-card bb-map-navigation-card"');
    expect(map).toContain('id="map-navigation-sheet" class="user-map-view__journey-content bb-floating-card bb-map-navigation-card"');
    expect(common).toMatch(/\.v-card\.bb-map-navigation-card\s*\{[^}]*border: 1px solid rgba\(var\(--v-theme-on-surface\), 0\.1\);/);
    expect(common).toContain('border-radius: var(--bb-radius-card, 24px) !important;');
    expect(common).toContain('background: rgba(var(--v-theme-surface), 0.95);');
    expect(common).toContain('backdrop-filter: blur(12px);');
    expect(common).toContain('.v-card.bb-floating-card {'); // Existing desktop/phone depth tiers.
  });

  it("uses inset fully rounded phone cards and keeps map controls above their measured edge", () => {
    for (const [source, name, root] of [[point, "PointRouteSheet.vue", ".point-route"],
      [routes, "PointRouteChoicesSheet.vue", ".point-route-choices"],
      [transport, "PointTransportChoicesSheet.vue", ".point-transport-choices"],
      [map, "UserMapView.vue", ".user-map-view__journey-content"]] as const) {
      const styles = css(source, name);
      expect(styles).toContain(`${root}.bb-map-navigation-card[data-v-navigation]`);
      expect(styles).toContain('border-radius: var(--bb-radius-card, 24px) !important');
      expect(styles).not.toContain('var(--bb-radius-card, 24px) var(--bb-radius-card, 24px) 0 0');
      expect(styles).toContain('safe-area-inset-bottom');
      expect(styles).toContain('left: calc(.75rem + env(safe-area-inset-left, 0px))');
      expect(styles).toContain('right: calc(.75rem + env(safe-area-inset-right, 0px))');
    }
    expect(map).toContain('Math.ceil(window.innerHeight - element.getBoundingClientRect().top)');
    expect(map).toContain('window.addEventListener("resize", onResize)');
    expect(map).toContain('window.removeEventListener("resize", onResize)');
    expect(point).toContain('.point-route.bb-map-navigation-card { max-height: max(7rem');
    expect(transport).toContain('.point-transport-choices.bb-map-navigation-card { max-height: max(7rem');
    expect(map).toContain('id="map-navigation-search"');
    expect(map).toContain('PlaceSearchPanel :api="placeSearch"');
    expect(map).toContain('.user-map-view__navigation-search :deep(.place-search.v-card.bb-floating-card)');
    expect(css(map, 'UserMapView.vue')).toContain('.user-map-view__navigation-search[data-v-navigation] .place-search.v-card.bb-floating-card');
    expect(map).toContain('box-shadow: none !important;');
    expect(map).toContain('.user-map-view__navigation-search :deep(.place-search__results) { max-height: none; overflow: visible; }');
    expect(map).toContain('بازگشت به برنامهٔ سفر');
    expect(map).toContain('توقف و پایان سفر');
    expect(point).toContain('aria-label="حذف مقصد و مسیر"');
    expect(routes).toContain('بازگشت بدون تغییر');
    expect(transport).toContain('تأیید وسیلهٔ انتخابی');
  });

  it("gives real action buttons the same rounded-rectangle shape and tactile size as the other widgets", () => {
    for (const [source, selector] of [[point, ".point-route__actions"],
      [routes, ".point-route-choices__footer"],
      [transport, ".point-transport-choices__footer"],
      [map, ".user-map-view__journey-actions"]] as const) {
      expect(source).toMatch(new RegExp(`${selector.replaceAll('.', '\\.')}[^\\n]*:deep\\(\\.v-btn\\)\\s*\\{[^}]*border-radius: \\.75rem !important;`));
    }
    expect(point).toContain('variant="tonal" color="primary" rounded="lg" @click="backToPoint"');
    expect(routes).toContain('variant="tonal" color="primary" rounded="lg" @click="emit(\'close\')"');
    expect(transport).toContain('variant="tonal" color="primary" rounded="lg" @click="emit(\'close\')"');
    expect(map).toContain('variant="tonal" color="primary" rounded="lg" @click="backToTravelPlan"');
    expect(map).toContain('variant="flat" color="error" rounded="lg" @click="clearPointRoute"');
  });

  it("uses the same nested 16px scale for travel metrics, actions and guidance telemetry", () => {
    expect(point).toMatch(/\.point-route__choice\s*\{[^}]*border-radius: var\(--bb-radius-nested, 16px\)/);
    expect(point).toMatch(/\.point-route__metrics > div\s*\{[^}]*border-radius: var\(--bb-radius-nested, 16px\)/);
    expect(map).toMatch(/\.user-map-view__telemetry-item\s*\{[^}]*border-radius: var\(--bb-radius-nested, 16px\)/);
    const alerts = map.match(/\.user-map-view__gps-warning, \.user-map-view__reroute-status\s*\{[^}]*\}/)?.[0];
    expect(alerts).toContain('border-radius: var(--bb-radius-nested, 16px)');
    expect(alerts).not.toContain('box-shadow'); // Warning is already inside the floating guidance card.
    for (const chooser of [routes, transport]) {
      expect(chooser).toContain('border-radius: var(--bb-radius-nested, 16px)');
      expect(chooser).not.toMatch(/\[aria-pressed="true"\]\s*\{\s*border: 2px/); // No row shift on selection.
    }
  });
});
