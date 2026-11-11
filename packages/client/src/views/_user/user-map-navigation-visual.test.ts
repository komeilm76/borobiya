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
      expect(source).toMatch(new RegExp(`${selector.replaceAll('.', '\\.')}[^\\n]*:deep\\(\\.v-btn\\)\\s*\\{[^}]*border-radius: 14px !important;`));
    }
    expect(point).toContain('variant="text" color="primary" rounded="lg" @click="backToPoint"');
    expect(point).toContain('class="point-route__start" color="primary" variant="flat" rounded="lg"');
    expect(routes).toContain('variant="tonal" color="primary" rounded="lg" @click="emit(\'close\')"');
    expect(transport).toContain('variant="tonal" color="primary" rounded="lg" @click="emit(\'close\')"');
    expect(map).toContain('variant="tonal" color="primary" rounded="lg" prepend-icon="mdi-arrow-right" @click="backToTravelPlan"');
    expect(map).toContain('variant="outlined" color="error" rounded="lg" prepend-icon="mdi-stop-circle-outline" @click="clearPointRoute"');
  });

  it("makes travel a connected origin-to-destination plan with a persistent primary action", () => {
    const planActions = point.slice(point.indexOf('class="point-route__actions point-route__actions--plan"'),
      point.indexOf('</div>', point.indexOf('class="point-route__actions point-route__actions--plan"')));
    expect(planActions.indexOf('شروع سفر')).toBeLessThan(planActions.indexOf('انصراف'));
    expect(planActions).toContain('محاسبهٔ دوباره');
    expect(point).toContain('.point-route__endpoint:first-child::after');
    expect(point).toContain('.point-route__endpoint:last-child::before');
    expect(point).toContain('.point-route__actions { position: sticky; bottom: 0;');
    expect(point).toContain('.point-route__actions--plan :deep(.point-route__start)');
  });

  it("puts ETA first in guidance, separates the actions, and keeps unknown limits explicit", () => {
    const guidance = map.slice(map.indexOf('class="user-map-view__journey-bar"'),
      map.indexOf('class="user-map-view__navigation-status"'));
    expect(guidance).toContain('class="user-map-view__journey-heading"');
    expect(guidance).toContain('در حال سفر · <bdi dir="auto">{{ journey.title.value }}</bdi>');
    expect(guidance.indexOf('user-map-view__telemetry-item--eta')).toBeLessThan(guidance.indexOf('mdi-speedometer'));
    expect(guidance.indexOf('mdi-speedometer')).toBeLessThan(guidance.indexOf('user-map-view__telemetry-item--unknown'));
    expect(map).toContain('.user-map-view__journey-actions { grid-column: 1 / -1;');
    expect(map).toContain('border-top: 1px solid rgba(var(--v-theme-on-surface), .12);');
    expect(map).toContain('.user-map-view__telemetry-item--eta { border-color:');
  });

  it("makes phone guidance glanceable without hiding unknown-limit or accessible details", () => {
    const styles = css(map, "UserMapView.vue");
    expect(map).toContain('isPhone ? `≈ ${formatRemainingTimeCompact(remainingSeconds)}`');
    expect(map).toContain('برآورد مسیر بدون ترافیک');
    expect(map).toContain('class="user-map-view__telemetry-unit" aria-hidden="true">km/h</span>');
    expect(map).toContain('aria-label="حد مجاز نامشخص"');
    expect(map).toContain('دادهٔ معتبر موجود نیست');
    expect(styles).toContain('@media (max-width: 599px)');
    expect(styles).toMatch(/\.user-map-view__telemetry-item small\[data-v-navigation\]\s*\{\s*display: none;/);
    expect(styles).toContain('.user-map-view__telemetry-item--unknown dd[data-v-navigation] { display: grid;');
    expect(map).toContain('بازگشت به برنامهٔ سفر');
    expect(map).toContain('توقف و پایان سفر');
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
