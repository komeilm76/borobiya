import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const view = readFileSync(new URL("./UserMissionView.vue", import.meta.url), "utf8");
const charts = readFileSync(new URL("../../sos/route-elevation-charts.ts", import.meta.url), "utf8");
const credits = readFileSync(new URL("../../../public/terrain-attribution.html", import.meta.url), "utf8");

describe("mission map style restoration", () => {
  it("starts the lazy map before loading Marker for the rescuer route", () => {
    const canvas = readFileSync(new URL("../../components/map/MapCanvas.vue", import.meta.url), "utf8");
    // A value import here pulls the 1MB MapLibre chunk before this route can mount MapCanvas.
    expect(view).not.toMatch(/import\s*\{[^}]*\bMarker\b[^}]*\}\s*from\s*["']maplibre-gl["']/);
    expect(view).toContain('import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent, Marker } from "maplibre-gl"');
    expect(canvas).toContain('emit("ready", instance, Marker)');
    expect(view).toContain('function onRouteMapReady(map: MapLibreMap, MarkerClass: typeof Marker)');
    expect(view).toContain('markerConstructor = MarkerClass;');
    expect(view).toContain('if (!map || !incident || !MarkerClass) return;');
    expect(view).toContain('new MarkerClass(');
    expect(view).toContain('markerConstructor = null;');
    expect(view).toContain('waypointMarkers.forEach((marker) => marker.remove());');
  });

  it("shows measured elevation only when present and credits the offline DEM", () => {
    expect(view).toContain('v-if="choice.elevation"');
    expect(view).toContain("choice.elevation.gain_m");
    expect(view).toContain("choice.elevation.loss_m");
    expect(view).toContain('v-else>ارتفاع: دادهٔ آفلاین');
    expect(view).toContain('href="/terrain-attribution.html"');
    expect(credits).toContain("SRTM terrain data courtesy of the U.S. Geological Survey");
    expect(credits).toContain("Europe terrain data produced using Copernicus");
  });
  it("offers up to three route cards and restricts offline elevation charts to bike/foot", () => {
    expect(view).toContain('v-for="(choice, index) in routing.routes.value"');
    expect(view).toContain("formatRouteDistance(choice.distance_m)");
    expect(view).toContain("formatRouteDuration(choice.duration_s)");
    expect(charts).toContain('profile.value === "car"');
    expect(view).toContain('v-if="elevationCharts[index]"');
    expect(view).toContain('aria-hidden="true"');
    expect(view).toContain('<span class="sr-only">{{ elevationCharts[index]?.description }}</span>');
    expect(charts).toContain("build(choice.elevation?.profile)");
    expect(view).toContain("routing.routes.value.length === 1");
  });
  it("shares a decoded geometry snapshot between camera and style restoration", () => {
    expect(view).toContain('const routeSnapshot = useMissionRouteGeometry(routing.selectedRoute);');
    expect(view).toContain('map.fitBounds(routeSnapshot.value.bounds!');
    expect(view).toContain('source.setData(routeSnapshot.value.data)');
    expect(view).not.toContain('decodeRoutePolyline(');
  });
  it("does not call GeoJSON setData on every map idle when the route layer is already present", () => {
    expect(view).toContain('map.on("idle", onStyleReady)');
    expect(view).toContain("function restoreRouteLayer()");
    expect(view).toMatch(/const onStyleReady = \(\) => restoreRouteLayer\(\)/);
    expect(view).toContain("needsOverlayRestore(");
    expect(view).toContain("applyRouteLayer()");
  });
});
