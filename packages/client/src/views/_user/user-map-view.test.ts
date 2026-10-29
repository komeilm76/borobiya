import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The view's wiring rules, pinned by reading the component source.
 *
 * This workspace does not mount Vue components in tests (no jsdom, no `@vue/test-utils`) and cannot run
 * maplibre at all, so the ordering decisions that only exist inside a `.vue` file would otherwise be
 * unprotected. They are worth pinning because they are exactly the kind a later edit breaks quietly: a
 * swapped paint order leaves the history line on top of the live markers, and a camera call added to a
 * peer watcher makes the map lurch every few seconds.
 */
const view = readFileSync(new URL("./UserMapView.vue", import.meta.url), "utf8");
const panel = readFileSync(new URL("../../components/map/LiveCompanionPanel.vue", import.meta.url), "utf8");
const canvas = readFileSync(new URL("../../components/map/MapCanvas.vue", import.meta.url), "utf8");

function body(name: string): string {
  const start = view.indexOf(`function ${name}(`);
  expect(start, `UserMapView.vue should define ${name}`).toBeGreaterThan(-1);
  const next = view.indexOf("\nfunction ", start + 1);
  return view.slice(start, next === -1 ? view.length : next);
}

describe("UserMapView live overlay", () => {
  it("keeps the large MapLibre chunk lazy until MapCanvas mounts while retaining own-position markers", () => {
    // A value import of Marker here makes the route depend on the 1MB+ chunk before mount,
    // defeating MapCanvas's concurrent dynamic import and worker startup.
    expect(view).not.toMatch(/import\s*\{[^}]*\bMarker\b[^}]*\}\s*from\s*["']maplibre-gl["']/);
    expect(view).toContain('import type { Map as MapLibreMap, MapMouseEvent, Marker } from "maplibre-gl"');
    expect(canvas).toContain('emit("ready", instance, Marker)');
    expect(body("onMapReady")).toContain("markerConstructor = MarkerClass");
    expect(body("syncOwnMarker")).toContain('new markerConstructor(');
  });

  it("restores missing layers on idle without rewriting every existing source on each idle event", () => {
    const restore = body("repaintOverlays");
    expect(restore).toContain("needsOverlayRestore(");
    expect(restore.indexOf("needsOverlayRestore(")).toBeLessThan(restore.indexOf("paintLive()"));
    expect(body("onMapReady")).toContain('instance.on("idle", repaintOverlays)');
  });

  it("paints the live markers before playback, so the layer playback sits under exists", () => {
    const ready = body("onMapReady");
    expect(ready.indexOf("paintLive()")).toBeLessThan(ready.indexOf("paintPlayback()"));
  });

  it("names the live layer as playback's `beforeId` only when maplibre can find it", () => {
    const state = body("playbackMapState");
    expect(state).toContain("getLayer(LIVE_BOTTOM_LAYER_ID)");
    expect(state).toContain("beforeLayerId: LIVE_BOTTOM_LAYER_ID");
  });

  it("keeps every live paint on the shared planner instead of calling maplibre directly", () => {
    expect(body("paintLive")).toContain("planOverlaySync");
    expect(body("paintLive")).not.toMatch(/instance\.(addLayer|addSource|setData)/);
  });

  it("removes both overlays on teardown, so leaving the map leaves nothing behind", () => {
    const teardown = view.slice(view.indexOf("onBeforeUnmount("));
    expect(teardown).toContain("planPlaybackRemoval");
    expect(teardown).toContain("planOverlayRemoval");
  });

  it("never moves the camera for a peer; only track framing and explicit place selection move it", () => {
    expect(view.match(/instance\.(fitBounds|easeTo|flyTo)\(/g)).toHaveLength(4);
    expect(body("frameCamera")).toContain("fitBounds");
    expect(body("frameCamera")).toContain("userPickedPlace.value");
    expect(body("paintLive")).not.toMatch(/fitBounds|easeTo|flyTo/);
    expect(body("selectPlace")).toContain("placeSearch.results.value.some");
    expect(body("selectPlace")).toContain("bounds.contains([place.lon, place.lat])");
    expect(body("selectPlace")).toContain("placeSearch.clear()");
    expect(body("selectPlace")).toContain("instance.flyTo(");
    expect(body("selectPlace")).toContain("zoom: Math.min(16, instance.getMaxZoom())");
  });

  it("renders search results and an explicit return-to-track action without mounting the map", () => {
    const search = readFileSync(new URL("../../components/map/PlaceSearchPanel.vue", import.meta.url), "utf8");
    expect(view).toContain('<PlaceSearchPanel :api="placeSearch" :ready="!!map" @select="selectPlace" />');
    expect(view).toContain('usePlaceSearch({');
    expect(view).toContain('getMaxBounds()?.toArray().flat().join(",")');
    expect(view).toContain('بازگشت به مسیر');
    expect(search).toContain('v-for="place in api.results.value"');
    expect(search).toContain("$emit('select', place)");
    expect(search).toContain("api.failed.value");
    expect(search).toContain("api.searched.value");
    expect(search).toContain("api.run()");
  });

  it("fits tracks without reserving overlay space for panels outside the narrow map", () => {
    const camera = body("frameCamera");
    expect(camera).toContain('window.matchMedia("(max-width: 1023px)").matches');
    expect(camera).toContain("historyCameraPadding(compact)");
    expect(body("onMapReady")).toContain('instance.on("resize", frameCamera)');
    const teardown = view.slice(view.indexOf("onBeforeUnmount("));
    expect(teardown).toContain('instance.off("resize", frameCamera)');
  });

  it("moves narrow map controls into a scrollable, non-occluding flow", () => {
    // 25rem toolbar + 24rem history + two 1rem edges = 816px at the default root size.
    // The previous 750px cutoff left a real overlap from 751px through at least 815px.
    expect(view).toContain('width: min(25rem, calc(100% - 2rem));');
    expect(view).toContain('width: min(24rem, calc(100% - 2rem));');
    expect(25 * 16 + 24 * 16 + 2 * 16).toBe(816);
    const start = view.indexOf("@media (max-width: 1023px)");
    expect(start).toBeGreaterThan(-1);
    const phone = view.slice(start);
    expect(phone).toContain("height: auto;");
    expect(phone).toContain("overflow: visible;");
    expect(phone).toContain("height: clamp(20rem, 55dvh, 32rem);");
    expect(phone).toContain(".user-map-view__search { order: 1; }");
    expect(phone).toContain(".user-map-view__playback { order: 3; }");
    expect(phone).toContain(".user-map-view__live { order: 5; }");
    expect(phone).not.toContain("inset-block-");
    expect(phone).not.toContain("position: absolute;");
  });

  it("offers private own-position watching independently of peer sharing and clears its marker", () => {
    expect(view).toContain('useOwnMapPosition(computed(() => auth.user?.id ?? null))');
    expect(view).toContain('ownPositionLabel(own.position.value, own.active.value, own.error.value)');
    expect(view).toContain('نمایش زندهٔ موقعیت من');
    expect(view).toContain('نمایش موقعیت، اشتراک‌گذاری را فعال نمی‌کند');
    expect(body("syncOwnMarker")).toContain('new markerConstructor(');
    expect(body("syncOwnMarker")).toContain('ownMarker.setLngLat([fix.lon, fix.lat])');
    expect(body("focusOwnIfRequested")).toContain('centerOnOwnLocation()');
    expect(body("centerOnOwnLocation")).toContain('userPickedPlace.value = true');
    expect(view).toContain('ownMarker?.remove();');
    expect(view).toContain('own.stop();');
  });

  it("renders the live panel and no longer claims that live positions are missing", () => {
    expect(view).toContain('<LiveCompanionPanel :api="live" />');
    expect(view).not.toContain("هنوز روی این نقشه نمی‌آید");
  });

  it("passes its own id and session-refresh hook to the composable, and renders the broadcast bar on both user views", () => {
    const dashboard = readFileSync(new URL("./UserDashboardView.vue", import.meta.url), "utf8");
    expect(view).toMatch(/ownUserId: computed\(\(\) => auth\.user\?\.id \?\? null\)/);
    expect(view).toContain("ensureSession: () => auth.ensureSession()");
    expect(view).toContain("<LiveBroadcastBar compact />");
    expect(dashboard).toContain("<LiveBroadcastBar />");
    expect(dashboard).not.toContain("نشانگرهای همراهانِ فعال در گام بعدی روی همین نقشه می‌آیند");
  });
});

describe("Map reverse-address sheet", () => {
  it("opens for map clicks and long presses and unregisters both listeners on teardown", () => {
    const ready = body("onMapReady");
    const teardown = view.slice(view.indexOf("onBeforeUnmount("));
    expect(ready).toContain('instance.on("click", onMapClick)');
    expect(ready).toContain('instance.on("contextmenu", onMapLongPress)');
    expect(body("onMapClick")).toContain("reverse.select(event.lngLat.lat, event.lngLat.lng)");
    expect(body("onMapLongPress")).toContain("reverse.select(event.lngLat.lat, event.lngLat.lng)");
    expect(teardown).toContain('instance.off("click", onMapClick)');
    expect(teardown).toContain('instance.off("contextmenu", onMapLongPress)');
    expect(view).toContain('<ReverseAddressSheet :api="reverse" />');
  });

  it("exposes a selectable address and clear copy failures without mounting Vue", () => {
    const sheet = readFileSync(new URL("../../components/map/ReverseAddressSheet.vue", import.meta.url), "utf8");
    expect(sheet).toContain("api.address.value.formattedAddress");
    expect(sheet).toContain("readonly");
    expect(sheet).toContain("api.copy()");
    expect(sheet).toContain("api.copyFailed.value");
    expect(sheet).toContain("api.load()");
    expect(sheet).toContain("api.close()");
  });

  it("keeps long addresses scrollable below a reachable close control on short mobile viewports", () => {
    const sheet = readFileSync(new URL("../../components/map/ReverseAddressSheet.vue", import.meta.url), "utf8");
    expect(sheet).toContain('<v-card-text class="reverse-address__body">');
    expect(sheet).toContain('class="reverse-address__close"');
    expect(sheet).toMatch(/\.reverse-address \{[^}]*max-height: calc\(100dvh - 1rem - env\(safe-area-inset-bottom, 0px\)\);[^}]*overflow: hidden;/);
    expect(sheet).toMatch(/\.reverse-address__body \{[^}]*min-height: 0;[^}]*overflow-y: auto;/);
    expect(sheet).toMatch(/\.reverse-address__text \{[^}]*max-height: min\(11rem, 32dvh\);[^}]*overflow-wrap: anywhere;/);
    expect(sheet).toContain('.reverse-address__close { min-width: 44px; min-height: 44px; flex-shrink: 0; }');
    expect(sheet).toContain('.reverse-address__body :deep(.v-btn) { min-height: 44px; height: auto; }');
  });
});

describe("LiveCompanionPanel", () => {
  it("renders and dispatches only — the sentences come from the pure module", () => {
    // If the component could invent an empty state, "nobody shared with you" and "our read failed" would
    // become the same sentence again, which is the bug this phase keeps re-fixing.
    expect(panel).not.toContain("هنوز کسی");
    expect(panel).not.toContain("برقرار");
    expect(panel).toContain("connectionTitle(api.connected.value)");
    expect(panel).toContain("api.status.value.line");
    expect(panel).toContain("ageWords(peer.ageMs)");
  });

  it("announces itself politely instead of at every update", () => {
    expect(panel).toContain('role="status"');
    expect(panel).toContain('aria-live="polite"');
  });

  it("offers the retry the status line promises", () => {
    expect(panel).toContain('v-if="api.readFailed.value"');
    expect(panel).toContain("api.refresh()");
    expect(panel).toContain("تازه‌سازی فهرست");
  });

  it("paints its legend dot from the map's own colors", () => {
    expect(panel).toContain("liveMarkerColors(theme.isDark)");
    expect(panel).toContain("peer.stale ? colors.stale : colors.live");
  });

  it("touches no map or maplibre API", () => {
    expect(panel).not.toMatch(/maplibre|getLayer|fitBounds|addLayer/);
  });
});
