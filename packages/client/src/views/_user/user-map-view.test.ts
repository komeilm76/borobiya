import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compileStyle, parse } from "vue/compiler-sfc";

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
  it("passes the authenticated profile to private history playback without mounting Vue", () => {
    expect(view).toMatch(/useHistoryPlayback\(\{[\s\S]*?ownerId: computed\(\(\) => auth\.user\?\.id \?\? null\)/);
  });

  it("does not restart history or lose the selected grant/cursor on same-session bearer renewal", () => {
    expect(view).toContain('shareSessionKey(auth.user?.id ?? null, auth.accessToken)');
    expect(view).toMatch(/watch\(\s*mapPlaybackSession,\s*\(next, previous\) => \{/);
    expect(view).toContain('if (next === previous) return;');
    expect(view).toContain('if (!next) playback.points.value = [];');
    expect(view).toContain('else void playback.selectPreset(playback.presetDays.value || 7);');
    expect(view).toContain('{ flush: "sync" }');
    expect(view).toContain('if (mapPlaybackSession.value) void playback.selectPreset(playback.presetDays.value);');
    expect(view).not.toContain('watch(\n  () => auth.accessToken,');
  });
  it("keeps the large MapLibre chunk lazy until MapCanvas mounts while retaining own-position markers", () => {
    // A value import of Marker here makes the route depend on the 1MB+ chunk before mount,
    // defeating MapCanvas's concurrent dynamic import and worker startup.
    expect(view).not.toMatch(/import\s*\{[^}]*\bMarker\b[^}]*\}\s*from\s*["']maplibre-gl["']/);
    expect(view).toContain('import type { Map as MapLibreMap, MapMouseEvent, MapMovementEvent, Marker } from "maplibre-gl"');
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
    expect(body("frameCamera")).toContain("userControlledCamera.value");
    expect(body("paintLive")).not.toMatch(/fitBounds|easeTo|flyTo/);
    expect(body("selectPlace")).toContain("placeSearch.results.value.some");
    expect(body("selectPlace")).toContain("bounds.contains([place.lon, place.lat])");
    expect(body("selectPlace")).not.toContain("placeSearch.clear()");
    expect(body("selectPlace")).toContain("placeSearch.select(place)");
    expect(body("selectPlace")).toContain("instance.flyTo(");
    expect(body("selectPlace")).toContain("zoom: Math.min(16, instance.getMaxZoom())");
  });

  it("pins the selected POI on the map and removes it when selection/search ends", () => {
    const marker = body("syncSelectedPlaceMarker");
    expect(marker).toContain("placeSearch.selectedPlaceId.value");
    expect(marker).toContain("placeSearch.results.value.find(");
    expect(marker).toContain("selectedPlaceMarker?.remove()");
    expect(marker).toContain("new markerConstructor(");
    expect(marker).toContain("setLngLat([place.lon, place.lat]).addTo(instance)");
    expect(marker).toContain("else selectedPlaceMarker.setLngLat([place.lon, place.lat])");
    expect(marker).toContain('setAttribute("aria-label",');
    expect(marker).toContain('setAttribute("title", place.name)');
    expect(view).toContain('watch(() => placeSearch.selectedPlaceId.value, syncSelectedPlaceMarker, { flush: "sync" })');
    expect(body("selectPlace")).toContain("placeSearch.select(place)");
    expect(body("onMapReady")).toContain("syncSelectedPlaceMarker()");
    expect(view.slice(view.indexOf("onBeforeUnmount("))).toContain("selectedPlaceMarker?.remove()");
    expect(view).not.toMatch(/import\s*\{[^}]*\bMarker\b[^}]*\}\s*from\s*["']maplibre-gl["']/);
  });

  it("renders search results and an explicit return-to-track action without mounting the map", () => {
    const search = readFileSync(new URL("../../components/map/PlaceSearchPanel.vue", import.meta.url), "utf8");
    expect(view).toContain('<PlaceSearchPanel :api="placeSearch" :ready="!!map" @select="selectPlace" />');
    expect(view).toContain('usePlaceSearch({');
    expect(view).toContain('const library = map.value?.getMaxBounds() ?? null');
    expect(view).toContain('placeSearchArea(library, scope === "viewport" ? map.value?.getBounds() ?? null : library)');
    expect(view).toContain('@return-to-track="showTrack"');
    expect(search).toContain('api.setScope(api.scope.value === \'viewport\' ? \'library\' : \'viewport\')');
    expect(search).toContain(':aria-pressed="api.scope.value === \'viewport\'"');
    expect(search).toContain(':aria-pressed="api.selectedPlaceId.value === place.placeId"');
    expect(search).not.toContain('<v-switch');
    expect(search).toContain('v-for="place in api.results.value"');
    expect(search).toContain("$emit('select', place)");
    expect(search).toContain("api.failed.value");
    expect(search).toContain("api.searched.value");
    expect(search).toContain("api.run()");
  });

  it("offers return-to-track after a real map drag, wheel, keyboard move or zoom-control press", () => {
    const move = body("onMapMoveEnd");
    expect(body("markUserCameraMove")).toContain("if (event.originalEvent) userControlledCamera.value = true;");
    expect(body("onMapReady")).toContain('instance.on("movestart", markUserCameraMove)');
    expect(view.slice(view.indexOf("onBeforeUnmount("))).toContain('instance.off("movestart", markUserCameraMove)');
    expect(move).toContain("markUserCameraMove(event)");
    expect(move).toContain("placeSearch.refreshForViewport()");
    expect(move.indexOf("markUserCameraMove(event)")).toBeLessThan(move.indexOf("placeSearch.refreshForViewport()"));
    expect(body("frameCamera")).toContain("track.length === 0 || userControlledCamera.value");
    expect(body("showTrack")).toContain("map.value?.stop()");
    expect(body("showTrack")).toContain("userControlledCamera.value = false");
    expect(body("showTrack").indexOf("map.value?.stop()")).toBeLessThan(
      body("showTrack").indexOf("userControlledCamera.value = false")
    );
    expect(body("showTrack")).toContain("frameCamera()");
    expect(view).toContain(':show-return-to-track="userControlledCamera && playback.frames.value.length > 0"');
  });

  it("updates visible-bbox results on map moveend but preserves the list after selecting a POI", () => {
    expect(body("onMapReady")).toContain('instance.on("moveend", onMapMoveEnd)');
    expect(view.slice(view.indexOf("onBeforeUnmount("))).toContain('instance.off("moveend", onMapMoveEnd)');
    expect(body("onMapMoveEnd")).toContain('event.placeSearchSelection === true');
    expect(body("onMapMoveEnd")).toContain('placeSearch.refreshForViewport()');
    expect(body("selectPlace")).toContain('{ placeSearchSelection: true }');
    expect(body("selectPlace")).not.toContain('placeSearch.clear()');
  });

  it("styles place search as a compact broadcast card with distinct selected and focus states", () => {
    const search = readFileSync(new URL("../../components/map/PlaceSearchPanel.vue", import.meta.url), "utf8");
    const broadcast = readFileSync(new URL("../../components/sharing/LiveBroadcastBar.vue", import.meta.url), "utf8");
    for (const part of ["__indicator", "__copy", "__headline", "__detail", "__actions"]) {
      expect(search).toContain(`place-search${part}`);
      expect(broadcast).toContain(`broadcast-bar${part}`);
    }
    const { descriptor } = parse(search);
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "PlaceSearchPanel.vue",
      id: "data-v-place-test", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toContain("container-type: inline-size");
    expect(css.code).toContain("min-height: 44px");
    expect(css.code).toContain("place-search__result--selected");
    expect(css.code).toContain(".place-search__result[data-v-place-test]:focus-visible");
    expect(css.code).toContain(":root.dark .place-search");
    expect(css.code).toContain("forced-colors: active");
  });

  it("fits tracks without reserving overlay space for panels outside the narrow map", () => {
    const camera = body("frameCamera");
    expect(camera).toContain('window.matchMedia("(max-width: 1023px)").matches');
    expect(camera).toContain("historyCameraPadding(compact, isPhone.value ? window.innerHeight : undefined)");
    expect(body("onMapReady")).toContain('instance.on("resize", frameCamera)');
    const teardown = view.slice(view.indexOf("onBeforeUnmount("));
    expect(teardown).toContain('instance.off("resize", frameCamera)');
  });

  it("docks native map navigation in the desktop overlay gap, then restores the edge rail on phones", () => {
    // The page is RTL: top-right navigation was hidden by the top-right history card.
    // At the 1024px overlay cutoff the left toolbar and right history leave a 208px gap.
    expect(1024 - (25 * 16 + 24 * 16 + 2 * 16)).toBe(208);
    expect(canvas).toContain('new NavigationControl({');
    expect(canvas).toContain('}), "top-right");');
    const { descriptor } = parse(view);
    const css = compileStyle({ source: descriptor.styles[0]!.content, filename: "UserMapView.vue", id: "data-v-map-test", scoped: true });
    expect(css.errors).toEqual([]);
    expect(css.code).toMatch(/\.user-map-view__canvas\[data-v-map-test\] \.maplibregl-ctrl-top-right\s*\{[^}]*left: 50%;[^}]*right: auto;[^}]*width: 132px;[^}]*transform: translateX\(-50%\);/);
    // Three 44px controls share one compact row, inside the existing 96px camera top padding.
    expect(css.code).toMatch(/\.user-map-view__canvas\[data-v-map-test\] \.maplibregl-ctrl-top-right \.maplibregl-ctrl-group\s*\{[^}]*display: flex;/);
    expect(css.code).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.user-map-view__canvas\[data-v-map-test\] \.maplibregl-ctrl-top-right\s*\{[^}]*right: 0;[^}]*left: auto;[^}]*transform: none;/);
    expect(css.code).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.user-map-view__canvas\[data-v-map-test\] \.maplibregl-ctrl-top-right \.maplibregl-ctrl-group\s*\{[^}]*display: block;/);
    expect(css.code).toMatch(/\.user-map-view__canvas\[data-v-map-test\] \.maplibregl-ctrl-top-right \.maplibregl-ctrl-group button\s*\{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
    expect(css.code).toMatch(/@media \(max-width: 1023px\)[\s\S]*?\.maplibregl-ctrl-group button \+ button\s*\{[^}]*border-top: 1px solid #627a7a;[^}]*border-inline-start: 0;/);
    expect(canvas).not.toContain('showZoom: false');
    expect(canvas).not.toContain('showCompass: false');
  });

  it("moves narrow map controls into a scrollable, non-occluding flow", () => {
    // 25rem search + 24rem history + two 1rem edges = 816px at the default root size.
    // Panels are stacked before their top corners can overlap.
    expect(view).toContain('width: min(25rem, calc(100% - 2rem));');
    expect(view).toContain('width: min(24rem, calc(100% - 2rem));');
    expect(25 * 16 + 24 * 16 + 2 * 16).toBe(816);
    const start = view.indexOf("@media (max-width: 1023px)");
    expect(start).toBeGreaterThan(-1);
    // The tablet band retains flow; phones have a separate immersive override below it.
    const phone = view.slice(start, view.indexOf("@media (max-width: 599px)", start));
    expect(phone).toContain("height: auto;");
    expect(phone).toContain("overflow: visible;");
    expect(phone).toContain("height: clamp(20rem, 55dvh, 32rem);");
    expect(phone).toContain(".user-map-view__search { order: 1; }");
    expect(phone).toContain(".user-map-view__playback { order: 3; }");
    expect(phone).toContain(".user-map-view__live { order: 4; }");
    expect(phone).not.toContain(".user-map-view__own { order:");
    expect(phone).not.toContain("inset-block-");
    expect(phone).not.toContain("position: absolute;");
  });

  it("starts private foreground GPS once when map and owner are ready, and keeps a recenter/retry action", () => {
    expect(view).toContain('useOwnMapPosition(computed(() => auth.user?.id ?? null))');
    expect(view).not.toContain('OwnPositionBar');
    expect(view).not.toContain('id="map-own-panel"');
    expect(view).toContain('watch([map, () => auth.user?.id ?? null]');
    expect(view).toContain('if (!instance || !ownerId || own.active.value || own.error.value) return;');
    expect(view).toContain('startOwnLocation(true)');
    expect(view).toContain('class="user-map-view__recenter"');
    expect(view).toContain('@click="centerOnOwnLocation"');
    expect(view).toContain('aria-live="polite"');
    expect(body("syncOwnMarker")).toContain('new markerConstructor(');
    expect(body("syncOwnMarker")).toContain('ownMarker.setLngLat([fix.lon, fix.lat])');
    expect(body("focusOwnIfRequested")).toContain('centerOnOwnLocation(false)');
    expect(body("centerOnOwnLocation")).toContain('if (!fix)');
    expect(body("centerOnOwnLocation")).toContain('userControlledCamera.value = true');
    expect(body("centerOnOwnLocation")).toContain('closeTool(false)');
    expect(body("centerOnOwnLocation")).toContain('getMaxBounds()');
    expect(body("centerOnOwnLocation")).toContain('bounds.contains([fix.lon, fix.lat])');
    expect(body("focusOwnIfRequested")).toContain('if (automaticFocus && userControlledCamera.value)');
    expect(view).toContain('ownMarker?.remove();');
    expect(view).toContain('own.stop();');
    expect(view).not.toContain('broadcast.toggle()'); // A map GPS watch never starts sharing.
  });

  it("paints a peer change once, not again via a redundant peer-count watcher", () => {
    expect(view).toContain('watch(() => live.overlay.value, paintLive)');
    expect(view).not.toMatch(/watch\(\(\) => live\.peers\.value\.length, paintLive\)/);
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
    expect(dashboard).toContain("<LiveBroadcastBar inset />");
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
